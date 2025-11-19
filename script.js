// script.js (versi stabil + filter dashboard + menu terlaris + riwayat + search)
// ================= FIREBASE =================
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
  orderBy,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

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

// ================= UTIL & DOM =================
const $ = (id) => document.getElementById(id);

const toastContainer = $("toast-container");
function showToast(msg, type = "info", time = 3000) {
  if (!toastContainer) return;
  const div = document.createElement("div");
  div.className = `toast toast-${type}`;
  div.textContent = msg;
  toastContainer.appendChild(div);
  setTimeout(() => div.remove(), time);
}

function formatCurrency(num) {
  const n = Number(num || 0);
  return "Rp " + n.toLocaleString("id-ID");
}
function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function formatDateTime(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

// ================= ELEMENTS =================
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

// POS
const saleSearch = $("saleSearch");
const saleMenuBody = $("saleMenuBody");
const cartBody = $("cartBody");
const cartSubtotalLabel = $("cartSubtotal");
const saleDiscount = $("saleDiscount");
const saleVoucher = $("saleVoucher");
const saleTotal = $("saleTotal");
const salePay = $("salePay");
const saleChange = $("saleChange");
const btnSaveSale = $("btnSaveSale");
const printArea = $("printArea");

// Inventory
const productName = $("productName");
const productType = $("productType");
const productCategory = $("productCategory");
const productPrice = $("productPrice");
const productStock = $("productStock");
const productMinStock = $("productMinStock");
const productUnit = $("productUnit");
const btnSaveProduct = $("btnSaveProduct");
const productTable = $("productTable");

// Dashboard
const metricEmptyCount = $("metricEmptyCount");
const metricLowCount = $("metricLowCount");
const metricOkCount = $("metricOkCount");
const dailyChartCanvas = $("dailyChart");
const monthlyChartCanvas = $("monthlyChart");
let dailyChart = null;
let monthlyChart = null;

// 🔍 filter tanggal + menu terlaris + riwayat
const filterStart = $("filterStart");
const filterEnd = $("filterEnd");
const btnFilterApply = $("btnFilterApply");
const btnFilterReset = $("btnFilterReset");
const topMenuTable = $("topMenuTable");
const historyTable = $("historyTable");
const historySearch = $("historySearch");

// Opname
const opnameTable = $("opnameTable");

// ================= FIRESTORE COLLECTION =================
const colUsers = collection(db, "users");
const colProducts = collection(db, "products");
const colSales = collection(db, "sales");
const colOpname = collection(db, "stock_opname");

// ================= STATE =================
let currentUser = null;
let currentRole = null;
let productsCache = [];
let salesCache = [];
let currentCart = [];
let editingProductId = null;

// ================= CONNECTION LABEL =================
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

// ================= ROLE =================
async function getUserRole(uid) {
  try {
    const qRole = query(colUsers, where("uid", "==", uid));
    const snap = await getDocs(qRole);
    if (snap.empty) return null;
    let role;
    snap.forEach((d) => {
      const data = d.data();
      if (data.role) role = data.role;
    });
    return role || "kasir";
  } catch (e) {
    console.error("getUserRole", e);
    return "kasir";
  }
}

function applyRoleUI(role) {
  currentRole = role || "kasir";
  const adminOnly = document.querySelectorAll(".admin-only");
  adminOnly.forEach((el) =>
    currentRole === "admin"
      ? el.classList.remove("hidden")
      : el.classList.add("hidden")
  );
  if (bannerRole)
    bannerRole.textContent = currentRole === "admin" ? "Administrator" : "Kasir";
}

// ================= NAV =================
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

  document.querySelectorAll(".side-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.section === name);
  });

  if (window.innerWidth <= 900 && sidebar) {
    sidebar.classList.remove("open");
  }
}

document.querySelectorAll(".side-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.dataset.section) showSection(btn.dataset.section);
  });
});

// burger
if (burgerBtn && sidebar) {
  burgerBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    sidebar.classList.toggle("open");
  });

  document.addEventListener("click", (e) => {
    if (
      window.innerWidth <= 900 &&
      sidebar.classList.contains("open") &&
      !sidebar.contains(e.target) &&
      !burgerBtn.contains(e.target)
    ) {
      sidebar.classList.remove("open");
    }
  });
}

// ================= NOTIF STOK =================
function productStatus(prod) {
  if (prod.type !== "bahan_baku") return { label: "-", cls: "" };
  const stock = Number(prod.stock || 0);
  const min = Number(prod.minStock || 0);
  if (stock <= 0) return { label: "Habis", cls: "red" };
  if (min > 0 && stock <= min) return { label: "Hampir habis", cls: "yellow" };
  return { label: "Aman", cls: "green" };
}

function updateStockNotif() {
  if (!notifList || !notifBadge) return;

  notifList.innerHTML = "";
  let count = 0;

  const emptyItems = productsCache.filter(
    (p) => productStatus(p).label === "Habis"
  );
  const lowItems = productsCache.filter(
    (p) => productStatus(p).label === "Hampir habis"
  );

  emptyItems.forEach((p) => {
    const li = document.createElement("li");
    li.textContent = `Stok habis: ${p.name}`;
    notifList.appendChild(li);
    count++;
  });
  lowItems.forEach((p) => {
    const li = document.createElement("li");
    li.textContent = `Hampir habis: ${p.name} (sisa ${p.stock} ${p.unit || ""})`;
    notifList.appendChild(li);
    count++;
  });

  if (count === 0) {
    const li = document.createElement("li");
    li.textContent = "Tidak ada notifikasi stok.";
    notifList.appendChild(li);
  }
  notifBadge.textContent = String(count);
}

if (notifBtn && notifPanel) {
  notifBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    notifPanel.classList.toggle("hidden");
  });
  document.addEventListener("click", (e) => {
    if (!notifPanel.contains(e.target) && !notifBtn.contains(e.target)) {
      notifPanel.classList.add("hidden");
    }
  });
}

// ================= AUTH BTN =================
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

// ================= LOAD PRODUCTS =================
async function loadProducts() {
  try {
    const snap = await getDocs(query(colProducts, orderBy("name", "asc")));
    productsCache = [];
    snap.forEach((d) => productsCache.push({ id: d.id, ...d.data() }));

    renderProductTable();
    renderSaleMenu();
    updateStockMetrics();
    updateStockNotif();
    renderOpnameTable();
  } catch (err) {
    console.error("loadProducts error:", err);
    showToast("Gagal mengambil data produk", "error");
  }
}

function renderProductTable() {
  if (!productTable) return;
  productTable.innerHTML = "";
  productsCache.forEach((p) => {
    const st = productStatus(p);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.name || "-"}</td>
      <td>${p.type === "menu" ? "Menu" : "Bahan Baku"}</td>
      <td>${p.category || "-"}</td>
      <td>${p.type === "menu" ? formatCurrency(p.price || 0) : "-"}</td>
      <td>${p.type === "bahan_baku" ? p.stock || 0 : "-"}</td>
      <td>${st.label}</td>
      <td>
        <button data-act="edit" data-id="${p.id}">Edit</button>
        <button data-act="del" data-id="${p.id}">Hapus</button>
      </td>
    `;
    productTable.appendChild(tr);
  });

  productTable.querySelectorAll("button").forEach((btn) => {
    const id = btn.getAttribute("data-id");
    const act = btn.getAttribute("data-act");
    if (act === "edit") btn.addEventListener("click", () => fillProductForm(id));
    if (act === "del") btn.addEventListener("click", () => deleteProduct(id));
  });
}

function fillProductForm(id) {
  const p = productsCache.find((x) => x.id === id);
  if (!p) return;
  editingProductId = id;
  if (productName) productName.value = p.name || "";
  if (productType) productType.value = p.type || "bahan_baku";
  if (productCategory) productCategory.value = p.category || "makanan";
  if (productPrice) productPrice.value = p.price || "";
  if (productStock) productStock.value = p.stock || "";
  if (productMinStock) productMinStock.value = p.minStock || "";
  if (productUnit) productUnit.value = p.unit || "";
}

async function deleteProduct(id) {
  const p = productsCache.find((x) => x.id === id);
  if (!p) return;
  if (!confirm(`Hapus "${p.name}"?`)) return;
  try {
    await deleteDoc(doc(db, "products", id));
    showToast("Produk dihapus", "success");
    await loadProducts();
  } catch (e) {
    console.error(e);
    showToast("Gagal menghapus produk", "error");
  }
}

if (btnSaveProduct) {
  btnSaveProduct.addEventListener("click", async () => {
    try {
      const name = (productName?.value || "").trim();
      const type = productType?.value || "bahan_baku";
      const category = productCategory?.value || "lainnya";
      const price = Number(productPrice?.value || 0);
      const stock = Number(productStock?.value || 0);
      const minStock = Number(productMinStock?.value || 0);
      const unit = (productUnit?.value || "").trim();

      if (!name) {
        showToast("Nama produk wajib diisi", "error");
        return;
      }
      if (type === "menu" && (!price || price <= 0)) {
        showToast("Harga menu wajib diisi", "error");
        return;
      }

      const payload = {
        name,
        type,
        category,
        price: type === "menu" ? price : 0,
        stock: type === "bahan_baku" ? stock : 0,
        minStock: type === "bahan_baku" ? minStock : 0,
        unit,
        updatedAt: serverTimestamp(),
      };

      if (editingProductId) {
        await updateDoc(doc(db, "products", editingProductId), payload);
        showToast("Produk diupdate", "success");
      } else {
        await addDoc(colProducts, {
          ...payload,
          createdAt: serverTimestamp(),
        });
        showToast("Produk ditambahkan", "success");
      }
      editingProductId = null;
      if (productName) productName.value = "";
      if (productPrice) productPrice.value = "";
      if (productStock) productStock.value = "";
      if (productMinStock) productMinStock.value = "";
      if (productUnit) productUnit.value = "";
      await loadProducts();
    } catch (err) {
      console.error(err);
      showToast("Gagal menyimpan produk", "error");
    }
  });
}

// ================= POS =================
function renderSaleMenu() {
  if (!saleMenuBody) return;
  saleMenuBody.innerHTML = "";
  let list = productsCache.filter((p) => p.type === "menu");
  const q = (saleSearch?.value || "").trim().toLowerCase();
  if (q) list = list.filter((m) => (m.name || "").toLowerCase().includes(q));

  list.forEach((m) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${m.name || "-"}</td>
      <td>${formatCurrency(m.price || 0)}</td>
      <td><button data-id="${m.id}">Tambah</button></td>
    `;
    saleMenuBody.appendChild(tr);
  });

  saleMenuBody.querySelectorAll("button").forEach((b) => {
    const id = b.getAttribute("data-id");
    b.addEventListener("click", () => addToCart(id));
  });
}
if (saleSearch) saleSearch.addEventListener("input", renderSaleMenu);

function addToCart(productId) {
  const menu = productsCache.find((p) => p.id === productId);
  if (!menu) return;
  const existing = currentCart.find((i) => i.productId === productId);
  if (existing) {
    existing.qty += 1;
    existing.subtotal += menu.price || 0;
  } else {
    currentCart.push({
      productId,
      name: menu.name || "-",
      qty: 1,
      price: menu.price || 0,
      subtotal: menu.price || 0,
    });
  }
  renderCart();
}
function renderCart() {
  if (!cartBody) return;
  cartBody.innerHTML = "";
  currentCart.forEach((it, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${it.name}</td>
      <td>${it.qty}</td>
      <td>${formatCurrency(it.subtotal)}</td>
      <td><button data-idx="${idx}">x</button></td>
    `;
    cartBody.appendChild(tr);
  });
  cartBody.querySelectorAll("button").forEach((btn) => {
    const idx = Number(btn.getAttribute("data-idx"));
    btn.addEventListener("click", () => {
      currentCart.splice(idx, 1);
      renderCart();
    });
  });
  updateCartSummary();
}
function updateCartSummary() {
  const subtotal = currentCart.reduce(
    (sum, it) => sum + Number(it.subtotal || 0),
    0
  );
  if (cartSubtotalLabel) cartSubtotalLabel.textContent = formatCurrency(subtotal);
  const discPct = Number(saleDiscount?.value || 0);
  const voucher = Number(saleVoucher?.value || 0);
  let discAmount = discPct > 0 ? subtotal * (discPct / 100) : 0;
  let total = subtotal - discAmount - voucher;
  if (total < 0) total = 0;
  if (saleTotal) saleTotal.value = total;
  const pay = Number(salePay?.value || 0);
  const change = pay > total ? pay - total : 0;
  if (saleChange) saleChange.value = change;
}
[saleDiscount, saleVoucher, salePay].forEach((el) => {
  if (el) el.addEventListener("input", updateCartSummary);
});

function updatePrintAreaFromSale(saleDoc) {
  if (!printArea) return;
  const d = saleDoc.createdAtLocal ? new Date(saleDoc.createdAtLocal) : new Date();
  const waktu = formatDateTime(d);
  const kasir = saleDoc.createdBy || "-";
  const itemsHtml = (saleDoc.items || [])
    .map(
      (it) => `
      <div style="display:flex;justify-content:space-between;font-size:12px;">
        <span>${it.name} x${it.qty}</span>
        <span>${formatCurrency(it.subtotal)}</span>
      </div>`
    )
    .join("");
  printArea.innerHTML = `
    <div style="text-align:center;font-weight:700;margin-bottom:4px;">F&B POS</div>
    <div style="font-size:11px;margin-bottom:6px;">
      ${waktu}<br/>Kasir: ${kasir}
    </div>
    <hr/>
    ${itemsHtml || '<div style="font-size:11px;">(Tidak ada item)</div>'}
    <hr/>
    <div style="font-size:11px;">
      <div style="display:flex;justify-content:space-between;">
        <span>Total</span><span>${formatCurrency(saleDoc.total)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;">
        <span>Bayar</span><span>${formatCurrency(saleDoc.pay)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;">
        <span>Kembalian</span><span>${formatCurrency(saleDoc.change)}</span>
      </div>
    </div>`;
}

if (btnSaveSale) {
  btnSaveSale.addEventListener("click", async () => {
    try {
      if (!currentCart.length) {
        showToast("Keranjang kosong", "error");
        return;
      }
      const subtotal = currentCart.reduce(
        (sum, it) => sum + Number(it.subtotal || 0),
        0
      );
      const discountPercent = Number(saleDiscount?.value || 0);
      const voucher = Number(saleVoucher?.value || 0);
      const discountAmount =
        discountPercent > 0 ? subtotal * (discountPercent / 100) : 0;
      let total = subtotal - discountAmount - voucher;
      if (total < 0) total = 0;
      const pay = Number(salePay?.value || 0);
      if (pay < total) {
        showToast("Uang bayar kurang dari total", "error");
        return;
      }
      const change = pay - total;
      const now = new Date();
      const saleDoc = {
        items: currentCart.map((it) => ({ ...it })),
        subtotal,
        discountPercent,
        discountAmount,
        voucher,
        total,
        pay,
        change,
        dateKey: todayKey(now),
        createdAtLocal: now.toISOString(),
        createdBy: currentUser?.email || "-",
        createdByUid: currentUser?.uid || null,
      };
      await addDoc(colSales, { ...saleDoc, createdAt: serverTimestamp() });
      showToast("Transaksi tersimpan", "success");
      currentCart = [];
      renderCart();
      if (saleDiscount) saleDiscount.value = 0;
      if (saleVoucher) saleVoucher.value = 0;
      if (salePay) salePay.value = "";
      if (saleChange) saleChange.value = "";
      updatePrintAreaFromSale(saleDoc);
      await loadSales();
    } catch (e) {
      console.error(e);
      showToast("Gagal menyimpan transaksi", "error");
    }
  });
}

// ================= SALES / CHART =================
async function loadSales() {
  try {
    const snap = await getDocs(query(colSales, orderBy("createdAt", "desc")));
    salesCache = [];
    snap.forEach((d) => {
      const data = d.data();
      let createdDate = new Date();
      if (data.createdAt && typeof data.createdAt.toDate === "function") {
        createdDate = data.createdAt.toDate();
      } else if (data.createdAtLocal) {
        createdDate = new Date(data.createdAtLocal);
      }
      salesCache.push({
        id: d.id,
        ...data,
        createdAtDate: createdDate,
        dateKey: data.dateKey || todayKey(createdDate),
      });
    });
    // penting: semua pakai fungsi yang sama supaya sinkron
    updateCharts();
    updateTopMenu();
    updateHistoryTable();
  } catch (err) {
    console.error("loadSales error:", err);
    showToast("Gagal mengambil data penjualan", "error");
  }
}

// 👉 ambil penjualan sesuai filter tanggal
function getFilteredSales() {
  if (!salesCache.length) return [];
  let list = [...salesCache];

  if (filterStart?.value) {
    const sDate = new Date(filterStart.value + "T00:00:00");
    list = list.filter((s) => s.createdAtDate >= sDate);
  }
  if (filterEnd?.value) {
    const eDate = new Date(filterEnd.value + "T23:59:59");
    list = list.filter((s) => s.createdAtDate <= eDate);
  }

  return list;
}

function updateCharts() {
  if (
    !dailyChartCanvas ||
    !monthlyChartCanvas ||
    typeof Chart === "undefined"
  ) {
    console.warn("Chart.js belum siap, chart dilewati");
    return;
  }

  const src = getFilteredSales();
  const today = new Date();

  // ---- Harian (7 hari) ----
  const dayLabels = [];
  const dayData = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = todayKey(d);
    dayLabels.push(`${d.getDate()}/${d.getMonth() + 1}`);
    const sum = src
      .filter((s) => s.dateKey === key)
      .reduce((n, s) => n + Number(s.total || 0), 0);
    dayData.push(sum);
  }

  // ---- Bulanan (6 bulan) ----
  const monthLabels = [];
  const monthData = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthLabels.push(
      d.toLocaleString("id-ID", {
        month: "short",
      })
    );
    const sum = src
      .filter((s) => (s.dateKey || "").startsWith(ym))
      .reduce((n, s) => n + Number(s.total || 0), 0);
    monthData.push(sum);
  }

  if (dailyChart) dailyChart.destroy();
  if (monthlyChart) monthlyChart.destroy();

  dailyChart = new Chart(dailyChartCanvas.getContext("2d"), {
    type: "line",
    data: { labels: dayLabels, datasets: [{ label: "Omzet", data: dayData }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { y: { beginAtZero: true } },
    },
  });

  monthlyChart = new Chart(monthlyChartCanvas.getContext("2d"), {
    type: "bar",
    data: {
      labels: monthLabels,
      datasets: [{ label: "Omzet", data: monthData }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { y: { beginAtZero: true } },
    },
  });
}

// 👉 Menu terlaris (5–10 besar) sesuai filter tanggal
function updateTopMenu() {
  if (!topMenuTable) return;

  const src = getFilteredSales();
  const agg = {};

  src.forEach((s) => {
    (s.items || []).forEach((it) => {
      const key = it.name || "Tanpa Nama";
      if (!agg[key]) agg[key] = { qty: 0, total: 0 };
      agg[key].qty += Number(it.qty || 0);
      agg[key].total += Number(it.subtotal || 0);
    });
  });

  const rows = Object.entries(agg)
    .sort((a, b) => b[1].qty - a[1].qty)
    .slice(0, 10);

  topMenuTable.innerHTML = "";
  if (!rows.length) {
    const tr = document.createElement("tr");
    tr.innerHTML =
      '<td colspan="3">Belum ada data penjualan untuk periode ini.</td>';
    topMenuTable.appendChild(tr);
    return;
  }

  rows.forEach(([name, data]) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${name}</td>
      <td>${data.qty}</td>
      <td>${formatCurrency(data.total)}</td>
    `;
    topMenuTable.appendChild(tr);
  });
}

// 👉 Riwayat penjualan (semua transaksi sesuai filter + search)
function updateHistoryTable() {
  if (!historyTable) return;

  const src = getFilteredSales();
  historyTable.innerHTML = "";

  const keyword = (historySearch?.value || "").trim().toLowerCase();

  // filter lagi pakai keyword (tanggal / item)
  let list = [...src];
  if (keyword) {
    list = list.filter((s) => {
      const d = s.createdAtDate || new Date();
      const timeStr = formatDateTime(d).toLowerCase();
      const itemsStr = (s.items || [])
        .map((it) => `${it.name} x${it.qty}`)
        .join(", ")
        .toLowerCase();

      return timeStr.includes(keyword) || itemsStr.includes(keyword);
    });
  }

  if (!list.length) {
    const tr = document.createElement("tr");
    tr.innerHTML =
      '<td colspan="3">Belum ada transaksi pada periode ini.</td>';
    historyTable.appendChild(tr);
    return;
  }

  list
    .sort((a, b) => b.createdAtDate - a.createdAtDate)
    .forEach((s) => {
      const d = s.createdAtDate || new Date();
      const timeStr = formatDateTime(d);
      const itemsStr = (s.items || [])
        .map((it) => `${it.name} x${it.qty}`)
        .join(", ");

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${timeStr}</td>
        <td>${itemsStr}</td>
        <td>${formatCurrency(s.total || 0)}</td>
      `;
      historyTable.appendChild(tr);
    });
}

// event filter tanggal
if (btnFilterApply) {
  btnFilterApply.addEventListener("click", () => {
    updateCharts();
    updateTopMenu();
    updateHistoryTable();
  });
}
if (btnFilterReset) {
  btnFilterReset.addEventListener("click", () => {
    if (filterStart) filterStart.value = "";
    if (filterEnd) filterEnd.value = "";
    updateCharts();
    updateTopMenu();
    updateHistoryTable();
  });
}
if (filterStart) {
  filterStart.addEventListener("change", () => {
    updateCharts();
    updateTopMenu();
    updateHistoryTable();
  });
}
if (filterEnd) {
  filterEnd.addEventListener("change", () => {
    updateCharts();
    updateTopMenu();
    updateHistoryTable();
  });
}

// event search riwayat
if (historySearch) {
  historySearch.addEventListener("input", () => {
    updateHistoryTable();
  });
}

// ================= METRIC STOK =================
function updateStockMetrics() {
  let empty = 0,
    low = 0,
    ok = 0;
  productsCache.forEach((p) => {
    if (p.type !== "bahan_baku") return;
    const st = productStatus(p).label;
    if (st === "Habis") empty++;
    else if (st === "Hampir habis") low++;
    else if (st === "Aman") ok++;
  });
  if (metricEmptyCount) metricEmptyCount.textContent = empty;
  if (metricLowCount) metricLowCount.textContent = low;
  if (metricOkCount) metricOkCount.textContent = ok;
}

// ================= OPNAME =================
function renderOpnameTable() {
  if (!opnameTable) return;
  opnameTable.innerHTML = "";
  const bahan = productsCache.filter((p) => p.type === "bahan_baku");
  bahan.forEach((p) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.name}</td>
      <td>${p.stock || 0} ${p.unit || ""}</td>
      <td><input type="number" data-id="${p.id}" value="${p.stock || 0}"></td>
      <td><span data-id="${p.id}-diff">0</span></td>
      <td><button data-id="${p.id}">Simpan</button></td>
    `;
    opnameTable.appendChild(tr);
  });

  opnameTable.querySelectorAll("input[type='number']").forEach((inp) => {
    const id = inp.getAttribute("data-id");
    const prod = productsCache.find((p) => p.id === id);
    inp.addEventListener("input", () => {
      const fisik = Number(inp.value || 0);
      const sel = fisik - Number(prod?.stock || 0);
      const span = opnameTable.querySelector(`span[data-id="${id}-diff"]`);
      if (span) span.textContent = sel;
    });
  });

  opnameTable.querySelectorAll("button").forEach((btn) => {
    const id = btn.getAttribute("data-id");
    btn.addEventListener("click", () => saveOpnameRow(id));
  });
}

async function saveOpnameRow(id) {
  try {
    const prod = productsCache.find((p) => p.id === id);
    if (!prod) return;
    const inp = opnameTable.querySelector(`input[data-id="${id}"]`);
    if (!inp) return;
    const fisik = Number(inp.value || 0);
    const selisih = fisik - Number(prod.stock || 0);
    const now = new Date();
    await addDoc(colOpname, {
      productId: id,
      productName: prod.name,
      systemStock: prod.stock || 0,
      physicalStock: fisik,
      diff: selisih,
      unit: prod.unit || "",
      dateKey: todayKey(now),
      createdAt: serverTimestamp(),
      createdBy: currentUser?.email || "-",
    });
    await updateDoc(doc(db, "products", id), { stock: fisik });
    showToast(`Opname tersimpan untuk ${prod.name}`, "success");
    await loadProducts();
  } catch (err) {
    console.error(err);
    showToast("Gagal menyimpan opname", "error");
  }
}

// ================= AUTH STATE =================
onAuthStateChanged(auth, async (user) => {
  currentUser = user || null;
  if (user) {
    if (authCard) authCard.classList.add("hidden");
    if (appShell) appShell.classList.remove("hidden");

    const role = await getUserRole(user.uid);
    applyRoleUI(role);
    if (topbarEmail) topbarEmail.textContent = `${user.email} (${role})`;
    if (welcomeBanner) welcomeBanner.classList.remove("hidden");

    await loadProducts();
    await loadSales();
    showSection("sales");
  } else {
    currentRole = null;
    productsCache = [];
    salesCache = [];
    currentCart = [];
    if (authCard) authCard.classList.remove("hidden");
    if (appShell) appShell.classList.add("hidden");
    if (topbarEmail) topbarEmail.textContent = "–";
  }
});