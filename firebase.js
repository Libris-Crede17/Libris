import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js'
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  fetchSignInMethodsForEmail
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js'
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,       
  where,
  orderBy,
  onSnapshot, 
  runTransaction,
  serverTimestamp,
  Timestamp,
  increment
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js'

export const firebaseConfig = {
  apiKey: 'AIzaSyBWVnNcSHqt3LqsnvZYbCMc7S5wHZuWwaY',
  authDomain: 'librisce.firebaseapp.com',
  projectId: 'librisce',
  storageBucket: 'librisce.firebasestorage.app',
  messagingSenderId: '1003932601888',
  appId: '1:1003932601888:web:8ea81e3f6d0ba2cbd8f645',
  measurementId: 'G-SCSF9Y5G2S'
}

export const firebaseReady = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.appId
)

export const app = firebaseReady ? initializeApp(firebaseConfig) : null
export const auth = app ? getAuth(app) : null
export const db = app ? getFirestore(app) : null

export {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  fetchSignInMethodsForEmail,
  collection,
  doc,
  getDoc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  Timestamp,
  increment
}
