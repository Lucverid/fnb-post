// warehouse.js (FULL) — MULTI GUDANG (W1, W2, Rest, Bar, Kitchen) + Laporan Total
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

function csvEscape(value) {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
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

// ===================== CORE LOGIC: UNITS & STOCK =====================
function getPackQty(it) {
  const pq = clampInt(it?.packQty, 0);
  return pq > 0 ? pq : 1;
}

// Helper: Hitung total pcs dari Dus + Pcs
function toTotalUnits(packs, loose, packQty) {
  return (clampInt(packs) * clampInt(packQty)) + clampInt(loose);
}

// Helper: Konversi total pcs kembali ke {packs, loose}
function splitUnitsToPackLoose(totalUnits, packQty) {
  const t = Math.max(0, clampInt(totalUnits, 0));
  const pq = Math.max(1, clampInt(packQty, 1));
  const packs = Math.floor(t / pq);
  const loose = t % pq;
  return { packs, loose };
}

// Helper: Ambil stok berdasarkan kode gudang
// w1, w2, rest, bar, kitchen
function getItemStock(it, gudang) {
  if (gudang === 'w1') return { packs: it.stockW1 || 0, loose: it.stockW1Loose || 0 };
  if (gudang === 'w2') return { packs: it.stockW2 || 0, loose: it.stockW2Loose || 0 };
  if (gudang === 'rest') return { packs: it.stockRest || 0, loose: it.stockRestLoose || 0 };
  if (gudang === 'bar') return { packs: it.stockBar || 0, loose: it.stockBarLoose || 0 };
  if (gudang === 'kitchen') return { packs: it.stockKitchen || 0, loose: it.stockKitchenLoose || 0 };
  return { packs: 0, loose: 0 };
}

// Helper: Normalisasi data item (pastikan field ada)
function normalizeItemStock(it) {
  return {
    stockW1: clampInt(it.stockW1), stockW1Loose: clampInt(it.stockW1Loose),
    stockW2: clampInt(it.stockW2), stockW2Loose: clampInt(it.stockW2Loose),
    stockRest: clampInt(it.stockRest), stockRestLoose: clampInt(it.stockRestLoose),
    stockBar: clampInt(it.stockBar), stockBarLoose: clampInt(it.stockBarLoose),
    stockKitchen: clampInt(it.stockKitchen), stockKitchenLoose: clampInt(it.stockKitchenLoose),
  };
}

// ===================== Collections =====================
const colWhItems = collection(db, "wh_items");
const colWhTx = collection(db, "wh_tx");
const colWhOpname = collection(db, "wh_opname_logs");

// ===================== DOM Elements =====================
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
const whItemInitStockRest = $("whItemInitStockRest"); // Baru
const btnSaveItem = $("btnSaveItem");

// Transfer
const moveSearch = $("moveSearch");
const moveItemSelect = $("moveItemSelect");
const transferType = $("transferType"); // Baru
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
const whReportStart = $("whReportStart");
const whReportEnd = $("whReportEnd");
const btnWhReport = $("btnWhReport");
const btnWhReportDownload = $("btnWhReportDownload") || $("btnWhReportCsv");
const whReportHead = $("whReportHead");
const whReportBody = $("whReportBody");

let currentUser = null;
let items = [];

// ===================== Navigation =====================
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

// ===================== MASTER ITEM =====================
async function createMasterItem() {
  if (!currentUser) return showToast("Harus login", "error");

  const name = (whItemName?.value || "").trim();
  const unitBig = (whItemUnitBig?.value || "").trim();
  const unitSmall = (whItemUnitSmall?.value || "").trim();
  const packQty = Number(whItemPackQty?.value || 0);
  
  // Stok Awal W1 & Rest
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
    // Init Stocks
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
    showToast("Master item tersimpan (W1 & Istirahat)", "success");
    
    // Reset Form
    whItemName.value = "";
    whItemInitStockW1.value = "";
    whItemInitStockRest.value = "";
    
    await loadWhItems();
    fillMoveSelect(moveSearch?.value || "");
    renderOpnameTable();
  } catch (e) {
    console.error(e);
    showToast("Gagal: " + e.message, "error");
  }
}

btnSaveItem?.addEventListener("click", createMasterItem);

// ===================== TRANSFER LOGIC =====================
function fillMoveSelect(keyword = "") {
  if (!moveItemSelect) return;
  const kw = (keyword || "").trim().toLowerCase();
  moveItemSelect.innerHTML = `<option value="">Pilih item...</option>`;

  items.forEach((it) => {
    if (kw && !it.name.toLowerCase().includes(kw)) return;
    const opt = document.createElement("option");
    opt.value = it.id;
    // Tampilkan stok W1 & Rest di dropdown biar user tau
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

    // Tentukan sumber stok berdasarkan tipe transfer
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

    moveInfo.textContent = `Sumber: ${sourceLabel} | Stok Tersedia: ${sourceStock.p} ${it.unitBig} + ${sourceStock.l} ${it.unitSmall}`;
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

    // Tentukan field Source dan Destination di Firestore
    let srcFieldP, srcFieldL, destFieldP, destFieldL;
    
    if(type === 'w1_to_w2') {
        srcFieldP = 'stockW1'; srcFieldL = 'stockW1Loose';
        destFieldP = 'stockW2'; destFieldL = 'stockW2Loose';
    } else if (type === 'w1_to_bar') {
        srcFieldP = 'stockW1'; srcFieldL = 'stockW1Loose';
        destFieldP = 'stockBar'; destFieldL = 'stockBarLoose';
    } else if (type === 'rest_to_bar') {
        srcFieldP = 'stockRest'; srcFieldL = 'stockRestLoose';
        destFieldP = 'stockBar'; destFieldL = 'stockBarLoose';
    } else if (type === 'w2_to_kitchen') {
        srcFieldP = 'stockW2'; srcFieldL = 'stockW2Loose';
        destFieldP = 'stockKitchen'; destFieldL = 'stockKitchenLoose';
    }

    // Cek Stok Cukup
    const currentSrcUnits = toTotalUnits(it[srcFieldP], it[srcFieldL], pq);
    if (totalTransferUnits > currentSrcUnits) {
        return showToast(`Stok sumber tidak cukup! Max: ${currentSrcUnits} units`, "error");
    }

    // Hitung Stok Baru Sumber
    const newSrcUnits = currentSrcUnits - totalTransferUnits;
    const newSrcSplit = splitUnitsToPackLoose(newSrcUnits, pq);

    // Hitung Stok Baru Tujuan
    const currentDestUnits = toTotalUnits(it[destFieldP], it[destFieldL], pq);
    const newDestUnits = currentDestUnits + totalTransferUnits;
    const newDestSplit = splitUnitsToPackLoose(newDestUnits, pq);

    try {
        const updatePayload = { updatedAt: serverTimestamp() };
        updatePayload[srcFieldP] = newSrcSplit.packs;
        updatePayload[srcFieldL] = newSrcSplit.loose;
        updatePayload[destFieldP] = newDestSplit.packs;
        updatePayload[destFieldL] = newDestSplit.loose;

        await updateDoc(doc(db, "wh_items", itemId), updatePayload);
        
        // Log Transaksi
        await addDoc(colWhTx, {
            type: "TRANSFER",
            subtype: type,
            itemId, itemName: it.name,
            qtyTotalUnits: totalTransferUnits,
            desc: `Transfer ${qtyP} Dus + ${qtyL} Pcs`,
            createdBy: currentUser.email,
            createdAt: serverTimestamp()
        });

        showToast("Transfer Berhasil ✅", "success");
        moveQtyPack.value = ""; moveQtyLoose.value = "";
        await loadWhItems();
        fillMoveSelect(moveSearch.value);
        renderOpnameTable();
    } catch (e) {
        console.error(e);
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

    if(filtered.length === 0) {
        whOpnameTableBody.innerHTML = `<tr><td colspan="6">Item tidak ditemukan</td></tr>`;
        return;
    }

    filtered.forEach(it => {
        const tr = document.createElement("tr");
        const pq = getPackQty(it);
        const stock = getItemStock(it, gudang); // Ambil stok sesuai gudang yg dipilih
        
        // Label Stok
        const displayStock = showSmall 
            ? `${toTotalUnits(stock.packs, stock.loose, pq)} ${it.unitSmall}`
            : `${stock.packs} ${it.unitBig} + ${stock.loose} ${it.unitSmall}`;

        // Input Value (Default 0 atau stok saat ini agar mudah diedit)
        const valPack = stock.packs;
        const valLoose = stock.loose;

        tr.innerHTML = `
            <td>${escapeHtml(it.name)}</td>
            <td>${it.unitBig}/${it.unitSmall} (isi ${pq})</td>
            <td style="text-transform:capitalize; font-weight:bold;">${gudang}</td>
            <td>${displayStock}</td>
            <td>
                <div style="display:flex; gap:4px;">
                   <input type="number" class="op-pack" data-id="${it.id}" placeholder="Dus" value="${valPack}" style="width:60px;">
                   <input type="number" class="op-loose" data-id="${it.id}" placeholder="Pcs" value="${valLoose}" style="width:60px;">
                </div>
            </td>
            <td>
                ${iconBtn('<i class="lucide-save"></i>', "Simpan", "btn-save-row")}
            </td>
        `;

        // Event Simpan Per Baris
        tr.querySelector(".btn-save-row").addEventListener("click", () => saveOpnameSingle(it, gudang, tr));
        whOpnameTableBody.appendChild(tr);
    });
}

async function saveOpnameSingle(it, gudang, tr) {
    const inpPack = tr.querySelector(".op-pack").value;
    const inpLoose = tr.querySelector(".op-loose").value;
    
    const newPack = clampInt(inpPack);
    const newLoose = clampInt(inpLoose);

    // Tentukan field update
    let fP, fL;
    if(gudang === 'w1') { fP = 'stockW1'; fL = 'stockW1Loose'; }
    else if(gudang === 'w2') { fP = 'stockW2'; fL = 'stockW2Loose'; }
    else if(gudang === 'rest') { fP = 'stockRest'; fL = 'stockRestLoose'; }
    else if(gudang === 'bar') { fP = 'stockBar'; fL = 'stockBarLoose'; }
    else if(gudang === 'kitchen') { fP = 'stockKitchen'; fL = 'stockKitchenLoose'; }

    try {
        const payload = { updatedAt: serverTimestamp() };
        payload[fP] = newPack;
        payload[fL] = newLoose;

        await updateDoc(doc(db, "wh_items", it.id), payload);
        
        // Log
        await addDoc(colWhOpname, {
            dateKey: todayKey(),
            itemId: it.id, itemName: it.name,
            gudang,
            newPack, newLoose,
            createdBy: currentUser.email,
            createdAt: serverTimestamp()
        });

        showToast(`Opname ${it.name} di ${gudang} tersimpan!`, "success");
        await loadWhItems(); // Reload data local
        renderOpnameTable(); // Refresh table
    } catch(e) {
        showToast("Gagal: " + e.message, "error");
    }
}

whOpnameGudang?.addEventListener("change", renderOpnameTable);
whOpnameSearch?.addEventListener("input", renderOpnameTable);
whOpnameModeSmall?.addEventListener("change", renderOpnameTable);

// ===================== REPORTING (TOTAL SEMUA GUDANG) =====================
async function generateReport() {
    if(!whReportHead || !whReportBody) return;
    
    // Header Laporan
    whReportHead.innerHTML = `
        <th>Item</th>
        <th>Isi/Dus</th>
        <th>Total Dus (Semua Gudang)</th>
        <th>Total Pcs (Semua Gudang)</th>
        <th>Total Value (Estimasi Unit Kecil)</th>
    `;
    
    whReportBody.innerHTML = "";

    // Kalkulasi
    items.forEach(it => {
        const pq = getPackQty(it);

        // Jumlahkan semua lokasi
        const totalPacks = (it.stockW1||0) + (it.stockW2||0) + (it.stockRest||0) + (it.stockBar||0) + (it.stockKitchen||0);
        const totalLoose = (it.stockW1Loose||0) + (it.stockW2Loose||0) + (it.stockRestLoose||0) + (it.stockBarLoose||0) + (it.stockKitchenLoose||0);
        
        // Normalisasi (jika loose >= packQty, jadikan pack)
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

    showToast("Laporan Total Stok Generated!", "success");
}

function downloadCSV() {
    if(!items.length) return showToast("Data kosong", "error");
    let csv = "Item,IsiPerDus,TotalDus,TotalPcs,TotalUnitKecil\n";
    
    items.forEach(it => {
        const pq = getPackQty(it);
        const totalPacks = (it.stockW1||0) + (it.stockW2||0) + (it.stockRest||0) + (it.stockBar||0) + (it.stockKitchen||0);
        const totalLoose = (it.stockW1Loose||0) + (it.stockW2Loose||0) + (it.stockRestLoose||0) + (it.stockBarLoose||0) + (it.stockKitchenLoose||0);
        const grandTotalUnits = toTotalUnits(totalPacks, totalLoose, pq);
        const split = splitUnitsToPackLoose(grandTotalUnits, pq);

        csv += `"${it.name}",${pq},${split.packs},${split.loose},${grandTotalUnits}\n`;
    });
    
    downloadText(`Laporan_Total_Stok_${todayKey()}.csv`, csv);
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
  }
});
