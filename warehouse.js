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

const app = getApp();
const auth = getAuth(app);
const db = getFirestore(app);

const $ = (id) => document.getElementById(id);

// ===================== Utils =====================
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
  const ms = 1000 * 60 * 60 * 24;
  return Math.floor((a.getTime() - b.getTime()) / ms);
}
function clampInt(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
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
function iconBtn(html, title, extraClass = "") {
  return `<button class="btn-icon-mini ${extraClass}" type="button" title="${escapeHtmlAttr(
    title
  )}">${html}</button>`;
}

// CSV helpers (Excel-friendly)
function csvEscape(v) {
  const s = (v ?? "").toString();
  if (/[",\n\r]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}
function buildCsv(metaRows, headers, rows) {
  const lines = [];
  // UTF-8 BOM for Excel
  lines.push("\ufeff" + metaRows.map((r) => r.map(csvEscape).join(",")).join("\n"));
  lines.push(""); // blank line
  lines.push(headers.map(csvEscape).join(","));
  rows.forEach((r) => lines.push(r.map(csvEscape).join(",")));
  return lines.join("\n");
}
function downloadTextFile(filename, content, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function dateInRange(dateStr, startStr, endStr) {
  if (!dateStr) return false;
  if (!startStr && !endStr) return true;
  const key = dateStr; // YYYY-MM-DD
  const s = startStr || "0000-01-01";
  const e = endStr || "9999-12-31";
  return key >= s && key <= e;
}

// ===================== Collections =====================
const colWhItems = collection(db, "wh_items");
const colWhWaste = collection(db, "wh_waste");

// ===================== DOM =====================
const whDashboardSection = $("whDashboardSection");
const whOpnameSection = $("whOpnameSection");
const whWasteSection = $("whWasteSection");
const whReportSection = $("whReportSection");

const navWhDashboard = $("navWhDashboard");
const navWhOpname = $("navWhOpname");
const navWhWaste = $("navWhWaste");
const navWhReport = $("navWhReport");

// Dashboard
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

const dashboardExpiryWrapId = "whExpiryWrap";

// Master form
const whItemName = $("whItemName");
const whItemUnitBig = $("whItemUnitBig");
const whItemUnitSmall = $("whItemUnitSmall");
const whItemPackQty = $("whItemPackQty");
const whItemInitStockW1 = $("whItemInitStockW1"); // optional
const whItemExp = $("whItemExp");
const whItemReceivedAt = $("whItemReceivedAt");
const whItemSupplier = $("whItemSupplier");
const whItemInfo = $("whItemInfo");
const btnSaveItem = $("btnSaveItem");

// Transfer
const moveSearch = $("moveSearch"); // optional
const moveItemSelect = $("moveItemSelect");
const moveQty = $("moveQty");
const moveInfo = $("moveInfo"); // optional
const btnMove = $("btnMove");

// Opname
const whOpnameGudang = $("whOpnameGudang");
const whOpnameSearch = $("whOpnameSearch");
const whOpnameTableBody = $("whOpnameTableBody");

// Waste form
const wasteItemSelect = $("wasteItemSelect");
const wasteDate = $("wasteDate");
const wasteUnit = $("wasteUnit");
const wasteQty = $("wasteQty");
const wasteNote = $("wasteNote");
const btnSaveWaste = $("btnSaveWaste");

const wasteFilterStart = $("wasteFilterStart");
const wasteFilterEnd = $("wasteFilterEnd");
const wasteHistorySearch = $("wasteHistorySearch");
const wasteHistoryBody = $("wasteHistoryBody");
const wasteSortBy = $("wasteSortBy");
const wasteSortDirBtn = $("wasteSortDir");

const notifBadge = $("notifBadge");
const notifList = $("notifList");

// Report
const whReportType = $("whReportType");
const whReportStart = $("whReportStart");
const whReportEnd = $("whReportEnd");
const whReportNote = $("whReportNote"); // ✅ textarea catatan (opsional)
const btnWhReport = $("btnWhReport");
const whReportHead = $("whReportHead");
const whReportBody = $("whReportBody");

// ===================== State =====================
let currentUser = null;
let items = [];
let wasteLogs = [];

const LOW_STOCK_LT = 10;
const HIGH_STOCK_GT = 50;
const EXP_SOON_DAYS = 7;

let whExpiryFilter = null; // null | ok | soon | expired
let whStockFilter = null;  // null | { gudang, bucket }

// ✅ Master edit mode (via form)
let editingMasterId = null;

// ✅ Waste edit mode (via form)
let editingWasteFormId = null;

let wasteSortByState = "dateKey";
let wasteSortDirState = "asc";

const WASTE_PRESET_ITEMS = [
  "Milktea","Teh Hijau","Teh Hitam","Teh Blooming","Teh oolong",
  "boba","susu","pudding","kopi","crystal jelly",
  "Eskrim original","eskrim yoghurt","pendamping lemon",
];

// ===================== Navigation =====================
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
function resetOpnameFilters() {
  whExpiryFilter = null;
  whStockFilter = null;
}

navWhDashboard?.addEventListener("click", () => {
  resetOpnameFilters();
  setActiveNav(navWhDashboard);
  showWhSection("dashboard");
});
navWhOpname?.addEventListener("click", () => {
  setActiveNav(navWhOpname);
  showWhSection("opname");
  renderOpnameTable();
});
navWhWaste?.addEventListener("click", () => {
  setActiveNav(navWhWaste);
  showWhSection("waste");
});
navWhReport?.addEventListener("click", () => {
  setActiveNav(navWhReport);
  showWhSection("report");
});

// ===================== Load =====================
async function loadWhItems() {
  const snap = await getDocs(query(colWhItems, orderBy("name", "asc")));
  items = [];
  snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
}

async function loadWasteLogs(rangeStart = null, rangeEnd = null) {
  const snap = await getDocs(query(colWhWaste, orderBy("createdAt", "desc"), limit(200)));
  wasteLogs = [];
  snap.forEach((d) => wasteLogs.push({ id: d.id, ...d.data() }));

  if (rangeStart && rangeEnd) {
    const sKey = todayKey(rangeStart);
    const eKey = todayKey(rangeEnd);
    wasteLogs = wasteLogs.filter((w) => (w.dateKey || "") >= sKey && (w.dateKey || "") <= eKey);
  }
}

// ===================== Expiry =====================
function getExpStatus(expStr) {
  if (!expStr) return "ok";
  const now = new Date();
  const exp = parseDateOnly(expStr);
  if (!exp) return "ok";

  const left = daysDiff(exp, now);
  if (left < 0) return "expired";
  if (left <= EXP_SOON_DAYS) return "soon";
  return "ok";
}

// ===================== Stock bucket =====================
function stockBucketCount(stock) {
  const n = Number(stock || 0);
  if (n <= 0) return "habis";
  if (n < LOW_STOCK_LT) return "low";
  if (n > HIGH_STOCK_GT) return "high";
  return "mid";
}

// ===================== Dashboard expiry cards =====================
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

  $("cardExpOk")?.addEventListener("click", () => gotoOpnameWithExpiryFilter("ok"));
  $("cardExpSoon")?.addEventListener("click", () => gotoOpnameWithExpiryFilter("soon"));
  $("cardExpBad")?.addEventListener("click", () => gotoOpnameWithExpiryFilter("expired"));
}

function gotoOpnameWithExpiryFilter(type) {
  whExpiryFilter = type;
  whStockFilter = null;
  setActiveNav(navWhOpname);
  showWhSection("opname");
  renderOpnameTable();
}

function gotoOpnameWithStockFilter(gudang, bucket) {
  whStockFilter = { gudang, bucket };
  whExpiryFilter = null;

  setActiveNav(navWhOpname);
  showWhSection("opname");
  if (whOpnameGudang) whOpnameGudang.value = gudang;
  renderOpnameTable();
}

function bindStockCardClicks() {
  const setCursor = (el) => el && (el.style.cursor = "pointer");
  [cardW1Habis, cardW1Lumayan, cardW1Banyak, cardW2Habis, cardW2Lumayan, cardW2Banyak].forEach(setCursor);

  cardW1Habis?.addEventListener("click", () => gotoOpnameWithStockFilter("w1", "habis"));
  cardW1Lumayan?.addEventListener("click", () => gotoOpnameWithStockFilter("w1", "low"));
  cardW1Banyak?.addEventListener("click", () => gotoOpnameWithStockFilter("w1", "high"));

  cardW2Habis?.addEventListener("click", () => gotoOpnameWithStockFilter("w2", "habis"));
  cardW2Lumayan?.addEventListener("click", () => gotoOpnameWithStockFilter("w2", "low"));
  cardW2Banyak?.addEventListener("click", () => gotoOpnameWithStockFilter("w2", "high"));
}

function updateWarehouseNotif() {
  if (!notifList || !notifBadge) return;
  notifList.innerHTML = "";
  let count = 0;
  const now = new Date();

  const expiredItems = items
    .filter((it) => getExpStatus(it.expDate || "") === "expired" && (it.expDate || ""))
    .slice(0, 10);

  expiredItems.forEach((it) => {
    const li = document.createElement("li");
    li.textContent = `EXPIRED: ${it.name} (EXP ${it.expDate})`;
    notifList.appendChild(li);
    count++;
  });

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

function updateDashboard() {
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

  ensureExpiryCards();

  let expOk = 0, expSoon = 0, expBad = 0;
  items.forEach((it) => {
    const st = getExpStatus(it.expDate || "");
    if (st === "ok") expOk++;
    else if (st === "soon") expSoon++;
    else expBad++;
  });

  $("expOkCount") && ($("expOkCount").textContent = expOk);
  $("expSoonCount") && ($("expSoonCount").textContent = expSoon);
  $("expBadCount") && ($("expBadCount").textContent = expBad);

  updateWarehouseNotif();
}

// ===================== Master Form helpers =====================
function fillMasterForm(it) {
  if (!it) return;
  if (whItemName) whItemName.value = it.name || "";
  if (whItemUnitBig) whItemUnitBig.value = it.unitBig || "";
  if (whItemUnitSmall) whItemUnitSmall.value = it.unitSmall || "";
  if (whItemPackQty) whItemPackQty.value = String(clampInt(it.packQty, 0));
  if (whItemInitStockW1) whItemInitStockW1.value = String(clampInt(it.stockW1, 0));
  if (whItemExp) whItemExp.value = it.expDate || "";
  if (whItemReceivedAt) whItemReceivedAt.value = it.receivedAt || "";
  if (whItemSupplier) whItemSupplier.value = it.supplier || "";
  if (whItemInfo) whItemInfo.value = it.info || "";
  if (btnSaveItem) btnSaveItem.textContent = "Update";
}
function resetMasterForm() {
  if (whItemName) whItemName.value = "";
  if (whItemUnitBig) whItemUnitBig.value = "";
  if (whItemUnitSmall) whItemUnitSmall.value = "";
  if (whItemPackQty) whItemPackQty.value = "";
  if (whItemInitStockW1) whItemInitStockW1.value = "";
  if (whItemExp) whItemExp.value = "";
  if (whItemReceivedAt) whItemReceivedAt.value = "";
  if (whItemSupplier) whItemSupplier.value = "";
  if (whItemInfo) whItemInfo.value = "";
  editingMasterId = null;
  if (btnSaveItem) btnSaveItem.textContent = "Simpan Item";
}

async function createMasterItem() {
  if (!currentUser) return showToast("Harus login", "error");

  const name = (whItemName?.value || "").trim();
  const unitBig = (whItemUnitBig?.value || "").trim();
  const unitSmall = (whItemUnitSmall?.value || "").trim();
  const packQty = Number(whItemPackQty?.value || 0);

  const initStockW1 = Number(whItemInitStockW1?.value || 0);
  const safeInit = Number.isFinite(initStockW1) && initStockW1 > 0 ? Math.trunc(initStockW1) : 0;

  const exp = whItemExp?.value || "";
  const receivedAt = whItemReceivedAt?.value || "";
  const supplier = (whItemSupplier?.value || "").trim();
  const info = (whItemInfo?.value || "").trim();

  if (!name) return showToast("Nama item wajib diisi", "error");
  if (!unitBig) return showToast("Unit besar wajib diisi", "error");
  if (!unitSmall) return showToast("Unit isi wajib diisi", "error");
  if (!packQty || packQty <= 0) return showToast("Isi per dus wajib > 0", "error");

  const docData = {
    name,
    unitBig,
    unitSmall,
    packQty,
    expDate: exp,
    receivedAt,
    supplier,
    info,
    stockW1: safeInit,
    stockW2: 0,
    createdBy: currentUser.email || "-",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await addDoc(colWhItems, docData);
    showToast("Master item tersimpan", "success");
    resetMasterForm();

    await loadWhItems();
    fillMoveSelect(moveSearch?.value || "");
    renderOpnameTable();
    updateDashboard();
    updateMoveInfo();
  } catch (e) {
    console.error(e);
    showToast("Gagal simpan master item", "error");
  }
}

async function updateMasterItem(id) {
  if (!currentUser) return showToast("Harus login", "error");
  if (!id) return;

  const itOld = items.find((x) => x.id === id);
  if (!itOld) return showToast("Item tidak ditemukan", "error");

  const name = (whItemName?.value || "").trim();
  const unitBig = (whItemUnitBig?.value || "").trim();
  const unitSmall = (whItemUnitSmall?.value || "").trim();
  const packQty = Number(whItemPackQty?.value || 0);

  const expDate = whItemExp?.value || "";
  const receivedAt = whItemReceivedAt?.value || "";
  const supplier = (whItemSupplier?.value || "").trim();
  const info = (whItemInfo?.value || "").trim();

  if (!name) return showToast("Nama item wajib diisi", "error");
  if (!unitBig) return showToast("Unit besar wajib diisi", "error");
  if (!unitSmall) return showToast("Unit isi wajib diisi", "error");
  if (!packQty || packQty <= 0) return showToast("Isi per dus wajib > 0", "error");

  const payload = {
    name,
    unitBig,
    unitSmall,
    packQty,
    expDate,
    receivedAt,
    supplier,
    info,
    updatedAt: serverTimestamp(),
  };

  if (whItemInitStockW1) {
    const s = Number(whItemInitStockW1.value || 0);
    payload.stockW1 = Number.isFinite(s) && s >= 0 ? Math.trunc(s) : (itOld.stockW1 || 0);
  }

  try {
    await updateDoc(doc(db, "wh_items", id), payload);
    showToast("Master item diupdate", "success");
    resetMasterForm();

    await loadWhItems();
    fillMoveSelect(moveSearch?.value || "");
    renderOpnameTable();
    updateDashboard();
    updateMoveInfo();
  } catch (e) {
    console.error(e);
    showToast("Gagal update master item", "error");
  }
}

async function saveOrUpdateMasterItem() {
  if (editingMasterId) return await updateMasterItem(editingMasterId);
  return await createMasterItem();
}

// ===================== Transfer helpers =====================
function currentTransferItem() {
  const id = moveItemSelect?.value || "";
  return items.find((x) => x.id === id) || null;
}

function updateMoveInfo() {
  if (!moveInfo) return;
  const it = currentTransferItem();
  const qtyPack = Number(moveQty?.value || 0);

  if (!it) {
    moveInfo.textContent = "";
    return;
  }

  const packQty = Number(it.packQty || 0);
  const unitBig = it.unitBig || "dus";
  const unitSmall = it.unitSmall || "pcs";

  const pcs = qtyPack > 0 && packQty > 0 ? qtyPack * packQty : 0;
  moveInfo.textContent =
    packQty > 0
      ? `${qtyPack} ${unitBig} = ${pcs} ${unitSmall} (isi/${unitBig}: ${packQty}) | Stok W1: ${it.stockW1 || 0}`
      : `Isi/${unitBig}: ${packQty} ${unitSmall} | Stok W1: ${it.stockW1 || 0}`;
}

function fillMoveSelect(keyword = "") {
  if (!moveItemSelect) return;

  const kw = (keyword || "").trim().toLowerCase();
  moveItemSelect.innerHTML = `<option value="">Pilih item...</option>`;

  items.forEach((it) => {
    if (kw) {
      const s = (it.name || "").toLowerCase();
      if (!s.includes(kw)) return;
    }

    const s1 = Number(it.stockW1 || 0);
    const opt = document.createElement("option");
    opt.value = it.id;
    opt.textContent = `${it.name} (W1: ${s1})`;
    if (s1 <= 0) opt.disabled = true; // tetap terlihat
    moveItemSelect.appendChild(opt);
  });

  updateMoveInfo();
}

// ===================== Opname filters =====================
function applyExpiryFilter(list) {
  if (!whExpiryFilter) return list;
  return (list || []).filter((it) => getExpStatus(it.expDate || "") === whExpiryFilter);
}
function applyStockFilter(list) {
  if (!whStockFilter) return list;
  const { gudang, bucket } = whStockFilter;
  return (list || []).filter((it) => {
    const stock = gudang === "w1" ? Number(it.stockW1 || 0) : Number(it.stockW2 || 0);
    return stockBucketCount(stock) === bucket;
  });
}
function applyGudangVisibility(list, gudang) {
  if (gudang === "w2") return (list || []).filter((it) => Number(it.stockW2 || 0) > 0);
  return (list || []);
}

// ===================== Opname table =====================
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

  list = applyGudangVisibility(list, gudang);
  list = applyExpiryFilter(list);
  list = applyStockFilter(list);

  whOpnameTableBody.innerHTML = "";
  if (!list.length) {
    whOpnameTableBody.innerHTML = `<tr><td colspan="9">Belum ada item untuk ${gudang.toUpperCase()}.</td></tr>`;
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
    tr.dataset.itemId = it.id;

    tr.innerHTML = `
      <td>${escapeHtml(it.name || "-")}</td>
      <td>
        ${escapeHtml(unitText)}
        <div style="opacity:.75;font-size:12px;margin-top:4px;">Isi/dus: ${clampInt(it.packQty || 0, 0)}</div>
      </td>
      <td>
        ${escapeHtml(expStr)}
        <div style="margin-top:6px;">${expBadge}</div>
      </td>
      <td>${escapeHtml(it.info || "-")}</td>
      <td>${escapeHtml(it.receivedAt || "-")}</td>
      <td>${escapeHtml(it.supplier || "-")}</td>
      <td>${systemStock}</td>
      <td>
        <input type="number" min="0" step="1" data-opname-id="${it.id}" value="${systemStock}" style="min-width:110px;" />
      </td>
      <td style="text-align:right;">
        <div class="table-actions">
          <span data-ibtn="saveOpname">${iconBtn('<i class="lucide-save"></i>', "Simpan Opname")}</span>
          <span data-ibtn="edit">${iconBtn('<i class="lucide-pencil"></i>', "Edit (muncul di form master)")}</span>
          <span data-ibtn="delete">${iconBtn('<i class="lucide-trash-2"></i>', "Hapus Item", "danger")}</span>
        </div>
      </td>
    `;

    const bind = (key, fn) => {
      const el = tr.querySelector(`span[data-ibtn="${key}"] > button`);
      if (el) el.addEventListener("click", fn);
    };

    bind("saveOpname", async () => await saveOpname(it.id));
    bind("edit", () => {
      editingMasterId = it.id;
      fillMasterForm(it);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    bind("delete", async () => await deleteItem(it.id));

    whOpnameTableBody.appendChild(tr);
  });
}

async function saveOpname(itemId) {
  if (!currentUser) return showToast("Harus login", "error");

  const gudang = whOpnameGudang?.value || "w1";
  const inp = whOpnameTableBody?.querySelector(`input[data-opname-id="${itemId}"]`);
  if (!inp) return;

  const physical = Number(inp.value || 0);
  if (physical < 0) return showToast("Stok fisik tidak valid", "error");

  const it = items.find((x) => x.id === itemId);
  if (!it) return showToast("Item tidak ditemukan", "error");

  const systemStock = Number(gudang === "w1" ? it.stockW1 || 0 : it.stockW2 || 0);

  if (physical > systemStock) {
    return showToast(`Error: stok fisik (${physical}) > stok sistem (${systemStock}).`, "error", 3500);
  }

  const payload = { updatedAt: serverTimestamp() };
  if (gudang === "w1") payload.stockW1 = physical;
  else payload.stockW2 = physical;

  try {
    await updateDoc(doc(db, "wh_items", itemId), payload);
    showToast(`Opname tersimpan (${gudang.toUpperCase()})`, "success");

    await loadWhItems();
    fillMoveSelect(moveSearch?.value || "");
    renderOpnameTable();
    updateDashboard();
    updateMoveInfo();
  } catch (e) {
    console.error(e);
    showToast("Gagal simpan opname", "error");
  }
}

async function deleteItem(id) {
  if (!currentUser) return showToast("Harus login", "error");
  const it = items.find((x) => x.id === id);
  const ok = confirm(`Hapus ${it?.name || "item ini"}?`);
  if (!ok) return;

  try {
    await deleteDoc(doc(db, "wh_items", id));
    showToast("Item dihapus", "success");

    if (editingMasterId === id) resetMasterForm();

    await loadWhItems();
    fillMoveSelect(moveSearch?.value || "");
    renderOpnameTable();
    updateDashboard();
    updateMoveInfo();
  } catch (e) {
    console.error(e);
    showToast("Gagal hapus item", "error");
  }
}

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
    updateMoveInfo();

    await loadWhItems();
    fillMoveSelect(moveSearch?.value || "");
    renderOpnameTable();
    updateDashboard();
    updateMoveInfo();
  } catch (e) {
    console.error(e);
    showToast("Gagal transfer", "error");
  }
}

// ===================== Waste: form mode (Simpan/Update) =====================
function setWasteButtonModeUpdate(on) {
  if (!btnSaveWaste) return;
  btnSaveWaste.textContent = on ? "Update Waste" : "Simpan Waste";
}

function resetWasteForm() {
  if (wasteItemSelect) wasteItemSelect.value = "";
  if (wasteQty) wasteQty.value = "";
  if (wasteNote) wasteNote.value = "";
  if (wasteUnit) wasteUnit.value = "gram";

  const today = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const val = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  if (wasteDate) wasteDate.value = val;

  editingWasteFormId = null;
  setWasteButtonModeUpdate(false);
}

function fillWasteFormFromRow(w) {
  if (!w) return;
  if (wasteItemSelect) wasteItemSelect.value = w.itemName || "";
  if (wasteDate) wasteDate.value = w.dateKey || "";
  if (wasteUnit) wasteUnit.value = w.unit || "gram";
  if (wasteQty) wasteQty.value = String(clampInt(w.qty, 0));
  if (wasteNote) wasteNote.value = w.note || "";
  setWasteButtonModeUpdate(true);
}

async function createWaste() {
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
    resetWasteForm();

    await loadWasteLogs(getWasteFilterStart(), getWasteFilterEnd());
    renderWasteHistory();
  } catch (e) {
    console.error(e);
    showToast("Gagal simpan waste", "error");
  }
}

async function updateWaste(id) {
  if (!currentUser) return showToast("Harus login", "error");
  if (!id) return;

  const itemName = (wasteItemSelect?.value || "").trim();
  if (!itemName) return showToast("Pilih item waste dulu", "error");

  const d = wasteDate?.value || "";
  if (!d) return showToast("Tanggal waste wajib diisi", "error");

  const qty = Number(wasteQty?.value || 0);
  if (!qty || qty <= 0) return showToast("Qty waste harus > 0", "error");

  const unit = (wasteUnit?.value || "unit").trim();
  const note = (wasteNote?.value || "").trim();

  try {
    await updateDoc(doc(db, "wh_waste", id), {
      itemId: `preset:${itemName}`,
      itemName,
      dateKey: d,
      qty,
      unit,
      note,
      updatedAt: serverTimestamp(),
    });

    showToast("Waste berhasil diupdate", "success");
    resetWasteForm();

    await loadWasteLogs(getWasteFilterStart(), getWasteFilterEnd());
    renderWasteHistory();
  } catch (e) {
    console.error(e);
    showToast("Gagal update waste", "error");
  }
}

async function saveOrUpdateWaste() {
  if (editingWasteFormId) return await updateWaste(editingWasteFormId);
  return await createWaste();
}

// ===================== Waste list =====================
function ensureWasteDefaults() {
  const today = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const val = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  if (wasteDate && !wasteDate.value) wasteDate.value = val;
  if (wasteFilterStart && !wasteFilterStart.value) wasteFilterStart.value = val;
  if (wasteFilterEnd && !wasteFilterEnd.value) wasteFilterEnd.value = val;
}

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

function getWasteFilterStart() {
  return parseDateOnly(wasteFilterStart?.value || "") || null;
}
function getWasteFilterEnd() {
  return parseDateOnly(wasteFilterEnd?.value || "") || null;
}

function sortWasteList(list) {
  const by = wasteSortByState;
  const dir = wasteSortDirState;

  const sorted = [...list].sort((a, b) => {
    const av = (a?.[by] ?? "").toString().toLowerCase();
    const bv = (b?.[by] ?? "").toString().toLowerCase();
    if (av < bv) return -1;
    if (av > bv) return 1;
    return 0;
  });

  return dir === "asc" ? sorted : sorted.reverse();
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

  list = sortWasteList(list);
  wasteHistoryBody.innerHTML = "";

  if (!list.length) {
    wasteHistoryBody.innerHTML = `<tr><td colspan="7">Belum ada data waste.</td></tr>`;
    return;
  }

  list.forEach((w) => {
    const tr = document.createElement("tr");
    tr.dataset.wasteId = w.id;

    tr.innerHTML = `
      <td>${escapeHtml(w.dateKey || "-")}</td>
      <td>${escapeHtml(w.itemName || "-")}</td>
      <td>${clampInt(w.qty, 0)}</td>
      <td>${escapeHtml(w.unit || "-")}</td>
      <td>${escapeHtml(w.note || "-")}</td>
      <td>${escapeHtml(w.createdBy || "-")}</td>
      <td style="text-align:right;">
        <div class="table-actions">
          <span data-wbtn="edit">${iconBtn('<i class="lucide-pencil"></i>', "Edit (muncul di form waste)")}</span>
          <span data-wbtn="delete">${iconBtn('<i class="lucide-trash-2"></i>', "Hapus", "danger")}</span>
        </div>
      </td>
    `;

    const bind = (key, fn) => {
      const el = tr.querySelector(`span[data-wbtn="${key}"] > button`);
      if (el) el.addEventListener("click", fn);
    };

    bind("edit", () => {
      editingWasteFormId = w.id;
      fillWasteFormFromRow(w);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    bind("delete", async () => await deleteWaste(w.id));

    wasteHistoryBody.appendChild(tr);
  });
}

async function deleteWaste(id) {
  if (!currentUser) return showToast("Harus login", "error");
  const ok = confirm("Hapus data waste ini?");
  if (!ok) return;

  try {
    await deleteDoc(doc(db, "wh_waste", id));
    showToast("Waste dihapus", "success");

    if (editingWasteFormId === id) resetWasteForm();

    await loadWasteLogs(getWasteFilterStart(), getWasteFilterEnd());
    renderWasteHistory();
  } catch (e) {
    console.error(e);
    showToast("Gagal hapus waste", "error");
  }
}

// ===================== REPORT (Generate + CSV Download) =====================
let reportLast = null; // simpan data report terakhir untuk tombol Download CSV

function ensureDownloadReportButton() {
  if (!whReportSection) return null;

  let btn = $("btnWhReportDownload");
  if (btn) return btn;

  // cari container card yang sama dengan tombol generate, kalau nggak ketemu: taruh di section
  const anchor = btnWhReport?.parentElement || whReportSection;

  btn = document.createElement("button");
  btn.id = "btnWhReportDownload";
  btn.type = "button";
  btn.className = "btn-outline";
  btn.textContent = "Download CSV";
  btn.style.marginTop = "10px";
  btn.disabled = true;

  anchor.appendChild(btn);

  btn.addEventListener("click", () => {
    if (!reportLast) return showToast("Belum ada laporan. Klik Generate dulu.", "error");
    const { type, start, end, note, headers, rows } = reportLast;

    const meta = [
      ["Report Type", type],
      ["Start Date", start || "-"],
      ["End Date", end || "-"],
      ["Note", note || "-"],
      ["Generated At", new Date().toISOString()],
    ];

    const csv = buildCsv(meta, headers, rows);
    const safeStart = (start || "all").replaceAll(":", "-");
    const safeEnd = (end || "all").replaceAll(":", "-");
    const filename = `warehouse_report_${type}_${safeStart}_${safeEnd}.csv`;
    downloadTextFile(filename, csv);
  });

  return btn;
}

function renderReportTable(headers, rows) {
  if (!whReportHead || !whReportBody) return;

  whReportHead.innerHTML = `<tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr>`;
  whReportBody.innerHTML = "";

  if (!rows.length) {
    whReportBody.innerHTML = `<tr><td colspan="${headers.length}">Tidak ada data.</td></tr>`;
    return;
  }

  rows.forEach((r) => {
    const tr = document.createElement("tr");
    tr.innerHTML = r.map((c) => `<td>${escapeHtml(c ?? "")}</td>`).join("");
    whReportBody.appendChild(tr);
  });
}

async function generateWarehouseReport() {
  if (!currentUser) return showToast("Harus login", "error");

  const type = whReportType?.value || "opname_w1";
  const start = whReportStart?.value || "";
  const end = whReportEnd?.value || "";
  const note = (whReportNote?.value || "").trim();

  const btnDownload = ensureDownloadReportButton();
  if (btnDownload) btnDownload.disabled = true;

  try {
    if (type === "waste") {
      // waste berdasarkan dateKey
      await loadWasteLogs(parseDateOnly(start), parseDateOnly(end));
      const list = (wasteLogs || []).filter((w) => dateInRange(w.dateKey || "", start, end));

      const headers = ["Tanggal", "Item", "Qty", "Satuan", "Catatan", "User"];
      const rows = list.map((w) => [
        w.dateKey || "-",
        w.itemName || "-",
        String(clampInt(w.qty, 0)),
        w.unit || "-",
        w.note || "-",
        w.createdBy || "-",
      ]);

      renderReportTable(headers, rows);
      reportLast = { type, start, end, note, headers, rows };
      if (btnDownload) btnDownload.disabled = false;
      showToast("Laporan waste berhasil dibuat", "success");
      return;
    }

    // opname snapshot (filter optional berdasarkan receivedAt kalau kamu isi)
    await loadWhItems();

    const gudang = type === "opname_w2" ? "w2" : "w1";

    let list = [...items];

    // kalau W2: sesuai rule kamu, hanya yang stockW2 > 0
    if (gudang === "w2") list = list.filter((it) => Number(it.stockW2 || 0) > 0);

    // filter tanggal terima optional (receivedAt format YYYY-MM-DD)
    if (start || end) {
      list = list.filter((it) => dateInRange(it.receivedAt || "", start, end));
    }

    const headers = [
      "Nama Item",
      "Gudang",
      "Stok (Dus)",
      "Unit Besar",
      "Isi / Dus",
      "Unit Isi",
      "Total (PCS)",
      "EXP",
      "Terima",
      "Supplier",
      "Info",
    ];

    const rows = list.map((it) => {
      const stockDus = Number(gudang === "w1" ? it.stockW1 || 0 : it.stockW2 || 0);
      const packQty = Number(it.packQty || 0);
      const totalPcs = stockDus > 0 && packQty > 0 ? stockDus * packQty : 0;

      return [
        it.name || "-",
        gudang.toUpperCase(),
        String(stockDus),
        it.unitBig || "-",
        String(clampInt(packQty, 0)),
        it.unitSmall || "-",
        String(clampInt(totalPcs, 0)),
        it.expDate || "-",
        it.receivedAt || "-",
        it.supplier || "-",
        it.info || "-",
      ];
    });

    renderReportTable(headers, rows);
    reportLast = { type, start, end, note, headers, rows };
    if (btnDownload) btnDownload.disabled = false;

    showToast("Laporan opname berhasil dibuat", "success");
  } catch (e) {
    console.error(e);
    showToast("Gagal generate laporan", "error");
  }
}

// ===================== Events =====================
btnSaveItem?.addEventListener("click", saveOrUpdateMasterItem);

btnMove?.addEventListener("click", transferW1toW2);
moveSearch?.addEventListener("input", () => fillMoveSelect(moveSearch.value || ""));
moveItemSelect?.addEventListener("change", updateMoveInfo);
moveQty?.addEventListener("input", updateMoveInfo);

whOpnameGudang?.addEventListener("change", () => {
  if (whStockFilter && whStockFilter.gudang !== (whOpnameGudang.value || "w1")) whStockFilter = null;
  renderOpnameTable();
});
whOpnameSearch?.addEventListener("input", renderOpnameTable);

// ✅ Waste button pakai saveOrUpdateWaste
btnSaveWaste?.addEventListener("click", saveOrUpdateWaste);

wasteFilterStart?.addEventListener("change", async () => {
  await loadWasteLogs(getWasteFilterStart(), getWasteFilterEnd());
  renderWasteHistory();
});
wasteFilterEnd?.addEventListener("change", async () => {
  await loadWasteLogs(getWasteFilterStart(), getWasteFilterEnd());
  renderWasteHistory();
});
wasteHistorySearch?.addEventListener("input", renderWasteHistory);

wasteSortBy?.addEventListener("change", () => {
  wasteSortByState = wasteSortBy.value || "dateKey";
  renderWasteHistory();
});
wasteSortDirBtn?.addEventListener("click", () => {
  wasteSortDirState = wasteSortDirState === "asc" ? "desc" : "asc";
  wasteSortDirBtn.textContent = wasteSortDirState.toUpperCase();
  renderWasteHistory();
});

// ✅ Report
btnWhReport?.addEventListener("click", generateWarehouseReport);

// ===================== Boot =====================
async function bootWarehouse() {
  ensureWasteDefaults();
  fillWasteSelectPreset();
  fillWasteUnitOptions();
  setWasteButtonModeUpdate(false);

  ensureDownloadReportButton(); // tombol download siap, masih disabled sampai generate

  if (wasteSortBy) wasteSortBy.value = wasteSortByState;
  if (wasteSortDirBtn) wasteSortDirBtn.textContent = wasteSortDirState.toUpperCase();

  await loadWhItems();
  fillMoveSelect(moveSearch?.value || "");

  renderOpnameTable();

  await loadWasteLogs(getWasteFilterStart(), getWasteFilterEnd());
  renderWasteHistory();

  bindStockCardClicks();
  updateDashboard();
  updateMoveInfo();
}

onAuthStateChanged(auth, async (u) => {
  currentUser = u || null;
  if (!currentUser) return;

  try {
    await bootWarehouse();
  } catch (e) {
    console.error(e);
    showToast("Warehouse gagal init", "error");
  }
});