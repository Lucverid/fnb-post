// script.js
// ========== IMPORT FIREBASE ==========
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

// ========== FIREBASE CONFIG ==========
const firebaseConfig = {
  apiKey: "AIzaSyAu5VsFBmcOLZtUbNMjdue2vQeMhWVIRqk",
  authDomain: "app-387dc.firebaseapp.com",
  projectId: "app-387dc",
  storageBucket: "app-387dc.firebasestorage.app",
  messagingSenderId: "227151496412",
  appId: "1:227151496412:web:ac35b7ecd7f39905cba019",
  measurementId: "G-9E282TKXSJ",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ========== DOM HELPER ==========
const $ = (id) => document.getElementById(id);

// Toast sederhana
const toastContainer = $("toast-container");
function showToast(msg, type = "info", time = 3000) {
  if (!toastContainer) return;
  const div = document.createElement("div");
  div.className = `toast toast-${type}`;
  div.textContent = msg;
  toastContainer.appendChild(div);
  setTimeout(() => div.remove(), time);
}

// ========== ELEMENTS ==========
const authCard = $("auth-card");
const appShell = $("app-shell");

const loginEmail = $("loginEmail");
const loginPassword = $("loginPassword");
const registerEmail = $("registerEmail");
const registerPassword = $("registerPassword");
const registerRole = $("registerRole");
const btnLogin = $("btnLogin");
const btnRegister = $("btnRegister");
const btnLogout = $("btnLogout");

const topbarEmail = $("topbarEmail");
const connectionStatus = $("connectionStatus");
const bannerRole = $("bannerRole");

const welcomeBanner = $("welcomeBanner");
const salesSection = $("salesSection");
const inventorySection = $("inventorySection");
const dashboardSection = $("dashboardSection");
const opnameSection = $("opnameSection");

const sidebar = $("sidebar");
const burgerBtn = $("burgerBtn");
const notifBtn = $("notifBtn");
const notifPanel = $("notifPanel");
const notifBadge = $("notifBadge");
const notifList = $("notifList");

// ========== COLLECTION ==========
const colUsers = collection(db, "users");

// ========== STATE ==========
let currentUser = null;
let currentRole = null;

// ========== CONNECTION LABEL ==========
function updateConnectionStatus() {
  if (!connectionStatus) return;
  if (navigator.onLine) {
    connectionStatus.textContent = "Online";
    connectionStatus.classList.remove("offline");
    connectionStatus.classList.add("online");
  } else {
    connectionStatus.textContent = "Offline";
    connectionStatus.classList.remove("online");
    connectionStatus.classList.add("offline");
  }
}
updateConnectionStatus();
window.addEventListener("online", updateConnectionStatus);
window.addEventListener("offline", updateConnectionStatus);

// ========== ROLE HANDLER ==========
async function getUserRole(uid) {
  try {
    const q = query(colUsers, where("uid", "==", uid));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    let role = null;
    snap.forEach((d) => {
      const data = d.data();
      if (data.role) role = data.role;
    });
    return role;
  } catch (err) {
    console.error("getUserRole error:", err);
    return null;
  }
}

function applyRoleUI(role) {
  currentRole = role || "kasir";
  const adminOnly = document.querySelectorAll(".admin-only");
  if (currentRole === "admin") {
    adminOnly.forEach((el) => el.classList.remove("hidden"));
  } else {
    adminOnly.forEach((el) => el.classList.add("hidden"));
  }

  if (bannerRole) {
    bannerRole.textContent =
      currentRole === "admin" ? "Administrator" : "Kasir";
  }
}

// ========== NAVIGATION ==========
function showSection(name) {
  [salesSection, inventorySection, dashboardSection, opnameSection].forEach(
    (sec) => sec && sec.classList.add("hidden")
  );
  if (name === "sales" && salesSection) salesSection.classList.remove("hidden");
  if (name === "inventory" && inventorySection)
    inventorySection.classList.remove("hidden");
  if (name === "dashboard" && dashboardSection)
    dashboardSection.classList.remove("hidden");
  if (name === "opname" && opnameSection)
    opnameSection.classList.remove("hidden");

  const sideItems = document.querySelectorAll(".side-item");
  sideItems.forEach((btn) => {
    const target = btn.dataset.section;
    if (target === name) btn.classList.add("active");
    else btn.classList.remove("active");
  });

  if (window.innerWidth <= 900 && appShell) {
    appShell.classList.remove("sidebar-open");
  }
}

// Sidebar buttons
document.querySelectorAll(".side-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.section;
    if (target) showSection(target);
  });
});

// Burger (slide-in sidebar di mobile)
if (burgerBtn && appShell) {
  burgerBtn.addEventListener("click", () => {
    appShell.classList.toggle("sidebar-open");
  });
}

// ========== NOTIFIKASI SEDERHANA ==========
function setDummyNotif() {
  if (!notifList || !notifBadge) return;
  notifList.innerHTML = "";
  const li = document.createElement("li");
  li.textContent = "Belum ada notifikasi stok.";
  notifList.appendChild(li);
  notifBadge.textContent = "0";
}

setDummyNotif();

if (notifBtn && notifPanel) {
  notifBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    notifPanel.classList.toggle("open");
  });
  document.addEventListener("click", (e) => {
    if (!notifPanel.contains(e.target) && !notifBtn.contains(e.target)) {
      notifPanel.classList.remove("open");
    }
  });
}

// ========== AUTH HANDLERS ==========

// Login
if (btnLogin) {
  btnLogin.addEventListener("click", async () => {
    try {
      const email = (loginEmail?.value || "").trim();
      const pass = (loginPassword?.value || "").trim();
      if (!email || !pass) {
        showToast("Email & password wajib diisi", "error");
        return;
      }
      await signInWithEmailAndPassword(auth, email, pass);
      showToast("Login berhasil", "success");
    } catch (err) {
      console.error(err);
      showToast("Login gagal: " + (err.message || err.code), "error");
    }
  });
}

// Register
if (btnRegister) {
  btnRegister.addEventListener("click", async () => {
    try {
      const email = (registerEmail?.value || "").trim();
      const pass = (registerPassword?.value || "").trim();
      const role = registerRole?.value || "kasir";
      if (!email || !pass) {
        showToast("Email & password wajib diisi", "error");
        return;
      }
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      await addDoc(colUsers, {
        uid: cred.user.uid,
        email,
        role,
        createdAt: serverTimestamp(),
      });
      showToast("User berhasil dibuat", "success");
      if (registerEmail) registerEmail.value = "";
      if (registerPassword) registerPassword.value = "";
    } catch (err) {
      console.error(err);
      showToast("Register gagal: " + (err.message || err.code), "error");
    }
  });
}

// Logout
if (btnLogout) {
  btnLogout.addEventListener("click", async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error(err);
      showToast("Logout gagal: " + (err.message || err.code), "error");
    }
  });
}

// ========== AUTH STATE LISTENER ==========
onAuthStateChanged(auth, async (user) => {
  currentUser = user || null;

  if (user) {
    // Sudah login
    if (authCard) authCard.classList.add("hidden");
    if (appShell) appShell.classList.remove("hidden");

    const role = (await getUserRole(user.uid)) || "kasir";
    applyRoleUI(role);

    if (topbarEmail) topbarEmail.textContent = `${user.email} (${role})`;

    if (welcomeBanner) welcomeBanner.classList.remove("hidden");

    // default buka kasir
    showSection("sales");
  } else {
    // Belum login
    currentRole = null;
    if (authCard) authCard.classList.remove("hidden");
    if (appShell) appShell.classList.add("hidden");
    if (topbarEmail) topbarEmail.textContent = "–";
  }
});

// ========== (NANTI) LOGIC POS / INVENTORY / DASHBOARD ==========
// Di sini nanti kita sambungkan lagi logic penjualan, inventory, chart, dsb
// pakai struktur section baru. Untuk sekarang yang penting login → app shell dulu.