/* ---------------------------------------------------------
   1. FIREBASE INIT
--------------------------------------------------------- */
import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";


/* ---------------------------------------------------------
   2. FIREBASE CONFIG
--------------------------------------------------------- */
const firebaseConfig = {
  apiKey: "AIzaSyAu5VsFBmcOLZtUbNMjdue2vQeMhWVIRqk",
  authDomain: "app-387dc.firebaseapp.com",
  projectId: "app-387dc",
  storageBucket: "app-387dc.firebasestorage.app",
  messagingSenderId: "227151496412",
  appId: "1:227151496412:web:ac35b7ecd7f39905cba019",
  measurementId: "G-9E282TKXSJ"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);


/* ---------------------------------------------------------
   3. DOM ELEMENTS
--------------------------------------------------------- */
const authCard = document.getElementById("authCard");
const topbar = document.getElementById("topbar");
const topbarUser = document.getElementById("topbarUser");

const inventoryCard = document.getElementById("inventoryCard");
const recipeCard = document.getElementById("recipeCard");
const posCard = document.getElementById("posCard");
const dashboardCard = document.getElementById("dashboardCard");
const opnameCard = document.getElementById("opnameCard");

const btnLogin = document.getElementById("btnLogin");
const btnRegister = document.getElementById("btnRegister");
const btnLogout = document.getElementById("btnLogout");

const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");

const registerEmail = document.getElementById("registerEmail");
const registerPassword = document.getElementById("registerPassword");
const registerRole = document.getElementById("registerRole");

const toastContainer = document.getElementById("toastContainer");

function toast(msg) {
  const div = document.createElement("div");
  div.className = "toast";
  div.innerText = msg;
  toastContainer.appendChild(div);
  setTimeout(() => div.remove(), 3000);
}


/* ---------------------------------------------------------
   4. REGISTER USER + ROLE
--------------------------------------------------------- */
btnRegister.addEventListener("click", async () => {
  const email = registerEmail.value.trim();
  const pass = registerPassword.value.trim();
  const role = registerRole.value;

  if (!email || !pass) return toast("Isi email & password.");

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);

    await addDoc(collection(db, "users"), {
      uid: cred.user.uid,
      email: email,
      role: role,
      createdAt: serverTimestamp()
    });

    toast("User berhasil diregister.");
  } catch (err) {
    toast("Gagal register: " + err.message);
  }
});


/* ---------------------------------------------------------
   5. LOGIN
--------------------------------------------------------- */
btnLogin.addEventListener("click", async () => {
  const email = loginEmail.value.trim();
  const pass = loginPassword.value.trim();

  if (!email || !pass) return toast("Email & password wajib.");

  try {
    await signInWithEmailAndPassword(auth, email, pass);
    toast("Login berhasil.");
  } catch (err) {
    toast("Login gagal: " + err.message);
  }
});


/* ---------------------------------------------------------
   6. LOGOUT
--------------------------------------------------------- */
btnLogout.addEventListener("click", async () => {
  await signOut(auth);
});


/* ---------------------------------------------------------
   7. GET USER ROLE
--------------------------------------------------------- */
async function getUserRole(uid) {
  const q = query(collection(db, "users"), where("uid", "==", uid));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return snap.docs[0].data().role;
}


/* ---------------------------------------------------------
   8. AUTH STATE LISTENER
--------------------------------------------------------- */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    // Logout mode
    authCard.classList.remove("hidden");
    topbar.classList.add("hidden");

    inventoryCard.classList.add("hidden");
    recipeCard.classList.add("hidden");
    posCard.classList.add("hidden");
    dashboardCard.classList.add("hidden");
    opnameCard.classList.add("hidden");
    return;
  }

  // Login mode
  const role = await getUserRole(user.uid);

  topbar.classList.remove("hidden");
  topbarUser.innerHTML = `${user.email} (${role})`;
  authCard.classList.add("hidden");

  if (role === "admin") {
    inventoryCard.classList.remove("hidden");
    recipeCard.classList.remove("hidden");
    posCard.classList.remove("hidden");
    dashboardCard.classList.remove("hidden");
    opnameCard.classList.remove("hidden");
  }

  if (role === "kasir") {
    inventoryCard.classList.add("hidden");
    recipeCard.classList.add("hidden");
    dashboardCard.classList.add("hidden");
    opnameCard.classList.add("hidden");

    posCard.classList.remove("hidden");
  }
});