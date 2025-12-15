// warehouse.js (Realtime Warehouse + Opname WH1/WH2 + EXP Notif + Waste + Reports)
// ============================================================================
// REQUIREMENTS (DOM IDs yang dipakai - aman kalau belum ada):
// - Auth/topbar/notif (opsional):
//   #topbarEmail #connectionStatus #notifBtn #notifPanel #notifBadge #notifList
// - Dashboard Opname:
//   #dashboardOpnameList  (container untuk 6 kartu stok + 2 kartu exp)
// - Opname:
//   #opnameSectionNew #opnameWarehouse #opnameSearchNew #opnameTableNew
// - Waste:
//   #wasteSectionNew #wasteItemSearch #wasteItemSuggest #wasteItemHiddenId
//   #wasteDate #wasteUnit #wasteQty #wasteNote #btnSaveWaste
//   #wasteTable
// - Reports:
//   #reportsSectionNew #reportTypeNew #reportStartNew #reportEndNew
//   #btnReportGenerateNew #btnReportDownloadNew #reportTableHeadNew #reportTableBodyNew
//
// FIRESTORE collections (bisa kamu ganti kalau mau):
// - warehouse_items            : data stok per gudang + exp + supplier
// - warehouse_opname_logs      : log opname (WH1/WH2)
// - warehouse_waste_logs       : log waste (tanpa gudang)
//
// Struktur doc warehouse_items (minimal):
// { name, unit, stock, warehouse:1|2, expDate:"YYYY-MM-DD"|null, info, incomingDate:"YYYY-MM-DD"|null, supplierName }
//
// ============================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  doc,
  updateDoc,
  query,
  orderBy,
  where,
  onSnapshot,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

// ================= FIREBASE CONFIG (samakan dengan project kamu) =================
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

// ================= COLLECTIONS =================
const colItems = collection(db, "warehouse_items");
const colOpname = collection(db, "warehouse_opname_logs");
const colWaste = collection(db, "warehouse_waste_logs");

// ================= UTIL / DOM =================
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

function parseYMD(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  return isNaN(d) ? null : d;
}
function daysDiff(from, to) {
  const ms = to - from;
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

// EXP rule (ubah kalau mau)
const EXP_WARNING_DAYS = 7;

function expStatus(item) {
  const d = parseYMD(item?.expDate);
  if (!d) return { level: "none", label: "-" };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diff = daysDiff(today, d); // sisa hari
  if (diff < 0) return { level: "expired", label: `Expired ${Math.abs(diff)} hari` };
  if (diff <= EXP_WARNING_DAYS) return { level: "near", label: `Hampir Exp (${diff} hari)` };
  return { level: "ok", label: `Exp ${diff} hari` };
}

function stockBucket(stock) {
  const s = Number(stock || 0);
  if (s <= 0) return "empty"; // habis
  if (s < 10) return "low";   // lumayan banyak < 10
  if (s > 50) return "many";  // banyak > 50
  return "mid";
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ================= DOM (OPSIONAL TOPBAR/NOTIF) =================
const topbarEmail = $("topbarEmail");
const connectionStatus = $("connectionStatus");

const notifBtn = $("notifBtn");
const notifPanel = $("notifPanel");
const notifBadge = $("notifBadge");
const notifList = $("notifList");

// ================= DOM (FITUR BARU) =================
// Dashboard Opname container (render kartu di sini)
const dashboardOpnameList = $("dashboardOpnameList");

// Opname
const opnameWarehouse = $("opnameWarehouse");
const opnameSearchNew = $("opnameSearchNew");
const opnameTableNew = $("opnameTableNew");

// Waste
const wasteItemSearch = $("wasteItemSearch");
const wasteItemSuggest = $("wasteItemSuggest");
const wasteItemHiddenId = $("wasteItemHiddenId");
const wasteDate = $("wasteDate");
const wasteUnit = $("wasteUnit");
const wasteQty = $("wasteQty");
const wasteNote = $("wasteNote");
const btnSaveWaste = $("btnSaveWaste");
const wasteTable = $("wasteTable");

// Reports
const reportTypeNew = $("reportTypeNew");
const reportStartNew = $("reportStartNew");
const reportEndNew = $("reportEndNew");
const btnReportGenerateNew = $("btnReportGenerateNew");
const btnReportDownloadNew = $("btnReportDownloadNew");
const reportTableHeadNew = $("reportTableHeadNew");
const reportTableBodyNew = $("reportTableBodyNew");

// ================= STATE =================
let currentUser = null;

// caches
let itemsCache = [];       // warehouse_items (gabungan wh1+wh2)
let opnameLogsCache = [];  // warehouse_opname_logs
let wasteLogsCache = [];   // warehouse_waste_logs

// filters
let dashWarehouseFilter = null; // 1|2|null
let dashBucketFilter = null;    // "empty"|"low"|"many"|null

// laporan state
let currentReportKind = "opname_wh1";
let currentReportRows = [];

// ================= CONNECTION LABEL =================
function updateConnectionStatus() {
  if (!connectionStatus) return;
  const isOnline = navigator.onLine;
  connectionStatus.textContent = isOnline ? "Online" : "Offline";
  connectionStatus.classList.toggle("online", isOnline);
  connectionStatus.classList.toggle("offline", !isOnline);
}
updateConnectionStatus();
window.addEventListener("online", updateConnectionStatus);
window.addEventListener("offline", updateConnectionStatus);

// ================= NOTIF PANEL TOGGLE =================
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

// ================= REALTIME LISTENERS =================
let unsubItems = null;
let unsubOpname = null;
let unsubWaste = null;

function startRealtime() {
  stopRealtime();

  // Items realtime
  unsubItems = onSnapshot(
    query(colItems, orderBy("name", "asc")),
    (snap) => {
      itemsCache = [];
      snap.forEach((d) => itemsCache.push({ id: d.id, ...d.data() }));

      renderDashboardOpname();
      renderOpnameTable();
      renderWasteSuggest(""); // refresh suggestion list
      updateWarehouseNotif();
    },
    (err) => {
      console.error("items onSnapshot error", err);
      showToast("Gagal realtime items", "error");
    }
  );

  // Opname logs realtime
  unsubOpname = onSnapshot(
    query(colOpname, orderBy("createdAt", "desc")),
    (snap) => {
      opnameLogsCache = [];
      snap.forEach((d) => {
        const data = d.data();
        let createdAtDate = new Date();
        if (data.createdAt?.toDate) createdAtDate = data.createdAt.toDate();
        else if (data.createdAtLocal) createdAtDate = new Date(data.createdAtLocal);
        opnameLogsCache.push({ id: d.id, ...data, createdAtDate });
      });
    },
    (err) => {
      console.error("opname onSnapshot error", err);
    }
  );

  // Waste logs realtime
  unsubWaste = onSnapshot(
    query(colWaste, orderBy("createdAt", "desc")),
    (snap) => {
      wasteLogsCache = [];
      snap.forEach((d) => {
        const data = d.data();
        let createdAtDate = new Date();
        if (data.createdAt?.toDate) createdAtDate = data.createdAt.toDate();
        else if (data.createdAtLocal) createdAtDate = new Date(data.createdAtLocal);
        wasteLogsCache.push({ id: d.id, ...data, createdAtDate });
      });
      renderWasteTable();
    },
    (err) => {
      console.error("waste onSnapshot error", err);
    }
  );
}

function stopRealtime() {
  try { unsubItems?.(); } catch {}
  try { unsubOpname?.(); } catch {}
  try { unsubWaste?.(); } catch {}
  unsubItems = unsubOpname = unsubWaste = null;
}

// ================= DASHBOARD OPNAME =================
function computeDashMetricsForWarehouse(warehouse) {
  const list = itemsCache.filter((it) => Number(it.warehouse) === Number(warehouse));
  let empty = 0, low = 0, many = 0;

  let expRed = 0; // near/expired count

  list.forEach((it) => {
    const b = stockBucket(it.stock);
    if (b === "empty") empty++;
    else if (b === "low") low++;
    else if (b === "many") many++;

    const ex = expStatus(it);
    if (ex.level === "near" || ex.level === "expired") expRed++;
  });

  return { empty, low, many, expRed };
}

function makeDashCard({ title, count, tone, onClick }) {
  // tone: "red"|"yellow"|"green"|"purple"
  const div = document.createElement("div");
  div.className = `metric-card ${tone || ""}`;
  div.style.cursor = "pointer";
  div.innerHTML = `
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;">
      <div style="font-weight:700;">${escapeHtml(title)}</div>
      <div style="font-size:18px;font-weight:800;">${Number(count || 0)}</div>
    </div>
  `;
  div.addEventListener("click", () => onClick?.());
  return div;
}

function renderDashboardOpname() {
  if (!dashboardOpnameList) return;

  dashboardOpnameList.innerHTML = "";

  const m1 = computeDashMetricsForWarehouse(1);
  const m2 = computeDashMetricsForWarehouse(2);

  // WH1 cards
  dashboardOpnameList.appendChild(
    makeDashCard({
      title: `Habis (Gudang 1)`,
      count: m1.empty,
      tone: "red",
      onClick: () => jumpToOpname(1, "empty"),
    })
  );
  dashboardOpnameList.appendChild(
    makeDashCard({
      title: `Lumayan Banyak < 10 (Gudang 1)`,
      count: m1.low,
      tone: "yellow",
      onClick: () => jumpToOpname(1, "low"),
    })
  );
  dashboardOpnameList.appendChild(
    makeDashCard({
      title: `Banyak > 50 (Gudang 1)`,
      count: m1.many,
      tone: "green",
      onClick: () => jumpToOpname(1, "many"),
    })
  );
  dashboardOpnameList.appendChild(
    makeDashCard({
      title: `EXP Merah (Gudang 1)`,
      count: m1.expRed,
      tone: "red",
      onClick: () => jumpToOpname(1, "exp_red"),
    })
  );

  // WH2 cards
  dashboardOpnameList.appendChild(
    makeDashCard({
      title: `Habis (Gudang 2)`,
      count: m2.empty,
      tone: "red",
      onClick: () => jumpToOpname(2, "empty"),
    })
  );
  dashboardOpnameList.appendChild(
    makeDashCard({
      title: `Lumayan Banyak < 10 (Gudang 2)`,
      count: m2.low,
      tone: "yellow",
      onClick: () => jumpToOpname(2, "low"),
    })
  );
  dashboardOpnameList.appendChild(
    makeDashCard({
      title: `Banyak > 50 (Gudang 2)`,
      count: m2.many,
      tone: "green",
      onClick: () => jumpToOpname(2, "many"),
    })
  );
  dashboardOpnameList.appendChild(
    makeDashCard({
      title: `EXP Merah (Gudang 2)`,
      count: m2.expRed,
      tone: "red",
      onClick: () => jumpToOpname(2, "exp_red"),
    })
  );
}

// Hook klik dashboard -> filter opname
function jumpToOpname(warehouse, bucket) {
  dashWarehouseFilter = warehouse;
  dashBucketFilter = bucket;

  // set dropdown WH kalau ada
  if (opnameWarehouse) opnameWarehouse.value = String(warehouse);

  // reset search
  if (opnameSearchNew) opnameSearchNew.value = "";

  // render table
  renderOpnameTable();

  // kalau kamu punya showSection() di global (script.js), kita coba panggil
  try {
    if (typeof window.showSection === "function") window.showSection("opname");
  } catch {}

  // scroll ke area opname
  const opnameSec = $("opnameSectionNew") || $("opnameSection");
  opnameSec?.scrollIntoView?.({ behavior: "smooth" });
}

// ================= NOTIF (EXP + HABIS + LOW) =================
function updateWarehouseNotif() {
  if (!notifList || !notifBadge) return;

  notifList.innerHTML = "";
  let count = 0;

  const list = Array.isArray(itemsCache) ? itemsCache : [];

  // EXP near/expired
  const expAlerts = list
    .map((it) => ({ it, exp: expStatus(it) }))
    .filter(({ exp }) => exp.level === "near" || exp.level === "expired")
    .sort((a, b) => {
      const ad = parseYMD(a.it.expDate);
      const bd = parseYMD(b.it.expDate);
      return (ad?.getTime() || 0) - (bd?.getTime() || 0);
    });

  expAlerts.forEach(({ it, exp }) => {
    const li = document.createElement("li");
    li.textContent = `⚠️ ${exp.level === "expired" ? "EXPIRED" : "Hampir EXP"}: ${it.name} (Gudang ${it.warehouse}) — ${exp.label}`;
    notifList.appendChild(li);
    count++;
  });

  // Stok habis
  list
    .filter((it) => stockBucket(it.stock) === "empty")
    .forEach((it) => {
      const li = document.createElement("li");
      li.textContent = `🟥 Stok habis: ${it.name} (Gudang ${it.warehouse})`;
      notifList.appendChild(li);
      count++;
    });

  // Hampir habis
  list
    .filter((it) => stockBucket(it.stock) === "low")
    .forEach((it) => {
      const li = document.createElement("li");
      li.textContent = `🟨 Hampir habis: ${it.name} (Gudang ${it.warehouse}) — sisa ${Number(it.stock || 0)} ${it.unit || ""}`;
      notifList.appendChild(li);
      count++;
    });

  if (count === 0) {
    const li = document.createElement("li");
    li.textContent = "Tidak ada notifikasi.";
    notifList.appendChild(li);
  }

  notifBadge.textContent = String(count);
}

// ================= OPNAME =================
function getOpnameFilteredItems() {
  let list = [...itemsCache];

  const wh = Number(opnameWarehouse?.value || dashWarehouseFilter || 1);
  list = list.filter((it) => Number(it.warehouse) === wh);

  // bucket filter dari dashboard
  if (dashBucketFilter) {
    if (dashBucketFilter === "exp_red") {
      list = list.filter((it) => {
        const ex = expStatus(it);
        return ex.level === "near" || ex.level === "expired";
      });
    } else {
      list = list.filter((it) => stockBucket(it.stock) === dashBucketFilter);
    }
  }

  // search
  const q = (opnameSearchNew?.value || "").trim().toLowerCase();
  if (q) {
    list = list.filter((it) => {
      const a = (it.name || "").toLowerCase();
      const b = (it.supplierName || "").toLowerCase();
      const c = (it.info || "").toLowerCase();
      return a.includes(q) || b.includes(q) || c.includes(q);
    });
  }

  return list;
}

function renderOpnameTable() {
  if (!opnameTableNew) return;

  const list = getOpnameFilteredItems();
  opnameTableNew.innerHTML = "";

  if (!list.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="9">Tidak ada data item.</td>`;
    opnameTableNew.appendChild(tr);
    return;
  }

  list.forEach((it) => {
    const systemStock = Number(it.stock || 0);
    const ex = expStatus(it);

    const expBadge =
      ex.level === "expired" || ex.level === "near"
        ? `<span class="status-badge red">${escapeHtml(ex.label)}</span>`
        : `<span class="status-badge">${escapeHtml(ex.label)}</span>`;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <div style="font-weight:700;">${escapeHtml(it.name || "-")}</div>
        <div style="font-size:11px;opacity:.8;margin-top:2px;">
          ${escapeHtml(it.info || "")}
        </div>
        <div style="font-size:11px;opacity:.8;margin-top:2px;">
          Supplier: ${escapeHtml(it.supplierName || "-")}
        </div>
      </td>

      <td>${escapeHtml(it.unit || "dus")}</td>
      <td>${expBadge}</td>
      <td>${escapeHtml(it.incomingDate || "-")}</td>

      <td>${systemStock}</td>

      <td>
        <input
          type="number"
          class="op-phys"
          data-id="${it.id}"
          value="${systemStock}"
          style="width:90px;"
        />
      </td>

      <td>
        <span class="op-diff" data-id="${it.id}-diff">0</span>
      </td>

      <td>
        <button class="btn-table small op-save" data-id="${it.id}">
          Simpan
        </button>
      </td>
    `;
    opnameTableNew.appendChild(tr);
  });

  // diff live
  opnameTableNew.querySelectorAll(".op-phys").forEach((inp) => {
    const id = inp.getAttribute("data-id");
    const it = itemsCache.find((x) => x.id === id);
    inp.addEventListener("input", () => {
      const fisik = Number(inp.value || 0);
      const diff = fisik - Number(it?.stock || 0);
      const span = opnameTableNew.querySelector(`.op-diff[data-id="${id}-diff"]`);
      if (span) span.textContent = String(diff);
    });
  });

  // save
  opnameTableNew.querySelectorAll(".op-save").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      await saveOpnameRow(id);
    });
  });
}

async function saveOpnameRow(itemId) {
  try {
    const it = itemsCache.find((x) => x.id === itemId);
    if (!it) return;

    const inp = opnameTableNew?.querySelector(`.op-phys[data-id="${itemId}"]`);
    if (!inp) return;

    const physicalStock = Number(inp.value || 0);
    const systemStock = Number(it.stock || 0);
    const diff = physicalStock - systemStock;

    const now = new Date();

    // log opname
    await addDoc(colOpname, {
      itemId,
      itemName: it.name || "-",
      warehouse: Number(it.warehouse || 1),
      unit: it.unit || "dus",
      systemStock,
      physicalStock,
      diff,
      dateKey: todayKey(now),
      createdAtLocal: now.toISOString(),
      createdBy: currentUser?.email || "-",
      createdAt: serverTimestamp(),
    });

    // update stock
    await updateDoc(doc(db, "warehouse_items", itemId), {
      stock: physicalStock,
      updatedAt: serverTimestamp(),
    });

    showToast(`Opname tersimpan: ${it.name}`, "success");
  } catch (err) {
    console.error("saveOpnameRow", err);
    showToast("Gagal simpan opname", "error");
  }
}

if (opnameSearchNew) {
  opnameSearchNew.addEventListener("input", () => {
    // kalau user mulai search manual, matiin filter bucket dari dashboard (biar normal lagi)
    // warehouse tetap ikut dropdown
    dashBucketFilter = null;
    renderOpnameTable();
  });
}
if (opnameWarehouse) {
  opnameWarehouse.addEventListener("change", () => {
    dashWarehouseFilter = Number(opnameWarehouse.value || 1);
    dashBucketFilter = null; // ganti gudang = reset bucket filter
    renderOpnameTable();
  });
}

// ================= WASTE (NO WAREHOUSE) =================
function getUniqueItemNames() {
  const names = itemsCache
    .map((it) => (it.name || "").trim())
    .filter(Boolean);
  return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
}

function renderWasteSuggest(keyword) {
  if (!wasteItemSuggest || !wasteItemSearch) return;

  const q = (keyword || "").trim().toLowerCase();
  const all = getUniqueItemNames();

  let list = all;
  if (q) list = all.filter((n) => n.toLowerCase().includes(q));

  wasteItemSuggest.innerHTML = "";

  if (!list.length) {
    wasteItemSuggest.classList.add("hidden");
    return;
  }

  list.slice(0, 20).forEach((name) => {
    const div = document.createElement("div");
    div.className = "suggest-item";
    div.textContent = name;
    div.addEventListener("click", () => {
      wasteItemSearch.value = name;
      if (wasteItemHiddenId) wasteItemHiddenId.value = ""; // kita pakai name aja
      wasteItemSuggest.classList.add("hidden");
    });
    wasteItemSuggest.appendChild(div);
  });

  wasteItemSuggest.classList.remove("hidden");
}

if (wasteItemSearch) {
  wasteItemSearch.addEventListener("input", () => {
    renderWasteSuggest(wasteItemSearch.value);
  });
  wasteItemSearch.addEventListener("focus", () => {
    renderWasteSuggest(wasteItemSearch.value);
  });
  document.addEventListener("click", (e) => {
    if (wasteItemSuggest && wasteItemSearch) {
      if (!wasteItemSuggest.contains(e.target) && !wasteItemSearch.contains(e.target)) {
        wasteItemSuggest.classList.add("hidden");
      }
    }
  });
}

async function saveWaste() {
  try {
    const itemName = (wasteItemSearch?.value || "").trim();
    if (!itemName) {
      showToast("Pilih item waste dulu", "error");
      return;
    }

    const dateStr = (wasteDate?.value || "").trim();
    if (!dateStr) {
      showToast("Tanggal waste wajib", "error");
      return;
    }

    const unit = (wasteUnit?.value || "").trim(); // "gram" | "ml"
    if (!unit) {
      showToast("Unit waste wajib dipilih", "error");
      return;
    }

    const qty = Number(wasteQty?.value || 0);
    if (!qty || qty <= 0) {
      showToast("Qty waste harus > 0", "error");
      return;
    }

    const note = (wasteNote?.value || "").trim();
    const now = new Date();

    await addDoc(colWaste, {
      itemName,
      wasteDate: dateStr, // simpan yyyy-mm-dd
      qty,
      unit,
      note,
      dateKey: dateStr,
      createdAtLocal: now.toISOString(),
      createdBy: currentUser?.email || "-",
      createdAt: serverTimestamp(),
    });

    showToast("Waste tersimpan", "success");

    if (wasteQty) wasteQty.value = "";
    if (wasteNote) wasteNote.value = "";
  } catch (err) {
    console.error("saveWaste", err);
    showToast("Gagal simpan waste", "error");
  }
}

if (btnSaveWaste) {
  btnSaveWaste.addEventListener("click", () => saveWaste());
}

function renderWasteTable() {
  if (!wasteTable) return;

  wasteTable.innerHTML = "";

  const list = [...wasteLogsCache].slice(0, 50);

  if (!list.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="5">Belum ada data waste.</td>`;
    wasteTable.appendChild(tr);
    return;
  }

  list.forEach((w) => {
    const d = w.createdAtDate || new Date();
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(w.wasteDate || "-")}</td>
      <td>${escapeHtml(w.itemName || "-")}</td>
      <td>${Number(w.qty || 0)} ${escapeHtml(w.unit || "")}</td>
      <td>${escapeHtml(w.note || "")}</td>
      <td>${escapeHtml(w.createdBy || "-")}</td>
    `;
    wasteTable.appendChild(tr);
  });
}

// ================= REPORTS (OPNAME WH1/WH2 + WASTE) =================
function parseDateInput(value, isEnd = false) {
  if (!value) return null;
  return new Date(value + (isEnd ? "T23:59:59" : "T00:00:00"));
}

function buildOpnameReportRows(warehouse, startDate, endDate) {
  const rows = [];

  opnameLogsCache.forEach((o) => {
    const d = o.createdAtDate || new Date();
    if (d < startDate || d > endDate) return;
    if (Number(o.warehouse) !== Number(warehouse)) return;

    rows.push({
      tanggal: formatDateTime(d),
      item: o.itemName || "-",
      system: Number(o.systemStock ?? 0),
      physical: Number(o.physicalStock ?? 0),
      diff: Number(o.diff ?? 0),
      unit: o.unit || "",
      user: o.createdBy || "-",
    });
  });

  return rows;
}

function buildWasteReportRows(startDate, endDate) {
  const rows = [];

  wasteLogsCache.forEach((w) => {
    const d = w.createdAtDate || new Date();
    if (d < startDate || d > endDate) return;

    rows.push({
      tanggal: w.wasteDate || todayKey(d),
      item: w.itemName || "-",
      qty: Number(w.qty ?? 0),
      unit: w.unit || "",
      note: w.note || "",
      user: w.createdBy || "-",
    });
  });

  return rows;
}

function renderReportHeader() {
  if (!reportTableHeadNew) return;
  reportTableHeadNew.innerHTML = "";

  const tr = document.createElement("tr");

  if (currentReportKind === "waste") {
    tr.innerHTML = `
      <th>Tanggal</th>
      <th>Item</th>
      <th>Qty</th>
      <th>Catatan</th>
      <th>User</th>
    `;
  } else {
    tr.innerHTML = `
      <th>Tanggal & Waktu</th>
      <th>Item</th>
      <th>Stok Sistem</th>
      <th>Stok Fisik</th>
      <th>Selisih</th>
      <th>User</th>
    `;
  }

  reportTableHeadNew.appendChild(tr);
}

function renderReportTable() {
  if (!reportTableBodyNew) return;

  reportTableBodyNew.innerHTML = "";
  renderReportHeader();

  if (!currentReportRows.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="6">Tidak ada data untuk periode ini.</td>`;
    reportTableBodyNew.appendChild(tr);
    return;
  }

  if (currentReportKind === "waste") {
    currentReportRows.forEach((r) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(r.tanggal)}</td>
        <td>${escapeHtml(r.item)}</td>
        <td>${Number(r.qty)} ${escapeHtml(r.unit)}</td>
        <td>${escapeHtml(r.note)}</td>
        <td>${escapeHtml(r.user)}</td>
      `;
      reportTableBodyNew.appendChild(tr);
    });
  } else {
    currentReportRows.forEach((r) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(r.tanggal)}</td>
        <td>${escapeHtml(r.item)}</td>
        <td>${Number(r.system)}</td>
        <td>${Number(r.physical)}</td>
        <td>${Number(r.diff)}</td>
        <td>${escapeHtml(r.user)}</td>
      `;
      reportTableBodyNew.appendChild(tr);
    });
  }
}

function generateReport() {
  if (!reportTypeNew || !reportStartNew || !reportEndNew) return;

  const type = reportTypeNew.value || "opname_wh1";
  const startDate = parseDateInput(reportStartNew.value, false);
  const endDate = parseDateInput(reportEndNew.value, true);

  if (!startDate || !endDate || isNaN(startDate) || isNaN(endDate)) {
    showToast("Tanggal awal & akhir wajib diisi", "error");
    return;
  }
  if (endDate < startDate) {
    showToast("Tanggal akhir tidak boleh sebelum tanggal awal", "error");
    return;
  }

  if (type === "waste") {
    currentReportKind = "waste";
    currentReportRows = buildWasteReportRows(startDate, endDate);
  } else if (type === "opname_wh2") {
    currentReportKind = "opname_wh2";
    currentReportRows = buildOpnameReportRows(2, startDate, endDate);
  } else {
    currentReportKind = "opname_wh1";
    currentReportRows = buildOpnameReportRows(1, startDate, endDate);
  }

  renderReportTable();
  showToast("Laporan diperbarui", "success");
}

function downloadReportCSV() {
  if (!currentReportRows.length) {
    showToast("Tidak ada data laporan untuk diunduh", "error");
    return;
  }

  let csv = "";
  const sep = ",";

  if (currentReportKind === "waste") {
    csv += ["Tanggal", "Item", "Qty", "Unit", "Catatan", "User"].join(sep) + "\n";
    currentReportRows.forEach((r) => {
      const row = [
        `"${String(r.tanggal).replace(/"/g, '""')}"`,
        `"${String(r.item).replace(/"/g, '""')}"`,
        r.qty,
        `"${String(r.unit).replace(/"/g, '""')}"`,
        `"${String(r.note).replace(/"/g, '""')}"`,
        `"${String(r.user).replace(/"/g, '""')}"`,
      ];
      csv += row.join(sep) + "\n";
    });
  } else {
    csv += ["Tanggal", "Item", "Stok Sistem", "Stok Fisik", "Selisih", "User"].join(sep) + "\n";
    currentReportRows.forEach((r) => {
      const row = [
        `"${String(r.tanggal).replace(/"/g, '""')}"`,
        `"${String(r.item).replace(/"/g, '""')}"`,
        r.system,
        r.physical,
        r.diff,
        `"${String(r.user).replace(/"/g, '""')}"`,
      ];
      csv += row.join(sep) + "\n";
    });
  }

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  const startLabel = reportStartNew?.value || "";
  const endLabel = reportEndNew?.value || "";
  a.href = url;
  a.download = `laporan-${currentReportKind}-${startLabel}_sd_${endLabel}.csv`;

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast("CSV diunduh", "success");
}

if (btnReportGenerateNew) btnReportGenerateNew.addEventListener("click", generateReport);
if (btnReportDownloadNew) btnReportDownloadNew.addEventListener("click", downloadReportCSV);

// ================= AUTH STATE =================
onAuthStateChanged(auth, (user) => {
  currentUser = user || null;

  if (user) {
    if (topbarEmail) topbarEmail.textContent = user.email || "-";

    // default date waste = hari ini
    if (wasteDate && !wasteDate.value) wasteDate.value = todayKey(new Date());

    // default report date
    if (reportStartNew && !reportStartNew.value) reportStartNew.value = todayKey(new Date());
    if (reportEndNew && !reportEndNew.value) reportEndNew.value = todayKey(new Date());

    // default opname warehouse
    if (opnameWarehouse && !opnameWarehouse.value) opnameWarehouse.value = "1";

    startRealtime();
    showToast("Warehouse realtime aktif", "success", 2200);
  } else {
    stopRealtime();
  }
});