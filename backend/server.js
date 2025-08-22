const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin'); // Import Firebase Admin SDK
const path = require('path');



// --- FIREBASE SETUP (with fallback) ---
let db = null;
let isDbAvailable = false;
try {
  // Load your downloaded service account key
  const serviceAccountConfig = process.env.FIREBASE_SERVICE_ACCOUNT
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT) // Use environment variable on Render
    : require('./serviceAccountKey.json'); // Use local file for development

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccountConfig)
  });

  db = admin.firestore();
  isDbAvailable = true;
  console.log('Firebase Admin initialized. Firestore available.');
} catch (err) {
  console.warn('Firestore not configured. Falling back to in-memory storage. Reason:', err.message);
}
// In-memory fallback stores
const inMemoryProducts = [];
const inMemoryOrders = [];
// --- END FIREBASE SETUP ---


const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/images', express.static(path.join(__dirname, '../images')));

// Simple admin auth middleware using a static secret
function requireAdmin(req, res, next) {
  const provided = req.headers['x-admin-secret'] || '';
  const expected = process.env.ADMIN_SECRET || '';
  if (!expected) {
    console.warn('ADMIN_SECRET is not set. Admin endpoints are disabled.');
    return res.status(503).json({ message: 'Admin not configured' });
  }
  if (provided !== expected) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  next();
}

// Serve frontend entry
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// API endpoint to handle a new order
app.post('/api/create-order', async (req, res) => {
  try {
    console.log('Received a new order request!');
    const orderData = req.body;

    // Add a timestamp to the order
    orderData.createdAt = new Date();
    orderData.status = 'Processing'; // Set initial status

    if (isDbAvailable) {
      // --- SAVE TO FIRESTORE ---
      const orderRef = await db.collection('orders').add(orderData);
      console.log('Order saved to Firestore with ID:', orderRef.id);
      res.status(200).json({ 
        message: 'Order received and saved successfully!', 
        orderId: orderRef.id
      });
    } else {
      // Fallback: in-memory
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      inMemoryOrders.push({ id, ...orderData });
      console.log('Order stored in-memory with ID:', id);
      res.status(200).json({ message: 'Order received (in-memory).', orderId: id });
    }

  } catch (error) {
    console.error("Error saving order to Firestore:", error);
    res.status(500).json({ message: 'Failed to save order.' });
  }
});

// --- Products API ---
// List products
app.get('/api/products', async (req, res) => {
  try {
    if (isDbAvailable) {
      try {
        const snapshot = await db.collection('products').orderBy('createdAt', 'desc').get();
        const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return res.status(200).json(items);
      } catch (innerErr) {
        console.warn('Firestore error when fetching products, falling back to in-memory:', innerErr.message);
        return res.status(200).json(inMemoryProducts);
      }
    } else {
      return res.status(200).json(inMemoryProducts);
    }
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(200).json(inMemoryProducts);
  }
});

// Add a product (admin)
app.post('/api/admin/products', requireAdmin, async (req, res) => {
  try {
    const product = req.body || {};
    if (!product.name || typeof product.price !== 'number') {
      return res.status(400).json({ message: 'name and numeric price are required' });
    }
    product.createdAt = new Date();
    if (isDbAvailable) {
      try {
        const ref = await db.collection('products').add(product);
        return res.status(201).json({ id: ref.id, ...product });
      } catch (innerErr) {
        console.warn('Firestore error when adding product, storing in-memory instead:', innerErr.message);
        const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const toStore = { id, ...product };
        inMemoryProducts.unshift(toStore);
        return res.status(201).json(toStore);
      }
    } else {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const toStore = { id, ...product };
      inMemoryProducts.unshift(toStore);
      return res.status(201).json(toStore);
    }
  } catch (error) {
    console.error('Error adding product:', error);
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const toStore = { id, ...(req.body || {}), createdAt: new Date() };
    inMemoryProducts.unshift(toStore);
    res.status(201).json(toStore);
  }
});

// Delete all products (admin)
app.delete('/api/admin/products', requireAdmin, async (req, res) => {
  try {
    if (isDbAvailable) {
      const snapshot = await db.collection('products').get();
      const batch = db.batch();
      snapshot.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      res.status(200).json({ message: 'All products deleted' });
    } else {
      inMemoryProducts.splice(0, inMemoryProducts.length);
      res.status(200).json({ message: 'All products deleted (in-memory)' });
    }
  } catch (error) {
    console.error('Error deleting products:', error);
    res.status(500).json({ message: 'Failed to delete products.' });
  }
});

// Delete one product (admin)
app.delete('/api/admin/products/:id', requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    if (isDbAvailable) {
      await db.collection('products').doc(id).delete();
      res.status(200).json({ message: 'Product deleted' });
    } else {
      const idx = inMemoryProducts.findIndex(p => p.id === id);
      if (idx !== -1) inMemoryProducts.splice(idx, 1);
      res.status(200).json({ message: 'Product deleted (in-memory)' });
    }
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ message: 'Failed to delete product.' });
  }
});

// Healthcheck route
app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok', time: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Not found' });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running locally on http://localhost:${PORT}`);
});