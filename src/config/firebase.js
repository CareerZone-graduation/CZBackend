// src/config/firebase.js
import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

// Đảm bảo bạn dùng import.meta.url với ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Đường dẫn tới file serviceAccountKey.json ở thư mục gốc
const serviceAccount = JSON.parse(
  readFileSync(path.resolve(__dirname, '../../serviceAccountKey.json'), 'utf8')
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

console.log('Firebase Admin SDK initialized successfully.');

export default admin;