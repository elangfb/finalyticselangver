// This file initializes and exports all necessary Firebase services.

// --- Firebase Imports ---
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from "firebase/functions";
import { getStorage } from "firebase/storage";

// --- Firebase Config ---
const firebaseConfig = {
  apiKey: 'AIzaSyB9_J1AZkSbCM9v3PeV4m33qojHX51bLwg',
  authDomain: 'finalytics-62350.firebaseapp.com',
  projectId: 'finalytics-62350',
  storageBucket: 'finalytics-62350.firebasestorage.app',
  messagingSenderId: '586305419053',
  appId: '1:586305419053:web:b94a325fd5b649340305a4',
};

// --- Initialize and Export Firebase Services ---
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);
export const storage = getStorage(app);
