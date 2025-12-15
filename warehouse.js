// warehouse.js — Warehouse (Dashboard Opname + Opname W1/W2 + Transfer + Waste + Report) realtime
// Cocok dengan HTML yang kamu kirim (IDs: navWhDashboard, whDashboardSection, whOpnameSection, whWasteSection, whReportSection, dst)

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

/* ================= FIREBASE CONFIG =================
   Pakai config yang sama seperti script.js kamu
*/
const firebaseConfig = {
  apiKey: "AIzaSyAu5VsFBmcOLZtUbNMjdue2vQeMhWVIRqk",
  authDomain: "app-387dc.firebaseapp.com",
  projectId: "app-387dc",
  storageBucket: "app-387dc.firebasestorage.app",
  messagingSenderId: "227151496412",
  appId: "1:227151496412:web:ac35b7ecd7f39905cba019",
  measurementId: "G-9E282TKXSJ",
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/* ================= UTIL ================= */
const $ = (id) => document.getElementById(id);

const toastContainer = $("toast-container");
function showToast(msg, type = "info", time = 3200) {
  if (!toastContainer) return;
  const div = document.createElement("div");
  div.className = `toast toast-${type}`;
  div.textContent = msg;
  toastContainer.appendChild(div);
  setTimeout(() => div.remove(), time);
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseDateInput(v) {
  if (!v) return null;
  const d = new Date(v + "T00:00:00");
  return isNaN(d) ? null : d;
}

function parseDateEndInput(v) {
  if (!v) return null;
  const d = new Date(v + "T23:59:59");
  return isNaN(d) ? null : d;
}

function formatDateShort(isoOrDate) {
  try {
    const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
    if (isNaN(d)) return "-";
    return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
  } catch {
    return "-";
  }
}

function daysDiff(a, b) {
  // a,b : Date
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

/* ================= DOM (NAV) ================= */
const sidebar = $("sidebar");
const burgerBtn = $("burgerBtn");

const navWhDashboard = $("navWhDashboard");
const navWhOpname = $("navWhOpname");
const navWhWaste = $("navWhWaste");
const navWhReport = $("navWhReport");

/* ================= DOM (SECTIONS) ================= */
const whDashboardSection = $("whDashboardSection");
const whOpnameSection = $("whOpnameSection");
const whWasteSection = $("whWasteSection");
const whReportSection = $("whReportSection");

/* ================= DOM (DASHBOARD CARDS) ================= */
const w1Habis = $("w1Habis");
const w1Lumayan = $("w1Lumayan");
const w1Banyak = $("w1Banyak");
const w2Habis = $("w2Habis");
const w2Lumayan = $("w2Lumayan");
const w2Banyak = $("w2Banyak");

const cardW1Habis = $("cardW1Habis");
const cardW1Lumayan = $("cardW1Lumayan");
const cardW1Banyak = $("cardW1Banyak");
const cardW2Habis = $("cardW2Habis");
const cardW2Lumayan = $("cardW2Lumayan");
const cardW2Banyak = $("cardW2Banyak");

/* ================= DOM (OPNAME + MASTER ITEM + TRANSFER) ================= */
const whItemName = $("whItemName");
const whItemUnit = $("whItemUnit");
const whItemExp = $("whItemExp");
const whItemInfo = $("whItemInfo");
const whItemReceivedAt = $("whItemReceivedAt");
const whItemSupplier = $("whItemSupplier");
const btnSaveItem = $("btnSaveItem");

const whOpnameGudang = $("whOpnameGudang");
const whOpnameSearch = $("whOpnameSearch");
const whOpnameTableBody = $("whOpnameTableBody");

const moveItemSelect = $("moveItemSelect");
const moveQty = $("moveQty");
const btnMove = $("btnMove");

/* ================= DOM (WASTE) - REVISI: tanpa gudang, item search, unit dropdown ================= */
const wasteGudang = $("wasteGudang"); // masih ada di HTML kamu, tapi akan kita sembunyikan & abaikan
const wasteItemSelect = $("wasteItemSelect"); // masih ada, tapi kita sembunyikan & ganti dengan search suggestion
const wasteDate = $("wasteDate");
const wasteGram = $("wasteGram"); // akan kita repurpose jadi input qty
const wasteMl = $("wasteMl");     // akan kita hide
const wasteNote = $("wasteNote");
const btnSaveWaste = $("btnSaveWaste");

/* ================= DOM (REPORT) ================= */
const whReportType = $("whReportType");
const whReportStart = $("whReportStart");
const whReportEnd = $("whReportEnd");
const btnWhReport = $("btnWhReport");
const whReportHead = $("whReportHead");
const whReportBody = $("whReportBody");

/* ================= COLLECTIONS =================
   - warehouse_items: master item
   - warehouse_stock: stok per gudang (docId: `${itemId}_w1` / `${itemId}_w2`)
   - warehouse_opname_logs: log opname
   - warehouse_moves: log transfer
   - warehouse_waste: log waste
*/
const colItems = collection(db, "warehouse_items");
const colStock = collection(db, "warehouse_stock");
const colOpnameLogs = collection(db, "warehouse_opname_logs");
const colMoves = collection(db, "warehouse_moves");
const colWaste = collection(db, "warehouse_waste");

/* ================= STATE ================= */
let currentUser = null;
let itemsCache = [];     // {id, name, unit, expDate, info, receivedAt, supplier, ...}
let stockCache = [];     // {id, itemId, warehouse, stock, updatedAtDate?}
let unsubscribeItems = null;
let unsubscribeStock = null;

/* ================== UI HELPERS ================== */
function hideAllWarehouseSections() {
  [whDashboardSection, whOpnameSection, whWasteSection, whReportSection].forEach((s) => {
    if (s) s.classList.add("hidden");
  });
}

function setActiveNav(btn) {
  [navWhDashboard, navWhOpname, navWhWaste, navWhReport].forEach((b) => {
    if (!b) return;
    b.classList.remove("active");
  });
  if (btn) btn.classList.add("active");
}

function showWarehouseSection(which) {
  hideAllWarehouseSections();
  if (which === "dashboard" && whDashboardSection) whDashboardSection.classList.remove("hidden");
  if (which === "opname" && whOpnameSection) whOpnameSection.classList.remove("hidden");
  if (which === "waste" && whWasteSection) whWasteSection.classList.remove("hidden");
  if (which === "report" && whReportSection) whReportSection.classList.remove("hidden");

  // auto close sidebar on mobile
  if (window.innerWidth <= 900 && sidebar) sidebar.classList.remove("open");
}

function ensureDefaultDates() {
  if (wasteDate && !wasteDate.value) wasteDate.value = todayISO();
  if (whReportStart && !whReportStart.value) whReportStart.value = todayISO();
  if (whReportEnd && !whReportEnd.value) whReportEnd.value = todayISO(); 
}

/* ================== DATA HELPERS ================== */
function getStock(itemId, wh /* "w1"|"w2" */) {
  const row = stockCache.find((s) => s.itemId === itemId && s.warehouse === wh);
  return Number(row?.stock || 0);
}

function setMetricLabel(el, val) {
  if (el) el.textContent = String(val || 0);
}

// status stok untuk indikator
function stockBucket(n) {
  const x = Number(n || 0);
  if (x <= 0) return "habis";
  if (x < 10) return "lumayan";
  if (x > 50) return "banyak";
  return "normal";
}

// exp indicator (merah kalau <= 7 hari menuju exp)
function expAlertLevel(item) {
  const exp = item?.expDate;
  if (!exp) return "none";
  const expDate = new Date(exp + "T00:00:00");
  if (isNaN(expDate)) return "none";
  const today = new Date();
  const diff = daysDiff(today, expDate); // exp - today
  if (diff < 0) return "expired";
  if (diff <= 7) return "near";
  return "ok";
}

/* ================== NOTIF BUILDER ==================
   Notif:
   - EXP near/expired
   - stok habis
   - stok hampir habis (<10)
*/
function updateNotifPanel() {
  const notifList = $("notifList");
  const notifBadge = $("notifBadge");
  if (!notifList || !notifBadge) return;

  notifList.innerHTML = "";
  let count = 0;

  // EXP notif
  itemsCache.forEach((it) => {
    const lvl = expAlertLevel(it);
    if (lvl === "near") {
      const li = document.createElement("li");
      li.textContent = `⚠️ EXP mendekati: ${it.name} (EXP ${it.expDate})`;
      notifList.appendChild(li);
      count++;
    } else if (lvl === "expired") {
      const li = document.createElement("li");
      li.textContent = `⛔ EXPIRED: ${it.name} (EXP ${it.expDate})`;
      notifList.appendChild(li);
      count++;
    }
  });

  // stok notif W1/W2
  itemsCache.forEach((it) => {
    const s1 = getStock(it.id, "w1");
    const s2 = getStock(it.id, "w2");

    const b1 = stockBucket(s1);
    const b2 = stockBucket(s2);

    if (b1 === "habis") {
      const li = document.createElement("li");
      li.textContent = `⛔ Habis (Gudang 1): ${it.name}`;
      notifList.appendChild(li);
      count++;
    } else if (b1 === "lumayan") {
      const li = document.createElement("li");
      li.textContent = `⚠️ Hampir habis <10 (Gudang 1): ${it.name} (sisa ${s1} ${it.unit || ""})`;
      notifList.appendChild(li);
      count++;
    }

    if (b2 === "habis") {
      const li = document.createElement("li");
      li.textContent = `⛔ Habis (Gudang 2): ${it.name}`;
      notifList.appendChild(li);
      count++;
    } else if (b2 === "lumayan") {
      const li = document.createElement("li");
      li.textContent = `⚠️ Hampir habis <10 (Gudang 2): ${it.name} (sisa ${s2} ${it.unit || ""})`;
      notifList.appendChild(li);
      count++;
    }
  });

  if (count === 0) {
    const li = document.createElement("li");
    li.textContent = "Tidak ada notifikasi.";
    notifList.appendChild(li);
  }

  notifBadge.textContent = String(count);
}

/* ================== DASHBOARD ================== */
function renderWarehouseDashboard() {
  let w1 = { habis: 0, lumayan: 0, banyak: 0 };
  let w2 = { habis: 0, lumayan: 0, banyak: 0 };

  itemsCache.forEach((it) => {
    const s1 = getStock(it.id, "w1");
    const s2 = getStock(it.id, "w2");

    const b1 = stockBucket(s1);
    const b2 = stockBucket(s2);

    if (b1 === "habis") w1.habis++;
    else if (b1 === "lumayan") w1.lumayan++;
    else if (b1 === "banyak") w1.banyak++;

    if (b2 === "habis") w2.habis++;
    else if (b2 === "lumayan") w2.lumayan++;
    else if (b2 === "banyak") w2.banyak++;
  });

  setMetricLabel(w1Habis, w1.habis);
  setMetricLabel(w1Lumayan, w1.lumayan);
  setMetricLabel(w1Banyak, w1.banyak);

  setMetricLabel(w2Habis, w2.habis);
  setMetricLabel(w2Lumayan, w2.lumayan);
  setMetricLabel(w2Banyak, w2.banyak);
}

function initDashboardClickToOpname() {
  const bind = (card, wh, bucket) => {
    if (!card) return;
    card.style.cursor = "pointer";
    card.addEventListener("click", () => {
      setActiveNav(navWhOpname);
      showWarehouseSection("opname");
      if (whOpnameGudang) whOpnameGudang.value = wh; // "w1" / "w2"
      // simpan bucket filter ke dataset biar render tahu
      if (whOpnameSection) {
        whOpnameSection.dataset.bucket = bucket; // "habis"|"lumayan"|"banyak"
      }
      renderOpnameTable();
      whOpnameSection?.scrollIntoView({ behavior: "smooth" });
    });
  };

  bind(cardW1Habis, "w1", "habis");
  bind(cardW1Lumayan, "w1", "lumayan");
  bind(cardW1Banyak, "w1", "banyak");
  bind(cardW2Habis, "w2", "habis");
  bind(cardW2Lumayan, "w2", "lumayan");
  bind(cardW2Banyak, "w2", "banyak");
}

/* ================== MASTER ITEM SAVE ================== */
async function saveMasterItem() {
  const name = (whItemName?.value || "").trim();
  const unit = (whItemUnit?.value || "").trim();
  const expDate = (whItemExp?.value || "").trim(); // yyyy-mm-dd
  const info = (whItemInfo?.value || "").trim();
  const receivedAt = (whItemReceivedAt?.value || "").trim();
  const supplier = (whItemSupplier?.value || "").trim();

  if (!name) return showToast("Nama item wajib diisi", "error");
  if (!unit) return showToast("Satuan wajib diisi (mis: dus/pcs)", "error");

  // doc id: slug sederhana biar stabil (atau random kalau bentrok)
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || ("item-" + Date.now());

  const ref = doc(db, "warehouse_items", slug);

  // kalau sudah ada, update. kalau belum, create.
  const existing = await getDoc(ref).catch(() => null);

  const payload = {
    name,
    unit,
    expDate: expDate || null,
    info: info || "",
    receivedAt: receivedAt || null,
    supplier: supplier || "",
    updatedAt: serverTimestamp(),
  };

  if (existing && existing.exists()) {
    await updateDoc(ref, payload);
    showToast("Item diupdate", "success");
  } else {
    await setDoc(ref, { ...payload, createdAt: serverTimestamp() });
    // inisialisasi stok di dua gudang
    await setDoc(doc(db, "warehouse_stock", `${slug}_w1`), {
      itemId: slug,
      warehouse: "w1",
      stock: 0,
      updatedAt: serverTimestamp(),
    });
    await setDoc(doc(db, "warehouse_stock", `${slug}_w2`), {
      itemId: slug,
      warehouse: "w2",
      stock: 0,
      updatedAt: serverTimestamp(),
    });
    showToast("Item ditambahkan", "success");
  }

  // reset form
  if (whItemName) whItemName.value = "";
  if (whItemUnit) whItemUnit.value = "";
  if (whItemExp) whItemExp.value = "";
  if (whItemInfo) whItemInfo.value = "";
  if (whItemReceivedAt) whItemReceivedAt.value = "";
  if (whItemSupplier) whItemSupplier.value = "";
}

/* ================== OPNAME TABLE ================== */
function renderOpnameTable() {
  if (!whOpnameTableBody) return;
  whOpnameTableBody.innerHTML = "";

  const wh = whOpnameGudang?.value || "w1";
  const keyword = (whOpnameSearch?.value || "").trim().toLowerCase();
  const bucket = whOpnameSection?.dataset?.bucket || ""; // optional filter from dashboard

  let list = itemsCache.map((it) => {
    const stock = getStock(it.id, wh);
    return { ...it, stock };
  });

  if (bucket) {
    list = list.filter((x) => stockBucket(x.stock) === bucket);
  }

  if (keyword) {
    list = list.filter((it) => {
      const a = (it.name || "").toLowerCase();
      const b = (it.unit || "").toLowerCase();
      const c = (it.supplier || "").toLowerCase();
      const d = (it.info || "").toLowerCase();
      return a.includes(keyword) || b.includes(keyword) || c.includes(keyword) || d.includes(keyword);
    });
  }

  if (!list.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="9">Tidak ada item yang cocok.</td>`;
    whOpnameTableBody.appendChild(tr);
    return;
  }

  list.forEach((it) => {
    const expLvl = expAlertLevel(it);
    const expBadge =
      expLvl === "expired"
        ? `<span class="status-badge red">EXPIRED</span>`
        : expLvl === "near"
        ? `<span class="status-badge red">EXP Soon</span>`
        : `<span class="status-badge green">OK</span>`;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><b>${it.name || "-"}</b></td>
      <td>${it.unit || "-"}</td>
      <td>
        ${it.expDate ? formatDateShort(it.expDate) : "-"}
        <div style="margin-top:4px;">${it.expDate ? expBadge : ""}</div>
      </td>
      <td style="max-width:220px;">
        <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
          ${(it.info || "-")}
        </div>
      </td>
      <td>${it.receivedAt ? formatDateShort(it.receivedAt) : "-"}</td>
      <td>${it.supplier || "-"}</td>
      <td>${Number(it.stock || 0)}</td>
      <td>
        <input type="number" min="0" step="1" data-item="${it.id}" class="wh-physical" value="${Number(it.stock || 0)}">
      </td>
      <td>
        <button class="btn-table btn-table-delete small" data-save="${it.id}">Simpan</button>
      </td>
    `;
    whOpnameTableBody.appendChild(tr);
  });

  whOpnameTableBody.querySelectorAll("button[data-save]").forEach((btn) => {
    const itemId = btn.getAttribute("data-save");
    btn.addEventListener("click", () => saveOpnameRow(itemId));
  });
}

async function saveOpnameRow(itemId) {
  try {
    const wh = whOpnameGudang?.value || "w1";
    const item = itemsCache.find((x) => x.id === itemId);
    if (!item) return;

    const inp = whOpnameTableBody.querySelector(`input[data-item="${itemId}"]`);
    if (!inp) return;

    const physical = Number(inp.value || 0);
    const systemStock = getStock(itemId, wh);
    const diff = physical - systemStock;

    // update stock doc
    const stockDocId = `${itemId}_${wh}`;
    await updateDoc(doc(db, "warehouse_stock", stockDocId), {
      stock: physical,
      updatedAt: serverTimestamp(),
      updatedBy: currentUser?.email || "-",
    });

    // log opname
    await addDoc(colOpnameLogs, {
      itemId,
      itemName: item.name || "-",
      warehouse: wh,
      systemStock,
      physicalStock: physical,
      diff,
      unit: item.unit || "",
      createdBy: currentUser?.email || "-",
      createdByUid: currentUser?.uid || null,
      createdAt: serverTimestamp(),
      createdAtLocal: new Date().toISOString(),
    });

    showToast(`Opname tersimpan: ${item.name} (${wh.toUpperCase()})`, "success");
  } catch (e) {
    console.error(e);
    showToast("Gagal menyimpan opname", "error");
  }
}

/* ================== TRANSFER W1 -> W2 ================== */
function renderMoveSelect() {
  if (!moveItemSelect) return;
  moveItemSelect.innerHTML = "";
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = "Pilih item...";
  moveItemSelect.appendChild(opt0);

  itemsCache.forEach((it) => {
    const s1 = getStock(it.id, "w1");
    const opt = document.createElement("option");
    opt.value = it.id;
    opt.textContent = `${it.name} (W1: ${s1} ${it.unit || ""})`;
    moveItemSelect.appendChild(opt);
  });
}

async function transferW1toW2() {
  const itemId = moveItemSelect?.value || "";
  const qty = Number(moveQty?.value || 0);

  if (!itemId) return showToast("Pilih item dulu", "error");
  if (!qty || qty <= 0) return showToast("Qty transfer harus > 0", "error");

  const item = itemsCache.find((x) => x.id === itemId);
  const s1 = getStock(itemId, "w1");
  const s2 = getStock(itemId, "w2");

  if (qty > s1) return showToast(`Stok Gudang 1 kurang. Sisa ${s1}`, "error");

  try {
    await updateDoc(doc(db, "warehouse_stock", `${itemId}_w1`), {
      stock: s1 - qty,
      updatedAt: serverTimestamp(),
      updatedBy: currentUser?.email || "-",
    });
    await updateDoc(doc(db, "warehouse_stock", `${itemId}_w2`), {
      stock: s2 + qty,
      updatedAt: serverTimestamp(),
      updatedBy: currentUser?.email || "-",
    });

    await addDoc(colMoves, {
      itemId,
      itemName: item?.name || "-",
      qty,
      unit: item?.unit || "",
      from: "w1",
      to: "w2",
      createdBy: currentUser?.email || "-",
      createdByUid: currentUser?.uid || null,
      createdAt: serverTimestamp(),
      createdAtLocal: new Date().toISOString(),
    });

    showToast(`Transfer sukses: ${item?.name} ${qty} ${item?.unit || ""}`, "success");
    if (moveQty) moveQty.value = "";
  } catch (e) {
    console.error(e);
    showToast("Gagal transfer", "error");
  }
}

/* ================== WASTE (REVISI UI) ==================
   - Tidak pakai gudang
   - Pilih item pakai search suggestion
   - Gram/ML pakai dropdown
*/
let wasteSelectedItemId = "";
let wasteUnitSelect = null;
let wasteQtyInput = null;
let wasteItemSearch = null;
let wasteSuggestBox = null;

function initWasteUIRewrite() {
  // 1) sembunyikan gudang
  if (wasteGudang) wasteGudang.closest(".form-grid")?.querySelector("div")?.classList?.add("hidden");
  if (wasteGudang) wasteGudang.parentElement?.classList?.add("hidden");

  // 2) sembunyikan select item lama
  if (wasteItemSelect) wasteItemSelect.parentElement?.classList?.add("hidden");

  // 3) sembunyikan input gram/ml lama (kita bikin satu input + dropdown unit)
  if (wasteMl) wasteMl.parentElement?.classList?.add("hidden");

  // repurpose wasteGram jadi qty input
  if (wasteGram) {
    wasteGram.placeholder = "Jumlah...";
    wasteQtyInput = wasteGram;
  }

  // 4) bikin search + suggest di atas input qty
  const card = whWasteSection?.querySelector(".card .form-grid");
  if (!card) return;

  // cari elemen pertama label "Pilih Item" (ada di HTML), kita sisipkan search di awal form-grid
  const wrap = document.createElement("div");
  wrap.className = "full";
  wrap.innerHTML = `
    <label>Cari & Pilih Item</label>
    <div class="suggest-wrap">
      <input id="wasteItemSearchNew" type="text" placeholder="Ketik nama item..." autocomplete="off" />
      <div id="wasteSuggestNew" class="suggest-box hidden"></div>
    </div>
    <div style="margin-top:6px; font-size:12px; opacity:.7;" id="wastePickedLabel">Belum pilih item</div>
  `;

  // sisipkan paling atas
  card.insertBefore(wrap, card.firstChild);

  // 5) bikin dropdown unit (gram/ml)
  const unitDiv = document.createElement("div");
  unitDiv.innerHTML = `
    <label>Satuan</label>
    <select id="wasteUnitNew">
      <option value="gram">Gram</option>
      <option value="ml">ML</option>
    </select>
  `;
  // taruh sebelum qty input (yang sekarang berada di div gram)
  if (wasteGram?.parentElement) {
    card.insertBefore(unitDiv, wasteGram.parentElement);
  }

  wasteUnitSelect = $("wasteUnitNew");
  wasteItemSearch = $("wasteItemSearchNew");
  wasteSuggestBox = $("wasteSuggestNew");

  const pickedLabel = $("wastePickedLabel");

  function renderWasteSuggest(keyword) {
    const q = (keyword || "").trim().toLowerCase();
    let list = [...itemsCache];

    if (q) {
      list = list.filter((it) => (it.name || "").toLowerCase().includes(q));
    }

    if (!list.length) {
      wasteSuggestBox.innerHTML = `<div class="suggest-item">Tidak ada item</div>`;
      wasteSuggestBox.classList.remove("hidden");
      return;
    }

    wasteSuggestBox.innerHTML = list
      .slice(0, 25)
      .map((it) => `<div class="suggest-item" data-id="${it.id}">${it.name} <span style="opacity:.7;">(${it.unit || "-"})</span></div>`)
      .join("");
    wasteSuggestBox.classList.remove("hidden");

    wasteSuggestBox.querySelectorAll(".suggest-item").forEach((el) => {
      const id = el.getAttribute("data-id");
      if (!id) return;
      el.addEventListener("click", () => {
        wasteSelectedItemId = id;
        const it = itemsCache.find((x) => x.id === id);
        if (pickedLabel) pickedLabel.textContent = `Dipilih: ${it?.name || "-"} (${it?.unit || "-"})`;
        if (wasteItemSearch) wasteItemSearch.value = it?.name || "";
        wasteSuggestBox.classList.add("hidden");
      });
    });

    if (list.length === 1) {
      // auto select
      const it = list[0];
      wasteSelectedItemId = it.id;
      if (pickedLabel) pickedLabel.textContent = `Dipilih: ${it.name} (${it.unit || "-"})`;
      if (wasteItemSearch) wasteItemSearch.value = it.name;
      wasteSuggestBox.classList.add("hidden");
    }
  }

  wasteItemSearch?.addEventListener("input", () => {
    wasteSelectedItemId = "";
    if (pickedLabel) pickedLabel.textContent = "Belum pilih item";
    renderWasteSuggest(wasteItemSearch.value);
  });

  wasteItemSearch?.addEventListener("focus", () => {
    renderWasteSuggest(wasteItemSearch.value);
  });

  document.addEventListener("click", (e) => {
    if (!wrap.contains(e.target)) {
      wasteSuggestBox?.classList?.add("hidden");
    }
  });
}

async function saveWaste() {
  try {
    if (!wasteSelectedItemId) return showToast("Pilih item waste dulu (pakai search)", "error");
    const item = itemsCache.find((x) => x.id === wasteSelectedItemId);
    if (!item) return showToast("Item tidak ditemukan", "error");

    const dt = (wasteDate?.value || "").trim() || todayISO();
    const unit = wasteUnitSelect?.value || "gram";
    const qty = Number(wasteQtyInput?.value || 0);
    const note = (wasteNote?.value || "").trim();

    if (!qty || qty <= 0) return showToast("Jumlah waste harus > 0", "error");

    // tentukan gudang otomatis: pakai gudang yang stoknya lebih besar (biar laporan bisa “dipisah pergudang”)
    const s1 = getStock(item.id, "w1");
    const s2 = getStock(item.id, "w2");
    const warehouse = s2 > s1 ? "w2" : "w1";

    await addDoc(colWaste, {
      itemId: item.id,
      itemName: item.name || "-",
      unitMeasure: unit,   // gram/ml
      qty,
      note,
      warehouse,           // untuk laporan dipisah
      createdBy: currentUser?.email || "-",
      createdByUid: currentUser?.uid || null,
      wasteDate: dt,
      createdAt: serverTimestamp(),
      createdAtLocal: new Date().toISOString(),
    });

    showToast("Waste tersimpan", "success");

    // reset
    if (wasteQtyInput) wasteQtyInput.value = "";
    if (wasteNote) wasteNote.value = "";
  } catch (e) {
    console.error(e);
    showToast("Gagal menyimpan waste", "error");
  }
}

/* ================== REPORT ================== */
function clearReportTable() {
  if (whReportHead) whReportHead.innerHTML = "";
  if (whReportBody) whReportBody.innerHTML = "";
}

function renderReportHead(kind) {
  if (!whReportHead) return;
  whReportHead.innerHTML = "";

  const tr = document.createElement("tr");
  if (kind.startsWith("opname_")) {
    tr.innerHTML = `
      <th>Tanggal</th>
      <th>Item</th>
      <th>Gudang</th>
      <th>Stok Sistem</th>
      <th>Stok Fisik</th>
      <th>Selisih</th>
      <th>User</th>
    `;
  } else {
    tr.innerHTML = `
      <th>Tanggal</th>
      <th>Item</th>
      <th>Qty</th>
      <th>Satuan</th>
      <th>Gudang</th>
      <th>Catatan</th>
      <th>User</th>
    `;
  }
  whReportHead.appendChild(tr);
}

async function generateReport() {
  clearReportTable();
  const kind = whReportType?.value || "opname_w1";

  const start = parseDateInput(whReportStart?.value);
  const end = parseDateEndInput(whReportEnd?.value);
  if (!start || !end) return showToast("Tanggal laporan wajib diisi", "error");
  if (end < start) return showToast("Tanggal akhir tidak boleh sebelum tanggal awal", "error");

  renderReportHead(kind);

  if (!whReportBody) return;

  if (kind === "opname_w1" || kind === "opname_w2") {
    const wh = kind === "opname_w1" ? "w1" : "w2";

    // ambil logs periode + warehouse
    const qLogs = query(colOpnameLogs, orderBy("createdAt", "desc"));
    const snap = await getDocs(qLogs);

    let rows = [];
    snap.forEach((d) => {
      const data = d.data();
      const dt = data.createdAt?.toDate?.() || (data.createdAtLocal ? new Date(data.createdAtLocal) : null);
      if (!dt || isNaN(dt)) return;
      if (dt < start || dt > end) return;
      if (data.warehouse !== wh) return;

      rows.push({
        tanggal: dt,
        itemName: data.itemName || "-",
        warehouse: data.warehouse || "-",
        systemStock: Number(data.systemStock ?? 0),
        physicalStock: Number(data.physicalStock ?? 0),
        diff: Number(data.diff ?? 0),
        user: data.createdBy || "-",
      });
    });

    if (!rows.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="7">Tidak ada data opname pada periode ini.</td>`;
      whReportBody.appendChild(tr);
      return;
    }

    rows.forEach((r) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${formatDateShort(r.tanggal)} ${pad2(r.tanggal.getHours())}:${pad2(r.tanggal.getMinutes())}</td>
        <td>${r.itemName}</td>
        <td>${(r.warehouse || "").toUpperCase()}</td>
        <td>${r.systemStock}</td>
        <td>${r.physicalStock}</td>
        <td>${r.diff}</td>
        <td>${r.user}</td>
      `;
      whReportBody.appendChild(tr);
    });

    showToast("Laporan opname diperbarui", "success");
  }

  if (kind === "waste_w1" || kind === "waste_w2") {
    const wh = kind === "waste_w1" ? "w1" : "w2";
    const qWaste = query(colWaste, orderBy("createdAt", "desc"));
    const snap = await getDocs(qWaste);

    let rows = [];
    snap.forEach((d) => {
      const data = d.data();
      // wasteDate pakai string yyyy-mm-dd (lebih gampang filter)
      const wd = data.wasteDate ? new Date(data.wasteDate + "T00:00:00") : null;
      if (!wd || isNaN(wd)) return;
      if (wd < start || wd > end) return;
      if (data.warehouse !== wh) return;

      rows.push({
        wasteDate: data.wasteDate || "-",
        itemName: data.itemName || "-",
        qty: Number(data.qty ?? 0),
        unitMeasure: data.unitMeasure || "-",
        warehouse: data.warehouse || "-",
        note: data.note || "",
        user: data.createdBy || "-",
      });
    });

    if (!rows.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="7">Tidak ada data waste pada periode ini.</td>`;
      whReportBody.appendChild(tr);
      return;
    }

    rows.forEach((r) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${formatDateShort(r.wasteDate)}</td>
        <td>${r.itemName}</td>
        <td>${r.qty}</td>
        <td>${r.unitMeasure}</td>
        <td>${(r.warehouse || "").toUpperCase()}</td>
        <td>${(r.note || "").replace(/</g, "&lt;")}</td>
        <td>${r.user}</td>
      `;
      whReportBody.appendChild(tr);
    });

    showToast("Laporan waste diperbarui", "success");
  }
}

/* ================== REALTIME LISTENERS ================== */
function startRealtime() {
  if (unsubscribeItems) unsubscribeItems();
  if (unsubscribeStock) unsubscribeStock();

  unsubscribeItems = onSnapshot(query(colItems, orderBy("name", "asc")), (snap) => {
    itemsCache = [];
    snap.forEach((d) => itemsCache.push({ id: d.id, ...d.data() }));

    // render dependent UI
    renderWarehouseDashboard();
    renderOpnameTable();
    renderMoveSelect();
    updateNotifPanel();
  });

  unsubscribeStock = onSnapshot(query(colStock, orderBy("warehouse", "asc")), (snap) => {
    stockCache = [];
    snap.forEach((d) => stockCache.push({ id: d.id, ...d.data() }));

    renderWarehouseDashboard();
    renderOpnameTable();
    renderMoveSelect();
    updateNotifPanel();
  });
}

/* ================== INIT NAV & EVENTS ================== */
function initNavHandlers() {
  navWhDashboard?.addEventListener("click", () => {
    setActiveNav(navWhDashboard);
    showWarehouseSection("dashboard");
  });

  navWhOpname?.addEventListener("click", () => {
    setActiveNav(navWhOpname);
    // reset bucket filter kalau buka manual
    if (whOpnameSection) delete whOpnameSection.dataset.bucket;
    showWarehouseSection("opname");
    renderOpnameTable();
  });

  navWhWaste?.addEventListener("click", () => {
    setActiveNav(navWhWaste);
    showWarehouseSection("waste");
  });

  navWhReport?.addEventListener("click", () => {
    setActiveNav(navWhReport);
    showWarehouseSection("report");
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
      ) sidebar.classList.remove("open");
    });
  }
}

function initFormHandlers() {
  btnSaveItem?.addEventListener("click", saveMasterItem);

  whOpnameGudang?.addEventListener("change", () => {
    // reset bucket filter saat ganti gudang
    if (whOpnameSection) delete whOpnameSection.dataset.bucket;
    renderOpnameTable();
  });

  whOpnameSearch?.addEventListener("input", () => renderOpnameTable());

  btnMove?.addEventListener("click", transferW1toW2);

  // Waste: rewrite UI + save
  if (btnSaveWaste) btnSaveWaste.addEventListener("click", saveWaste);

  btnWhReport?.addEventListener("click", generateReport);
}

/* ================== BOOTSTRAP ================== */
initNavHandlers();
initDashboardClickToOpname();
initFormHandlers();
ensureDefaultDates();

// tunggu login
onAuthStateChanged(auth, (user) => {
  currentUser = user || null;

  if (user) {
    // default tampilan: dashboard opname
    setActiveNav(navWhDashboard);
    showWarehouseSection("dashboard");

    // init waste UI sekali setelah login (butuh DOM siap)
    if (!window.__wasteUIInited) {
      initWasteUIRewrite();
      window.__wasteUIInited = true;
    }

    startRealtime();
    showToast("Warehouse aktif (realtime)", "success", 2200);
  } else {
    // logout -> stop listeners
    if (unsubscribeItems) unsubscribeItems();
    if (unsubscribeStock) unsubscribeStock();
    unsubscribeItems = null;
    unsubscribeStock = null;

    itemsCache = [];
    stockCache = [];
  }
});