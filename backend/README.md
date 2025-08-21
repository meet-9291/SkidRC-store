SkidRC backend

Run locally

1. Install dependencies:
   npm install

2. Set Firebase Admin credentials for local dev (optional if you have serviceAccountKey.json):
   - Place serviceAccountKey.json in backend/ or set env var FIREBASE_SERVICE_ACCOUNT to the JSON contents

3. Start server:
   npm start

Server will serve the frontend at /

Endpoints

- GET /healthz -> health check
- POST /api/create-order -> stores order in Firestore

