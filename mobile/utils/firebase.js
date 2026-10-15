// Firebase configuration for ThreatTrack Mobile
import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAuth, getAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: "AIzaSyA2hkOVWFxkHTx9jYEfZ_SPCocfX4gSdVA",
  authDomain: "threattrackcap1.firebaseapp.com",
  projectId: "threattrackcap1",
  storageBucket: "threattrackcap1.firebasestorage.app",
  messagingSenderId: "278045657556",
  appId: "1:278045657556:web:cdc9528b8097ca7dadae41",
  measurementId: "G-467FLMJZM8"
};

// Initialize Firebase App as a singleton
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize auth with AsyncStorage persistence safely
let authInstance;
try {
  const persistence = getReactNativePersistence(ReactNativeAsyncStorage);
  authInstance = initializeAuth(app, { persistence });
} catch (e) {
  authInstance = getAuth(app);
}

export const auth = authInstance;

// Initialize services
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;
