/* ============================================================
   F&B POS SYSTEM — PART 1
   Firebase Init • Auth • Role • Toast • DOM Setup
   Version: Stable Firebase v10
============================================================ */

// -------------------------------
// 1. Firebase Init
// -------------------------------
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
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";


// --------------------------------------------
// 2. Firebase Config
// --------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyAu5VsFBmcOLZtUbNMjdue2vQeMhWVIRqk",
  authDomain: "app-387dc.firebaseapp.com",
  projectId: "app-387dc",
  storageBucket: "app-387dc.firebasestorage.app",
  messagingSenderId: "227151496412",
  appId: "1:227151496412:web:ac35b7ecd7f39905cba019",
  measurementId: "G-9E282TKXSJ"
};

// Init
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);


// --------------------------------------------
// 3. Toast Notification System
// --------------------------------------------
const toastContainer = document.getElementById("toastContainer");

function toast(message, type = "info") {
  const div = document.createElement("div");
  div.classList.add("toast");

  if (type === "success") div.classList.add("toast-success");
  if (type === "error") div.classList.add("toast-error");
  if (type === "info") div.classList.add("toast-info");

  div.textContent = message;

  toastContainer.appendChild(div);

  setTimeout(() => div.remove(), 3500);
}


// --------------------------------------------
// 4. DOM Reference
// --------------------------------------------
const authCard      = document.getElementById("authCard");
const topbar        = document.getElementById("topbar");
const topbarUser    = document.getElementById("topbarUser");
const btnLogout     = document.getElementById("btnLogout");

// Role-based cards
const inventoryCard = document.getElementById("inventoryCard");
const recipeCard    = document.getElementById("recipeCard");
const posCard       = document.getElementById("posCard");
const dashboardCard = document.getElementById("dashboardCard");
const opnameCard    = document.getElementById("opnameCard");

// Login/Register
const btnLogin      = document.getElementById("btnLogin");
const loginEmail    = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");

const btnRegister       = document.getElementById("btnRegister");
const registerEmail     = document.getElementById("registerEmail");
const registerPassword  = document.getElementById("registerPassword");
const registerRole      = document.getElementById("registerRole");


// --------------------------------------------
// 5. REGISTER USER
// --------------------------------------------
btnRegister.addEventListener("click", async () => {
  const email = registerEmail.value.trim();
  const pass  = registerPassword.value.trim();
  const role  = registerRole.value;

  if (!email || !pass) return toast("Email & password wajib diisi", "error");

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);

    await addDoc(collection(db, "users"), {
      uid: cred.user.uid,
      email: email,
      role: role,
      createdAt: serverTimestamp()
    });

    toast("User berhasil didaftarkan", "success");
  } catch (err) {
    toast("Gagal register: " + err.message, "error");
  }
});


// --------------------------------------------
// 6. LOGIN USER
// --------------------------------------------
btnLogin.addEventListener("click", async () => {
  const email = loginEmail.value.trim();
  const pass  = loginPassword.value.trim();

  if (!email || !pass) return toast("Isi email & password", "error");

  try {
    await signInWithEmailAndPassword(auth, email, pass);
    toast("Login berhasil!", "success");
  } catch (err) {
    toast("Login gagal: " + err.message, "error");
  }
});


// --------------------------------------------
// 7. LOGOUT
// --------------------------------------------
btnLogout.addEventListener("click", async () => {
  await signOut(auth);
  toast("Logout berhasil", "success");
});


// --------------------------------------------
// 8. GET ROLE FROM FIRESTORE
// --------------------------------------------
async function getUserRole(uid) {
  const q = query(collection(db, "users"), where("uid", "==", uid));
  const snap = await getDocs(q);

  if (snap.empty) return null;
  
  return snap.docs[0].data().role;
}


// ---------------------------------------------------
// 9. AUTH STATE — TAMPILKAN UI SESUAI ROLE
// ---------------------------------------------------
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    // After logout
    authCard.classList.remove("hidden");
    topbar.classList.add("hidden");

    inventoryCard.classList.add("hidden");
    recipeCard.classList.add("hidden");
    dashboardCard.classList.add("hidden");
    opnameCard.classList.add("hidden");
    posCard.classList.add("hidden");

    return;
  }

  // User logged in
  const role = await getUserRole(user.uid);
  topbarUser.textContent = `${user.email} (${role})`;

  authCard.classList.add("hidden");
  topbar.classList.remove("hidden");

  if (role === "admin") {
    inventoryCard.classList.remove("hidden");
    recipeCard.classList.remove("hidden");
    dashboardCard.classList.remove("hidden");
    opnameCard.classList.remove("hidden");
    posCard.classList.remove("hidden");
  }

  if (role === "kasir") {
    inventoryCard.classList.add("hidden");
    recipeCard.classList.add("hidden");
    dashboardCard.classList.add("hidden");
    opnameCard.classList.add("hidden");

    posCard.classList.remove("hidden");
  }
});


/* ============================================================
   END OF PART 1
   NEXT → PART 2 (Inventory, Resep/BOM, POS Cart System)
============================================================ */

/* ============================================================
   PART 2 — Inventory + Resep (BOM) + Menu filtering untuk POS
============================================================ */

// -------------------------------
// Inventory DOM
// -------------------------------
const invName  = document.getElementById("invName");
const invType  = document.getElementById("invType");
const invCat   = document.getElementById("invCat");
const invPrice = document.getElementById("invPrice");
const invStock = document.getElementById("invStock");
const invUnit  = document.getElementById("invUnit");
const invMin   = document.getElementById("invMin");

const btnSaveInv = document.getElementById("btnSaveInv");
const invTable   = document.getElementById("invTable");


// -------------------------------
// Recipe DOM
// -------------------------------
const recipeMenu = document.getElementById("recipeMenu");
const recipeIng  = document.getElementById("recipeIng");
const recipeQty  = document.getElementById("recipeQty");
const btnAddRecipe = document.getElementById("btnAddRecipe");
const recipeTable   = document.getElementById("recipeTable");


// -------------------------------
// Firestore Collections
// -------------------------------
const colProducts = collection(db, "products");
const colRecipes  = collection(db, "recipes");


// -------------------------------
// Cache
// -------------------------------
let productsCache = [];
let recipesCache  = [];


// ===========================================================
//  LOAD ALL PRODUCTS
// ===========================================================
async function loadProducts() {
  const snap = await getDocs(colProducts);
  const list = [];

  snap.forEach((d) => list.push({ id: d.id, ...d.data() }));

  productsCache = list;

  renderInventoryTable();
  renderRecipeMenu();
  renderRecipeIngredients();
  renderRecipeTable();
  updateMenuGrid(); // POS MENU list (but POS cart is in PART 3)

  lowStockCheck();
}


// ===========================================================
//  SAVE PRODUCT (ADD / UPDATE)
// ===========================================================
btnSaveInv.addEventListener("click", async () => {
  const name  = invName.value.trim();
  const type  = invType.value;
  const cat   = invCat.value;
  const price = Number(invPrice.value || 0);
  const stock = Number(invStock.value || 0);
  const unit  = invUnit.value.trim();
  const min   = Number(invMin.value || 0);

  if (!name) return toast("Nama wajib diisi", "error");

  if (type === "menu" && price <= 0)
      return toast("Menu harus punya harga", "error");

  if (type === "bahan_baku") {
    // HARGA BAHAN DIHILANGKAN
    invPrice.value = "";
  }

  try {
    await addDoc(colProducts, {
      name, type, cat,
      price: type === "menu" ? price : 0,
      stock, unit, minStock: min,
      createdAt: serverTimestamp()
    });

    toast("Produk berhasil ditambahkan", "success");

    invName.value = "";
    invPrice.value = "";
    invStock.value = "";
    invUnit.value = "";
    invMin.value  = "";

    loadProducts();

  } catch (err) {
    toast("Gagal simpan produk: " + err.message, "error");
  }
});


// ===========================================================
//  DELETE PRODUCT
// ===========================================================
async function deleteProduct(id) {
  if (!confirm("Hapus item ini?")) return;

  try {
    await deleteDoc(doc(db, "products", id));
    toast("Item dihapus", "success");
    loadProducts();
  } catch (err) {
    toast("Gagal hapus: " + err.message, "error");
  }
}


// ===========================================================
//  RENDER TABLE INVENTORY
// ===========================================================
function renderInventoryTable() {
  invTable.innerHTML = "";

  productsCache.forEach((p) => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${p.name}</td>
      <td>${p.type}</td>
      <td>${p.cat}</td>
      <td>${p.type === "menu" ? "Rp " + p.price.toLocaleString("id-ID") : "-"}</td>
      <td>${p.stock} ${p.unit || ""}</td>
    `;

    // aksi
    const tdAct = document.createElement("td");
    const btnDel = document.createElement("button");
    btnDel.className = "danger";
    btnDel.textContent = "Hapus";
    btnDel.onclick = () => deleteProduct(p.id);

    tdAct.appendChild(btnDel);
    tr.appendChild(tdAct);

    invTable.appendChild(tr);
  });
}


// ===========================================================
//  RENDER RECIPE MENU SELECT (MENU W/ BOM)
// ===========================================================
function renderRecipeMenu() {
  recipeMenu.innerHTML = "";

  // hanya menu yang boleh punya resep
  const menus = productsCache.filter(p => p.type === "menu");

  menus.forEach((m) => {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.name;
    recipeMenu.appendChild(opt);
  });
}


// ===========================================================
//  RENDER RECIPE INGREDIENT SELECT (HANYA BAHAN_BAKU)
// ===========================================================
function renderRecipeIngredients() {
  recipeIng.innerHTML = "";

  const ingredients = productsCache.filter(p => p.type === "bahan_baku");

  ingredients.forEach((i) => {
    const opt = document.createElement("option");
    opt.value = i.id;
    opt.textContent = `${i.name} (stok: ${i.stock} ${i.unit || ""})`;
    recipeIng.appendChild(opt);
  });
}


// ===========================================================
//  ADD RECIPE ITEM
// ===========================================================
btnAddRecipe.addEventListener("click", async () => {
  const menuId = recipeMenu.value;
  const ingId  = recipeIng.value;
  const qty    = Number(recipeQty.value || 0);

  if (!menuId) return toast("Pilih menu", "error");
  if (!ingId)  return toast("Pilih bahan", "error");
  if (qty <= 0) return toast("Qty harus > 0", "error");

  const menu = productsCache.find(p => p.id === menuId);
  const ing  = productsCache.find(p => p.id === ingId);

  try {
    await addDoc(colRecipes, {
      menuId,
      menuName: menu.name,
      ingredientId: ingId,
      ingredientName: ing.name,
      ingredientUnit: ing.unit || "",
      qtyUsed: qty,
      createdAt: serverTimestamp()
    });

    toast("Bahan ditambahkan ke resep", "success");
    recipeQty.value = "";
    loadRecipes();

  } catch (err) {
    toast("Gagal tambah resep: " + err.message, "error");
  }
});


// ===========================================================
//  LOAD ALL RECIPES
// ===========================================================
async function loadRecipes() {
  const snap = await getDocs(colRecipes);
  const list = [];

  snap.forEach((d) => list.push({ id: d.id, ...d.data() }));

  recipesCache = list;

  renderRecipeTable();
  updateMenuGrid(); // Update menu POS
}


// ===========================================================
//  DELETE RECIPE ITEM
// ===========================================================
async function deleteRecipe(id) {
  if (!confirm("Hapus bahan dari resep?")) return;

  try {
    await deleteDoc(doc(db, "recipes", id));
    toast("Bahan dihapus", "success");
    loadRecipes();
  } catch (err) {
    toast("Gagal hapus: " + err.message, "error");
  }
}


// ===========================================================
//  RENDER RECIPE TABLE
// ===========================================================
function renderRecipeTable() {
  recipeTable.innerHTML = "";

  const menuId = recipeMenu.value;

  const list = recipesCache.filter(r => r.menuId === menuId);

  if (list.length === 0) {
    recipeTable.innerHTML = `<tr><td colspan="3" style="text-align:center;color:#999;">Belum ada resep</td></tr>`;
    return;
  }

  list.forEach((r) => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${r.ingredientName}</td>
      <td>${r.qtyUsed} ${r.ingredientUnit}</td>
    `;

    const tdAct = document.createElement("td");
    const btn = document.createElement("button");
    btn.classList.add("danger");
    btn.textContent = "Hapus";
    btn.onclick = () => deleteRecipe(r.id);

    tdAct.appendChild(btn);
    tr.appendChild(tdAct);

    recipeTable.appendChild(tr);
  });
}


// ===========================================================
//  POS MENU FILTER — hanya menu yang ADA resepnya
// ===========================================================
function updateMenuGrid() {
  const menuGrid = document.getElementById("menuGrid");
  menuGrid.innerHTML = "";

  const menus = productsCache.filter(p => p.type === "menu");

  menus.forEach((m) => {
    const hasRecipe = recipesCache.some(r => r.menuId === m.id);

    if (!hasRecipe) return; // ⛔ hide menu without BOM

    const card = document.createElement("div");
    card.className = "menu-card";
    card.dataset.id = m.id;

    card.innerHTML = `
      <div class="menu-title">${m.name}</div>
      <div class="menu-price">Rp ${m.price.toLocaleString("id-ID")}</div>
    `;

    card.addEventListener("click", () => addToCart(m.id));
    menuGrid.appendChild(card);
  });
}


// ===========================================================
//  LOW STOCK ALERT
// ===========================================================
function lowStockCheck() {
  productsCache.forEach((p) => {
    if (p.type === "menu") return; // stok bahan saja yg penting

    if (p.stock <= p.minStock) {
      toast(`Stok menipis: ${p.name} (${p.stock} ${p.unit || ""})`, "error");
    }
  });
}


/* ============================================================
   END OF PART 2
   NEXT → PART 3 (POS Cart System, Save Sales, Dashboard, Opname)
============================================================ */

/* ============================================================
   PART 3 — POS CART • SAVE SALES • DASHBOARD • OPNAME
============================================================ */

// ============================================================
//  POS CART SYSTEM
// ============================================================
let cart = [];

function addToCart(menuId) {
  const menu = productsCache.find(p => p.id === menuId);
  if (!menu) return;

  const exist = cart.find(i => i.id === menuId);

  if (exist) {
    exist.qty += 1;
  } else {
    cart.push({
      id: menu.id,
      name: menu.name,
      price: menu.price,
      qty: 1
    });
  }

  renderCart();
}


// ============================================================
// RENDER CART
// ============================================================
const cartBox    = document.getElementById("cartBox");
const cashDisc   = document.getElementById("cashDisc");
const cashVoucher= document.getElementById("cashVoucher");
const cashTotal  = document.getElementById("cashTotal");
const cashPay    = document.getElementById("cashPay");
const cashChange = document.getElementById("cashChange");

function renderCart() {
  cartBox.innerHTML = "";

  if (cart.length === 0) {
    cartBox.innerHTML = "<i>Keranjang kosong</i>";
    cashTotal.value = "";
    cashChange.value = "";
    return;
  }

  cart.forEach((item, index) => {
    const div = document.createElement("div");
    div.className = "cart-item";

    div.innerHTML = `
      <span>${item.name} x${item.qty}</span>
      <span>Rp ${(item.price * item.qty).toLocaleString("id-ID")}</span>
    `;

    // klik untuk tambah qty
    div.addEventListener("click", () => {
      item.qty++;
      renderCart();
    });

    // klik kanan untuk hapus
    div.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      item.qty--;
      if (item.qty <= 0) cart.splice(index, 1);
      renderCart();
    });

    cartBox.appendChild(div);
  });

  calculateTotal();
}


// ============================================================
// CALCULATE TOTAL
// ============================================================
function calculateTotal() {
  let total = 0;

  cart.forEach(i => total += i.qty * i.price);

  const discPct = Number(cashDisc.value || 0);
  const voucher = Number(cashVoucher.value || 0);

  if (discPct > 0) total -= (total * discPct / 100);
  if (voucher > 0) total -= voucher;

  if (total < 0) total = 0;

  cashTotal.value = Math.round(total);

  // update kembalian
  const bayar = Number(cashPay.value || 0);
  cashChange.value = bayar > total ? bayar - total : 0;
}

cashDisc.addEventListener("input", calculateTotal);
cashVoucher.addEventListener("input", calculateTotal);
cashPay.addEventListener("input", calculateTotal);


// ============================================================
// SAVE SALES (1 transaksi = 1 dokumen)
// ============================================================
const btnPay = document.getElementById("btnPay");
const receiptBox = document.getElementById("receiptBox");

btnPay.addEventListener("click", async () => {
  if (cart.length === 0) return toast("Keranjang kosong!", "error");

  const total = Number(cashTotal.value || 0);
  const bayar = Number(cashPay.value || 0);

  if (bayar < total)
    return toast("Uang kurang!", "error");

  // create sales doc
  const saleRef = await addDoc(collection(db, "sales"), {
    total,
    bayar,
    kembali: bayar - total,
    createdAt: serverTimestamp()
  });

  // create subcollection items
  for (let item of cart) {
    await addDoc(collection(db, `sales/${saleRef.id}/items`), {
      name: item.name,
      price: item.price,
      qty: item.qty,
      subtotal: item.qty * item.price
    });

    // KURANGI STOK BAHAN BERDASARKAN BOM
    const menuId = item.id;
    const recipe = recipesCache.filter(r => r.menuId === menuId);

    for (let r of recipe) {
      const ingredient = productsCache.find(p => p.id === r.ingredientId);

      if (ingredient) {
        const newStock = ingredient.stock - (r.qtyUsed * item.qty);

        await updateDoc(doc(db, "products", ingredient.id), {
          stock: newStock
        });
      }
    }
  }

  // STRUK
  renderReceipt(cart, total, bayar);

  toast("Transaksi berhasil", "success");

  // reset cart
  cart = [];
  renderCart();

  // reload produk dan stok
  loadProducts();
});


// ============================================================
// RENDER RECEIPT
// ============================================================
function renderReceipt(list, total, bayar) {
  let html = `<h3>Struk Penjualan</h3>`;

  list.forEach((item) => {
    html += `
      <div style="border-bottom:1px dashed #ddd;padding:4px 0;">
        ${item.name} x${item.qty}  
        <div style="float:right;">Rp ${(item.qty * item.price).toLocaleString("id-ID")}</div>
      </div>
    `;
  });

  html += `
    <hr>
    <b>Total:</b> Rp ${total.toLocaleString("id-ID")}<br>
    <b>Bayar:</b> Rp ${bayar.toLocaleString("id-ID")}<br>
    <b>Kembali:</b> Rp ${(bayar - total).toLocaleString("id-ID")}
  `;

  receiptBox.innerHTML = html;
}


// ============================================================
// LOAD SALES FOR DASHBOARD
// ============================================================
async function loadSales() {
  const snap = await getDocs(collection(db, "sales"));
  const list = [];

  snap.forEach((d) => list.push({ id: d.id, ...d.data() }));

  return list;
}


// ============================================================
// DASHBOARD
// ============================================================
async function renderDashboard() {
  const sales = await loadSales();

  const dailyMap = {};
  const monthlyMap = {};

  sales.forEach((s) => {
    if (!s.createdAt) return;

    const d = s.createdAt.toDate();
    const day = d.toISOString().slice(0, 10);
    const month = d.toISOString().slice(0, 7);

    dailyMap[day] = (dailyMap[day] || 0) + s.total;
    monthlyMap[month] = (monthlyMap[month] || 0) + s.total;
  });

  renderDailyChart(dailyMap);
  renderMonthlyChart(monthlyMap);
}


// ============================================================
// CHART DAILY
// ============================================================
function renderDailyChart(data) {
  const ctx = document.getElementById("dailyChart");

  new Chart(ctx, {
    type: "line",
    data: {
      labels: Object.keys(data),
      datasets: [{
        label: "Penjualan Harian",
        data: Object.values(data),
        borderWidth: 2
      }]
    }
  });
}


// ============================================================
// CHART MONTHLY
// ============================================================
function renderMonthlyChart(data) {
  const ctx = document.getElementById("monthlyChart");

  new Chart(ctx, {
    type: "bar",
    data: {
      labels: Object.keys(data),
      datasets: [{
        label: "Penjualan Bulanan",
        data: Object.values(data),
        borderWidth: 2
      }]
    }
  });
}


// ============================================================
// STOK OPNAME
// ============================================================
const opnameTable = document.getElementById("opnameTable");

async function renderOpname() {
  opnameTable.innerHTML = "";

  productsCache.forEach((p) => {
    if (p.type !== "bahan_baku") return;

    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${p.name}</td>
      <td>${p.stock} ${p.unit}</td>
      <td><input type="number" id="op_fisik_${p.id}" placeholder="Stok fisik"></td>
      <td id="op_selisih_${p.id}">-</td>
    `;

    const tdAct = document.createElement("td");
    const btn = document.createElement("button");
    btn.className = "primary";
    btn.textContent = "Simpan";

    btn.onclick = () => saveOpnameItem(p.id);

    tdAct.appendChild(btn);
    tr.appendChild(tdAct);

    opnameTable.appendChild(tr);
  });
}


// SAVE OPNAME ITEM
async function saveOpnameItem(id) {
  const p = productsCache.find(x => x.id === id);
  const fisik = Number(document.getElementById(`op_fisik_${id}`).value || 0);
  const selCell = document.getElementById(`op_selisih_${id}`);

  const sel = fisik - p.stock;
  selCell.textContent = sel;

  await updateDoc(doc(db, "products", id), {
    stock: fisik
  });

  toast("Opname disimpan", "success");
  loadProducts();
}


// ============================================================
// REMINDER OPNAME (Minggu 05:00)
// ============================================================
setInterval(() => {
  const now = new Date();
  if (now.getDay() === 0 && now.getHours() === 5 && now.getMinutes() === 0) {
    toast("Besok Senin jadwal stok opname!", "info");
  }
}, 60000);


// ============================================================
// AUTO LOAD ON START
// ============================================================
loadProducts();
loadRecipes();
renderDashboard();
renderOpname();

/* ============================================================
   END OF PART 3 — SYSTEM COMPLETE
============================================================ */