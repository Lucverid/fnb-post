// warehouse.js (FULL) — FIXED: Multi-Gudang + Restore Date Filters & Waste Report
// =====================================================================================

import { getApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import {
  getFirestore, collection, addDoc, getDocs, query, orderBy, updateDoc, doc, serverTimestamp, limit, deleteDoc, where
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

const app = getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const $ = (id) => document.getElementById(id);

// ===================== UTILS & DATE HELPERS =====================
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

// --- DATE FILTER LOGIC ---
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

  showToast(weekOffset === 0 ? "Minggu Ini" : weekOffset === 1 ? "Minggu Lalu" : "2 Minggu Lalu", "info");
}

// ===================== CORE LOGIC =====================
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

// ===================== DOM =====================
const whOpnameSection = $("whOpnameSection");
const whReportSection = $("whReportSection");
const navWhOpname = $("navWhOpname");
const navWhReport = $("navWhReport");

// Form Master
const whItemName = $("whItemName");
const whItemUnitBig = $("whItemUnitBig");
const whItemUnitSmall = $("whItemUnitSmall");
const whItemPackQty = $("whItemPackQty");
const whItemInitStockW1 = $("whItemInitStockW1");
const whItemInitStockRest = $("whItemInitStockRest");
const btnSaveItem = $("btnSaveItem");

// Transfer
const moveSearch = $("moveSearch");
const moveItemSelect = $("moveItemSelect");
const transferType = $("transferType");
const moveQtyPack = $("moveQtyPack");
const moveQtyLoose = $("moveQtyLoose");
const moveInfo = $("moveInfo");
const btnMove = $("btnMove");

// Opname Table
const whOpnameGudang = $("whOpnameGudang");
const whOpnameSearch = $("whOpnameSearch");
const whOpnameTableBody = $("whOpnameTableBody");
const btnOpnameSaveAll = $("btnOpnameSaveAll");
const whOpnameModeSmall = $("whOpnameModeSmall");

// Report
const whReportType = $("whReportType");
const whReportStart = $("whReportStart");
const whReportEnd = $("whReportEnd");
const btnWhReport = $("btnWhReport");
const btnWhReportDownload = $("btnWhReportDownload");
const whReportHead = $("whReportHead");
const whReportBody = $("whReportBody");

// Report Filters
const btnWeekThis = $("btnWeekThis");
const btnWeekLast = $("btnWeekLast");
const btnWeekPrev2 = $("btnWeekPrev2");

let currentUser = null;
let items = [];
let wasteLogs = [];
let batchLogs = [];

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

// Load Waste (Filter Tanggal)
async function loadWasteLogs(rangeStart, rangeEnd) {
  const snap = await getDocs(query(colWhWaste, orderBy("createdAt", "desc"), limit(500)));
  wasteLogs = [];
  const sKey = todayKey(rangeStart);
  const eKey = todayKey(rangeEnd);
  
  snap.forEach((d) => {
    const data = d.data();
    if((data.dateKey || "") >= sKey && (data.dateKey || "") <= eKey){
        wasteLogs.push({ id: d.id, ...data });
    }
  });
}

// Load Barang Masuk (Filter Tanggal)
async function loadBatchLogs(rangeStart, rangeEnd) {
  const snap = await getDocs(query(colWhBatches, orderBy("receivedAt", "desc"), limit(500)));
  batchLogs = [];
  const sKey = todayKey(rangeStart);
  const eKey = todayKey(rangeEnd);

  snap.forEach((d) => {
    const data = d.data();
    if((data.receivedAt || "") >= sKey && (data.receivedAt || "") <= eKey){
        batchLogs.push({ id: d.id, ...data });
    }
  });
}

// ===================== NAVIGATION =====================
function setActiveNav(btn) {
  document.querySelectorAll(".side-item").forEach((b) => b.classList.remove("active"));
  if (btn) btn.classList.add("active");
}

function showSection(id) {
  document.querySelectorAll(".section").forEach(s => s.classList.add("hidden"));
  const el = $(id);
  if (el) el.classList.remove("hidden");
}

navWhOpname?.addEventListener("click", () => {
  setActiveNav(navWhOpname);
  showSection("whOpnameSection");
  renderOpnameTable();
});

navWhReport?.addEventListener("click", () => {
  setActiveNav(navWhReport);
  showSection("whReportSection");
  if(!whReportStart.value) setReportRangeByWeekOffset(0); // Default minggu ini
});

// ===================== MASTER ITEM =====================
async function createMasterItem() {
  if (!currentUser) return showToast("Harus login", "error");

  const name = (whItemName?.value || "").trim();
  const unitBig = (whItemUnitBig?.value || "").trim();
  const unitSmall = (whItemUnitSmall?.value || "").trim();
  const packQty = Number(whItemPackQty?.value || 0);
  const initW1 = clampInt(whItemInitStockW1?.value);
  const initRest = clampInt(whItemInitStockRest?.value);

  if (!name) return showToast("Nama item wajib diisi", "error");
  if (!packQty || packQty <= 0) return showToast("Isi per dus wajib > 0", "error");

  const docData = {
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
    createdBy: currentUser.email || "-",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await addDoc(colWhItems, docData);
    showToast("Item tersimpan (W1 & Istirahat)", "success");
    whItemName.value = ""; whItemInitStockW1.value = ""; whItemInitStockRest.value = "";
    await loadWhItems();
    fillMoveSelect(moveSearch?.value || "");
    renderOpnameTable();
  } catch (e) {
    console.error(e);
    showToast("Gagal: " + e.message, "error");
  }
}
btnSaveItem?.addEventListener("click", createMasterItem);

// ===================== TRANSFER =====================
function fillMoveSelect(keyword = "") {
  if (!moveItemSelect) return;
  const kw = (keyword || "").trim().toLowerCase();
  moveItemSelect.innerHTML = `<option value="">Pilih item...</option>`;
  items.forEach((it) => {
    if (kw && !it.name.toLowerCase().includes(kw)) return;
    const opt = document.createElement("option");
    opt.value = it.id;
    opt.textContent = `${it.name} (W1: ${it.stockW1}, Rest: ${it.stockRest})`;
    moveItemSelect.appendChild(opt);
  });
  updateMoveInfo();
}

function updateMoveInfo() {
    if(!moveInfo) return;
    const id = moveItemSelect?.value;
    const it = items.find(x => x.id === id);
    if(!it) { moveInfo.textContent = ""; return; }
    
    const type = transferType.value;
    let sourceLabel = "";
    let sourceStock = {p:0, l:0};

    if(type === 'w1_to_w2' || type === 'w1_to_bar') {
        sourceLabel = "Gudang 1";
        sourceStock = {p: it.stockW1, l: it.stockW1Loose};
    } else if (type === 'rest_to_bar') {
        sourceLabel = "Gudang Istirahat";
        sourceStock = {p: it.stockRest, l: it.stockRestLoose};
    } else if (type === 'w2_to_kitchen') {
        sourceLabel = "Gudang 2";
        sourceStock = {p: it.stockW2, l: it.stockW2Loose};
    }
    moveInfo.textContent = `Sumber: ${sourceLabel} | Stok: ${sourceStock.p} ${it.unitBig} + ${sourceStock.l} ${it.unitSmall}`;
}

async function processTransfer() {
    if (!currentUser) return showToast("Harus login", "error");
    const itemId = moveItemSelect?.value;
    const type = transferType?.value;
    const qtyP = clampInt(moveQtyPack?.value);
    const qtyL = clampInt(moveQtyLoose?.value);

    if(!itemId) return showToast("Pilih item", "error");
    if(qtyP === 0 && qtyL === 0) return showToast("Qty tidak boleh kosong", "error");

    const it = items.find(x => x.id === itemId);
    const pq = getPackQty(it);
    const totalTransferUnits = (qtyP * pq) + qtyL;

    let srcFieldP, srcFieldL, destFieldP, destFieldL;
    if(type === 'w1_to_w2') { srcFieldP = 'stockW1'; srcFieldL = 'stockW1Loose'; destFieldP = 'stockW2'; destFieldL = 'stockW2Loose'; }
    else if (type === 'w1_to_bar') { srcFieldP = 'stockW1'; srcFieldL = 'stockW1Loose'; destFieldP = 'stockBar'; destFieldL = 'stockBarLoose'; }
    else if (type === 'rest_to_bar') { srcFieldP = 'stockRest'; srcFieldL = 'stockRestLoose'; destFieldP = 'stockBar'; destFieldL = 'stockBarLoose'; }
    else if (type === 'w2_to_kitchen') { srcFieldP = 'stockW2'; srcFieldL = 'stockW2Loose'; destFieldP = 'stockKitchen'; destFieldL = 'stockKitchenLoose'; }

    const currentSrcUnits = toTotalUnits(it[srcFieldP], it[srcFieldL], pq);
    if (totalTransferUnits > currentSrcUnits) return showToast(`Stok tidak cukup! Max: ${currentSrcUnits}`, "error");

    const newSrcSplit = splitUnitsToPackLoose(currentSrcUnits - totalTransferUnits, pq);
    const currentDestUnits = toTotalUnits(it[destFieldP], it[destFieldL], pq);
    const newDestSplit = splitUnitsToPackLoose(currentDestUnits + totalTransferUnits, pq);

    try {
        const updatePayload = { updatedAt: serverTimestamp() };
        updatePayload[srcFieldP] = newSrcSplit.packs;
        updatePayload[srcFieldL] = newSrcSplit.loose;
        updatePayload[destFieldP] = newDestSplit.packs;
        updatePayload[destFieldL] = newDestSplit.loose;

        await updateDoc(doc(db, "wh_items", itemId), updatePayload);
        await addDoc(colWhTx, {
            type: "TRANSFER", subtype: type, itemId, itemName: it.name,
            qtyTotalUnits: totalTransferUnits, desc: `Transfer ${qtyP} Dus + ${qtyL} Pcs`,
            createdBy: currentUser.email, createdAt: serverTimestamp()
        });

        showToast("Transfer Berhasil ✅", "success");
        moveQtyPack.value = ""; moveQtyLoose.value = "";
        await loadWhItems();
        fillMoveSelect(moveSearch.value);
        renderOpnameTable();
    } catch (e) {
        showToast("Gagal Transfer: " + e.message, "error");
    }
}

moveSearch?.addEventListener("input", () => fillMoveSelect(moveSearch.value));
moveItemSelect?.addEventListener("change", updateMoveInfo);
transferType?.addEventListener("change", updateMoveInfo);
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
        await addDoc(colWhOpname, {
            dateKey: todayKey(), itemId: it.id, itemName: it.name, gudang, newPack, newLoose,
            createdBy: currentUser.email, createdAt: serverTimestamp()
        });
        showToast(`Opname ${it.name} di ${gudang} tersimpan!`, "success");
        await loadWhItems(); renderOpnameTable();
    } catch(e) { showToast("Gagal: " + e.message, "error"); }
}

whOpnameGudang?.addEventListener("change", renderOpnameTable);
whOpnameSearch?.addEventListener("input", renderOpnameTable);
whOpnameModeSmall?.addEventListener("change", renderOpnameTable);

// ===================== REPORTING SYSTEM (Total + Waste + History) =====================
btnWeekThis?.addEventListener("click", () => setReportRangeByWeekOffset(0));
btnWeekLast?.addEventListener("click", () => setReportRangeByWeekOffset(1));
btnWeekPrev2?.addEventListener("click", () => setReportRangeByWeekOffset(2));

async function generateReport() {
    if(!whReportHead || !whReportBody) return;
    const type = whReportType.value;
    const start = parseDateOnly(whReportStart.value);
    const end = parseDateOnly(whReportEnd.value);

    // Validasi Tanggal (Kecuali laporan Total Aset yang sifatnya snapshot)
    if(type !== 'total_asset' && (!start || !end)) return showToast("Pilih rentang tanggal dulu", "error");

    whReportHead.innerHTML = "";
    whReportBody.innerHTML = "";

    if (type === 'total_asset') {
        // --- 1. LAPORAN TOTAL ASET (MULTI GUDANG) ---
        whReportHead.innerHTML = `
            <th>Item</th>
            <th>Isi/Dus</th>
            <th>Total Dus (All)</th>
            <th>Total Pcs (All)</th>
            <th>Estimasi Unit Kecil</th>
        `;
        items.forEach(it => {
            const pq = getPackQty(it);
            const totalPacks = (it.stockW1||0) + (it.stockW2||0) + (it.stockRest||0) + (it.stockBar||0) + (it.stockKitchen||0);
            const totalLoose = (it.stockW1Loose||0) + (it.stockW2Loose||0) + (it.stockRestLoose||0) + (it.stockBarLoose||0) + (it.stockKitchenLoose||0);
            const grandTotalUnits = toTotalUnits(totalPacks, totalLoose, pq);
            const split = splitUnitsToPackLoose(grandTotalUnits, pq);

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${escapeHtml(it.name)}</td>
                <td>${pq} ${it.unitSmall}</td>
                <td><b>${split.packs}</b> ${it.unitBig}</td>
                <td><b>${split.loose}</b> ${it.unitSmall}</td>
                <td>${grandTotalUnits} ${it.unitSmall}</td>
            `;
            whReportBody.appendChild(tr);
        });
        showToast("Laporan Total Aset Generated!", "success");

    } else if (type === 'waste') {
        // --- 2. LAPORAN WASTE (DATE FILTER) ---
        await loadWasteLogs(start, end);
        whReportHead.innerHTML = `<th>Tanggal</th><th>Item</th><th>Qty</th><th>Satuan</th><th>Catatan</th><th>User</th>`;
        
        if(!wasteLogs.length) whReportBody.innerHTML = `<tr><td colspan="6">Tidak ada data waste di tanggal ini.</td></tr>`;
        
        wasteLogs.forEach(w => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${w.dateKey}</td>
                <td>${escapeHtml(w.itemName)}</td>
                <td>${w.qty}</td>
                <td>${w.unit}</td>
                <td>${escapeHtml(w.note)}</td>
                <td>${w.createdBy}</td>
            `;
            whReportBody.appendChild(tr);
        });
        showToast("Laporan Waste Generated!", "success");

    } else if (type === 'receiving') {
        // --- 3. LAPORAN BARANG MASUK ---
        await loadBatchLogs(start, end);
        whReportHead.innerHTML = `<th>Terima</th><th>Item</th><th>Supplier</th><th>Qty</th><th>Catatan</th>`;
        
        if(!batchLogs.length) whReportBody.innerHTML = `<tr><td colspan="5">Tidak ada barang masuk.</td></tr>`;

        batchLogs.forEach(b => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${b.receivedAt}</td>
                <td>${escapeHtml(b.itemName)}</td>
                <td>${escapeHtml(b.supplier)}</td>
                <td>${b.qtyPack}</td>
                <td>${escapeHtml(b.note)}</td>
            `;
            whReportBody.appendChild(tr);
        });
        showToast("Laporan Receiving Generated!", "success");
    }
}

function downloadCSV() {
    const type = whReportType.value;
    let csv = "";

    if (type === 'total_asset') {
        csv = "Item,IsiPerDus,TotalDus,TotalPcs,TotalUnitKecil\n";
        items.forEach(it => {
            const pq = getPackQty(it);
            const totalPacks = (it.stockW1||0) + (it.stockW2||0) + (it.stockRest||0) + (it.stockBar||0) + (it.stockKitchen||0);
            const totalLoose = (it.stockW1Loose||0) + (it.stockW2Loose||0) + (it.stockRestLoose||0) + (it.stockBarLoose||0) + (it.stockKitchenLoose||0);
            const grandTotalUnits = toTotalUnits(totalPacks, totalLoose, pq);
            const split = splitUnitsToPackLoose(grandTotalUnits, pq);
            csv += `"${it.name}",${pq},${split.packs},${split.loose},${grandTotalUnits}\n`;
        });
        downloadText(`Total_Asset_${todayKey()}.csv`, csv);

    } else if (type === 'waste') {
        csv = "Tanggal,Item,Qty,Satuan,Catatan,User\n";
        wasteLogs.forEach(w => {
            csv += `"${w.dateKey}","${w.itemName}",${w.qty},${w.unit},"${w.note}","${w.createdBy}"\n`;
        });
        downloadText(`Waste_Report_${todayKey()}.csv`, csv);
    }
}

btnWhReport?.addEventListener("click", generateReport);
btnWhReportDownload?.addEventListener("click", downloadCSV);

// ===================== INIT =====================
onAuthStateChanged(auth, async (u) => {
  currentUser = u;
  if (u) {
    await loadWhItems();
    fillMoveSelect();
    renderOpnameTable();
    // Set default date week this
    setReportRangeByWeekOffset(0);
  }
});
