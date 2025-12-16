// warehouse.js
// =======================================================
// WAREHOUSE MODULE (Dashboard, Opname W1/W2, Waste, Report)
// ✅ NAV FIX: Event delegation untuk [data-wh-nav="1"] -> pasti bisa diklik
// ✅ Stock upsert: setDoc(docId `${itemId}_${gudang}`) merge true -> anti dobel
// =======================================================

import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  doc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

// ============== SAFE GET DOM ==============
const $ = (id) => document.getElementById(id);

// ============== TOAST (reuse script.js) ==============
function fallbackToast(msg, type = "info", time = 3000) {
  const box = $("toast-container");
  if (!box) return alert(msg);
  const div = document.createElement("div");
  div.className = `toast toast-${type}`;
  div.textContent = msg;
  box.appendChild(div);
  setTimeout(() => div.remove(), time);
}
const showToast = window.showToast || fallbackToast;

// ============== FIREBASE ==============
const auth = getAuth();
const db = getFirestore();

// ============== COLLECTIONS ==============
const colWhItems = collection(db, "wh_items");
const colWhStock = collection(db, "wh_stock");
const colWhStockLogs = collection(db, "wh_stock_logs");
const colWhWaste = collection(db, "wh_waste");

// ============== DOM SECTIONS (WAREHOUSE) ==============
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

// ============== MASTER ITEM DOM ==============
const whItemName = $("whItemName");
const whItemUnit = $("whItemUnit"); // legacy
const whItemUnitBig = $("whItemUnitBig");
const whItemUnitSmall = $("whItemUnitSmall");
const whItemPackQty = $("whItemPackQty");
const whItemPricePerPack = $("whItemPricePerPack");

const whItemExp = $("whItemExp");
const whItemInfo = $("whItemInfo");
const whItemReceivedAt = $("whItemReceivedAt");
const whItemSupplier = $("whItemSupplier");
const btnSaveItem = $("btnSaveItem");

// ============== OPNAME DOM ==============
const whOpnameGudang = $("whOpnameGudang");
const whOpnameSearch = $("whOpnameSearch");
const whOpnameTableBody = $("whOpnameTableBody");

// ============== TRANSFER DOM ==============
const moveItemSelect = $("moveItemSelect");
const moveQty = $("moveQty");
const btnMove = $("btnMove");

// ============== WASTE DOM ==============
const wasteItemSearch = $("wasteItemSearch");
const wasteItemSelect = $("wasteItemSelect");
const wasteDate = $("wasteDate");
const wasteQty = $("wasteQty");
const wasteUnit = $("wasteUnit");
const wasteNote = $("wasteNote");
const btnSaveWaste = $("btnSaveWaste");

// ============== REPORT DOM ==============
const whReportType = $("whReportType");
const whReportStart = $("whReportStart");
const whReportEnd = $("whReportEnd");
const btnWhReport = $("btnWhReport");
const whReportHead = $("whReportHead");
const whReportBody = $("whReportBody");

// ============== NOTIF DOM (reuse header panel) ==============
const notifBadge = $("notifBadge");
const notifList = $("notifList");

// ============== STATE ==============
let currentUser = null;
let items = [];
let stock = [];
let stockLogs = [];
let wasteLogs = [];
let activeGudang = "w1";
let activeFilter = null; // habis|lumayan|banyak|null

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
function inRange(d, start, end) {
  if (!d) return false;
  return d >= start && d <= end;
}

// ============== UI HELPERS ==============
function showWhSection(name) {
  [whDashboardSection, whOpnameSection, whWasteSection, whReportSection].forEach((sec) => {
    if (sec) sec.classList.add("hidden");
  });
  if (name === "dashboard" && whDashboardSection) whDashboardSection.classList.remove("hidden");
  if (name === "opname" && whOpnameSection) whOpnameSection.classList.remove("hidden");
  if (name === "waste" && whWasteSection) whWasteSection.classList.remove("hidden");
  if (name === "report" && whReportSection) whReportSection.classList.remove("hidden");
}

function setActiveWhNav(buttonId) {
  // aktifkan cuma tombol warehouse, jangan ganggu menu lama
  document.querySelectorAll("[data-wh-nav='1']").forEach((b) => b.classList.remove("active"));
  const btn = $(buttonId);
  if (btn) btn.classList.add("active");
}

// ============== NAV FIX (EVENT DELEGATION) ==============
function initWarehouseNavDelegation() {
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-wh-nav='1']");
    if (!btn) return;

    e.preventDefault();
    e.stopPropagation();

    const id = btn.id;

    // reset filter saat pindah halaman selain opname
    if (id !== "navWhOpname") activeFilter = null;

    if (id === "navWhDashboard") {
      setActiveWhNav("navWhDashboard");
      showWhSection("dashboard");
      renderDashboard();
    } else if (id === "navWhOpname") {
      setActiveWhNav("navWhOpname");
      showWhSection("opname");
      renderOpnameTable();
    } else if (id === "navWhWaste") {
      setActiveWhNav("navWhWaste");
      showWhSection("waste");
    } else if (id === "navWhReport") {
      setActiveWhNav("navWhReport");
      showWhSection("report");
    }
  });
}

// ============== LOADERS ==============
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
async function upsertStock(itemId, gudang, nextStock) {
  const stockDocId = `${itemId}_${gudang}`; // ✅ FIX 1 doc per item+gudang
  await setDoc(
    doc(db, "wh_stock", stockDocId),
    {
      itemId,
      gudang,
      stock: Number(nextStock || 0),
      updatedAt: serverTimestamp(),
      updatedBy: currentUser?.email || "-",
    },
    { merge: true }
  );
}

// ============== DASHBOARD ==============
function renderDashboard() {
  if (!w1Habis && !w2Habis) return;

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

function initDashboardMetricClicks() {
  const bind = (card, gudang, filter) => {
    if (!card) return;
    card.style.cursor = "pointer";
    card.addEventListener("click", () => {
      activeGudang = gudang;
      activeFilter = filter;
      if (whOpnameGudang) whOpnameGudang.value = gudang;
      if (whOpnameSearch) whOpnameSearch.value = "";

      setActiveWhNav("navWhOpname");
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

// ============== SELECTS DEFAULTS ==============
function renderSelects() {
  if (moveItemSelect) {
    moveItemSelect.innerHTML = items.map((it) => `<option value="${it.id}">${it.name}</option>`).join("");
  }
  if (wasteItemSelect) {
    wasteItemSelect.innerHTML = items.map((it) => `<option value="${it.id}">${it.name}</option>`).join("");
  }
  if (wasteUnit) {
    wasteUnit.innerHTML = `<option value="gram">Gram</option><option value="ml">ML</option>`;
  }
  if (wasteDate && !wasteDate.value) wasteDate.value = todayStr();
  if (whReportStart && !whReportStart.value) whReportStart.value = todayStr();
  if (whReportEnd && !whReportEnd.value) whReportEnd.value = todayStr();
}

// ============== OPNAME ==============
function expBadge(expStr) {
  if (!expStr) return `<span class="status-badge">-</span>`;
  const exp = parseDate(expStr);
  if (!exp) return `<span class="status-badge">-</span>`;

  const now = new Date();
  const diff = daysDiff(now, exp);
  if (diff <= 7) return `<span class="status-badge red">EXP ${diff}h</span>`;
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

  if (activeFilter) list = list.filter((x) => x.bucket === activeFilter);

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

  whOpnameTableBody.innerHTML = list
    .map(({ it, sys }) => {
      const unitPack = it.unitPack || it.unit || "dus";
      const unitInner = it.unitInner || "-";
      const packQty = Number(it.packQty || 0);

      const sysText = `${sys.toLocaleString("id-ID")} ${unitPack}`;
      const helper =
        packQty > 0 && unitInner !== "-"
          ? `<div style="font-size:11px;opacity:.7;margin-top:2px;">= ${(sys * packQty).toLocaleString(
              "id-ID"
            )} ${unitInner}</div>`
          : "";

      return `
      <tr>
        <td><b>${it.name || "-"}</b></td>
        <td>${unitPack}${
          unitInner !== "-" ? ` <div style="font-size:11px;opacity:.7;">isi: ${packQty} ${unitInner}</div>` : ""
        }</td>
        <td>${expBadge(it.expDate || "")}</td>
        <td style="max-width:220px;">${it.info || "-"}</td>
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
    })
    .join("");

  // bind save opname (table delegation juga aman)
  whOpnameTableBody.querySelectorAll("button[data-save='1']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const itemId = btn.getAttribute("data-item");
      const gudang = btn.getAttribute("data-gudang");
      const inp = whOpnameTableBody.querySelector(
        `input[data-phys='1'][data-item='${itemId}'][data-gudang='${gudang}']`
      );
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
  const diff = Number(physicalStock || 0) - systemStock;

  await upsertStock(itemId, gudang, physicalStock);

  await addDoc(colWhStockLogs, {
    kind: "opname",
    itemId,
    itemName: it.name || "-",
    gudang,
    systemStock,
    physicalStock: Number(physicalStock || 0),
    diff,
    createdAt: serverTimestamp(),
    createdAtLocal: new Date().toISOString(),
    createdBy: currentUser?.email || "-",
  });

  showToast(`Opname tersimpan (${it.name}) - ${gudang.toUpperCase()}`, "success");
  await loadAllWarehouseData();
}

// ============== MASTER ITEM SAVE ==============
async function saveItem() {
  const name = (whItemName?.value || "").trim();
  if (!name) return showToast("Nama item wajib diisi", "error");

  const unitPack = (whItemUnitBig?.value || whItemUnit?.value || "dus").trim() || "dus";
  const unitInner = (whItemUnitSmall?.value || "").trim() || "pcs";
  const packQty = Number(whItemPackQty?.value || 0);
  const pricePerPack = Number(whItemPricePerPack?.value || 0);

  const expDate = whItemExp?.value || "";
  const info = (whItemInfo?.value || "").trim();
  const receivedAt = whItemReceivedAt?.value || "";
  const supplierName = (whItemSupplier?.value || "").trim();

  await addDoc(colWhItems, {
    name,
    unitPack,
    unitInner,
    packQty,
    pricePerPack,
    expDate,
    info,
    receivedAt,
    supplierName,
    createdAt: serverTimestamp(),
    createdAtLocal: new Date().toISOString(),
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

  await upsertStock(itemId, "w1", s1 - qty);
  await upsertStock(itemId, "w2", s2 + qty);

  await addDoc(colWhStockLogs, {
    kind: "transfer",
    itemId,
    itemName: it?.name || "-",
    from: "w1",
    to: "w2",
    qty,
    createdAt: serverTimestamp(),
    createdAtLocal: new Date().toISOString(),
    createdBy: currentUser?.email || "-",
  });

  showToast("Transfer berhasil (W1 → W2)", "success");
  if (moveQty) moveQty.value = "";
  await loadAllWarehouseData();
}

// ============== WASTE ==============
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
    unit,
    note,
    createdAt: serverTimestamp(),
    createdAtLocal: new Date().toISOString(),
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
        const d = x.createdAtLocal ? new Date(x.createdAtLocal) : null;
        if (!d) return true;
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

  if (type === "waste") {
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

// ============== NOTIF ==============
function updateWarehouseNotif() {
  if (!notifList || !notifBadge) return;

  notifList.innerHTML = "";
  let count = 0;
  const now = new Date();

  const li = (text) => {
    const el = document.createElement("li");
    el.textContent = text;
    return el;
  };

  items.forEach((it) => {
    const s1 = ensureStockValue(it.id, "w1");
    const s2 = ensureStockValue(it.id, "w2");

    if (s1 <= 0) { notifList.appendChild(li(`Habis (Gudang 1): ${it.name}`)); count++; }
    else if (s1 < 10) { notifList.appendChild(li(`Hampir habis <10 (Gudang 1): ${it.name} (${s1})`)); count++; }

    if (s2 <= 0) { notifList.appendChild(li(`Habis (Gudang 2): ${it.name}`)); count++; }
    else if (s2 < 10) { notifList.appendChild(li(`Hampir habis <10 (Gudang 2): ${it.name} (${s2})`)); count++; }

    if (it.expDate) {
      const exp = parseDate(it.expDate);
      if (exp) {
        const diff = daysDiff(now, exp);
        if (diff <= 7) { notifList.appendChild(li(`⚠️ EXP dekat (${diff} hari): ${it.name}`)); count++; }
      }
    }
  });

  if (count === 0) notifList.appendChild(li("Tidak ada notifikasi."));
  notifBadge.textContent = String(count);
}

// ============== EVENTS ==============
function bindEvents() {
  if (btnSaveItem) btnSaveItem.addEventListener("click", saveItem);

  if (whOpnameGudang) whOpnameGudang.addEventListener("change", () => {
    activeGudang = whOpnameGudang.value || "w1";
    renderOpnameTable();
  });

  if (whOpnameSearch) whOpnameSearch.addEventListener("input", () => renderOpnameTable());
  if (btnMove) btnMove.addEventListener("click", transferW1toW2);
  if (btnSaveWaste) btnSaveWaste.addEventListener("click", saveWaste);
  if (btnWhReport) btnWhReport.addEventListener("click", generateReport);

  if (wasteItemSearch && wasteItemSelect) {
    wasteItemSearch.addEventListener("input", () => {
      const q = (wasteItemSearch.value || "").trim().toLowerCase();
      const filtered = items.filter((it) => (it.name || "").toLowerCase().includes(q));
      wasteItemSelect.innerHTML = filtered.map((it) => `<option value="${it.id}">${it.name}</option>`).join("");
    });
  }
}

// ============== BOOT ==============
function bootUI() {
  // default: dashboard warehouse
  setActiveWhNav("navWhDashboard");
  showWhSection("dashboard");
  initDashboardMetricClicks();
  bindEvents();
}

// ✅ INIT NAV DELEGATION SEKARANG JUGA (biar menu bisa dipencet kapanpun)
initWarehouseNavDelegation();
bootUI();

// Auth gating untuk load data
onAuthStateChanged(auth, async (user) => {
  currentUser = user || null;
  if (!currentUser) return;
  await loadAllWarehouseData();
});