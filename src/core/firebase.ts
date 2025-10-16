// This file initializes and exports all necessary Firebase services.

// --- Firebase Imports ---
import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getFunctions } from 'firebase/functions'
import { getStorage } from 'firebase/storage'

// --- Firebase Config ---
const DEVELOPMENT_FirebaseConfig = {
  apiKey: "AIzaSyAT81L_gsi3PWwxiz1FpoiUD54aYYhrkj8",
  authDomain: "finalytics-development.firebaseapp.com",
  projectId: "finalytics-development",
  storageBucket: "finalytics-development.firebasestorage.app",
  messagingSenderId: "334725384863",
  appId: "1:334725384863:web:69d07127690da125c630aa"
}
const PRODUCTION_FirebaseConfig = {
  apiKey: 'AIzaSyB9_J1AZkSbCM9v3PeV4m33qojHX51bLwg',
  authDomain: 'finalytics-62350.firebaseapp.com',
  projectId: 'finalytics-62350',
  storageBucket: 'finalytics-62350.firebasestorage.app',
  messagingSenderId: '586305419053',
  appId: '1:586305419053:web:b94a325fd5b649340305a4',
}

const knownProductionHostnames = ['finalytics.id', 'www.finalytics.id', 'app.finalytics.id']
const isProduction = knownProductionHostnames.includes(window.location.hostname)
const currentFirebaseConfig = isProduction
  ? PRODUCTION_FirebaseConfig
  : DEVELOPMENT_FirebaseConfig

console.debug(
  'Firebase is running in ' +
  (isProduction ? 'PRODUCTION' : 'DEVELOPMENT') +
  ' environment.',
);

// --- Initialize and Export Firebase Services ---
export const app = initializeApp(currentFirebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)
export const functions = getFunctions(app)
export const storage = getStorage(app)
