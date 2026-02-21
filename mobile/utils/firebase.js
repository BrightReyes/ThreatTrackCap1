// Firebase configuration for ThreatTrack Mobile
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyA2hkOVWFxkHTx9jYEfZ_SPCocfX4gSdVA",
  authDomain: "threattrackcap1.firebaseapp.com",
  projectId: "threattrackcap1",
  storageBucket: "threattrackcap1.firebasestorage.app",
  messagingSenderId: "278045657556",
  appId: "1:278045657556:web:cdc9528b8097ca7dadae41",
  measurementId: "G-467FLMJZM8"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize services
export const auth = getAuth(app);
export const db = getFirestore(app);

export default app;
