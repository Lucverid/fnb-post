// warehouse.js — Warehouse realtime + konversi Dus -> (PCS/BAREL) + harga supplier per dus
// Cocok dengan HTML kamu. Tidak perlu ubah HTML (field baru di-inject via JS).

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
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
  orderBy,
  serverTimestamp,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

/* ================= FIREBASE CONFIG ================= */
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

function formatDateShort(isoOrDate) {
  try {
    const d = isoOrDate instanceof Date ? isoOrDate : new Date(String(isoOrDate) + "T00:00:00");
    if (isNaN(d)) return "-";
    return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
  } catch {
    return "-";
  }
}

function daysDiff(a, b) {
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function cleanNumber(v) {
  const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
  return isNaN(n) ? 0 : n;
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
const whItemUnit = $("whItemUnit"); // akan kita auto-set "dus" (pack unit), tetap dipakai
const whItemExp = $("whItemExp");
const whItemInfo = $("whItemInfo");
const whItemReceivedAt = $("whItemReceivedAt");
const whItemSupplier = $("whItemSupplier");
const btnSaveItem = $("btnSaveItem");

const whOpnameGudang = $("whOpnameGudang");
const whOpnameSearch = $("whOpnameSearch");
const whOpnameTableBody = $("whOpnameTableBody");

const moveItemSelect = $("moveItemSelect");
const moveQty = $("moveQty"); // qty transfer dalam DUS
const btnMove = $("btnMove");

/* ================= DOM (WASTE) ================= */
const wasteGudang = $("wasteGudang");
const wasteItemSelect = $("wasteItemSelect");
const wasteDate = $("wasteDate");
const wasteGram = $("wasteGram");
const wasteMl = $("wasteMl");
const wasteNote = $("wasteNote");
const btnSaveWaste = $("btnSaveWaste");

/* ================= DOM (REPORT) ================= */
const whReportType = $("whReportType");
const whReportStart = $("whReportStart");
const whReportEnd = $("whReportEnd");
const btnWhReport = $("btnWhReport");
const whReportHead = $("whReportHead");
const whReportBody = $("whReportBody");

/* ================= COLLECTIONS ================= */
const colItems = collection(db, "warehouse_items");
const colStock = collection(db, "warehouse_stock");
const colOpnameLogs = collection(db, "warehouse_opname_logs");
const colMoves = collection(db, "warehouse_moves");
const colWaste = collection(db, "warehouse_waste");

/* ================= STATE ================= */
let currentUser = null;
let itemsCache = []; // master item
let stockCache = []; // stok per gudang (disimpan dalam base unit)
let unsubscribeItems = null;
let unsubscribeStock = null;

/* ================= UI HELPERS ================= */
function hideAllWarehouseSections() {
  [whDashboardSection, whOpnameSection, whWasteSection, whReportSection].forEach((s) => {
    if (s) s.classList.add("hidden");
  });
}

function setActiveNav(btn) {
  [navWhDashboard, navWhOpname, navWhWaste, navWhReport].forEach((b) => b?.classList.remove("active"));
  btn?.classList.add("active");
}

function showWarehouseSection(which) {
  hideAllWarehouseSections();
  if (which === "dashboard") whDashboardSection?.classList.remove("hidden");
  if (which === "opname") whOpnameSection?.classList.remove("hidden");
  if (which === "waste") whWasteSection?.classList.remove("hidden");
  if (which === "report") whReportSection?.classList.remove("hidden");
  if (window.innerWidth <= 900 && sidebar) sidebar.classList.remove("open");
}

function ensureDefaultDates() {
  if (wasteDate && !wasteDate.value) wasteDate.value = todayISO();
  if (whReportStart && !whReportStart.value) whReportStart.value = todayISO();
  if (whReportEnd && !whReportEnd.value) whReportEnd.value = todayISO();
}

/* ================= DATA HELPERS ================= */
function getStockBase(itemId, wh) {
  const row = stockCache.find((s) => s.itemId === itemId && s.warehouse === wh);
  return Number(row?.stockBase ?? row?.stock ?? 0);
}

function stockBucket(baseQty) {
  const x = Number(baseQty || 0);
  if (x <= 0) return "habis";
  if (x < 10) return "lumayan";
  if (x > 50) return "banyak";
  return "normal";
}

function expAlertLevel(item) {
  const exp = item?.expDate;
  if (!exp) return "none";
  const expDate = new Date(String(exp) + "T00:00:00");
  if (isNaN(expDate)) return "none";
  const today = new Date();
  const diff = daysDiff(today, expDate);
  if (diff < 0) return "expired";
  if (diff <= 7) return "near";
  return "ok";
}

function getPackSize(item) {
  const ps = Number(item?.packSize || 0);
  return ps > 0 ? ps : 1;
}

function toPackAndLoose(baseQty, item) {
  const packSize = getPackSize(item);
  const base = Number(baseQty || 0);
  const pack = Math.floor(base / packSize);
  const loose = base % packSize;
  return { pack, loose, packSize };
}

function toBaseFromPackLoose(pack, loose, item) {
  const packSize = getPackSize(item);
  const p = Number(pack || 0);
  const l = Number(loose || 0);
  return Math.max(0, p * packSize + l);
}

/* ================= NOTIF ================= */
function updateNotifPanel() {
  const notifList = $("notifList");
  const notifBadge = $("notifBadge");
  if (!notifList || !notifBadge) return;

  notifList.innerHTML = "";
  let count = 0;

  // EXP
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

  // stok
  itemsCache.forEach((it) => {
    const s1 = getStockBase(it.id, "w1");
    const s2 = getStockBase(it.id, "w2");

    const b1 = stockBucket(s1);
    const b2 = stockBucket(s2);

    if (b1 === "habis") {
      const li = document.createElement("li");
      li.textContent = `⛔ Habis (Gudang 1): ${it.name}`;
      notifList.appendChild(li);
      count++;
    } else if (b1 === "lumayan") {
      const li = document.createElement("li");
      li.textContent = `⚠️ Hampir habis <10 (Gudang 1): ${it.name} (sisa ${s1} ${it.baseUnit || "pcs"})`;
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
      li.textContent = `⚠️ Hampir habis <10 (Gudang 2): ${it.name} (sisa ${s2} ${it.baseUnit || "pcs"})`;
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

/* ================= DASHBOARD ================= */
function setMetricLabel(el, val) {
  if (el) el.textContent = String(val || 0);
}

function renderWarehouseDashboard() {
  let w1 = { habis: 0, lumayan: 0, banyak: 0 };
  let w2 = { habis: 0, lumayan: 0, banyak: 0 };

  itemsCache.forEach((it) => {
    const s1 = getStockBase(it.id, "w1");
    const s2 = getStockBase(it.id, "w2");

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
      if (whOpnameGudang) whOpnameGudang.value = wh;
      if (whOpnameSection) whOpnameSection.dataset.bucket = bucket;
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

/* ================== INJECT FIELD BARU (Dus -> Base Unit + Harga Supplier) ==================
   - baseUnit: pcs / barel
   - packUnit: dus (default)
   - packSize: isi per dus (misal 24 pcs)
   - supplierPackPrice: harga per dus dari supplier
*/
let injected = false;
function injectExtraItemFields() {
  if (injected) return;
  const root = whItemName?.closest(".card");
  const formGrid = root?.querySelector(".form-grid");
  if (!formGrid) return;

  // default pack unit "dus"
  if (whItemUnit && !whItemUnit.value) whItemUnit.value = "dus";

  const html = `
    <div>
      <label>Satuan Isi (PCS/BAREL)</label>
      <select id="whBaseUnit">
        <option value="pcs">pcs</option>
        <option value="barel">barel</option>
      </select>
    </div>

    <div>
      <label>Satuan Kemasan (default: dus)</label>
      <input id="whPackUnit" placeholder="dus" value="dus">
    </div>

    <div>
      <label>Isi per Dus (berapa pcs/barel)</label>
      <input id="whPackSize" type="number" min="1" step="1" placeholder="contoh: 24">
    </div>

    <div>
      <label>Harga Dus dari Supplier (Rp)</label>
      <input id="whSupplierPackPrice" type="number" min="0" step="1" placeholder="contoh: 250000">
    </div>

    <div class="full" style="font-size:12px;opacity:.75;margin-top:-4px;">
      * Stok disimpan dalam satuan isi (pcs/barel) supaya akurat. Input/opname bisa pakai dus + pcs/barel.
    </div>
  `;

  const wrap = document.createElement("div");
  wrap.className = "full";
  wrap.innerHTML = `<div class="form-grid" style="margin-top:10px;">${html}</div>`;

  // sisipkan sebelum tombol simpan item
  const btn = btnSaveItem;
  if (btn && btn.parentElement === formGrid) {
    formGrid.insertBefore(wrap, btn);
  } else {
    formGrid.appendChild(wrap);
  }

  injected = true;
}

/* ================== MASTER ITEM SAVE ================== */
async function saveMasterItem() {
  const name = (whItemName?.value || "").trim();
  const packUnit = (($("whPackUnit")?.value || whItemUnit?.value || "dus") + "").trim() || "dus";
  const baseUnit = ($("whBaseUnit")?.value || "pcs").trim();
  const packSize = cleanNumber($("whPackSize")?.value || 0);
  const supplierPackPrice = cleanNumber($("whSupplierPackPrice")?.value || 0);

  const expDate = (whItemExp?.value || "").trim();
  const info = (whItemInfo?.value || "").trim();
  const receivedAt = (whItemReceivedAt?.value || "").trim();
  const supplier = (whItemSupplier?.value || "").trim();

  if (!name) return showToast("Nama item wajib diisi", "error");
  if (!packUnit) return showToast("Satuan kemasan wajib diisi (mis: dus)", "error");
  if (!baseUnit) return showToast("Satuan isi wajib dipilih (pcs/barel)", "error");
  if (!packSize || packSize <= 0) return showToast("Isi per dus wajib diisi (>= 1)", "error");
  if (supplierPackPrice < 0) return showToast("Harga dus tidak valid", "error");

  const supplierUnitPrice = packSize > 0 ? Math.round(supplierPackPrice / packSize) : 0;

  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || ("item-" + Date.now());

  const ref = doc(db, "warehouse_items", slug);
  const existing = await getDoc(ref).catch(() => null);

  const payload = {
    name,
    packUnit,            // dus
    baseUnit,            // pcs/barel
    packSize,            // isi per dus
    supplierPackPrice,   // harga per dus
    supplierUnitPrice,   // auto (per pcs/barel)
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

    // init stok base = 0
    await setDoc(doc(db, "warehouse_stock", `${slug}_w1`), {
      itemId: slug,
      warehouse: "w1",
      stockBase: 0,
      updatedAt: serverTimestamp(),
    });
    await setDoc(doc(db, "warehouse_stock", `${slug}_w2`), {
      itemId: slug,
      warehouse: "w2",
      stockBase: 0,
      updatedAt: serverTimestamp(),
    });

    showToast("Item ditambahkan", "success");
  }

  // reset form
  if (whItemName) whItemName.value = "";
  if (whItemUnit) whItemUnit.value = "dus";
  $("whPackUnit") && ($("whPackUnit").value = "dus");
  $("whBaseUnit") && ($("whBaseUnit").value = "pcs");
  $("whPackSize") && ($("whPackSize").value = "");
  $("whSupplierPackPrice") && ($("whSupplierPackPrice").value = "");
  if (whItemExp) whItemExp.value = "";
  if (whItemInfo) whItemInfo.value = "";
  if (whItemReceivedAt) whItemReceivedAt.value = "";
  if (whItemSupplier) whItemSupplier.value = "";
}

/* ================== OPNAME TABLE (Dus + Base) ================== */
function renderOpnameTable() {
  if (!whOpnameTableBody) return;
  whOpnameTableBody.innerHTML = "";

  const wh = whOpnameGudang?.value || "w1";
  const keyword = (whOpnameSearch?.value || "").trim().toLowerCase();
  const bucket = whOpnameSection?.dataset?.bucket || "";

  let list = itemsCache.map((it) => {
    const stockBase = getStockBase(it.id, wh);
    return { ...it, stockBase };
  });

  if (bucket) list = list.filter((x) => stockBucket(x.stockBase) === bucket);

  if (keyword) {
    list = list.filter((it) => {
      const a = (it.name || "").toLowerCase();
      const b = (it.supplier || "").toLowerCase();
      const c = (it.baseUnit || "").toLowerCase();
      const d = (it.packUnit || "").toLowerCase();
      const e = (it.info || "").toLowerCase();
      return a.includes(keyword) || b.includes(keyword) || c.includes(keyword) || d.includes(keyword) || e.includes(keyword);
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

    const sys = toPackAndLoose(it.stockBase, it);
    const sysLabel = `${sys.pack} ${it.packUnit || "dus"} + ${sys.loose} ${it.baseUnit || "pcs"}`;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><b>${it.name || "-"}</b></td>
      <td>${(it.packUnit || "dus")} / ${ (it.baseUnit || "pcs") }</td>
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
      <td>
        <div>${sysLabel}</div>
        <div style="font-size:12px;opacity:.7;">
          (Isi per ${it.packUnit || "dus"}: ${getPackSize(it)} ${it.baseUnit || "pcs"})
        </div>
      </td>
      <td>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <div style="display:flex;gap:6px;align-items:center;">
            <span style="font-size:12px;opacity:.7;">${it.packUnit || "dus"}</span>
            <input type="number" min="0" step="1" style="width:92px;" data-pack="${it.id}" value="${sys.pack}">
          </div>
          <div style="display:flex;gap:6px;align-items:center;">
            <span style="font-size:12px;opacity:.7;">${it.baseUnit || "pcs"}</span>
            <input type="number" min="0" step="1" style="width:92px;" data-loose="${it.id}" value="${sys.loose}">
          </div>
        </div>
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

    const packInp = whOpnameTableBody.querySelector(`input[data-pack="${itemId}"]`);
    const looseInp = whOpnameTableBody.querySelector(`input[data-loose="${itemId}"]`);
    if (!packInp || !looseInp) return;

    const physicalPack = Number(packInp.value || 0);
    const physicalLoose = Number(looseInp.value || 0);
    const physicalBase = toBaseFromPackLoose(physicalPack, physicalLoose, item);

    const systemBase = getStockBase(itemId, wh);
    const diffBase = physicalBase - systemBase;

    const stockDocId = `${itemId}_${wh}`;
    await updateDoc(doc(db, "warehouse_stock", stockDocId), {
      stockBase: physicalBase,
      updatedAt: serverTimestamp(),
      updatedBy: currentUser?.email || "-",
    });

    await addDoc(colOpnameLogs, {
      itemId,
      itemName: item.name || "-",
      warehouse: wh,
      systemBase,
      physicalBase,
      diffBase,
      packUnit: item.packUnit || "dus",
      baseUnit: item.baseUnit || "pcs",
      packSize: getPackSize(item),
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

/* ================== TRANSFER W1 -> W2 (qty dalam DUS) ================== */
function renderMoveSelect() {
  if (!moveItemSelect) return;
  moveItemSelect.innerHTML = "";
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = "Pilih item...";
  moveItemSelect.appendChild(opt0);

  itemsCache.forEach((it) => {
    const s1 = getStockBase(it.id, "w1");
    const w1 = toPackAndLoose(s1, it);
    const opt = document.createElement("option");
    opt.value = it.id;
    opt.textContent = `${it.name} (W1: ${w1.pack} ${it.packUnit || "dus"} + ${w1.loose} ${it.baseUnit || "pcs"})`;
    moveItemSelect.appendChild(opt);
  });

  // label input transfer: dus
  if (moveQty) moveQty.placeholder = "Qty (dus)";
}

async function transferW1toW2() {
  const itemId = moveItemSelect?.value || "";
  const packQty = Number(moveQty?.value || 0);

  if (!itemId) return showToast("Pilih item dulu", "error");
  if (!packQty || packQty <= 0) return showToast("Qty transfer (dus) harus > 0", "error");

  const item = itemsCache.find((x) => x.id === itemId);
  if (!item) return showToast("Item tidak ditemukan", "error");

  const s1 = getStockBase(itemId, "w1");
  const s2 = getStockBase(itemId, "w2");

  const baseMove = toBaseFromPackLoose(packQty, 0, item);
  if (baseMove > s1) return showToast(`Stok Gudang 1 kurang.`, "error");

  try {
    await updateDoc(doc(db, "warehouse_stock", `${itemId}_w1`), {
      stockBase: s1 - baseMove,
      updatedAt: serverTimestamp(),
      updatedBy: currentUser?.email || "-",
    });
    await updateDoc(doc(db, "warehouse_stock", `${itemId}_w2`), {
      stockBase: s2 + baseMove,
      updatedAt: serverTimestamp(),
      updatedBy: currentUser?.email || "-",
    });

    await addDoc(colMoves, {
      itemId,
      itemName: item?.name || "-",
      packQty,
      baseQty: baseMove,
      packUnit: item.packUnit || "dus",
      baseUnit: item.baseUnit || "pcs",
      packSize: getPackSize(item),
      from: "w1",
      to: "w2",
      createdBy: currentUser?.email || "-",
      createdByUid: currentUser?.uid || null,
      createdAt: serverTimestamp(),
      createdAtLocal: new Date().toISOString(),
    });

    showToast(`Transfer sukses: ${item?.name} ${packQty} ${item?.packUnit || "dus"}`, "success");
    if (moveQty) moveQty.value = "";
  } catch (e) {
    console.error(e);
    showToast("Gagal transfer", "error");
  }
}

/* ================== WASTE (tetap sesuai request kamu sebelumnya) ==================
   - Tidak pakai gudang
   - Pilih item pakai search suggestion
   - Gram/ML dropdown + 1 input jumlah
*/
let wasteSelectedItemId = "";
let wasteUnitSelect = null;
let wasteQtyInput = null;
let wasteItemSearch = null;
let wasteSuggestBox = null;

function initWasteUIRewrite() {
  // hide gudang
  if (wasteGudang) wasteGudang.parentElement?.classList?.add("hidden");
  // hide select item lama
  if (wasteItemSelect) wasteItemSelect.parentElement?.classList?.add("hidden");
  // hide ML input lama
  if (wasteMl) wasteMl.parentElement?.classList?.add("hidden");

  // repurpose wasteGram jadi qty input
  if (wasteGram) {
    wasteGram.placeholder = "Jumlah...";
    wasteQtyInput = wasteGram;
  }

  const card = whWasteSection?.querySelector(".card .form-grid");
  if (!card) return;

  // search + suggest
  const wrap = document.createElement("div");
  wrap.className = "full";
  wrap.innerHTML = `
    <label>Cari & Pilih Item</label>
    <div class="suggest-wrap">
      <input id="wasteItemSearchNew" type="text" placeholder="Ketik nama item..." autocomplete="off" />
      <div id="wasteSuggestNew" class="suggest-box hidden"></div>
    </div>
    <div style="margin-top:6px;font-size:12px;opacity:.7;" id="wastePickedLabel">Belum pilih item</div>
  `;
  card.insertBefore(wrap, card.firstChild);

  // unit dropdown gram/ml
  const unitDiv = document.createElement("div");
  unitDiv.innerHTML = `
    <label>Satuan</label>
    <select id="wasteUnitNew">
      <option value="gram">Gram</option>
      <option value="ml">ML</option>
    </select>
  `;
  if (wasteGram?.parentElement) card.insertBefore(unitDiv, wasteGram.parentElement);

  wasteUnitSelect = $("wasteUnitNew");
  wasteItemSearch = $("wasteItemSearchNew");
  wasteSuggestBox = $("wasteSuggestNew");
  const pickedLabel = $("wastePickedLabel");

  function renderWasteSuggest(keyword) {
    const q = (keyword || "").trim().toLowerCase();
    let list = [...itemsCache];
    if (q) list = list.filter((it) => (it.name || "").toLowerCase().includes(q));

    if (!list.length) {
      wasteSuggestBox.innerHTML = `<div class="suggest-item">Tidak ada item</div>`;
      wasteSuggestBox.classList.remove("hidden");
      return;
    }

    wasteSuggestBox.innerHTML = list
      .slice(0, 25)
      .map((it) => `<div class="suggest-item" data-id="${it.id}">${it.name}</div>`)
      .join("");
    wasteSuggestBox.classList.remove("hidden");

    wasteSuggestBox.querySelectorAll(".suggest-item").forEach((el) => {
      const id = el.getAttribute("data-id");
      if (!id) return;
      el.addEventListener("click", () => {
        wasteSelectedItemId = id;
        const it = itemsCache.find((x) => x.id === id);
        if (pickedLabel) pickedLabel.textContent = `Dipilih: ${it?.name || "-"}`;
        if (wasteItemSearch) wasteItemSearch.value = it?.name || "";
        wasteSuggestBox.classList.add("hidden");
      });
    });

    if (list.length === 1) {
      const it = list[0];
      wasteSelectedItemId = it.id;
      if (pickedLabel) pickedLabel.textContent = `Dipilih: ${it.name}`;
      if (wasteItemSearch) wasteItemSearch.value = it.name;
      wasteSuggestBox.classList.add("hidden");
    }
  }

  wasteItemSearch?.addEventListener("input", () => {
    wasteSelectedItemId = "";
    if (pickedLabel) pickedLabel.textContent = "Belum pilih item";
    renderWasteSuggest(wasteItemSearch.value);
  });

  wasteItemSearch?.addEventListener("focus", () => renderWasteSuggest(wasteItemSearch.value));

  document.addEventListener("click", (e) => {
    if (!wrap.contains(e.target)) wasteSuggestBox?.classList?.add("hidden");
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

    // gudang otomatis: yang stoknya lebih besar
    const s1 = getStockBase(item.id, "w1");
    const s2 = getStockBase(item.id, "w2");
    const warehouse = s2 > s1 ? "w2" : "w1";

    await addDoc(colWaste, {
      itemId: item.id,
      itemName: item.name || "-",
      unitMeasure: unit,
      qty,
      note,
      warehouse,
      createdBy: currentUser?.email || "-",
      createdByUid: currentUser?.uid || null,
      wasteDate: dt,
      createdAt: serverTimestamp(),
      createdAtLocal: new Date().toISOString(),
    });

    showToast("Waste tersimpan", "success");
    if (wasteQtyInput) wasteQtyInput.value = "";
    if (wasteNote) wasteNote.value = "";
  } catch (e) {
    console.error(e);
    showToast("Gagal menyimpan waste", "error");
  }
}

/* ================== REPORT ================== */
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
      <th>Sistem</th>
      <th>Fisik</th>
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

    const snap = await getDocs(query(colOpnameLogs, orderBy("createdAt", "desc")));
    let rows = [];

    snap.forEach((d) => {
      const data = d.data();
      const dt = data.createdAt?.toDate?.() || (data.createdAtLocal ? new Date(data.createdAtLocal) : null);
      if (!dt || isNaN(dt)) return;
      if (dt < start || dt > end) return;
      if (data.warehouse !== wh) return;

      const item = itemsCache.find((x) => x.id === data.itemId);
      const packUnit = data.packUnit || item?.packUnit || "dus";
      const baseUnit = data.baseUnit || item?.baseUnit || "pcs";
      const packSize = Number(data.packSize || item?.packSize || 1);

      const sys = toPackAndLoose(Number(data.systemBase ?? 0), { packSize });
      const phy = toPackAndLoose(Number(data.physicalBase ?? 0), { packSize });
      const dif = toPackAndLoose(Number(data.diffBase ?? 0), { packSize });

      rows.push({
        tanggal: dt,
        itemName: data.itemName || "-",
        warehouse: data.warehouse || "-",
        systemText: `${sys.pack} ${packUnit} + ${sys.loose} ${baseUnit}`,
        physicalText: `${phy.pack} ${packUnit} + ${phy.loose} ${baseUnit}`,
        diffText: `${dif.pack} ${packUnit} + ${dif.loose} ${baseUnit}`,
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
        <td>${r.systemText}</td>
        <td>${r.physicalText}</td>
        <td>${r.diffText}</td>
        <td>${r.user}</td>
      `;
      whReportBody.appendChild(tr);
    });

    showToast("Laporan opname diperbarui", "success");
  }

  if (kind === "waste_w1" || kind === "waste_w2") {
    const wh = kind === "waste_w1" ? "w1" : "w2";
    const snap = await getDocs(query(colWaste, orderBy("createdAt", "desc")));

    let rows = [];
    snap.forEach((d) => {
      const data = d.data();
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
        <td>${String(r.note || "").replace(/</g, "&lt;")}</td>
        <td>${r.user}</td>
      `;
      whReportBody.appendChild(tr);
    });

    showToast("Laporan waste diperbarui", "success");
  }
}

/* ================== REALTIME ================== */
function startRealtime() {
  unsubscribeItems?.();
  unsubscribeStock?.();

  unsubscribeItems = onSnapshot(query(colItems, orderBy("name", "asc")), (snap) => {
    itemsCache = [];
    snap.forEach((d) => itemsCache.push({ id: d.id, ...d.data() }));

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

/* ================== INIT ================== */
function initNavHandlers() {
  navWhDashboard?.addEventListener("click", () => {
    setActiveNav(navWhDashboard);
    showWarehouseSection("dashboard");
  });

  navWhOpname?.addEventListener("click", () => {
    setActiveNav(navWhOpname);
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

function initHandlers() {
  btnSaveItem?.addEventListener("click", saveMasterItem);

  whOpnameGudang?.addEventListener("change", () => {
    if (whOpnameSection) delete whOpnameSection.dataset.bucket;
    renderOpnameTable();
  });

  whOpnameSearch?.addEventListener("input", () => renderOpnameTable());

  btnMove?.addEventListener("click", transferW1toW2);

  btnSaveWaste?.addEventListener("click", saveWaste);

  btnWhReport?.addEventListener("click", generateReport);
}

initNavHandlers();
initDashboardClickToOpname();
initHandlers();
ensureDefaultDates();

/* ================== AUTH ================== */
onAuthStateChanged(auth, (user) => {
  currentUser = user || null;

  if (user) {
    // inject field tambahan once
    injectExtraItemFields();

    // default view
    setActiveNav(navWhDashboard);
    showWarehouseSection("dashboard");

    // init waste UI rewrite once
    if (!window.__wasteUIInited) {
      initWasteUIRewrite();
      window.__wasteUIInited = true;
    }

    startRealtime();
    showToast("Warehouse aktif (realtime + dus→pcs/barel)", "success", 2200);
  } else {
    unsubscribeItems?.();
    unsubscribeStock?.();
    unsubscribeItems = null;
    unsubscribeStock = null;
    itemsCache = [];
    stockCache = [];
  }
});