// Firebase configuration for ThreatTrack Mobile
import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
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

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize auth with AsyncStorage persistence
const persistence = getReactNativePersistence(ReactNativeAsyncStorage);
export const auth = initializeAuth(app, { persistence });

// Initialize services
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;
