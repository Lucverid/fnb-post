// warehouse.js (Firestore-ready) — Warehouse: Master Item, Opname, Transfer, Waste + History + Expiry Dashboard

import { getApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  where,
  updateDoc,
  doc,
  serverTimestamp,
  limit,
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
  // treat as local date
  const d = new Date(value + "T00:00:00");
  return isNaN(d) ? null : d;
}

function daysDiff(a, b) {
  // a - b in days
  const ms = 1000 * 60 * 60 * 24;
  return Math.floor((a.getTime() - b.getTime()) / ms);
}

// ========== Collections ==========
const colWhItems = collection(db, "wh_items");   // master + stok
const colWhWaste = collection(db, "wh_waste");   // waste logs

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
const whItemPricePerPack = $("whItemPricePerPack"); // will be ignored (optional)
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

// Waste
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
let items = [];      // wh_items cache
let wasteLogs = [];  // wh_waste cache

// thresholds
const LOW_STOCK_LT = 10;
const HIGH_STOCK_GT = 50;
const EXP_SOON_DAYS = 7;

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

if (navWhDashboard) navWhDashboard.addEventListener("click", () => (setActiveNav(navWhDashboard), showWhSection("dashboard")));
if (navWhOpname) navWhOpname.addEventListener("click", () => (setActiveNav(navWhOpname), showWhSection("opname")));
if (navWhWaste) navWhWaste.addEventListener("click", () => (setActiveNav(navWhWaste), showWhSection("waste")));
if (navWhReport) navWhReport.addEventListener("click", () => (setActiveNav(navWhReport), showWhSection("report")));

// ========== Load Data ==========
async function loadWhItems() {
  const snap = await getDocs(query(colWhItems, orderBy("name", "asc")));
  items = [];
  snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
}

async function loadWasteLogs(rangeStart = null, rangeEnd = null) {
  // Keep it simple: load last 200 then filter on client (works fine for small biz)
  const snap = await getDocs(query(colWhWaste, orderBy("createdAt", "desc"), limit(200)));
  wasteLogs = [];
  snap.forEach((d) => wasteLogs.push({ id: d.id, ...d.data() }));

  // optional client filter by dateKey
  if (rangeStart && rangeEnd) {
    const sKey = todayKey(rangeStart);
    const eKey = todayKey(rangeEnd);
    wasteLogs = wasteLogs.filter((w) => (w.dateKey || "") >= sKey && (w.dateKey || "") <= eKey);
  }
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
      <div id="cardExpOk" class="metric-card green">
        <i class="lucide-check-circle"></i>
        <div><b id="expOkCount">0</b> Belum Expired</div>
      </div>
      <div id="cardExpSoon" class="metric-card yellow">
        <i class="lucide-alert-triangle"></i>
        <div><b id="expSoonCount">0</b> Mau Expired (≤ ${EXP_SOON_DAYS} hari)</div>
      </div>
      <div id="cardExpBad" class="metric-card red">
        <i class="lucide-x-circle"></i>
        <div><b id="expBadCount">0</b> Sudah Expired</div>
      </div>
    </div>
  `;
  whDashboardSection.appendChild(wrap);
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
  const now = new Date();

  let expOk = 0, expSoon = 0, expBad = 0;
  items.forEach((it) => {
    const exp = it.expDate ? new Date(it.expDate) : null;
    if (!exp || isNaN(exp)) return; // if no exp, ignore from exp metric
    const left = daysDiff(exp, now); // exp - now
    if (left < 0) expBad++;
    else if (left <= EXP_SOON_DAYS) expSoon++;
    else expOk++;
  });

  const expOkCount = $("expOkCount");
  const expSoonCount = $("expSoonCount");
  const expBadCount = $("expBadCount");
  if (expOkCount) expOkCount.textContent = expOk;
  if (expSoonCount) expSoonCount.textContent = expSoon;
  if (expBadCount) expBadCount.textContent = expBad;

  // notif
  updateWarehouseNotif(expSoon, expBad);
}

function updateWarehouseNotif(expSoonCount, expBadCount) {
  if (!notifList || !notifBadge) return;

  // We'll append warehouse notifications (simple, clear)
  notifList.innerHTML = "";
  let count = 0;

  const now = new Date();

  // Expired
  const expiredItems = items
    .filter((it) => it.expDate && !isNaN(new Date(it.expDate)) && daysDiff(new Date(it.expDate), now) < 0)
    .slice(0, 10);

  expiredItems.forEach((it) => {
    const li = document.createElement("li");
    li.textContent = `EXPIRED: ${it.name} (EXP ${it.expDate})`;
    notifList.appendChild(li);
    count++;
  });

  // Exp soon
  const expSoonItems = items
    .filter((it) => {
      const exp = it.expDate ? new Date(it.expDate) : null;
      if (!exp || isNaN(exp)) return false;
      const left = daysDiff(exp, now);
      return left >= 0 && left <= EXP_SOON_DAYS;
    })
    .slice(0, 10);

  expSoonItems.forEach((it) => {
    const exp = new Date(it.expDate);
    const left = daysDiff(exp, now);
    const li = document.createElement("li");
    li.textContent = `Mau EXP (${left} hari): ${it.name} (EXP ${it.expDate})`;
    notifList.appendChild(li);
    count++;
  });

  // Low stock hints (optional, useful)
  const lowStock = items
    .filter((it) => (Number(it.stockW1 || 0) > 0 && Number(it.stockW1 || 0) < LOW_STOCK_LT) || (Number(it.stockW2 || 0) > 0 && Number(it.stockW2 || 0) < LOW_STOCK_LT))
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

function fillWasteSelect(keyword = "") {
  if (!wasteItemSelect) return;
  const q = (keyword || "").trim().toLowerCase();
  const list = q
    ? items.filter((it) => (it.name || "").toLowerCase().includes(q) || (it.supplier || "").toLowerCase().includes(q))
    : items;

  wasteItemSelect.innerHTML = `<option value="">Pilih item...</option>`;
  list.forEach((it) => {
    const opt = document.createElement("option");
    opt.value = it.id;
    opt.textContent = it.name;
    wasteItemSelect.appendChild(opt);
  });
}

function updateWasteUnitBySelectedItem() {
  if (!wasteUnit || !wasteItemSelect) return;
  const id = wasteItemSelect.value;
  const it = items.find((x) => x.id === id);
  wasteUnit.innerHTML = "";

  if (!it) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "—";
    wasteUnit.appendChild(opt);
    return;
  }

  // waste uses small unit (gram/ml/pcs) as requested
  const unitSmall = (it.unitSmall || "").trim() || "unit";
  const opt = document.createElement("option");
  opt.value = unitSmall;
  opt.textContent = unitSmall;
  wasteUnit.appendChild(opt);
}

// ========== Opname Table ==========
function renderOpnameTable() {
  if (!whOpnameTableBody || !whOpnameGudang) return;

  const gudang = whOpnameGudang.value || "w1";
  const keyword = (whOpnameSearch?.value || "").trim().toLowerCase();

  let list = [...items];
  if (keyword) {
    list = list.filter((it) =>
      (it.name || "").toLowerCase().includes(keyword) ||
      (it.supplier || "").toLowerCase().includes(keyword) ||
      (it.unitBig || "").toLowerCase().includes(keyword) ||
      (it.unitSmall || "").toLowerCase().includes(keyword)
    );
  }

  whOpnameTableBody.innerHTML = "";
  if (!list.length) {
    whOpnameTableBody.innerHTML = `<tr><td colspan="9">Belum ada item.</td></tr>`;
    return;
  }

  list.forEach((it) => {
    const systemStock = Number(gudang === "w1" ? it.stockW1 || 0 : it.stockW2 || 0);
    const unitText = `${it.unitBig || "-"} / ${it.unitSmall || "-"}`;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${it.name || "-"}</td>
      <td>${unitText}</td>
      <td>${it.expDate || "-"}</td>
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

  const payload = {
    updatedAt: serverTimestamp(),
  };

  if (gudang === "w1") payload.stockW1 = physical;
  else payload.stockW2 = physical;

  try {
    await updateDoc(doc(db, "wh_items", itemId), payload);
    showToast(`Opname tersimpan: ${it.name} (${gudang.toUpperCase()})`, "success");
    await loadWhItems();
    fillMoveSelect();
    fillWasteSelect(wasteItemSearch?.value || "");
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

  // ✅ Harga tidak dipakai di Opname (sesuai request). Tapi kita tetap simpan OPTIONAL kalau suatu saat perlu.
  const pricePerPack = Number(whItemPricePerPack?.value || 0) || 0;

  const docData = {
    name,
    unitBig,
    unitSmall,
    packQty,
    pricePerPack, // optional
    expDate: exp, // store as YYYY-MM-DD string (simple)
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
    fillWasteSelect();
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

// ========== Waste Save + History ==========
function ensureWasteDefaults() {
  const today = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const val = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  if (wasteDate && !wasteDate.value) wasteDate.value = val;
  if (wasteFilterStart && !wasteFilterStart.value) wasteFilterStart.value = val;
  if (wasteFilterEnd && !wasteFilterEnd.value) wasteFilterEnd.value = val;
}

async function saveWaste() {
  if (!currentUser) return showToast("Harus login", "error");

  const itemId = wasteItemSelect?.value || "";
  const it = items.find((x) => x.id === itemId);
  if (!it) return showToast("Pilih item waste dulu", "error");

  const d = wasteDate?.value || "";
  if (!d) return showToast("Tanggal waste wajib diisi", "error");

  const qty = Number(wasteQty?.value || 0);
  if (!qty || qty <= 0) return showToast("Qty waste harus > 0", "error");

  const unit = (wasteUnit?.value || it.unitSmall || "unit").trim();
  const note = (wasteNote?.value || "").trim();

  // Waste mengurangi stok — asumsi: waste terjadi di W1 (kalau nanti mau pilih gudang, kita tambah select)
  // Qty waste pakai unit kecil (gram/ml/pcs). Jika kamu mau otomatis konversi dari unit kecil ke dus,
  // kita bisa bikin aturan: qtySmall / packQty -> pengurangan stockW1.
  // Untuk sekarang: kita catat log waste, dan KURANGI stok W1 dalam "unit kecil ekuivalen".
  // Tapi stok W1 saat ini masih berbasis "unit besar". Jadi kita pakai cara aman:
  // ✅ Saat ini kita HANYA simpan log waste (history), tidak mengurangi stok W1,
  // karena satuannya beda. Nanti kalau kamu set aturan konversi, baru kita potong stok dengan benar.
  // (Kalau kamu ingin sekarang juga potong stok W1, bilang: waste dihitung per dus atau per pcs?)

  const log = {
    itemId,
    itemName: it.name || "-",
    dateKey: d,               // YYYY-MM-DD
    qty,
    unit,                     // unit small
    note,
    createdBy: currentUser.email || "-",
    createdAt: serverTimestamp(),
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
    wasteHistoryBody.innerHTML = `<tr><td colspan="6">Belum ada data waste.</td></tr>`;
    return;
  }

  list.forEach((w) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${w.dateKey || "-"}</td>
      <td>${w.itemName || "-"}</td>
      <td>${Number(w.qty || 0)}</td>
      <td>${w.unit || "-"}</td>
      <td>${w.note || "-"}</td>
      <td>${w.createdBy || "-"}</td>
    `;
    wasteHistoryBody.appendChild(tr);
  });
}

// ========== Events ==========
if (btnSaveItem) btnSaveItem.addEventListener("click", saveMasterItem);
if (btnMove) btnMove.addEventListener("click", transferW1toW2);

if (whOpnameGudang) whOpnameGudang.addEventListener("change", renderOpnameTable);
if (whOpnameSearch) whOpnameSearch.addEventListener("input", renderOpnameTable);

if (wasteItemSearch) wasteItemSearch.addEventListener("input", () => fillWasteSelect(wasteItemSearch.value));
if (wasteItemSelect) wasteItemSelect.addEventListener("change", updateWasteUnitBySelectedItem);
if (btnSaveWaste) btnSaveWaste.addEventListener("click", saveWaste);

if (wasteFilterStart) wasteFilterStart.addEventListener("change", async () => {
  await loadWasteLogs(getWasteFilterStart(), getWasteFilterEnd());
  renderWasteHistory();
});
if (wasteFilterEnd) wasteFilterEnd.addEventListener("change", async () => {
  await loadWasteLogs(getWasteFilterStart(), getWasteFilterEnd());
  renderWasteHistory();
});
if (wasteHistorySearch) wasteHistorySearch.addEventListener("input", renderWasteHistory);

// ========== Boot ==========
async function bootWarehouse() {
  ensureWasteDefaults();

  await loadWhItems();
  fillMoveSelect();
  fillWasteSelect();
  updateWasteUnitBySelectedItem();

  renderOpnameTable();
  await loadWasteLogs(getWasteFilterStart(), getWasteFilterEnd());
  renderWasteHistory();

  updateDashboard();
}

onAuthStateChanged(auth, async (u) => {
  currentUser = u || null;
  if (!currentUser) return; // script.js will handle login UI

  try {
    await bootWarehouse();
  } catch (e) {
    console.error(e);
    showToast("Warehouse gagal init", "error");
  }
});