const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin'); // Import Firebase Admin SDK



// --- FIREBASE SETUP ---
// Load your downloaded service account key
const serviceAccountConfig = process.env.FIREBASE_SERVICE_ACCOUNT
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT) // Use environment variable on Render
  : require('./serviceAccountKey.json'); // Use local file for development

admin.initializeApp({
  credential: admin.credential.cert(serviceAccountConfig)
});

const db = admin.firestore();
// --- END FIREBASE SETUP ---


const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Test route
app.get('/', (req, res) => {
  res.send('Hello from the Skid RC Backend! Connected to Firestore.');
});

// API endpoint to handle a new order
app.post('/api/create-order', async (req, res) => {
  try {
    console.log('Received a new order request!');
    const orderData = req.body;

    // Add a timestamp to the order
    orderData.createdAt = new Date();
    orderData.status = 'Processing'; // Set initial status

    // --- SAVE TO FIRESTORE ---
    // Get a reference to the 'orders' collection and add a new document
    const orderRef = await db.collection('orders').add(orderData);
    console.log('Order saved to Firestore with ID:', orderRef.id);
    // --- END SAVE TO FIRESTORE ---

    res.status(200).json({ 
      message: 'Order received and saved successfully!', 
      orderId: orderRef.id // Send back the real order ID from Firestore
    });

  } catch (error) {
    console.error("Error saving order to Firestore:", error);
    res.status(500).json({ message: 'Failed to save order.' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running locally on http://localhost:${PORT}`);
});