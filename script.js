/* --------------------------------------------------
   FIREBASE INIT
-------------------------------------------------- */

import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";

import {
  getFirestore, doc, setDoc, getDoc, getDocs, collection,
  onSnapshot, updateDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

/* --- GANTI INI DENGAN PUNYAMU --- */
const firebaseConfig = {
  apiKey: "YOUR KEY",
  authDomain: "YOUR DOMAIN",
  projectId: "YOUR PROJECT",
  storageBucket: "YOUR BUCKET",
  messagingSenderId: "YOUR SENDER",
  appId: "YOUR APPID"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

/* --------------------------------------------------
   GLOBAL STATE
-------------------------------------------------- */
let ONLINE = navigator.onLine;
let USER = null;
let USER_ROLE = null;
let CART = [];
let PRODUCTS = {};  
let RECIPES = {};   
let SALES = [];     

const isOnline = () => navigator.onLine;

/* --------------------------------------------------
   TOAST
-------------------------------------------------- */
function toast(msg, type = "info") {
  const box = document.getElementById("toast-container");
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.innerText = msg;
  box.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

/* --------------------------------------------------
   OFFLINE MODE (LOCAL STORAGE)
-------------------------------------------------- */
function saveLocal(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
function loadLocal(key, fallback = null) {
  const v = localStorage.getItem(key);
  return v ? JSON.parse(v) : fallback;
}

/* SIMPAN SEMUA DATA */
function saveAllLocal() {
  saveLocal("products", PRODUCTS);
  saveLocal("recipes", RECIPES);
  saveLocal("cart", CART);
  saveLocal("sales", SALES);
}

/* LOAD SEMUA DATA */
function loadAllLocal() {
  PRODUCTS = loadLocal("products", {});
  RECIPES = loadLocal("recipes", {});
  CART = loadLocal("cart", []);
  SALES = loadLocal("sales", []);
}

/* --------------------------------------------------
   SYNC ENGINE: Jika online → sinkron Firestore
-------------------------------------------------- */
async function syncAll() {
  if (!isOnline()) return;

  toast("Sinkronisasi server…", "info");

  /* sync products */
  for (let id in PRODUCTS) {
    await setDoc(doc(db, "products", id), PRODUCTS[id]);
  }

  /* sync recipes */
  for (let id in RECIPES) {
    await setDoc(doc(db, "recipes", id), RECIPES[id]);
  }

  /* sync sales */
  for (let s of SALES) {
    if (!s.synced) {
      await setDoc(doc(db, "sales", s.id), s);
      s.synced = true;
    }
  }

  saveAllLocal();
  toast("Sinkronisasi selesai", "success");
}

/* Listener jika dari offline → online */
window.addEventListener("online", () => {
  document.getElementById("connectionStatus").innerHTML = "🟢 Online";
  syncAll();
});

window.addEventListener("offline", () => {
  document.getElementById("connectionStatus").innerHTML = "🔴 Offline";
});



/* --------------------------------------------------
   SIDEBAR TOGGLE (MOBILE)
-------------------------------------------------- */
const sidebar = document.getElementById("sidebar");
const burger = document.getElementById("btnSidebarToggle");

burger.addEventListener("click", () => {
  sidebar.classList.toggle("open");
});

/* CLICK OUTSIDE CLOSE */
document.addEventListener("click", e => {
  if (!sidebar.contains(e.target) &&
      !burger.contains(e.target) &&
      window.innerWidth < 900) 
  {
    sidebar.classList.remove("open");
  }
});

/* --------------------------------------------------
   NOTIF PANEL
-------------------------------------------------- */
const notifBtn = document.getElementById("notifBtn");
const notifPanel = document.getElementById("notifPanel");

notifBtn.onclick = () => {
  notifPanel.classList.toggle("open");
};

document.addEventListener("click", e => {
  if (!notifPanel.contains(e.target) && !notifBtn.contains(e.target)) {
    notifPanel.classList.remove("open");
  }
});

/* Tambah Notif */
function addNotif(msg) {
  const list = document.getElementById("reminderList");
  const badge = document.getElementById("notifBadge");

  const li = document.createElement("li");
  li.innerText = msg;

  list.appendChild(li);
  badge.innerText = parseInt(badge.innerText) + 1;
}



/* --------------------------------------------------
   REGISTER
-------------------------------------------------- */
document.getElementById("btnRegister").onclick = async () => {
  const email = registerEmail.value;
  const pass = registerPassword.value;
  const role = registerRole.value;

  try {
    const userCred = await createUserWithEmailAndPassword(auth, email, pass);

    await setDoc(doc(db, "users", userCred.user.uid), {
      role,
      email
    });

    toast("Registrasi berhasil", "success");
  } catch (e) {
    toast("Gagal daftar: " + e.message, "error");
  }
};

/* --------------------------------------------------
   LOGIN
-------------------------------------------------- */
document.getElementById("btnLogin").onclick = async () => {
  try {
    await signInWithEmailAndPassword(auth, loginEmail.value, loginPassword.value);
    toast("Login berhasil", "success");
  } catch {
    toast("Login gagal", "error");
  }
};

/* --------------------------------------------------
   AUTH LISTENER
-------------------------------------------------- */
onAuthStateChanged(auth, async (u) => {
  if (!u) {
    document.getElementById("authCard").classList.remove("hidden");
    document.getElementById("appShell").classList.add("hidden");
    return;
  }

  USER = u;

  /* ambil role */
  const snap = await getDoc(doc(db, "users", u.uid));
  USER_ROLE = snap.exists() ? snap.data().role : "kasir";

  /* tampil UI */
  document.getElementById("bannerRole").innerText = USER_ROLE;
  document.getElementById("bannerUserEmail").innerText = u.email;
  document.getElementById("topbarUser").innerText = u.email;

  document.getElementById("authCard").classList.add("hidden");
  document.getElementById("appShell").classList.remove("hidden");

  /* Kasir hanya bisa akses menu kasir */
  document.querySelectorAll(".sidebar-admin").forEach(el => {
    el.style.display = USER_ROLE === "admin" ? "block" : "none";
  });

  /* load data */
  await loadDataFromServer();
  renderAll();
});

/* --------------------------------------------------
   LOAD DATA DARI FIRESTORE
-------------------------------------------------- */
async function loadDataFromServer() {
  if (!isOnline()) {
    loadAllLocal();
    return;
  }

  /* load products */
  const ps = await getDocs(collection(db, "products"));
  PRODUCTS = {};
  ps.forEach(d => PRODUCTS[d.id] = d.data());

  /* load recipes */
  const rs = await getDocs(collection(db, "recipes"));
  RECIPES = {};
  rs.forEach(d => RECIPES[d.id] = d.data());

  /* load sales */
  const ss = await getDocs(collection(db, "sales"));
  SALES = [];
  ss.forEach(d => SALES.push(d.data()));

  saveAllLocal();
}






/* --------------------------------------------------
   INVENTORY CRUD
-------------------------------------------------- */
document.getElementById("btnSaveProduct").onclick = () => {
  const name = productName.value.trim();
  const type = productType.value;
  const cat  = productCategory.value;
  const price = Number(productPrice.value);
  const stock = Number(productStock.value);
  const min   = Number(productMinStock.value);
  const unit  = productUnit.value;

  if (!name) return toast("Nama wajib diisi", "error");

  const id = crypto.randomUUID();

  PRODUCTS[id] = {
    id,
    name,
    type,
    category: cat,
    price,
    stock,
    minStock: min,
    unit
  };

  saveAllLocal();
  syncAll();
  renderProducts();
  toast("Item disimpan", "success");
};

/* --------------------------------------------------
   RECIPE (BOM)
-------------------------------------------------- */
document.getElementById("btnAddRecipe").onclick = () => {
  const menuId = recipeMenuSelect.value;
  const ingId  = recipeIngredientSelect.value;
  const qty    = Number(recipeQty.value);

  if (!RECIPES[menuId]) RECIPES[menuId] = {};
  RECIPES[menuId][ingId] = qty;

  saveAllLocal();
  syncAll();
  renderRecipe(menuId);

  toast("Bahan ditambahkan", "success");
};






/* --------------------------------------------------
   PILIH MENU
-------------------------------------------------- */
saleSearch.addEventListener("input", renderSaleMenu);

function renderSaleMenu() {
  const body = document.getElementById("saleMenuTableBody");
  const q = saleSearch.value.toLowerCase();
  body.innerHTML = "";

  Object.values(PRODUCTS).filter(p => p.type === "menu")
    .filter(p => p.name.toLowerCase().includes(q))
    .forEach(p => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${p.name}</td>
        <td>Rp ${p.price.toLocaleString()}</td>
        <td><button class="btn-primary" onclick="selectMenu('${p.id}')">Pilih</button></td>
      `;
      body.appendChild(tr);
    });
}

/* --------------------------------------------------
   CEK STOK BAHAN (BOM)
-------------------------------------------------- */
function checkRecipeStock(menuId, qty) {
  if (!RECIPES[menuId]) return true; 

  for (let ingId in RECIPES[menuId]) {
    let need = RECIPES[menuId][ingId] * qty;
    if (PRODUCTS[ingId].stock < need) return false;
  }
  return true;
}

/* --------------------------------------------------
   ADD TO CART
-------------------------------------------------- */
document.getElementById("btnAddToCart").onclick = () => {
  const id = saleSelectedId.value;
  const qty = Number(saleQty.value);

  if (!id) return toast("Pilih menu", "error");

  if (!checkRecipeStock(id, qty)) {
    return toast("Bahan baku tidak mencukupi!", "error");
  }

  const menu = PRODUCTS[id];

  CART.push({
    id,
    name: menu.name,
    qty,
    price: menu.price,
    subtotal: menu.price * qty
  });

  saveAllLocal();
  renderCart();
  toast("Ditambahkan ke keranjang", "success");
};

/* --------------------------------------------------
   SIMPAN PENJUALAN
-------------------------------------------------- */
document.getElementById("btnSaveSale").onclick = async () => {
  if (CART.length === 0) return toast("Keranjang kosong", "error");

  const discount = Number(saleDiscount.value);
  const voucher = Number(saleVoucher.value);

  const subtotal = CART.reduce((a,b) => a + b.subtotal, 0);
  const total = subtotal - (subtotal * discount/100) - voucher;

  /* kurangi stok bahan baku */
  for (let item of CART) {
    const menuId = item.id;

    if (RECIPES[menuId]) {
      for (let ingId in RECIPES[menuId]) {
        PRODUCTS[ingId].stock -= RECIPES[menuId][ingId] * item.qty;
      }
    }
  }

  const sale = {
    id: crypto.randomUUID(),
    time: Date.now(),
    items: CART,
    total,
    synced: isOnline()
  };

  SALES.push(sale);
  CART = [];

  saveAllLocal();
  syncAll();
  renderCart();
  renderSales();

  printReceipt(sale);

  toast("Penjualan disimpan", "success");
};

/* --------------------------------------------------
   PRINT STRUK
-------------------------------------------------- */
function printReceipt(sale) {
  const box = document.getElementById("printArea");
  box.innerHTML = `
    <h3 style="margin:4px 0">STRUK PEMBAYARAN</h3>
    <hr>
  `;

  sale.items.forEach(i => {
    box.innerHTML += `
      <div class="receipt-row">
        <div class="receipt-left">${i.name} x${i.qty}</div>
        <div class="receipt-right">Rp ${i.subtotal.toLocaleString()}</div>
      </div>
    `;
  });

  box.innerHTML += `
    <hr>
    <div class="receipt-row">
      <strong>Total</strong>
      <strong>Rp ${sale.total.toLocaleString()}</strong>
    </div>
  `;
}





let dailyChart, monthlyChart;

function renderDashboard() {
  const ctx = document.getElementById("dailyChart").getContext("2d");

  const today = new Date().setHours(0,0,0,0);
  const filtered = SALES.filter(s => {
    return new Date(s.time).setHours(0,0,0,0) === today;
  });

  const hours = Array.from({length: 24}, (_,i) => i);
  const values = hours.map(h => {
    let total = 0;
    filtered.forEach(s => {
      const sh = new Date(s.time).getHours();
      if (sh === h) total += s.total;
    });
    return total;
  });

  if (dailyChart) dailyChart.destroy();

  dailyChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: hours.map(h => h + ":00"),
      datasets: [{
        label: "Penjualan",
        data: values,
        fill: true,
        tension: 0.4,
        borderWidth: 2,
        borderColor: "#4f46e5",
        backgroundColor: "rgba(79,70,229,0.25)"
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } }
    }
  });
}

