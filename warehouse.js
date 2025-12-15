// warehouse.js
// =======================================================
// WAREHOUSE MODULE (Dashboard Opname, Opname W1/W2, Waste, Report)
// - Nav via #navWhDashboard/#navWhOpname/#navWhWaste/#navWhReport
// - Dashboard indikator (habis=0, lumayan<10, banyak>50) per gudang
// - Notifikasi: stok habis, hampir habis, dan exp mendekati
// - Master item: unit dus + unit isi (pcs/barel/pack dll) + nominal isi/dus + harga/dus dari supplier
// - Waste: tidak pakai gudang, pilih item via search, satuan gram/ml via dropdown (sesuai request)
// =======================================================

import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  where,
  doc,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import {
  getAuth,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

// ============== SAFE GET DOM ==============
const $ = (id) => document.getElementById(id);

// ============== FALLBACK TOAST ==============
function fallbackToast(msg, type = "info", time = 3000) {
  const box = $("toast-container");
  if (!box) return alert(msg);
  const div = document.createElement("div");
  div.className = `toast toast-${type}`;
  div.textContent = msg;
  box.appendChild(div);
  setTimeout(() => div.remove(), time);
}

// Jika script.js punya showToast global, pakai itu
const showToast = window.showToast || fallbackToast;

// ============== FIREBASE (reuse existing app) ==============
const auth = getAuth();
const db = getFirestore();

// ============== COLLECTIONS ==============
const colWhItems = collection(db, "wh_items");           // master item
const colWhStock = collection(db, "wh_stock");           // stok per gudang
const colWhStockLogs = collection(db, "wh_stock_logs");  // riwayat opname/masuk/transfer
const colWhWaste = collection(db, "wh_waste");           // waste log

// ============== DOM NAV ==============
const navWhDashboard = $("navWhDashboard");
const navWhOpname = $("navWhOpname");
const navWhWaste = $("navWhWaste");
const navWhReport = $("navWhReport");

// ============== DOM SECTIONS ==============
const whDashboardSection = $("whDashboardSection");
const whOpnameSection = $("whOpnameSection");
const whWasteSection = $("whWasteSection");
const whReportSection = $("whReportSection");

// ============== DASHBOARD METRICS DOM ==============
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

// ============== OPNAME DOM (MASTER ITEM) ==============
const whItemName = $("whItemName");

// unit besar (dus) + unit isi
const whItemUnit = $("whItemUnit"); // legacy dari HTML kamu (biar nggak error)
const whItemUnitBig = $("whItemUnitBig"); // kalau kamu nanti tambahkan
const whItemUnitSmall = $("whItemUnitSmall"); // kalau kamu nanti tambahkan
const whItemPackQty = $("whItemPackQty"); // isi per dus
const whItemPricePerPack = $("whItemPricePerPack"); // harga per dus

const whItemExp = $("whItemExp");
const whItemInfo = $("whItemInfo");
const whItemReceivedAt = $("whItemReceivedAt");
const whItemSupplier = $("whItemSupplier");
const btnSaveItem = $("btnSaveItem");

// ============== OPNAME TABLE ==============
const whOpnameGudang = $("whOpnameGudang");
const whOpnameSearch = $("whOpnameSearch");
const whOpnameTableBody = $("whOpnameTableBody");

// ============== TRANSFER ==============
const moveItemSelect = $("moveItemSelect");
const moveQty = $("moveQty");
const btnMove = $("btnMove");

// ============== WASTE ==============
const wasteItemSearch = $("wasteItemSearch"); // kalau kamu pakai input search
const wasteItemSelect = $("wasteItemSelect");
const wasteDate = $("wasteDate");
const wasteQty = $("wasteQty");         // qty number (gram/ml)
const wasteUnit = $("wasteUnit");       // dropdown gram/ml
const wasteNote = $("wasteNote");
const btnSaveWaste = $("btnSaveWaste");

// ============== REPORT ==============
const whReportType = $("whReportType");
const whReportStart = $("whReportStart");
const whReportEnd = $("whReportEnd");
const btnWhReport = $("btnWhReport");
const whReportHead = $("whReportHead");
const whReportBody = $("whReportBody");

// ============== NOTIF PANEL (reuse existing) ==============
const notifBadge = $("notifBadge");
const notifList = $("notifList");

// ============== STATE ==============
let currentUser = null;
let items = [];     // master
let stock = [];     // per gudang
let stockLogs = []; // logs
let wasteLogs = []; // waste

// filter dari dashboard -> opname
let activeGudang = "w1";
let activeFilter = null; // "habis" | "lumayan" | "banyak" | null

// ============== UTIL ==============
function todayStr() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseDate(val) {
  if (!val) return null;
  const d = new Date(val + "T00:00:00");
  return isNaN(d) ? null : d;
}

function daysDiff(from, to) {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / 86400000);
}

function setActiveSidebar(btn) {
  document.querySelectorAll(".side-item").forEach((b) => b.classList.remove("active"));
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

// ============== DATA LOADERS ==============
async function loadItems() {
  const snap = await getDocs(query(colWhItems, orderBy("name", "asc")));
  items = [];
  snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
}

async function loadStock() {
  const snap = await getDocs(query(colWhStock, orderBy("updatedAt", "desc")));
  stock = [];
  snap.forEach((d) => stock.push({ id: d.id, ...d.data() }));
}

async function loadStockLogs() {
  const snap = await getDocs(query(colWhStockLogs, orderBy("createdAt", "desc")));
  stockLogs = [];
  snap.forEach((d) => stockLogs.push({ id: d.id, ...d.data() }));
}

async function loadWasteLogs() {
  const snap = await getDocs(query(colWhWaste, orderBy("createdAt", "desc")));
  wasteLogs = [];
  snap.forEach((d) => wasteLogs.push({ id: d.id, ...d.data() }));
}

async function loadAllWarehouseData() {
  await Promise.all([loadItems(), loadStock(), loadStockLogs(), loadWasteLogs()]);
  renderDashboard();
  renderOpnameTable();
  renderSelects();
  updateWarehouseNotif();
}

// ============== STOCK HELPERS ==============
function getStockRow(itemId, gudang) {
  return stock.find((s) => s.itemId === itemId && s.gudang === gudang) || null;
}

function ensureStockValue(itemId, gudang) {
  const row = getStockRow(itemId, gudang);
  return Number(row?.stock || 0);
}

function bucketByQty(qty) {
  const n = Number(qty || 0);
  if (n <= 0) return "habis";
  if (n < 10) return "lumayan";
  if (n > 50) return "banyak";
  return "normal";
}

// ============== RENDER DASHBOARD ==============
function renderDashboard() {
  let w1 = { habis: 0, lumayan: 0, banyak: 0 };
  let w2 = { habis: 0, lumayan: 0, banyak: 0 };

  items.forEach((it) => {
    const s1 = ensureStockValue(it.id, "w1");
    const s2 = ensureStockValue(it.id, "w2");
    const b1 = bucketByQty(s1);
    const b2 = bucketByQty(s2);
    if (b1 === "habis") w1.habis++;
    if (b1 === "lumayan") w1.lumayan++;
    if (b1 === "banyak") w1.banyak++;
    if (b2 === "habis") w2.habis++;
    if (b2 === "lumayan") w2.lumayan++;
    if (b2 === "banyak") w2.banyak++;
  });

  if (w1Habis) w1Habis.textContent = w1.habis;
  if (w1Lumayan) w1Lumayan.textContent = w1.lumayan;
  if (w1Banyak) w1Banyak.textContent = w1.banyak;

  if (w2Habis) w2Habis.textContent = w2.habis;
  if (w2Lumayan) w2Lumayan.textContent = w2.lumayan;
  if (w2Banyak) w2Banyak.textContent = w2.banyak;
}

// Klik metric -> filter opname
function initDashboardMetricClicks() {
  const bind = (card, gudang, filter) => {
    if (!card) return;
    card.style.cursor = "pointer";
    card.addEventListener("click", () => {
      activeGudang = gudang;
      activeFilter = filter;

      if (whOpnameGudang) whOpnameGudang.value = gudang;
      if (whOpnameSearch) whOpnameSearch.value = "";

      setActiveSidebar(navWhOpname);
      showWhSection("opname");
      renderOpnameTable();
    });
  };

  bind(cardW1Habis, "w1", "habis");
  bind(cardW1Lumayan, "w1", "lumayan");
  bind(cardW1Banyak, "w1", "banyak");
  bind(cardW2Habis, "w2", "habis");
  bind(cardW2Lumayan, "w2", "lumayan");
  bind(cardW2Banyak, "w2", "banyak");
}

// ============== RENDER SELECTS ==============
function renderSelects() {
  if (moveItemSelect) {
    moveItemSelect.innerHTML = items.map((it) => `<option value="${it.id}">${it.name}</option>`).join("");
  }

  // waste: pilih item lebih enak pakai search + select
  if (wasteItemSelect) {
    wasteItemSelect.innerHTML = items.map((it) => `<option value="${it.id}">${it.name}</option>`).join("");
  }

  if (wasteUnit) {
    // dropdown satuan waste: gram/ml
    wasteUnit.innerHTML = `
      <option value="gram">Gram</option>
      <option value="ml">ML</option>
    `;
  }

  // default tanggal
  if (wasteDate && !wasteDate.value) wasteDate.value = todayStr();
  if (whReportStart && !whReportStart.value) whReportStart.value = todayStr();
  if (whReportEnd && !whReportEnd.value) whReportEnd.value = todayStr();
}

// ============== OPNAME TABLE ==============
function expBadge(expStr) {
  if (!expStr) return `<span class="status-badge">-</span>`;
  const exp = parseDate(expStr);
  if (!exp) return `<span class="status-badge">-</span>`;

  const now = new Date();
  const diff = daysDiff(now, exp); // exp - now
  // <= 7 hari merah
  if (diff <= 7) return `<span class="status-badge red">EXP ${diff}h</span>`;
  // <= 30 hari kuning
  if (diff <= 30) return `<span class="status-badge yellow">EXP ${diff}h</span>`;
  return `<span class="status-badge green">OK</span>`;
}

function renderOpnameTable() {
  if (!whOpnameTableBody) return;

  const gudang = whOpnameGudang?.value || activeGudang || "w1";
  const qtxt = (whOpnameSearch?.value || "").trim().toLowerCase();

  let list = items.map((it) => {
    const sys = ensureStockValue(it.id, gudang);
    return { it, sys, bucket: bucketByQty(sys) };
  });

  if (activeFilter) {
    list = list.filter((x) => x.bucket === activeFilter);
  }

  if (qtxt) {
    list = list.filter(({ it }) => {
      const a = (it.name || "").toLowerCase();
      const b = (it.supplierName || "").toLowerCase();
      const c = (it.unitPack || it.unit || "").toLowerCase();
      const d = (it.unitInner || "").toLowerCase();
      return a.includes(qtxt) || b.includes(qtxt) || c.includes(qtxt) || d.includes(qtxt);
    });
  }

  if (!list.length) {
    whOpnameTableBody.innerHTML = `<tr><td colspan="9">Tidak ada item.</td></tr>`;
    return;
  }

  whOpnameTableBody.innerHTML = list.map(({ it, sys }) => {
    const unitPack = it.unitPack || it.unit || "dus";
    const unitInner = it.unitInner || "-";
    const packQty = Number(it.packQty || 0);

    const sysText = `${sys.toLocaleString("id-ID")} ${unitPack}`;
    const helper = packQty > 0 && unitInner !== "-"
      ? `<div style="font-size:11px;opacity:.7;margin-top:2px;">= ${(sys * packQty).toLocaleString("id-ID")} ${unitInner}</div>`
      : "";

    return `
      <tr>
        <td><b>${it.name || "-"}</b></td>
        <td>${unitPack}${unitInner !== "-" ? ` <div style="font-size:11px;opacity:.7;">isi: ${packQty} ${unitInner}</div>` : ""}</td>
        <td>${expBadge(it.expDate || "")}</td>
        <td style="max-width:220px;">${(it.info || "-")}</td>
        <td>${it.receivedAt || "-"}</td>
        <td>${it.supplierName || "-"}</td>
        <td>${sysText}${helper}</td>
        <td>
          <input type="number" min="0" step="1"
                 data-phys="1"
                 data-item="${it.id}"
                 data-gudang="${gudang}"
                 value="${sys}">
        </td>
        <td>
          <button class="btn-table small" type="button"
                  data-save="1"
                  data-item="${it.id}"
                  data-gudang="${gudang}">
            Simpan
          </button>
        </td>
      </tr>
    `;
  }).join("");

  // bind save opname
  whOpnameTableBody.querySelectorAll("button[data-save='1']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const itemId = btn.getAttribute("data-item");
      const gudang = btn.getAttribute("data-gudang");
      const inp = whOpnameTableBody.querySelector(`input[data-phys='1'][data-item='${itemId}'][data-gudang='${gudang}']`);
      const phys = Number(inp?.value || 0);

      await saveOpname(itemId, gudang, phys);
    });
  });
}

async function saveOpname(itemId, gudang, physicalStock) {
  const it = items.find((x) => x.id === itemId);
  if (!it) return;

  const sysRow = getStockRow(itemId, gudang);
  const systemStock = Number(sysRow?.stock || 0);
  const diff = physicalStock - systemStock;

  // upsert stock doc: pakai doc id custom "itemId_gudang"
  const stockDocId = `${itemId}_${gudang}`;
  await updateDoc(doc(db, "wh_stock", stockDocId), {
    itemId,
    gudang,
    stock: physicalStock,
    updatedAt: serverTimestamp(),
    updatedBy: currentUser?.email || "-",
  }).catch(async () => {
    // kalau belum ada doc, addDoc manual dgn id = stockDocId (via setDoc ideal, tapi kita keep simple)
    await addDoc(colWhStock, {
      itemId,
      gudang,
      stock: physicalStock,
      updatedAt: serverTimestamp(),
      updatedBy: currentUser?.email || "-",
      _docIdHint: stockDocId,
    });
  });

  await addDoc(colWhStockLogs, {
    kind: "opname",
    itemId,
    itemName: it.name || "-",
    gudang,
    systemStock,
    physicalStock,
    diff,
    createdAt: serverTimestamp(),
    createdBy: currentUser?.email || "-",
  });

  showToast(`Opname tersimpan (${it.name}) - ${gudang.toUpperCase()}`, "success");
  await loadAllWarehouseData();
}

// ============== SAVE MASTER ITEM ==============
async function saveItem() {
  const name = (whItemName?.value || "").trim();
  if (!name) return showToast("Nama item wajib diisi", "error");

  // support field baru + fallback field lama (whItemUnit)
  const unitPack = (whItemUnitBig?.value || whItemUnit?.value || "dus").trim() || "dus";
  const unitInner = (whItemUnitSmall?.value || "").trim() || "pcs";
  const packQty = Number(whItemPackQty?.value || 0); // isi per dus
  const pricePerPack = Number(whItemPricePerPack?.value || 0); // harga/dus

  const expDate = whItemExp?.value || "";
  const info = (whItemInfo?.value || "").trim();
  const receivedAt = whItemReceivedAt?.value || "";
  const supplierName = (whItemSupplier?.value || "").trim();

  // NOTE: HTML kamu belum ada input2 baru (unitBig/unitSmall/packQty/pricePerPack).
  // Tapi warehouse.js sudah siap. Kamu tinggal tambah inputnya nanti.

  await addDoc(colWhItems, {
    name,
    unitPack,     // contoh: dus
    unitInner,    // contoh: pcs / barel
    packQty,      // nominal pcs per dus
    pricePerPack, // harga dus dari supplier
    expDate,
    info,
    receivedAt,
    supplierName,
    createdAt: serverTimestamp(),
    createdBy: currentUser?.email || "-",
  });

  showToast("Item tersimpan", "success");

  if (whItemName) whItemName.value = "";
  if (whItemUnit) whItemUnit.value = "";
  if (whItemUnitBig) whItemUnitBig.value = "";
  if (whItemUnitSmall) whItemUnitSmall.value = "";
  if (whItemPackQty) whItemPackQty.value = "";
  if (whItemPricePerPack) whItemPricePerPack.value = "";
  if (whItemExp) whItemExp.value = "";
  if (whItemInfo) whItemInfo.value = "";
  if (whItemReceivedAt) whItemReceivedAt.value = "";
  if (whItemSupplier) whItemSupplier.value = "";

  await loadAllWarehouseData();
}

// ============== TRANSFER W1 -> W2 ==============
async function transferW1toW2() {
  const itemId = moveItemSelect?.value || "";
  const qty = Number(moveQty?.value || 0);
  if (!itemId) return showToast("Pilih item transfer", "error");
  if (qty <= 0) return showToast("Qty transfer harus > 0", "error");

  const it = items.find((x) => x.id === itemId);
  const s1 = ensureStockValue(itemId, "w1");
  const s2 = ensureStockValue(itemId, "w2");

  if (qty > s1) return showToast("Stok Gudang 1 tidak cukup", "error");

  const newW1 = s1 - qty;
  const newW2 = s2 + qty;

  const docW1 = `${itemId}_w1`;
  const docW2 = `${itemId}_w2`;

  await updateDoc(doc(db, "wh_stock", docW1), {
    itemId, gudang: "w1", stock: newW1, updatedAt: serverTimestamp(),
  }).catch(async () => {
    await addDoc(colWhStock, { itemId, gudang: "w1", stock: newW1, updatedAt: serverTimestamp(), _docIdHint: docW1 });
  });

  await updateDoc(doc(db, "wh_stock", docW2), {
    itemId, gudang: "w2", stock: newW2, updatedAt: serverTimestamp(),
  }).catch(async () => {
    await addDoc(colWhStock, { itemId, gudang: "w2", stock: newW2, updatedAt: serverTimestamp(), _docIdHint: docW2 });
  });

  await addDoc(colWhStockLogs, {
    kind: "transfer",
    itemId,
    itemName: it?.name || "-",
    from: "w1",
    to: "w2",
    qty,
    createdAt: serverTimestamp(),
    createdBy: currentUser?.email || "-",
  });

  showToast("Transfer berhasil (W1 → W2)", "success");
  if (moveQty) moveQty.value = "";
  await loadAllWarehouseData();
}

// ============== WASTE (no gudang, unit dropdown gram/ml) ==============
async function saveWaste() {
  const itemId = wasteItemSelect?.value || "";
  if (!itemId) return showToast("Pilih item waste", "error");

  const date = wasteDate?.value || todayStr();
  const qty = Number(wasteQty?.value || 0);
  const unit = wasteUnit?.value || "gram";
  const note = (wasteNote?.value || "").trim();

  if (qty <= 0) return showToast("Qty waste harus > 0", "error");

  const it = items.find((x) => x.id === itemId);

  await addDoc(colWhWaste, {
    itemId,
    itemName: it?.name || "-",
    date,
    qty,
    unit,   // gram / ml
    note,
    createdAt: serverTimestamp(),
    createdBy: currentUser?.email || "-",
  });

  showToast("Waste tersimpan", "success");
  if (wasteQty) wasteQty.value = "";
  if (wasteNote) wasteNote.value = "";
  await loadAllWarehouseData();
}

// ============== REPORT ==============
function renderReportTable(headCols, rows, rowRenderer) {
  if (!whReportHead || !whReportBody) return;
  whReportHead.innerHTML = `<tr>${headCols.map((h) => `<th>${h}</th>`).join("")}</tr>`;
  whReportBody.innerHTML = rows.length
    ? rows.map(rowRenderer).join("")
    : `<tr><td colspan="${headCols.length}">Tidak ada data.</td></tr>`;
}

function inRange(d, start, end) {
  if (!d) return false;
  return d >= start && d <= end;
}

async function generateReport() {
  const type = whReportType?.value || "opname_w1";
  const s = parseDate(whReportStart?.value || "");
  const e = parseDate(whReportEnd?.value || "");
  if (!s || !e) return showToast("Tanggal laporan wajib diisi", "error");
  const end = new Date(e.getFullYear(), e.getMonth(), e.getDate(), 23, 59, 59);

  if (type === "opname_w1" || type === "opname_w2") {
    const gudang = type === "opname_w1" ? "w1" : "w2";

    const rows = stockLogs
      .filter((x) => x.kind === "opname" && x.gudang === gudang)
      .filter((x) => {
        // createdAt tidak bisa diparse di client tanpa toDate (kadang), jadi kita filter via fallback: tidak ketat
        // untuk akurat, sebaiknya simpan "dateKey" juga. Untuk sekarang, pakai createdAtLocal bila ada.
        const d = x.createdAtLocal ? new Date(x.createdAtLocal) : null;
        if (!d) return true; // fallback: tampilkan
        return inRange(d, s, end);
      });

    renderReportTable(
      ["Waktu", "Item", "Gudang", "Sistem", "Fisik", "Selisih", "User"],
      rows,
      (r) => `
        <tr>
          <td>${r.createdAtLocal || "-"}</td>
          <td>${r.itemName || "-"}</td>
          <td>${(r.gudang || "-").toUpperCase()}</td>
          <td>${Number(r.systemStock || 0).toLocaleString("id-ID")}</td>
          <td>${Number(r.physicalStock || 0).toLocaleString("id-ID")}</td>
          <td>${Number(r.diff || 0).toLocaleString("id-ID")}</td>
          <td>${r.createdBy || "-"}</td>
        </tr>
      `
    );
    return;
  }

  // Waste report (tidak pakai gudang) — tapi kamu minta dipisah gudang,
  // jadi kita treat: waste_w1/w2 sebagai label saja jika nanti kamu mau log gudang.
  // Untuk sekarang: tetap difilter jenisnya.
  if (type === "waste_w1" || type === "waste_w2") {
    const rows = wasteLogs.filter((x) => {
      const d = parseDate(x.date || "");
      if (!d) return true;
      return inRange(d, s, end);
    });

    renderReportTable(
      ["Tanggal", "Item", "Qty", "Satuan", "Catatan", "User"],
      rows,
      (r) => `
        <tr>
          <td>${r.date || "-"}</td>
          <td>${r.itemName || "-"}</td>
          <td>${Number(r.qty || 0).toLocaleString("id-ID")}</td>
          <td>${r.unit || "-"}</td>
          <td>${r.note || "-"}</td>
          <td>${r.createdBy || "-"}</td>
        </tr>
      `
    );
  }
}

// ============== NOTIF (stok habis/low + exp warning) ==============
function updateWarehouseNotif() {
  if (!notifList || !notifBadge) return;

  notifList.innerHTML = "";
  let count = 0;

  const now = new Date();

  // stok notif: habis & hampir habis (per gudang)
  items.forEach((it) => {
    const s1 = ensureStockValue(it.id, "w1");
    const s2 = ensureStockValue(it.id, "w2");

    if (s1 <= 0) {
      notifList.appendChild(li(`Habis (Gudang 1): ${it.name}`));
      count++;
    } else if (s1 < 10) {
      notifList.appendChild(li(`Hampir habis <10 (Gudang 1): ${it.name} (${s1})`));
      count++;
    }

    if (s2 <= 0) {
      notifList.appendChild(li(`Habis (Gudang 2): ${it.name}`));
      count++;
    } else if (s2 < 10) {
      notifList.appendChild(li(`Hampir habis <10 (Gudang 2): ${it.name} (${s2})`));
      count++;
    }

    // exp notif
    if (it.expDate) {
      const exp = parseDate(it.expDate);
      if (exp) {
        const diff = daysDiff(now, exp);
        if (diff <= 7) {
          notifList.appendChild(li(`⚠️ EXP dekat (${diff} hari): ${it.name}`));
          count++;
        }
      }
    }
  });

  if (count === 0) {
    notifList.appendChild(li("Tidak ada notifikasi."));
  }
  notifBadge.textContent = String(count);

  function li(text) {
    const el = document.createElement("li");
    el.textContent = text;
    return el;
  }
}

// ============== NAV INIT (INI KUNCI MENU BISA KLIK) ==============
function initWarehouseNav() {
  const bind = (btn, sectionName) => {
    if (!btn) return;
    btn.style.pointerEvents = "auto"; // jaga-jaga kalau CSS ke-disable
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      setActiveSidebar(btn);
      showWhSection(sectionName);

      // khusus: reset filter ketika pindah halaman
      if (sectionName !== "opname") activeFilter = null;

      if (sectionName === "opname") renderOpnameTable();
      if (sectionName === "dashboard") renderDashboard();
    });
  };

  bind(navWhDashboard, "dashboard");
  bind(navWhOpname, "opname");
  bind(navWhWaste, "waste");
  bind(navWhReport, "report");
}

// ============== EVENTS ==============
function bindEvents() {
  if (btnSaveItem) btnSaveItem.addEventListener("click", saveItem);

  if (whOpnameGudang) whOpnameGudang.addEventListener("change", () => {
    activeGudang = whOpnameGudang.value || "w1";
    renderOpnameTable();
  });

  if (whOpnameSearch) whOpnameSearch.addEventListener("input", () => {
    renderOpnameTable();
  });

  if (btnMove) btnMove.addEventListener("click", transferW1toW2);

  if (btnSaveWaste) btnSaveWaste.addEventListener("click", saveWaste);

  if (btnWhReport) btnWhReport.addEventListener("click", generateReport);

  // waste search filter (kalau kamu pakai input search)
  if (wasteItemSearch && wasteItemSelect) {
    wasteItemSearch.addEventListener("input", () => {
      const q = (wasteItemSearch.value || "").trim().toLowerCase();
      const filtered = items.filter((it) => (it.name || "").toLowerCase().includes(q));
      wasteItemSelect.innerHTML = filtered.map((it) => `<option value="${it.id}">${it.name}</option>`).join("");
    });
  }
}

// ============== INIT ==============
function boot() {
  initWarehouseNav();
  initDashboardMetricClicks();
  bindEvents();

  // default tampil dashboard warehouse
  setActiveSidebar(navWhDashboard);
  showWhSection("dashboard");
}

onAuthStateChanged(auth, async (user) => {
  currentUser = user || null;
  if (!currentUser) return;

  boot();
  await loadAllWarehouseData();
});