// warehouse.js — Realtime Warehouse (Gudang 1 & 2) + Waste + Report
// Cocok dengan HTML yang punya section: whDashboardSection, whOpnameSection, whWasteSection, whReportSection
// ID DOM semua pakai prefix "wh..."

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  addDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

/* ================= FIREBASE CONFIG (SAMA DENGAN script.js) ================= */
const firebaseConfig = {
  apiKey: "AIzaSyAu5VsFBmcOLZtUbNMjdue2vQeMhWVIRqk",
  authDomain: "app-387dc.firebaseapp.com",
  projectId: "app-387dc",
  storageBucket: "app-387dc.firebasestorage.app",
  messagingSenderId: "227151496412",
  appId: "1:227151496412:web:ac35b7ecd7f39905cba019",
  measurementId: "G-9E282TKXSJ",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
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

function parseDateInput(value, isEnd = false) {
  if (!value) return null;
  return new Date(value + (isEnd ? "T23:59:59" : "T00:00:00"));
}

function safeStr(v) {
  return (v ?? "").toString();
}

function normalize(s) {
  return safeStr(s).trim().toLowerCase();
}

/* ================= COLLECTIONS (BARU, TERPISAH DARI FITUR LAMA) ================= */
const colItems = collection(db, "wh_items"); // master item
const colStocks = collection(db, "wh_stocks"); // stok per gudang
const colOpnameLogs = collection(db, "wh_opname_logs"); // log opname
const colTransfers = collection(db, "wh_transfers"); // log transfer
const colWaste = collection(db, "wh_waste"); // log waste

/* ================= DOM — NAV BARU ================= */
const navWhDashboard = $("navWhDashboard");
const navWhOpname = $("navWhOpname");
const navWhWaste = $("navWhWaste");
const navWhReport = $("navWhReport");

const whDashboardSection = $("whDashboardSection");
const whOpnameSection = $("whOpnameSection");
const whWasteSection = $("whWasteSection");
const whReportSection = $("whReportSection");

/* ================= DOM — DASHBOARD METRICS ================= */
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

/* ================= DOM — MASTER ITEM + OPNAME ================= */
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

/* ================= DOM — TRANSFER ================= */
const moveItemSelect = $("moveItemSelect");
const moveQty = $("moveQty");
const btnMove = $("btnMove");

/* ================= DOM — WASTE ================= */
const wasteGudang = $("wasteGudang");
const wasteItemSelect = $("wasteItemSelect");
const wasteDate = $("wasteDate");
const wasteGram = $("wasteGram");
const wasteMl = $("wasteMl");
const wasteNote = $("wasteNote");
const btnSaveWaste = $("btnSaveWaste");

/* ================= DOM — REPORT ================= */
const whReportType = $("whReportType");
const whReportStart = $("whReportStart");
const whReportEnd = $("whReportEnd");
const btnWhReport = $("btnWhReport");
const whReportHead = $("whReportHead");
const whReportBody = $("whReportBody");

/* ================= STATE (REALTIME CACHES) ================= */
let currentUser = null;

let itemsCache = []; // [{id, name, unit, expDate, info, receivedAt, supplier, ...}]
let stocksCache = []; // [{id, warehouse, itemId, qty, updatedAt...}]
let stockMap = new Map(); // key: `${warehouse}_${itemId}` -> qty

let unsubscribeItems = null;
let unsubscribeStocks = null;

let opnameWarehouseFilter = "w1";
let opnameStatusFilter = null; // "habis" | "lumayan" | "banyak" | null

/* ================= SECTION SWITCHER (KHUSUS WAREHOUSE) ================= */
function setActiveWhNav(btn) {
  [navWhDashboard, navWhOpname, navWhWaste, navWhReport].forEach((b) => {
    if (!b) return;
    b.classList.remove("active");
  });
  if (btn) btn.classList.add("active");
}

function showWhSection(name) {
  [whDashboardSection, whOpnameSection, whWasteSection, whReportSection].forEach((sec) => {
    if (sec) sec.classList.add("hidden");
  });

  if (name === "dashboard" && whDashboardSection) whDashboardSection.classList.remove("hidden");
  if (name === "opname" && whOpnameSection) whOpnameSection.classList.remove("hidden");
  if (name === "waste" && whWasteSection) whWasteSection.classList.remove("hidden");
  if (name === "report" && whReportSection) whReportSection.classList.remove("hidden");
}

/* ================= STOCK HELPERS ================= */
function getQty(warehouse, itemId) {
  const key = `${warehouse}_${itemId}`;
  return Number(stockMap.get(key) || 0);
}

function classifyQty(qty) {
  const n = Number(qty || 0);
  if (n <= 0) return "habis";        // 0
  if (n < 10) return "lumayan";      // < 10
  if (n > 50) return "banyak";       // > 50
  return "normal";
}

function labelClass(status) {
  if (status === "habis") return { text: "Habis", cls: "red" };
  if (status === "lumayan") return { text: "Lumayan Banyak", cls: "yellow" };
  if (status === "banyak") return { text: "Banyak", cls: "green" };
  return { text: "Normal", cls: "" };
}

/* ================= REALTIME LISTENERS ================= */
function startRealtime() {
  stopRealtime();

  // Items
  unsubscribeItems = onSnapshot(query(colItems, orderBy("name", "asc")), (snap) => {
    itemsCache = [];
    snap.forEach((d) => itemsCache.push({ id: d.id, ...d.data() }));
    renderOpnameTable();
    refreshSelectOptions();
    updateDashboardMetrics();
  });

  // Stocks
  unsubscribeStocks = onSnapshot(query(colStocks, orderBy("warehouse", "asc")), (snap) => {
    stocksCache = [];
    stockMap = new Map();
    snap.forEach((d) => {
      const data = { id: d.id, ...d.data() };
      stocksCache.push(data);
      if (data.warehouse && data.itemId != null) {
        stockMap.set(`${data.warehouse}_${data.itemId}`, Number(data.qty || 0));
      }
    });
    renderOpnameTable();
    updateDashboardMetrics();
  });
}

function stopRealtime() {
  if (typeof unsubscribeItems === "function") unsubscribeItems();
  if (typeof unsubscribeStocks === "function") unsubscribeStocks();
  unsubscribeItems = null;
  unsubscribeStocks = null;
}

/* ================= DASHBOARD METRICS ================= */
function updateDashboardMetrics() {
  const calc = (warehouse) => {
    let habis = 0, lumayan = 0, banyak = 0;
    itemsCache.forEach((it) => {
      const q = getQty(warehouse, it.id);
      const st = classifyQty(q);
      if (st === "habis") habis++;
      else if (st === "lumayan") lumayan++;
      else if (st === "banyak") banyak++;
    });
    return { habis, lumayan, banyak };
  };

  const w1 = calc("w1");
  const w2 = calc("w2");

  if (w1Habis) w1Habis.textContent = w1.habis;
  if (w1Lumayan) w1Lumayan.textContent = w1.lumayan;
  if (w1Banyak) w1Banyak.textContent = w1.banyak;

  if (w2Habis) w2Habis.textContent = w2.habis;
  if (w2Lumayan) w2Lumayan.textContent = w2.lumayan;
  if (w2Banyak) w2Banyak.textContent = w2.banyak;
}

function initDashboardCardClicks() {
  const go = (warehouse, status) => {
    opnameWarehouseFilter = warehouse;
    opnameStatusFilter = status;
    if (whOpnameGudang) whOpnameGudang.value = warehouse;
    if (whOpnameSearch) whOpnameSearch.value = "";
    setActiveWhNav(navWhOpname);
    showWhSection("opname");
    renderOpnameTable();
    if (whOpnameSection) whOpnameSection.scrollIntoView({ behavior: "smooth" });
  };

  if (cardW1Habis) cardW1Habis.addEventListener("click", () => go("w1", "habis"));
  if (cardW1Lumayan) cardW1Lumayan.addEventListener("click", () => go("w1", "lumayan"));
  if (cardW1Banyak) cardW1Banyak.addEventListener("click", () => go("w1", "banyak"));

  if (cardW2Habis) cardW2Habis.addEventListener("click", () => go("w2", "habis"));
  if (cardW2Lumayan) cardW2Lumayan.addEventListener("click", () => go("w2", "lumayan"));
  if (cardW2Banyak) cardW2Banyak.addEventListener("click", () => go("w2", "banyak"));
}

/* ================= SELECT OPTIONS (TRANSFER + WASTE) ================= */
function refreshSelectOptions() {
  const makeOptions = () => {
    const opts = itemsCache.map((it) => {
      const name = it.name || "(Tanpa Nama)";
      const unit = it.unit ? ` (${it.unit})` : "";
      return `<option value="${it.id}">${name}${unit}</option>`;
    }).join("");

    if (moveItemSelect) moveItemSelect.innerHTML = `<option value="">Pilih item...</option>${opts}`;
    if (wasteItemSelect) wasteItemSelect.innerHTML = `<option value="">Pilih item...</option>${opts}`;
  };

  makeOptions();
}

/* ================= MASTER ITEM SAVE ================= */
async function saveItem() {
  const name = safeStr(whItemName?.value).trim();
  const unit = safeStr(whItemUnit?.value).trim();
  const expDate = safeStr(whItemExp?.value).trim(); // yyyy-mm-dd
  const info = safeStr(whItemInfo?.value).trim();
  const receivedAt = safeStr(whItemReceivedAt?.value).trim();
  const supplier = safeStr(whItemSupplier?.value).trim();

  if (!name) return showToast("Nama item wajib diisi", "error");
  if (!unit) return showToast("Satuan wajib diisi (misal: dus)", "error");

  try {
    await addDoc(colItems, {
      name,
      unit,
      expDate: expDate || "",
      info,
      receivedAt: receivedAt || "",
      supplier,
      createdAt: serverTimestamp(),
      createdBy: currentUser?.email || "-",
    });

    showToast("Item tersimpan", "success");
    if (whItemName) whItemName.value = "";
    if (whItemUnit) whItemUnit.value = "";
    if (whItemExp) whItemExp.value = "";
    if (whItemInfo) whItemInfo.value = "";
    if (whItemReceivedAt) whItemReceivedAt.value = "";
    if (whItemSupplier) whItemSupplier.value = "";
  } catch (e) {
    console.error(e);
    showToast("Gagal menyimpan item", "error");
  }
}

/* ================= OPNAME TABLE ================= */
function renderOpnameTable() {
  if (!whOpnameTableBody) return;

  const warehouse = whOpnameGudang?.value || opnameWarehouseFilter || "w1";
  opnameWarehouseFilter = warehouse;

  const q = normalize(whOpnameSearch?.value);

  let list = [...itemsCache];

  // search
  if (q) {
    list = list.filter((it) => {
      const hay = [
        it.name,
        it.unit,
        it.expDate,
        it.info,
        it.receivedAt,
        it.supplier,
      ].map(normalize).join(" | ");
      return hay.includes(q);
    });
  }

  // status filter from dashboard clicks
  if (opnameStatusFilter) {
    list = list.filter((it) => classifyQty(getQty(warehouse, it.id)) === opnameStatusFilter);
  }

  whOpnameTableBody.innerHTML = "";

  if (!list.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="9">Tidak ada item yang cocok.</td>`;
    whOpnameTableBody.appendChild(tr);
    return;
  }

  list.forEach((it) => {
    const systemQty = getQty(warehouse, it.id);
    const st = classifyQty(systemQty);
    const stBadge = labelClass(st);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${it.name || "-"}</td>
      <td>${it.unit || "-"}</td>
      <td>${it.expDate || "-"}</td>
      <td>${it.info ? `<span title="${it.info.replace(/"/g, "&quot;")}">${it.info}</span>` : "-"}</td>
      <td>${it.receivedAt || "-"}</td>
      <td>${it.supplier || "-"}</td>
      <td>${Number(systemQty).toLocaleString("id-ID")}</td>
      <td>
        <input type="number" min="0" step="1"
          data-item="${it.id}"
          data-warehouse="${warehouse}"
          value="${Number(systemQty)}"
          style="width:110px;"
        />
      </td>
      <td>
        <button class="btn-table btn-table-delete small"
          data-save="1"
          data-item="${it.id}"
          data-warehouse="${warehouse}"
        >Simpan</button>
        <div style="margin-top:6px;">
          <span class="status-badge ${stBadge.cls}">${stBadge.text}</span>
        </div>
      </td>
    `;
    whOpnameTableBody.appendChild(tr);
  });

  // attach save handlers
  whOpnameTableBody.querySelectorAll("button[data-save='1']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const itemId = btn.getAttribute("data-item");
      const warehouse = btn.getAttribute("data-warehouse");
      await saveOpnameRow(warehouse, itemId);
    });
  });
}

async function ensureStockDoc(warehouse, itemId) {
  const id = `${warehouse}_${itemId}`;
  const ref = doc(db, "wh_stocks", id);
  const snap = await getDoc(ref);
  if (snap.exists()) return ref;

  // create with 0
  await setDoc(ref, {
    warehouse,
    itemId,
    qty: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref;
}

async function saveOpnameRow(warehouse, itemId) {
  try {
    const inp = whOpnameTableBody?.querySelector(
      `input[data-item="${itemId}"][data-warehouse="${warehouse}"]`
    );
    if (!inp) return;

    const physical = Number(inp.value || 0);
    const system = Number(getQty(warehouse, itemId) || 0);
    const diff = physical - system;

    const item = itemsCache.find((x) => x.id === itemId);

    // update stock
    const stockRef = await ensureStockDoc(warehouse, itemId);
    await setDoc(
      stockRef,
      {
        warehouse,
        itemId,
        qty: physical,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    // log opname
    await addDoc(colOpnameLogs, {
      warehouse,
      itemId,
      itemName: item?.name || "-",
      unit: item?.unit || "",
      systemQty: system,
      physicalQty: physical,
      diff,
      dateKey: todayKey(new Date()),
      createdAt: serverTimestamp(),
      createdAtLocal: new Date().toISOString(),
      createdBy: currentUser?.email || "-",
    });

    showToast(`Opname tersimpan (${warehouse === "w1" ? "Gudang 1" : "Gudang 2"})`, "success");
  } catch (e) {
    console.error(e);
    showToast("Gagal menyimpan opname", "error");
  }
}

/* ================= TRANSFER (W1 -> W2) ================= */
async function doTransfer() {
  const itemId = safeStr(moveItemSelect?.value);
  const qty = Number(moveQty?.value || 0);

  if (!itemId) return showToast("Pilih item transfer dulu", "error");
  if (!qty || qty <= 0) return showToast("Qty transfer harus > 0", "error");

  try {
    const w1 = getQty("w1", itemId);
    if (qty > w1) return showToast(`Stok Gudang 1 tidak cukup (sisa ${w1})`, "error");

    const w2 = getQty("w2", itemId);

    const refW1 = await ensureStockDoc("w1", itemId);
    const refW2 = await ensureStockDoc("w2", itemId);

    await setDoc(refW1, { qty: w1 - qty, updatedAt: serverTimestamp() }, { merge: true });
    await setDoc(refW2, { qty: w2 + qty, updatedAt: serverTimestamp() }, { merge: true });

    const item = itemsCache.find((x) => x.id === itemId);

    await addDoc(colTransfers, {
      itemId,
      itemName: item?.name || "-",
      qty,
      from: "w1",
      to: "w2",
      createdAt: serverTimestamp(),
      createdAtLocal: new Date().toISOString(),
      createdBy: currentUser?.email || "-",
    });

    showToast("Transfer berhasil (W1 → W2)", "success");
    if (moveQty) moveQty.value = "";
  } catch (e) {
    console.error(e);
    showToast("Gagal transfer", "error");
  }
}

/* ================= WASTE ================= */
async function saveWaste() {
  const warehouse = wasteGudang?.value || "w1";
  const itemId = safeStr(wasteItemSelect?.value);
  const date = safeStr(wasteDate?.value);
  const gram = Number(wasteGram?.value || 0);
  const ml = Number(wasteMl?.value || 0);
  const note = safeStr(wasteNote?.value).trim();

  if (!itemId) return showToast("Pilih item waste dulu", "error");
  if (!date) return showToast("Tanggal waste wajib diisi", "error");
  if ((!gram || gram <= 0) && (!ml || ml <= 0)) {
    return showToast("Isi minimal Gram atau ML", "error");
  }

  try {
    const item = itemsCache.find((x) => x.id === itemId);

    await addDoc(colWaste, {
      warehouse,
      itemId,
      itemName: item?.name || "-",
      unit: item?.unit || "",
      wasteDate: date,
      gram: gram || 0,
      ml: ml || 0,
      note,
      dateKey: date,
      createdAt: serverTimestamp(),
      createdAtLocal: new Date().toISOString(),
      createdBy: currentUser?.email || "-",
    });

    showToast("Waste tersimpan", "success");
    if (wasteGram) wasteGram.value = "";
    if (wasteMl) wasteMl.value = "";
    if (wasteNote) wasteNote.value = "";
  } catch (e) {
    console.error(e);
    showToast("Gagal menyimpan waste", "error");
  }
}

/* ================= REPORTS (OPNAME/WASTE FILTER DATE) ================= */
function renderReportHeader(kind) {
  if (!whReportHead) return;
  whReportHead.innerHTML = "";

  const tr = document.createElement("tr");

  if (kind.startsWith("opname_")) {
    tr.innerHTML = `
      <th>Tanggal & Waktu</th>
      <th>Item</th>
      <th>Gudang</th>
      <th>Stok Sistem</th>
      <th>Stok Fisik</th>
      <th>Selisih</th>
      <th>User</th>
    `;
  } else {
    tr.innerHTML = `
      <th>Tanggal Waste</th>
      <th>Item</th>
      <th>Gudang</th>
      <th>Gram</th>
      <th>ML</th>
      <th>Catatan</th>
      <th>User</th>
    `;
  }

  whReportHead.appendChild(tr);
}

async function generateReport() {
  if (!whReportType || !whReportStart || !whReportEnd) return;

  const type = whReportType.value || "opname_w1";
  const start = parseDateInput(whReportStart.value, false);
  const end = parseDateInput(whReportEnd.value, true);

  if (!start || !end || isNaN(start) || isNaN(end)) {
    return showToast("Tanggal mulai & sampai wajib diisi", "error");
  }
  if (end < start) return showToast("Tanggal akhir tidak boleh sebelum tanggal awal", "error");

  renderReportHeader(type);
  if (!whReportBody) return;
  whReportBody.innerHTML = `<tr><td colspan="7">Memuat...</td></tr>`;

  const startTs = Timestamp.fromDate(start);
  const endTs = Timestamp.fromDate(end);

  try {
    if (type.startsWith("opname_")) {
      const warehouse = type.endsWith("_w1") ? "w1" : "w2";
      const q = query(
        colOpnameLogs,
        where("warehouse", "==", warehouse),
        where("createdAt", ">=", startTs),
        where("createdAt", "<=", endTs),
        orderBy("createdAt", "desc")
      );

      const snap = await getDocs(q);

      const rows = [];
      snap.forEach((d) => {
        const data = d.data();
        const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAtLocal || Date.now());
        rows.push({
          when: formatDateTime(createdAt),
          item: data.itemName || "-",
          wh: data.warehouse === "w1" ? "Gudang 1" : "Gudang 2",
          system: Number(data.systemQty || 0),
          physical: Number(data.physicalQty || 0),
          diff: Number(data.diff || 0),
          user: data.createdBy || "-",
        });
      });

      whReportBody.innerHTML = "";
      if (!rows.length) {
        whReportBody.innerHTML = `<tr><td colspan="7">Tidak ada data untuk periode ini.</td></tr>`;
        return;
      }

      rows.forEach((r) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${r.when}</td>
          <td>${r.item}</td>
          <td>${r.wh}</td>
          <td>${r.system.toLocaleString("id-ID")}</td>
          <td>${r.physical.toLocaleString("id-ID")}</td>
          <td>${r.diff}</td>
          <td>${r.user}</td>
        `;
        whReportBody.appendChild(tr);
      });

      showToast("Laporan opname diperbarui", "success");
    } else {
      const warehouse = type.endsWith("_w1") ? "w1" : "w2";
      const q = query(
        colWaste,
        where("warehouse", "==", warehouse),
        where("createdAt", ">=", startTs),
        where("createdAt", "<=", endTs),
        orderBy("createdAt", "desc")
      );

      const snap = await getDocs(q);

      const rows = [];
      snap.forEach((d) => {
        const data = d.data();
        rows.push({
          date: data.wasteDate || data.dateKey || "-",
          item: data.itemName || "-",
          wh: data.warehouse === "w1" ? "Gudang 1" : "Gudang 2",
          gram: Number(data.gram || 0),
          ml: Number(data.ml || 0),
          note: data.note || "-",
          user: data.createdBy || "-",
        });
      });

      whReportBody.innerHTML = "";
      if (!rows.length) {
        whReportBody.innerHTML = `<tr><td colspan="7">Tidak ada data untuk periode ini.</td></tr>`;
        return;
      }

      rows.forEach((r) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${r.date}</td>
          <td>${r.item}</td>
          <td>${r.wh}</td>
          <td>${r.gram.toLocaleString("id-ID")}</td>
          <td>${r.ml.toLocaleString("id-ID")}</td>
          <td>${r.note}</td>
          <td>${r.user}</td>
        `;
        whReportBody.appendChild(tr);
      });

      showToast("Laporan waste diperbarui", "success");
    }
  } catch (e) {
    console.error(e);
    whReportBody.innerHTML = `<tr><td colspan="7">Gagal memuat laporan (cek index Firestore jika diminta).</td></tr>`;
    showToast("Gagal generate laporan", "error");
  }
}

/* ================= DEFAULT DATES FOR WASTE/REPORT ================= */
function initDefaultDates() {
  const today = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const yyyyMMdd = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  if (wasteDate && !wasteDate.value) wasteDate.value = yyyyMMdd;
  if (whReportStart && !whReportStart.value) whReportStart.value = yyyyMMdd;
  if (whReportEnd && !whReportEnd.value) whReportEnd.value = yyyyMMdd;
}

/* ================= EVENTS ================= */
function bindEvents() {
  // NAV
  if (navWhDashboard) navWhDashboard.addEventListener("click", () => {
    setActiveWhNav(navWhDashboard);
    showWhSection("dashboard");
  });
  if (navWhOpname) navWhOpname.addEventListener("click", () => {
    opnameStatusFilter = null;
    setActiveWhNav(navWhOpname);
    showWhSection("opname");
    renderOpnameTable();
  });
  if (navWhWaste) navWhWaste.addEventListener("click", () => {
    setActiveWhNav(navWhWaste);
    showWhSection("waste");
  });
  if (navWhReport) navWhReport.addEventListener("click", () => {
    setActiveWhNav(navWhReport);
    showWhSection("report");
  });

  // DASHBOARD clicks
  initDashboardCardClicks();

  // MASTER ITEM
  if (btnSaveItem) btnSaveItem.addEventListener("click", saveItem);

  // OPNAME filters
  if (whOpnameGudang) whOpnameGudang.addEventListener("change", () => {
    opnameWarehouseFilter = whOpnameGudang.value;
    renderOpnameTable();
  });

  if (whOpnameSearch) whOpnameSearch.addEventListener("input", () => {
    renderOpnameTable();
  });

  // TRANSFER
  if (btnMove) btnMove.addEventListener("click", doTransfer);

  // WASTE
  if (btnSaveWaste) btnSaveWaste.addEventListener("click", saveWaste);

  // REPORT
  if (btnWhReport) btnWhReport.addEventListener("click", generateReport);
}

/* ================= AUTH & BOOT ================= */
function boot() {
  bindEvents();
  initDefaultDates();

  // Default: buka Dashboard Warehouse
  setActiveWhNav(navWhDashboard);
  showWhSection("dashboard");

  onAuthStateChanged(auth, (user) => {
    currentUser = user || null;

    if (!currentUser) {
      stopRealtime();
      // biarkan auth UI lama yang handle, kita cuma stop realtime
      return;
    }

    startRealtime();
  });
}

boot();