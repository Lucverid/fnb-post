// warehouse.js (FINAL FIX) - Dashboard + Waste Input + Multi-Gudang + Report
// ===========================================================================

import { getApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import {
  getFirestore, collection, addDoc, getDocs, query, orderBy, updateDoc, doc, serverTimestamp, limit, deleteDoc, where
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

const app = getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const $ = (id) => document.getElementById(id);

// ===================== UTILS =====================
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

function clampInt(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function escapeHtml(str) {
  return String(str).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function iconBtn(html, title, extraClass = "") {
  return `<button class="btn-icon-mini ${extraClass}" type="button" title="${title}">${html}</button>`;
}

function downloadText(filename, text, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// --- DATE LOGIC ---
function toDateInputValue(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfWeekMonday(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); 
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function setReportRangeByWeekOffset(weekOffset = 0) {
  const base = new Date();
  const start = startOfWeekMonday(base);
  start.setDate(start.getDate() - weekOffset * 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  if ($("whReportStart")) $("whReportStart").value = toDateInputValue(start);
  if ($("whReportEnd")) $("whReportEnd").value = toDateInputValue(end);
  
  if ($("wasteFilterStart")) $("wasteFilterStart").value = toDateInputValue(start);
  if ($("wasteFilterEnd")) $("wasteFilterEnd").value = toDateInputValue(end);

  showToast(weekOffset === 0 ? "Minggu Ini" : weekOffset === 1 ? "Minggu Lalu" : "2 Minggu Lalu", "info");
}

// ===================== CORE LOGIC =====================
const LOW_STOCK_LT = 2;
const HIGH_STOCK_GT = 50;
const EXP_SOON_DAYS = 7;

const WASTE_PRESET_ITEMS = [
  "Milktea", "Teh Hijau", "Teh Hitam", "Teh Blooming", "Teh oolong", "Boba", "Susu", "Pudding", "Kopi", "Crystal jelly"
];

function getPackQty(it) {
  const pq = clampInt(it?.packQty, 0);
  return pq > 0 ? pq : 1;
}

function toTotalUnits(packs, loose, packQty) {
  return (clampInt(packs) * clampInt(packQty)) + clampInt(loose);
}

function splitUnitsToPackLoose(totalUnits, packQty) {
  const t = Math.max(0, clampInt(totalUnits, 0));
  const pq = Math.max(1, clampInt(packQty, 1));
  const packs = Math.floor(t / pq);
  const loose = t % pq;
  return { packs, loose };
}

function getItemStock(it, gudang) {
  if (gudang === 'w1') return { packs: it.stockW1 || 0, loose: it.stockW1Loose || 0 };
  if (gudang === 'w2') return { packs: it.stockW2 || 0, loose: it.stockW2Loose || 0 };
  if (gudang === 'rest') return { packs: it.stockRest || 0, loose: it.stockRestLoose || 0 };
  if (gudang === 'bar') return { packs: it.stockBar || 0, loose: it.stockBarLoose || 0 };
  if (gudang === 'kitchen') return { packs: it.stockKitchen || 0, loose: it.stockKitchenLoose || 0 };
  return { packs: 0, loose: 0 };
}

function normalizeItemStock(it) {
  return {
    stockW1: clampInt(it.stockW1), stockW1Loose: clampInt(it.stockW1Loose),
    stockW2: clampInt(it.stockW2), stockW2Loose: clampInt(it.stockW2Loose),
    stockRest: clampInt(it.stockRest), stockRestLoose: clampInt(it.stockRestLoose),
    stockBar: clampInt(it.stockBar), stockBarLoose: clampInt(it.stockBarLoose),
    stockKitchen: clampInt(it.stockKitchen), stockKitchenLoose: clampInt(it.stockKitchenLoose),
  };
}

// ===================== COLLECTIONS =====================
const colWhItems = collection(db, "wh_items");
const colWhTx = collection(db, "wh_tx");
const colWhOpname = collection(db, "wh_opname_logs");
const colWhWaste = collection(db, "wh_waste");
const colWhBatches = collection(db, "wh_batches");

// ===================== DOM ELEMENTS =====================
// Sections
const whDashboardSection = $("whDashboardSection");
const whOpnameSection = $("whOpnameSection");
const whWasteSection = $("whWasteSection");
const whReportSection = $("whReportSection");

// Nav
const navWhDashboard = $("navWhDashboard");
const navWhOpname = $("navWhOpname");
const navWhWaste = $("navWhWaste");
const navWhReport = $("navWhReport");

// Dashboard Elements
const w1Habis = $("w1Habis"); const w1Lumayan = $("w1Lumayan"); const w1Banyak = $("w1Banyak");
const w2Habis = $("w2Habis"); const w2Lumayan = $("w2Lumayan"); const w2Banyak = $("w2Banyak");
const dashboardExpiryWrap = $("whExpiryWrap");

// Opname & Master
const whItemName = $("whItemName");
const whItemPackQty = $("whItemPackQty");
const btnSaveItem = $("btnSaveItem");
const whOpnameTableBody = $("whOpnameTableBody");
const whOpnameGudang = $("whOpnameGudang");
const whOpnameSearch = $("whOpnameSearch");
const whOpnameModeSmall = $("whOpnameModeSmall");

// Transfer
const moveItemSelect = $("moveItemSelect");
const transferType = $("transferType");
const moveQtyPack = $("moveQtyPack");
const moveQtyLoose = $("moveQtyLoose");
const btnMove = $("btnMove");
const moveInfo = $("moveInfo");
const moveSearch = $("moveSearch");

// Waste
const wasteItemSelect = $("wasteItemSelect");
const wasteDate = $("wasteDate");
const wasteUnit = $("wasteUnit");
const wasteQty = $("wasteQty");
const wasteNote = $("wasteNote");
const btnSaveWaste = $("btnSaveWaste");
const wasteHistoryBody = $("wasteHistoryBody");
const wasteFilterStart = $("wasteFilterStart");
const wasteFilterEnd = $("wasteFilterEnd");

// Report
const whReportType = $("whReportType");
const whReportStart = $("whReportStart");
const whReportEnd = $("whReportEnd");
const btnWhReport = $("btnWhReport");
const btnWhReportDownload = $("btnWhReportDownload");
const whReportHead = $("whReportHead");
const whReportBody = $("whReportBody");
const btnWeekThis = $("btnWeekThis");
const btnWeekLast = $("btnWeekLast");

// State
let currentUser = null;
let items = [];
let wasteLogs = [];
let batchLogs = [];

// ===================== NAVIGATION =====================
function setActiveNav(btn) {
  document.querySelectorAll(".side-item").forEach((b) => b.classList.remove("active"));
  if (btn) btn.classList.add("active");
}

function showSection(id) {
  [whDashboardSection, whOpnameSection, whWasteSection, whReportSection].forEach(s => s?.classList.add("hidden"));
  $(id)?.classList.remove("hidden");
}

navWhDashboard?.addEventListener("click", () => {
    setActiveNav(navWhDashboard);
    showSection("whDashboardSection");
    updateDashboard(); // Refresh angka
});

navWhOpname?.addEventListener("click", () => {
    setActiveNav(navWhOpname);
    showSection("whOpnameSection");
    renderOpnameTable();
});

navWhWaste?.addEventListener("click", () => {
    setActiveNav(navWhWaste);
    showSection("whWasteSection");
    // Auto load history
    if(!wasteFilterStart.value) setReportRangeByWeekOffset(0);
    loadWasteLogsAndRender();
});

navWhReport?.addEventListener("click", () => {
    setActiveNav(navWhReport);
    showSection("whReportSection");
    if(!whReportStart.value) setReportRangeByWeekOffset(0);
});

// ===================== LOAD DATA =====================
async function loadWhItems() {
  const snap = await getDocs(query(colWhItems, orderBy("name", "asc")));
  items = [];
  snap.forEach((d) => {
    const data = d.data() || {};
    const norm = normalizeItemStock(data);
    items.push({ id: d.id, ...data, ...norm });
  });
}

// ===================== DASHBOARD LOGIC =====================
function stockBucketCount(packEqFloat) {
  const n = Number(packEqFloat || 0);
  if (n <= 0.001) return "habis";
  if (n < LOW_STOCK_LT) return "low";
  if (n > HIGH_STOCK_GT) return "high";
  return "mid";
}

function updateDashboard() {
    if(!w1Habis) return;
    
    let cW1 = { habis: 0, low: 0, high: 0 };
    let cW2 = { habis: 0, low: 0, high: 0 };
    let expOk = 0, expSoon = 0, expBad = 0;
    const now = new Date();

    items.forEach(it => {
        const pq = getPackQty(it);
        
        // Calc W1
        const unitsW1 = toTotalUnits(it.stockW1, it.stockW1Loose, pq);
        const packsW1 = unitsW1 / pq;
        const s1 = stockBucketCount(packsW1);
        if(s1 === 'habis') cW1.habis++;
        else if(s1 === 'low') cW1.low++;
        else if(s1 === 'high') cW1.high++;

        // Calc W2
        const unitsW2 = toTotalUnits(it.stockW2, it.stockW2Loose, pq);
        const packsW2 = unitsW2 / pq;
        const s2 = stockBucketCount(packsW2);
        if(s2 === 'habis') cW2.habis++;
        else if(s2 === 'low') cW2.low++;
        else if(s2 === 'high') cW2.high++;

        // Expiry
        if(it.expDate) {
            const exp = parseDateOnly(it.expDate);
            if(exp) {
                const diff = Math.floor((exp - now) / (1000 * 60 * 60 * 24));
                if(diff < 0) expBad++;
                else if(diff <= EXP_SOON_DAYS) expSoon++;
                else expOk++;
            } else expOk++;
        } else expOk++;
    });

    w1Habis.textContent = cW1.habis; w1Lumayan.textContent = cW1.low; w1Banyak.textContent = cW1.high;
    w2Habis.textContent = cW2.habis; w2Lumayan.textContent = cW2.low; w2Banyak.textContent = cW2.high;

    // Render Expiry Card Simple
    if(dashboardExpiryWrap) {
        dashboardExpiryWrap.innerHTML = `
            <div class="metric-row" style="margin-top:10px;">
                <div class="metric-card green"><b>${expOk}</b> Aman</div>
                <div class="metric-card yellow"><b>${expSoon}</b> Mau Exp</div>
                <div class="metric-card red"><b>${expBad}</b> Expired</div>
            </div>
        `;
    }
}

// ===================== MASTER ITEM =====================
async function createMasterItem() {
  if (!currentUser) return showToast("Harus login", "error");
  const name = (whItemName?.value || "").trim();
  const unitBig = ($("whItemUnitBig")?.value || "").trim();
  const unitSmall = ($("whItemUnitSmall")?.value || "").trim();
  const packQty = Number(whItemPackQty?.value || 0);
  const initW1 = clampInt($("whItemInitStockW1")?.value);
  const initRest = clampInt($("whItemInitStockRest")?.value);

  if (!name) return showToast("Nama item wajib diisi", "error");
  if (!packQty || packQty <= 0) return showToast("Isi per dus wajib > 0", "error");

  try {
    await addDoc(colWhItems, {
        name, unitBig, unitSmall, packQty,
        expDate: $("whItemExp")?.value || "",
        receivedAt: $("whItemReceivedAt")?.value || "",
        supplier: $("whItemSupplier")?.value || "",
        info: $("whItemInfo")?.value || "",
        stockW1: initW1, stockW1Loose: 0,
        stockW2: 0, stockW2Loose: 0,
        stockRest: initRest, stockRestLoose: 0,
        stockBar: 0, stockBarLoose: 0,
        stockKitchen: 0, stockKitchenLoose: 0,
        createdBy: currentUser.email,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });
    showToast("Master item tersimpan", "success");
    whItemName.value = ""; $("whItemInitStockW1").value = ""; $("whItemInitStockRest").value = "";
    await loadWhItems();
    fillSelects();
    renderOpnameTable();
  } catch (e) { showToast("Gagal: " + e.message, "error"); }
}
btnSaveItem?.addEventListener("click", createMasterItem);

// ===================== TRANSFER LOGIC =====================
function fillSelects() {
    if(!moveItemSelect) return;
    const kw = (moveSearch?.value || "").toLowerCase();
    moveItemSelect.innerHTML = `<option value="">Pilih item...</option>`;
    
    // Fill Transfer Select
    items.forEach(it => {
        if(kw && !it.name.toLowerCase().includes(kw)) return;
        const opt = document.createElement("option");
        opt.value = it.id;
        opt.textContent = it.name;
        moveItemSelect.appendChild(opt);
    });

    // Fill Waste Select (Preset + Items)
    if(wasteItemSelect) {
        wasteItemSelect.innerHTML = `<option value="">Pilih item...</option>`;
        WASTE_PRESET_ITEMS.forEach(n => {
            const opt = document.createElement("option"); opt.value = n; opt.textContent = n; wasteItemSelect.appendChild(opt);
        });
        items.forEach(it => {
            const opt = document.createElement("option"); opt.value = it.name; opt.textContent = it.name; wasteItemSelect.appendChild(opt);
        });
    }
    
    // Fill Waste Unit
    if(wasteUnit) {
        wasteUnit.innerHTML = "";
        ["gram", "ml", "pcs", "pack"].forEach(u => {
            const opt = document.createElement("option"); opt.value = u; opt.textContent = u; wasteUnit.appendChild(opt);
        });
    }
}

moveSearch?.addEventListener("input", fillSelects);
moveItemSelect?.addEventListener("change", () => {
    const id = moveItemSelect.value;
    const it = items.find(x => x.id === id);
    if(it && moveInfo) moveInfo.textContent = `Stok W1: ${it.stockW1} | Rest: ${it.stockRest} | W2: ${it.stockW2}`;
});

async function processTransfer() {
    const itemId = moveItemSelect?.value;
    const type = transferType?.value;
    const qtyP = clampInt(moveQtyPack?.value);
    const qtyL = clampInt(moveQtyLoose?.value);
    if(!itemId || (qtyP===0 && qtyL===0)) return showToast("Data transfer tidak lengkap", "error");

    const it = items.find(x => x.id === itemId);
    const pq = getPackQty(it);
    const totalTx = (qtyP * pq) + qtyL;

    let srcP, srcL, dstP, dstL;
    if(type === 'w1_to_w2') { srcP='stockW1'; srcL='stockW1Loose'; dstP='stockW2'; dstL='stockW2Loose'; }
    else if (type === 'w1_to_bar') { srcP='stockW1'; srcL='stockW1Loose'; dstP='stockBar'; dstL='stockBarLoose'; }
    else if (type === 'rest_to_bar') { srcP='stockRest'; srcL='stockRestLoose'; dstP='stockBar'; dstL='stockBarLoose'; }
    else if (type === 'w2_to_kitchen') { srcP='stockW2'; srcL='stockW2Loose'; dstP='stockKitchen'; dstL='stockKitchenLoose'; }

    const curSrc = toTotalUnits(it[srcP], it[srcL], pq);
    if(totalTx > curSrc) return showToast(`Stok tidak cukup! Max: ${curSrc}`, "error");

    const newSrc = splitUnitsToPackLoose(curSrc - totalTx, pq);
    const curDst = toTotalUnits(it[dstP], it[dstL], pq);
    const newDst = splitUnitsToPackLoose(curDst + totalTx, pq);

    try {
        const payload = { updatedAt: serverTimestamp() };
        payload[srcP] = newSrc.packs; payload[srcL] = newSrc.loose;
        payload[dstP] = newDst.packs; payload[dstL] = newDst.loose;
        await updateDoc(doc(db, "wh_items", itemId), payload);
        await addDoc(colWhTx, {
            type: "TRANSFER", subtype: type, itemId, itemName: it.name,
            qtyTotalUnits: totalTx, createdBy: currentUser.email, createdAt: serverTimestamp()
        });
        showToast("Transfer Berhasil", "success");
        moveQtyPack.value = ""; moveQtyLoose.value = "";
        await loadWhItems(); renderOpnameTable(); updateDashboard();
    } catch(e) { showToast("Gagal: " + e.message, "error"); }
}
btnMove?.addEventListener("click", processTransfer);

// ===================== OPNAME TABLE =====================
function renderOpnameTable() {
    if(!whOpnameTableBody) return;
    whOpnameTableBody.innerHTML = "";
    const gudang = whOpnameGudang?.value || 'w1';
    const kw = (whOpnameSearch?.value || "").toLowerCase();
    const showSmall = whOpnameModeSmall?.checked;

    let filtered = items.filter(it => it.name.toLowerCase().includes(kw));
    if(filtered.length === 0) { whOpnameTableBody.innerHTML = `<tr><td colspan="6">Item tidak ditemukan</td></tr>`; return; }

    filtered.forEach(it => {
        const tr = document.createElement("tr");
        const pq = getPackQty(it);
        const stock = getItemStock(it, gudang);
        
        const displayStock = showSmall 
            ? `${toTotalUnits(stock.packs, stock.loose, pq)} ${it.unitSmall}`
            : `${stock.packs} ${it.unitBig} + ${stock.loose} ${it.unitSmall}`;

        tr.innerHTML = `
            <td>${escapeHtml(it.name)}</td>
            <td>${it.unitBig}/${it.unitSmall} (isi ${pq})</td>
            <td style="text-transform:capitalize; font-weight:bold;">${gudang}</td>
            <td>${displayStock}</td>
            <td>
                <div style="display:flex; gap:4px;">
                   <input type="number" class="op-pack" placeholder="Dus" value="${stock.packs}" style="width:60px;">
                   <input type="number" class="op-loose" placeholder="Pcs" value="${stock.loose}" style="width:60px;">
                </div>
            </td>
            <td>${iconBtn('<i class="lucide-save"></i>', "Simpan", "btn-save-row")}</td>
        `;
        tr.querySelector(".btn-save-row").addEventListener("click", () => saveOpnameSingle(it, gudang, tr));
        whOpnameTableBody.appendChild(tr);
    });
}

async function saveOpnameSingle(it, gudang, tr) {
    const newPack = clampInt(tr.querySelector(".op-pack").value);
    const newLoose = clampInt(tr.querySelector(".op-loose").value);
    
    let fP, fL;
    if(gudang === 'w1') { fP = 'stockW1'; fL = 'stockW1Loose'; }
    else if(gudang === 'w2') { fP = 'stockW2'; fL = 'stockW2Loose'; }
    else if(gudang === 'rest') { fP = 'stockRest'; fL = 'stockRestLoose'; }
    else if(gudang === 'bar') { fP = 'stockBar'; fL = 'stockBarLoose'; }
    else if(gudang === 'kitchen') { fP = 'stockKitchen'; fL = 'stockKitchenLoose'; }

    try {
        const payload = { updatedAt: serverTimestamp() };
        payload[fP] = newPack; payload[fL] = newLoose;
        await updateDoc(doc(db, "wh_items", it.id), payload);
        showToast(`Stok ${gudang} diupdate!`, "success");
        await loadWhItems(); renderOpnameTable(); updateDashboard();
    } catch(e) { showToast("Gagal: " + e.message, "error"); }
}
whOpnameGudang?.addEventListener("change", renderOpnameTable);
whOpnameSearch?.addEventListener("input", renderOpnameTable);
whOpnameModeSmall?.addEventListener("change", renderOpnameTable);

// ===================== WASTE INPUT & HISTORY =====================
async function saveWaste() {
    if (!currentUser) return showToast("Harus login", "error");
    const name = wasteItemSelect?.value;
    const qty = clampInt(wasteQty?.value);
    const unit = wasteUnit?.value;
    const date = wasteDate?.value;
    
    if(!name || !date || qty <= 0) return showToast("Data waste tidak valid", "error");

    try {
        await addDoc(colWhWaste, {
            itemId: 'manual', itemName: name,
            qty, unit, dateKey: date, note: wasteNote?.value || "",
            createdBy: currentUser.email, createdAt: serverTimestamp()
        });
        showToast("Waste tersimpan", "success");
        wasteQty.value = ""; wasteNote.value = "";
        loadWasteLogsAndRender();
    } catch(e) { showToast("Gagal: " + e.message, "error"); }
}
btnSaveWaste?.addEventListener("click", saveWaste);

async function loadWasteLogsAndRender() {
    if(!wasteHistoryBody) return;
    const start = parseDateOnly(wasteFilterStart.value);
    const end = parseDateOnly(wasteFilterEnd.value);
    if(!start || !end) return;

    const sKey = todayKey(start);
    const eKey = todayKey(end);
    
    const snap = await getDocs(query(colWhWaste, orderBy("createdAt", "desc"), limit(100)));
    wasteHistoryBody.innerHTML = "";
    
    snap.forEach(d => {
        const w = d.data();
        if((w.dateKey || "") >= sKey && (w.dateKey || "") <= eKey) {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${w.dateKey}</td>
                <td>${escapeHtml(w.itemName)}</td>
                <td>${w.qty}</td>
                <td>${w.unit}</td>
                <td>${escapeHtml(w.note)}</td>
                <td>${iconBtn('<i class="lucide-trash-2"></i>', "Hapus", "btn-del-waste")}</td>
            `;
            tr.querySelector(".btn-del-waste").addEventListener("click", async () => {
                if(confirm("Hapus waste ini?")) { await deleteDoc(doc(db, "wh_waste", d.id)); loadWasteLogsAndRender(); }
            });
            wasteHistoryBody.appendChild(tr);
        }
    });
}
wasteFilterStart?.addEventListener("change", loadWasteLogsAndRender);
wasteFilterEnd?.addEventListener("change", loadWasteLogsAndRender);

// ===================== REPORTING =====================
btnWeekThis?.addEventListener("click", () => setReportRangeByWeekOffset(0));
btnWeekLast?.addEventListener("click", () => setReportRangeByWeekOffset(1));

async function generateReport() {
    if(!whReportHead || !whReportBody) return;
    const type = whReportType.value;
    const start = parseDateOnly(whReportStart.value);
    const end = parseDateOnly(whReportEnd.value);

    whReportHead.innerHTML = "";
    whReportBody.innerHTML = "";

    if (type === 'total_asset') {
        // REPORT 1: TOTAL ALL GUDANG (SNAPSHOT)
        whReportHead.innerHTML = `<th>Item</th><th>Isi/Dus</th><th>Total Dus</th><th>Total Pcs</th><th>Estimasi Pcs</th>`;
        items.forEach(it => {
            const pq = getPackQty(it);
            const totalPacks = (it.stockW1||0) + (it.stockW2||0) + (it.stockRest||0) + (it.stockBar||0) + (it.stockKitchen||0);
            const totalLoose = (it.stockW1Loose||0) + (it.stockW2Loose||0) + (it.stockRestLoose||0) + (it.stockBarLoose||0) + (it.stockKitchenLoose||0);
            const grandTotal = toTotalUnits(totalPacks, totalLoose, pq);
            const split = splitUnitsToPackLoose(grandTotal, pq);

            const tr = document.createElement("tr");
            tr.innerHTML = `<td>${it.name}</td><td>${pq}</td><td>${split.packs}</td><td>${split.loose}</td><td>${grandTotal}</td>`;
            whReportBody.appendChild(tr);
        });
        showToast("Laporan Total Aset Selesai", "success");

    } else if (type === 'waste') {
        // REPORT 2: WASTE LOGS
        if(!start || !end) return showToast("Pilih tanggal dulu", "error");
        
        // Manual filter karena Firestore query ribet dengan date string
        const sKey = todayKey(start);
        const eKey = todayKey(end);
        const snap = await getDocs(query(colWhWaste, orderBy("createdAt", "desc"), limit(500)));
        
        whReportHead.innerHTML = `<th>Tanggal</th><th>Item</th><th>Qty</th><th>Satuan</th><th>Ket</th>`;
        let count = 0;
        
        snap.forEach(d => {
            const w = d.data();
            if((w.dateKey || "") >= sKey && (w.dateKey || "") <= eKey) {
                const tr = document.createElement("tr");
                tr.innerHTML = `<td>${w.dateKey}</td><td>${w.itemName}</td><td>${w.qty}</td><td>${w.unit}</td><td>${w.note}</td>`;
                whReportBody.appendChild(tr);
                count++;
            }
        });
        if(count===0) whReportBody.innerHTML = `<tr><td colspan="5">Tidak ada data waste</td></tr>`;
        showToast(`Laporan Waste Selesai (${count} baris)`, "success");
    }
}
btnWhReport?.addEventListener("click", generateReport);

// ===================== INIT =====================
onAuthStateChanged(auth, async (u) => {
  currentUser = u;
  if (u) {
    await loadWhItems();
    fillSelects();
    updateDashboard();
    renderOpnameTable();
    setReportRangeByWeekOffset(0); // Default date
  }
});
