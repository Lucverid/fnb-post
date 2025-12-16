// warehouse.js (Firestore-ready) — Warehouse: Master Item, Opname, Transfer, Waste + History + Expiry Dashboard + Click Filter

import { getApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  updateDoc,
  doc,
  serverTimestamp,
  limit,
  deleteDoc,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

// ========== Reuse Firebase App from script.js ==========
const app = getApp();
const auth = getAuth(app);
const db = getFirestore(app);

// ========== DOM Helpers ==========
const $ = (id) => document.getElementById(id);

// Reuse toast from script.js if exists
function showToast(msg, type = "info", time = 3000) {
  const container = $("toast-container");
  if (!container) return alert(msg);
  const div = document.createElement("div");
  div.className = `toast toast-${type}`;
  div.textContent = msg;
  container.appendChild(div);
  setTimeout(() => div.remove(), time);
}

function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDateOnly(value) {
  if (!value) return null;
  const d = new Date(value + "T00:00:00");
  return isNaN(d) ? null : d;
}

function daysDiff(a, b) {
  // a - b in days
  const ms = 1000 * 60 * 60 * 24;
  return Math.floor((a.getTime() - b.getTime()) / ms);
}

function clampInt(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

// ========== Collections ==========
const colWhItems = collection(db, "wh_items"); // master + stok
const colWhWaste = collection(db, "wh_waste"); // waste logs

// ========== Elements ==========
const whDashboardSection = $("whDashboardSection");
const whOpnameSection = $("whOpnameSection");
const whWasteSection = $("whWasteSection");
const whReportSection = $("whReportSection");

const navWhDashboard = $("navWhDashboard");
const navWhOpname = $("navWhOpname");
const navWhWaste = $("navWhWaste");
const navWhReport = $("navWhReport");

// Dashboard cards (existing stok status cards)
const w1Habis = $("w1Habis");
const w1Lumayan = $("w1Lumayan");
const w1Banyak = $("w1Banyak");
const w2Habis = $("w2Habis");
const w2Lumayan = $("w2Lumayan");
const w2Banyak = $("w2Banyak");

// ✅ NEW: expiry indicators (we'll inject cards if not exist)
const dashboardExpiryWrapId = "whExpiryWrap";

// Opname form
const whItemName = $("whItemName");
const whItemUnitBig = $("whItemUnitBig");
const whItemUnitSmall = $("whItemUnitSmall");
const whItemPackQty = $("whItemPackQty");
const whItemPricePerPack = $("whItemPricePerPack"); // optional (not used in opname)
const whItemExp = $("whItemExp");
const whItemReceivedAt = $("whItemReceivedAt");
const whItemSupplier = $("whItemSupplier");
const whItemInfo = $("whItemInfo");
const btnSaveItem = $("btnSaveItem");

const moveItemSelect = $("moveItemSelect");
const moveQty = $("moveQty");
const btnMove = $("btnMove");

const whOpnameGudang = $("whOpnameGudang");
const whOpnameSearch = $("whOpnameSearch");
const whOpnameTableBody = $("whOpnameTableBody");

// Waste (Search will be disabled/hidden)
const wasteItemSearch = $("wasteItemSearch");
const wasteItemSelect = $("wasteItemSelect");
const wasteDate = $("wasteDate");
const wasteUnit = $("wasteUnit");
const wasteQty = $("wasteQty");
const wasteNote = $("wasteNote");
const btnSaveWaste = $("btnSaveWaste");

// Waste history
const wasteFilterStart = $("wasteFilterStart");
const wasteFilterEnd = $("wasteFilterEnd");
const wasteHistorySearch = $("wasteHistorySearch");
const wasteHistoryBody = $("wasteHistoryBody");

// Notif (reuse existing top notif UI)
const notifBadge = $("notifBadge");
const notifList = $("notifList");

// ========== State ==========
let currentUser = null;
let items = []; // wh_items cache
let wasteLogs = []; // wh_waste cache

// thresholds
const LOW_STOCK_LT = 10;
const HIGH_STOCK_GT = 50;
const EXP_SOON_DAYS = 7;

// Opname filter by expiry via dashboard click
let whExpiryFilter = null; // null | "ok" | "soon" | "expired"

// Waste CRUD edit state
let editingWasteId = null;
let editingWasteSnapshot = null;

// Waste preset items (NOT from opname/master)
const WASTE_PRESET_ITEMS = [
  "Milktea",
  "Teh Hijau",
  "Teh Hitam",
  "Teh Blooming",
  "Teh oolong",
  "boba",
  "susu",
  "pudding",
  "kopi",
  "crystal jelly",
  "Eskrim original",
  "eskrim yoghurt",
  "pendamping lemon",
];

// ========== Navigation ==========
function setActiveNav(btn) {
  document.querySelectorAll(".side-item").forEach((b) => b.classList.remove("active"));
  if (btn) btn.classList.add("active");
}

function showWhSection(which) {
  [whDashboardSection, whOpnameSection, whWasteSection, whReportSection].forEach((sec) => {
    if (sec) sec.classList.add("hidden");
  });

  if (which === "dashboard" && whDashboardSection) whDashboardSection.classList.remove("hidden");
  if (which === "opname" && whOpnameSection) whOpnameSection.classList.remove("hidden");
  if (which === "waste" && whWasteSection) whWasteSection.classList.remove("hidden");
  if (which === "report" && whReportSection) whReportSection.classList.remove("hidden");
}

if (navWhDashboard)
  navWhDashboard.addEventListener("click", () => {
    whExpiryFilter = null;
    setActiveNav(navWhDashboard);
    showWhSection("dashboard");
  });

if (navWhOpname)
  navWhOpname.addEventListener("click", () => {
    // masuk opname biasa = reset filter expiry
    whExpiryFilter = null;
    setActiveNav(navWhOpname);
    showWhSection("opname");
    renderOpnameTable();
  });

if (navWhWaste)
  navWhWaste.addEventListener("click", () => {
    setActiveNav(navWhWaste);
    showWhSection("waste");
  });

if (navWhReport)
  navWhReport.addEventListener("click", () => {
    setActiveNav(navWhReport);
    showWhSection("report");
  });

// ========== Load Data ==========
async function loadWhItems() {
  const snap = await getDocs(query(colWhItems, orderBy("name", "asc")));
  items = [];
  snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
}

async function loadWasteLogs(rangeStart = null, rangeEnd = null) {
  // Load last 200 then filter client
  const snap = await getDocs(query(colWhWaste, orderBy("createdAt", "desc"), limit(200)));
  wasteLogs = [];
  snap.forEach((d) => wasteLogs.push({ id: d.id, ...d.data() }));

  if (rangeStart && rangeEnd) {
    const sKey = todayKey(rangeStart);
    const eKey = todayKey(rangeEnd);
    wasteLogs = wasteLogs.filter((w) => (w.dateKey || "") >= sKey && (w.dateKey || "") <= eKey);
  }
}

// ========== Expiry Helpers ==========
function getExpStatus(expStr) {
  // expStr: "YYYY-MM-DD" or ""
  // Rule: empty exp = ok (Belum Expired)
  if (!expStr) return "ok";
  const now = new Date();
  const exp = parseDateOnly(expStr);
  if (!exp) return "ok";

  const left = daysDiff(exp, now); // exp - now
  if (left < 0) return "expired";
  if (left <= EXP_SOON_DAYS) return "soon";
  return "ok";
}

// ========== Dashboard: Stock Metrics + Expiry + Notif ==========
function stockBucketCount(stock) {
  const n = Number(stock || 0);
  if (n <= 0) return "habis";
  if (n < LOW_STOCK_LT) return "low";
  if (n > HIGH_STOCK_GT) return "high";
  return "mid";
}

function ensureExpiryCards() {
  if (!whDashboardSection) return;

  let wrap = $(dashboardExpiryWrapId);
  if (wrap) return;

  wrap = document.createElement("div");
  wrap.id = dashboardExpiryWrapId;
  wrap.innerHTML = `
    <h3 style="margin:18px 0 10px;">Indikator Expired</h3>
    <div class="metric-row">
      <div id="cardExpOk" class="metric-card green" style="cursor:pointer;">
        <i class="lucide-check-circle"></i>
        <div><b id="expOkCount">0</b> Belum Expired</div>
      </div>
      <div id="cardExpSoon" class="metric-card yellow" style="cursor:pointer;">
        <i class="lucide-alert-triangle"></i>
        <div><b id="expSoonCount">0</b> Mau Expired (≤ ${EXP_SOON_DAYS} hari)</div>
      </div>
      <div id="cardExpBad" class="metric-card red" style="cursor:pointer;">
        <i class="lucide-x-circle"></i>
        <div><b id="expBadCount">0</b> Sudah Expired</div>
      </div>
    </div>
  `;
  whDashboardSection.appendChild(wrap);

  // click-to-filter
  const cardExpOk = $("cardExpOk");
  const cardExpSoon = $("cardExpSoon");
  const cardExpBad = $("cardExpBad");

  if (cardExpOk) cardExpOk.addEventListener("click", () => gotoOpnameWithExpiryFilter("ok"));
  if (cardExpSoon) cardExpSoon.addEventListener("click", () => gotoOpnameWithExpiryFilter("soon"));
  if (cardExpBad) cardExpBad.addEventListener("click", () => gotoOpnameWithExpiryFilter("expired"));
}

function gotoOpnameWithExpiryFilter(type) {
  whExpiryFilter = type; // "ok" | "soon" | "expired"
  setActiveNav(navWhOpname);
  showWhSection("opname");

  const label =
    type === "ok"
      ? "Filter: Belum Expired"
      : type === "soon"
      ? `Filter: Mau Exp (≤ ${EXP_SOON_DAYS} hari)`
      : "Filter: Sudah Expired";

  showToast(label, "info", 2200);
  renderOpnameTable();
}

function updateDashboard() {
  // stock per gudang
  let w1 = { habis: 0, low: 0, high: 0 };
  let w2 = { habis: 0, low: 0, high: 0 };

  items.forEach((it) => {
    const s1 = stockBucketCount(it.stockW1 || 0);
    const s2 = stockBucketCount(it.stockW2 || 0);
    if (s1 === "habis") w1.habis++;
    if (s1 === "low") w1.low++;
    if (s1 === "high") w1.high++;

    if (s2 === "habis") w2.habis++;
    if (s2 === "low") w2.low++;
    if (s2 === "high") w2.high++;
  });

  if (w1Habis) w1Habis.textContent = w1.habis;
  if (w1Lumayan) w1Lumayan.textContent = w1.low;
  if (w1Banyak) w1Banyak.textContent = w1.high;
  if (w2Habis) w2Habis.textContent = w2.habis;
  if (w2Lumayan) w2Lumayan.textContent = w2.low;
  if (w2Banyak) w2Banyak.textContent = w2.high;

  // expiry
  ensureExpiryCards();
  let expOk = 0,
    expSoon = 0,
    expBad = 0;

  items.forEach((it) => {
    const st = getExpStatus(it.expDate || "");
    if (st === "ok") expOk++;
    else if (st === "soon") expSoon++;
    else expBad++;
  });

  const expOkCount = $("expOkCount");
  const expSoonCount = $("expSoonCount");
  const expBadCount = $("expBadCount");
  if (expOkCount) expOkCount.textContent = expOk;
  if (expSoonCount) expSoonCount.textContent = expSoon;
  if (expBadCount) expBadCount.textContent = expBad;

  // notif
  updateWarehouseNotif();
}

function updateWarehouseNotif() {
  if (!notifList || !notifBadge) return;

  notifList.innerHTML = "";
  let count = 0;

  const now = new Date();

  // expired
  const expiredItems = items
    .filter((it) => getExpStatus(it.expDate || "") === "expired" && (it.expDate || ""))
    .slice(0, 10);

  expiredItems.forEach((it) => {
    const li = document.createElement("li");
    li.textContent = `EXPIRED: ${it.name} (EXP ${it.expDate})`;
    notifList.appendChild(li);
    count++;
  });

  // exp soon
  const expSoonItems = items
    .filter((it) => getExpStatus(it.expDate || "") === "soon" && (it.expDate || ""))
    .slice(0, 10);

  expSoonItems.forEach((it) => {
    const exp = parseDateOnly(it.expDate);
    const left = exp ? daysDiff(exp, now) : 0;
    const li = document.createElement("li");
    li.textContent = `Mau EXP (${left} hari): ${it.name} (EXP ${it.expDate})`;
    notifList.appendChild(li);
    count++;
  });

  // low stock
  const lowStock = items
    .filter(
      (it) =>
        (Number(it.stockW1 || 0) > 0 && Number(it.stockW1 || 0) < LOW_STOCK_LT) ||
        (Number(it.stockW2 || 0) > 0 && Number(it.stockW2 || 0) < LOW_STOCK_LT)
    )
    .slice(0, 10);

  lowStock.forEach((it) => {
    const li = document.createElement("li");
    li.textContent = `Stok rendah: ${it.name} (W1 ${it.stockW1 || 0}, W2 ${it.stockW2 || 0})`;
    notifList.appendChild(li);
    count++;
  });

  if (count === 0) {
    const li = document.createElement("li");
    li.textContent = "Tidak ada notifikasi gudang.";
    notifList.appendChild(li);
  }

  notifBadge.textContent = String(count);
}

// ========== Dropdowns ==========
function fillMoveSelect() {
  if (!moveItemSelect) return;
  moveItemSelect.innerHTML = `<option value="">Pilih item...</option>`;
  items.forEach((it) => {
    const opt = document.createElement("option");
    opt.value = it.id;
    opt.textContent = it.name;
    moveItemSelect.appendChild(opt);
  });
}

// Waste dropdown (PRESET, not from items)
function fillWasteSelectPreset() {
  if (!wasteItemSelect) return;
  wasteItemSelect.innerHTML = `<option value="">Pilih item...</option>`;
  WASTE_PRESET_ITEMS.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    wasteItemSelect.appendChild(opt);
  });
}

// Waste unit options (standalone)
function fillWasteUnitOptions() {
  if (!wasteUnit) return;
  const units = ["gram", "ml", "pcs", "unit"];
  wasteUnit.innerHTML = "";
  units.forEach((u) => {
    const opt = document.createElement("option");
    opt.value = u;
    opt.textContent = u;
    wasteUnit.appendChild(opt);
  });
}

// ========== Opname Table (with expiry filter) ==========
function applyExpiryFilter(list) {
  if (!whExpiryFilter) return list;

  return (list || []).filter((it) => {
    const st = getExpStatus(it.expDate || "");
    return st === whExpiryFilter;
  });
}

function renderOpnameTable() {
  if (!whOpnameTableBody || !whOpnameGudang) return;

  const gudang = whOpnameGudang.value || "w1";
  const keyword = (whOpnameSearch?.value || "").trim().toLowerCase();

  let list = [...items];

  if (keyword) {
    list = list.filter(
      (it) =>
        (it.name || "").toLowerCase().includes(keyword) ||
        (it.supplier || "").toLowerCase().includes(keyword) ||
        (it.unitBig || "").toLowerCase().includes(keyword) ||
        (it.unitSmall || "").toLowerCase().includes(keyword)
    );
  }

  // APPLY expiry filter from dashboard click
  list = applyExpiryFilter(list);

  whOpnameTableBody.innerHTML = "";
  if (!list.length) {
    whOpnameTableBody.innerHTML = `<tr><td colspan="9">Belum ada item.</td></tr>`;
    return;
  }

  list.forEach((it) => {
    const systemStock = Number(gudang === "w1" ? it.stockW1 || 0 : it.stockW2 || 0);
    const unitText = `${it.unitBig || "-"} / ${it.unitSmall || "-"}`;

    const expStr = it.expDate || "-";
    const expStatus = getExpStatus(it.expDate || "");
    const expBadge =
      expStatus === "expired"
        ? `<span class="status-badge red">EXPIRED</span>`
        : expStatus === "soon"
        ? `<span class="status-badge yellow">SOON</span>`
        : `<span class="status-badge green">OK</span>`;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${it.name || "-"}</td>
      <td>${unitText}</td>
      <td>${expStr}<div style="margin-top:6px;">${expBadge}</div></td>
      <td>${it.info || "-"}</td>
      <td>${it.receivedAt || "-"}</td>
      <td>${it.supplier || "-"}</td>
      <td>${systemStock}</td>
      <td>
        <input
          type="number"
          min="0"
          step="1"
          data-id="${it.id}"
          data-system="${systemStock}"
          value="${systemStock}"
          style="min-width:110px;"
        />
      </td>
      <td>
        <button class="btn-table btn-table-delete small" data-act="save" data-id="${it.id}">Simpan</button>
      </td>
    `;
    whOpnameTableBody.appendChild(tr);
  });

  whOpnameTableBody.querySelectorAll("button[data-act='save']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      await saveOpname(id);
    });
  });
}

async function saveOpname(itemId) {
  if (!currentUser) return showToast("Harus login", "error");

  const gudang = whOpnameGudang?.value || "w1";
  const inp = whOpnameTableBody?.querySelector(`input[data-id="${itemId}"]`);
  if (!inp) return;

  const physical = Number(inp.value || 0);
  if (physical < 0) return showToast("Stok fisik tidak valid", "error");

  const it = items.find((x) => x.id === itemId);
  if (!it) return;

  const payload = { updatedAt: serverTimestamp() };
  if (gudang === "w1") payload.stockW1 = physical;
  else payload.stockW2 = physical;

  try {
    await updateDoc(doc(db, "wh_items", itemId), payload);
    showToast(`Opname tersimpan: ${it.name} (${gudang.toUpperCase()})`, "success");

    await loadWhItems();
    fillMoveSelect();
    renderOpnameTable();
    updateDashboard();
  } catch (e) {
    console.error(e);
    showToast("Gagal simpan opname", "error");
  }
}

// ========== Master Item Save ==========
async function saveMasterItem() {
  if (!currentUser) return showToast("Harus login", "error");

  const name = (whItemName?.value || "").trim();
  const unitBig = (whItemUnitBig?.value || "").trim();
  const unitSmall = (whItemUnitSmall?.value || "").trim();
  const packQty = Number(whItemPackQty?.value || 0);
  const exp = whItemExp?.value || "";
  const receivedAt = whItemReceivedAt?.value || "";
  const supplier = (whItemSupplier?.value || "").trim();
  const info = (whItemInfo?.value || "").trim();

  if (!name) return showToast("Nama item wajib diisi", "error");
  if (!unitBig) return showToast("Unit besar wajib diisi", "error");
  if (!unitSmall) return showToast("Unit isi wajib diisi", "error");
  if (!packQty || packQty <= 0) return showToast("Isi per dus wajib > 0", "error");

  // Harga tidak dipakai di Opname. Tetap disimpan optional (kalau nanti perlu laporan pembelian)
  const pricePerPack = Number(whItemPricePerPack?.value || 0) || 0;

  const docData = {
    name,
    unitBig,
    unitSmall,
    packQty,
    pricePerPack, // optional
    expDate: exp, // YYYY-MM-DD
    receivedAt,
    supplier,
    info,
    stockW1: 0,
    stockW2: 0,
    createdBy: currentUser.email || "-",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await addDoc(colWhItems, docData);
    showToast("Master item tersimpan", "success");

    // reset
    if (whItemName) whItemName.value = "";
    if (whItemUnitBig) whItemUnitBig.value = "";
    if (whItemUnitSmall) whItemUnitSmall.value = "";
    if (whItemPackQty) whItemPackQty.value = "";
    if (whItemPricePerPack) whItemPricePerPack.value = "";
    if (whItemExp) whItemExp.value = "";
    if (whItemReceivedAt) whItemReceivedAt.value = "";
    if (whItemSupplier) whItemSupplier.value = "";
    if (whItemInfo) whItemInfo.value = "";

    await loadWhItems();
    fillMoveSelect();
    renderOpnameTable();
    updateDashboard();
  } catch (e) {
    console.error(e);
    showToast("Gagal simpan master item", "error");
  }
}

// ========== Transfer W1 -> W2 ==========
async function transferW1toW2() {
  if (!currentUser) return showToast("Harus login", "error");

  const itemId = moveItemSelect?.value || "";
  const qtyPack = Number(moveQty?.value || 0);

  if (!itemId) return showToast("Pilih item dulu", "error");
  if (!qtyPack || qtyPack <= 0) return showToast("Qty transfer harus > 0", "error");

  const it = items.find((x) => x.id === itemId);
  if (!it) return showToast("Item tidak ditemukan", "error");

  const s1 = Number(it.stockW1 || 0);
  if (qtyPack > s1) return showToast(`Stok W1 tidak cukup (stok: ${s1})`, "error");

  try {
    await updateDoc(doc(db, "wh_items", itemId), {
      stockW1: s1 - qtyPack,
      stockW2: Number(it.stockW2 || 0) + qtyPack,
      updatedAt: serverTimestamp(),
    });
    showToast("Transfer berhasil", "success");
    if (moveQty) moveQty.value = "";

    await loadWhItems();
    renderOpnameTable();
    updateDashboard();
  } catch (e) {
    console.error(e);
    showToast("Gagal transfer", "error");
  }
}

// ========== Waste Save + History (CRUD) ==========
function ensureWasteDefaults() {
  const today = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const val = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  if (wasteDate && !wasteDate.value) wasteDate.value = val;
  if (wasteFilterStart && !wasteFilterStart.value) wasteFilterStart.value = val;
  if (wasteFilterEnd && !wasteFilterEnd.value) wasteFilterEnd.value = val;
}

function disableWasteSearchUI() {
  // request: hapus cari item => hide if still exists
  if (wasteItemSearch) {
    const wrap = wasteItemSearch.closest(".card") || wasteItemSearch.parentElement;
    wasteItemSearch.value = "";
    wasteItemSearch.disabled = true;
    wasteItemSearch.style.display = "none";
    // kalau label-nya tepat sebelum input
    const prev = wasteItemSearch.previousElementSibling;
    if (prev && prev.tagName === "LABEL") prev.style.display = "none";
    // biar ada jarak rapi (optional)
    if (wrap) wrap.style.gap = "10px";
  }
}

async function saveWaste() {
  if (!currentUser) return showToast("Harus login", "error");

  const itemName = (wasteItemSelect?.value || "").trim();
  if (!itemName) return showToast("Pilih item waste dulu", "error");

  const d = wasteDate?.value || "";
  if (!d) return showToast("Tanggal waste wajib diisi", "error");

  const qty = Number(wasteQty?.value || 0);
  if (!qty || qty <= 0) return showToast("Qty waste harus > 0", "error");

  const unit = (wasteUnit?.value || "unit").trim();
  const note = (wasteNote?.value || "").trim();

  const log = {
    itemId: `preset:${itemName}`,
    itemName,
    dateKey: d,
    qty,
    unit,
    note,
    createdBy: currentUser.email || "-",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await addDoc(colWhWaste, log);
    showToast("Waste tersimpan", "success");

    if (wasteQty) wasteQty.value = "";
    if (wasteNote) wasteNote.value = "";

    await loadWasteLogs(getWasteFilterStart(), getWasteFilterEnd());
    renderWasteHistory();
    updateDashboard();
  } catch (e) {
    console.error(e);
    showToast("Gagal simpan waste", "error");
  }
}

function getWasteFilterStart() {
  return parseDateOnly(wasteFilterStart?.value || "") || null;
}
function getWasteFilterEnd() {
  return parseDateOnly(wasteFilterEnd?.value || "") || null;
}

function renderWasteHistory() {
  if (!wasteHistoryBody) return;

  const keyword = (wasteHistorySearch?.value || "").trim().toLowerCase();
  let list = [...wasteLogs];

  if (keyword) {
    list = list.filter((w) => {
      const a = (w.itemName || "").toLowerCase();
      const b = (w.note || "").toLowerCase();
      const c = (w.createdBy || "").toLowerCase();
      return a.includes(keyword) || b.includes(keyword) || c.includes(keyword);
    });
  }

  wasteHistoryBody.innerHTML = "";

  if (!list.length) {
    wasteHistoryBody.innerHTML = `<tr><td colspan="7">Belum ada data waste.</td></tr>`;
    return;
  }

  list.forEach((w) => {
    const isEditing = editingWasteId === w.id;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${isEditing ? `<input type="date" data-wedit="dateKey" value="${w.dateKey || ""}" />` : (w.dateKey || "-")}</td>
      <td>${isEditing ? buildWasteItemSelectHTML(w.itemName || "") : (w.itemName || "-")}</td>
      <td>${isEditing ? `<input type="number" min="0" step="1" data-wedit="qty" value="${clampInt(w.qty, 0)}" style="max-width:110px;" />` : clampInt(w.qty, 0)}</td>
      <td>${isEditing ? buildWasteUnitSelectHTML(w.unit || "unit") : (w.unit || "-")}</td>
      <td>${isEditing ? `<input type="text" data-wedit="note" value="${escapeHtml(w.note || "")}" />` : (w.note || "-")}</td>
      <td>${w.createdBy || "-"}</td>
      <td>
        <div class="table-actions" style="justify-content:flex-end;">
          ${
            isEditing
              ? `
                <button class="btn-table btn-table-edit small" data-wact="save" data-id="${w.id}">Save</button>
                <button class="btn-table small" data-wact="cancel" data-id="${w.id}">Cancel</button>
              `
              : `
                <button class="btn-table btn-table-edit small" data-wact="edit" data-id="${w.id}">Edit</button>
                <button class="btn-table btn-table-delete small" data-wact="delete" data-id="${w.id}">Hapus</button>
              `
          }
        </div>
      </td>
    `;
    wasteHistoryBody.appendChild(tr);

    // attach events
    tr.querySelectorAll("button[data-wact]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const act = btn.getAttribute("data-wact");
        const id = btn.getAttribute("data-id");
        if (act === "edit") startEditWaste(id);
        if (act === "cancel") cancelEditWaste();
        if (act === "save") await saveEditWaste(id);
        if (act === "delete") await deleteWaste(id);
      });
    });
  });
}

function startEditWaste(id) {
  const w = wasteLogs.find((x) => x.id === id);
  if (!w) return;
  editingWasteId = id;
  editingWasteSnapshot = { ...w };
  renderWasteHistory();
}

function cancelEditWaste() {
  editingWasteId = null;
  editingWasteSnapshot = null;
  renderWasteHistory();
}

async function saveEditWaste(id) {
  if (!currentUser) return showToast("Harus login", "error");
  if (!wasteHistoryBody) return;

  const row = wasteHistoryBody.querySelector(`button[data-wact="save"][data-id="${id}"]`)?.closest("tr");
  if (!row) return;

  const dateKey = row.querySelector(`input[data-wedit="dateKey"]`)?.value || "";
  const itemName = row.querySelector(`select[data-wedit="itemName"]`)?.value || "";
  const qty = Number(row.querySelector(`input[data-wedit="qty"]`)?.value || 0);
  const unit = row.querySelector(`select[data-wedit="unit"]`)?.value || "unit";
  const note = row.querySelector(`input[data-wedit="note"]`)?.value || "";

  if (!dateKey) return showToast("Tanggal wajib diisi", "error");
  if (!itemName) return showToast("Item wajib dipilih", "error");
  if (!qty || qty <= 0) return showToast("Qty harus > 0", "error");

  try {
    await updateDoc(doc(db, "wh_waste", id), {
      dateKey,
      itemId: `preset:${itemName}`,
      itemName,
      qty,
      unit,
      note,
      updatedAt: serverTimestamp(),
    });

    showToast("Waste updated", "success");
    editingWasteId = null;
    editingWasteSnapshot = null;

    await loadWasteLogs(getWasteFilterStart(), getWasteFilterEnd());
    renderWasteHistory();
  } catch (e) {
    console.error(e);
    showToast("Gagal update waste", "error");
  }
}

async function deleteWaste(id) {
  if (!currentUser) return showToast("Harus login", "error");
  const ok = confirm("Hapus data waste ini?");
  if (!ok) return;

  try {
    await deleteDoc(doc(db, "wh_waste", id));
    showToast("Waste dihapus", "success");

    if (editingWasteId === id) {
      editingWasteId = null;
      editingWasteSnapshot = null;
    }

    await loadWasteLogs(getWasteFilterStart(), getWasteFilterEnd());
    renderWasteHistory();
  } catch (e) {
    console.error(e);
    showToast("Gagal hapus waste", "error");
  }
}

function buildWasteItemSelectHTML(current) {
  const opts = WASTE_PRESET_ITEMS.map((x) => {
    const sel = x === current ? "selected" : "";
    return `<option value="${escapeHtmlAttr(x)}" ${sel}>${escapeHtml(x)}</option>`;
  }).join("");
  return `<select data-wedit="itemName">${opts}</select>`;
}

function buildWasteUnitSelectHTML(current) {
  const units = ["gram", "ml", "pcs", "unit"];
  const opts = units
    .map((u) => {
      const sel = u === current ? "selected" : "";
      return `<option value="${escapeHtmlAttr(u)}" ${sel}>${escapeHtml(u)}</option>`;
    })
    .join("");
  return `<select data-wedit="unit">${opts}</select>`;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function escapeHtmlAttr(str) {
  return escapeHtml(str).replaceAll("\n", " ");
}

// ========== Events ==========
if (btnSaveItem) btnSaveItem.addEventListener("click", saveMasterItem);
if (btnMove) btnMove.addEventListener("click", transferW1toW2);

if (whOpnameGudang) whOpnameGudang.addEventListener("change", renderOpnameTable);
if (whOpnameSearch) whOpnameSearch.addEventListener("input", renderOpnameTable);

if (btnSaveWaste) btnSaveWaste.addEventListener("click", saveWaste);

if (wasteFilterStart)
  wasteFilterStart.addEventListener("change", async () => {
    await loadWasteLogs(getWasteFilterStart(), getWasteFilterEnd());
    renderWasteHistory();
  });
if (wasteFilterEnd)
  wasteFilterEnd.addEventListener("change", async () => {
    await loadWasteLogs(getWasteFilterStart(), getWasteFilterEnd());
    renderWasteHistory();
  });
if (wasteHistorySearch) wasteHistorySearch.addEventListener("input", renderWasteHistory);

// ========== Boot ==========
async function bootWarehouse() {
  ensureWasteDefaults();

  // Waste UI changes
  disableWasteSearchUI();
  fillWasteSelectPreset();
  fillWasteUnitOptions();

  await loadWhItems();
  fillMoveSelect();

  renderOpnameTable();

  await loadWasteLogs(getWasteFilterStart(), getWasteFilterEnd());
  renderWasteHistory();

  updateDashboard();
}

onAuthStateChanged(auth, async (u) => {
  currentUser = u || null;
  if (!currentUser) return; // script.js handles login UI

  try {
    await bootWarehouse();
  } catch (e) {
    console.error(e);
    showToast("Warehouse gagal init", "error");
  }
});