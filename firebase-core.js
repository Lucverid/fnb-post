// ============================================================
// firebase-core.js — Modul inti Firebase
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  getDoc,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyAu5VsFBmcOLZtUbNMjdue2vQeMhWVIRqk",
  authDomain: "app-387dc.firebaseapp.com",
  projectId: "app-387dc",
  storageBucket: "app-387dc.firebasestorage.app",
  messagingSenderId: "227151496412",
  appId: "1:227151496412:web:ac35b7ecd7f39905cba019",
  measurementId: "G-9E282TKXSJ",
};

// --- Init ---
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// --- Firestore References ---
export const colUsers = collection(db, "users");
export const colProducts = collection(db, "products");
export const colSales = collection(db, "sales");
export const colOpname = collection(db, "stock_opname");

// --- Firebase export ---
export {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  addDoc,
  getDocs,
  getDoc,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp
};

console.log("🔥 firebase-core.js loaded");
