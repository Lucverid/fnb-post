// warehouse.js (FINAL ROBUST) — Fix Tombol Ngg Berfungsi
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

// ===================== STATE & CONFIG =====================
let currentUser = null;
let items = [];
const LOW_STOCK_LT = 2; 
const HIGH_STOCK_GT = 50; 
const EXP_SOON_DAYS = 7;

const WASTE_PRESET_ITEMS = [
  "Milktea", "Teh Hijau", "Teh Hitam", "Teh Blooming", "Teh oolong", "Boba", "Susu", "Pudding", "Kopi", "Crystal jelly"
];

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

// ===================== DATA & UI =====================
function updateDashboard() {
    const w1Habis = $("w1Habis");
    if(!w1Habis) return;
    
    let cW1 = { habis: 0, low: 0, high: 0 };
    let cW2 = { habis: 0, low: 0, high: 0 };
    let cRest = { habis: 0, low: 0, high: 0 };
    let expOk = 0, expSoon = 0, expBad = 0;
    const now = new Date();

    function getBucket(packEq) {
        if (packEq <= 0.001) return 'habis';
        if (packEq < LOW_STOCK_LT) return 'low';
        if (packEq > HIGH_STOCK_GT) return 'high';
        return 'mid';
    }

    items.forEach(it => {
        const pq = getPackQty(it);
        const s1 = getBucket(toTotalUnits(it.stockW1, it.stockW1Loose, pq) / pq);
        if(s1 === 'habis') cW1.habis++; else if(s1 === 'low') cW1.low++; else if(s1 === 'high') cW1.high++;

        const sRest = getBucket(toTotalUnits(it.stockRest, it.stockRestLoose, pq) / pq);
        if(sRest === 'habis') cRest.habis++; else if(sRest === 'low') cRest.low++; else if(sRest === 'high') cRest.high++;

        const s2 = getBucket(toTotalUnits(it.stockW2, it.stockW2Loose, pq) / pq);
        if(s2 === 'habis') cW2.habis++; else if(s2 === 'low') cW2.low++; else if(s2 === 'high') cW2.high++;

        if(it.expDate) {
            const exp = parseDateOnly(it.expDate);
            if(exp) {
                const diff = Math.floor((exp - now) / (1000 * 60 * 60 * 24));
                if(diff < 0) expBad++; else if(diff <= EXP_SOON_DAYS) expSoon++; else expOk++;
            } else expOk++;
        } else expOk++;
    });

    $("w1Habis").textContent = cW1.habis; $("w1Lumayan").textContent = cW1.low; $("w1Banyak").textContent = cW1.high;
    $("restHabis").textContent = cRest.habis; $("restLumayan").textContent = cRest.low; $("restBanyak").textContent = cRest.high;
    $("w2Habis").textContent = cW2.habis; $("w2Lumayan").textContent = cW2.low; $("w2Banyak").textContent = cW2.high;

    const expiryWrap = $("whExpiryWrap");
    if(expiryWrap) {
        expiryWrap.innerHTML = `
            <div class="metric-row" style="margin-top:10px;">
                <div class="metric-card green"><b>${expOk}</b> Aman</div>
                <div class="metric-card yellow"><b>${expSoon}</b> Mau Exp</div>
                <div class="metric-card red"><b>${expBad}</b> Expired</div>
            </div>
        `;
    }
}

async function loadWhItems() {
  const snap = await getDocs(query(collection(db, "wh_items"), orderBy("name", "asc")));
  items = [];
  snap.forEach((d) => {
    const data = d.data() || {};
    const norm = normalizeItemStock(data);
    items.push({ id: d.id, ...data, ...norm });
  });
}

// ===================== BIND EVENTS (TOMBOL AKTIF) =====================
function bindWarehouseEvents() {
    console.log("Mengaktifkan tombol warehouse...");

    const switchSection = (id) => {
        ["whDashboardSection", "whOpnameSection", "whWasteSection", "whReportSection"].forEach(sId => $(sId)?.classList.add("hidden"));
        $(id)?.classList.remove("hidden");
        ["navWhDashboard", "navWhOpname", "navWhWaste", "navWhReport"].forEach(bId => $(bId)?.classList.remove("active"));
    };

    $("navWhDashboard")?.addEventListener("click", function() {
        switchSection("whDashboardSection");
        this.classList.add("active");
        updateDashboard();
    });

    $("navWhOpname")?.addEventListener("click", function() {
        switchSection("whOpnameSection");
        this.classList.add("active");
        renderOpnameTable();
    });

    $("navWhWaste")?.addEventListener("click", function() {
        switchSection("whWasteSection");
        this.classList.add("active");
        if(!$("wasteFilterStart").value) setReportRangeByWeekOffset(0);
        loadWasteLogsAndRender();
    });

    $("navWhReport")?.addEventListener("click", function() {
        switchSection("whReportSection");
        this.classList.add("active");
        if(!$("whReportStart").value) setReportRangeByWeekOffset(0);
    });

    // Form & Logic
    $("btnSaveItem")?.addEventListener("click", createMasterItem);
    $("moveSearch")?.addEventListener("input", () => fillSelects());
    $("moveItemSelect")?.addEventListener("change", updateMoveInfo);
    $("transferType")?.addEventListener("change", updateMoveInfo);
    $("btnMove")?.addEventListener("click", processTransfer);
    
    $("whOpnameGudang")?.addEventListener("change", renderOpnameTable);
    $("whOpnameSearch")?.addEventListener("input", renderOpnameTable);
    $("whOpnameModeSmall")?.addEventListener("change", renderOpnameTable);

    $("btnSaveWaste")?.addEventListener("click", saveWaste);
    $("wasteFilterStart")?.addEventListener("change", loadWasteLogsAndRender);
    $("wasteFilterEnd")?.addEventListener("change", loadWasteLogsAndRender);

    $("btnWeekThis")?.addEventListener("click", () => setReportRangeByWeekOffset(0));
    $("btnWeekLast")?.addEventListener("click", () => setReportRangeByWeekOffset(1));
    $("btnWhReport")?.addEventListener("click", generateReport);
    $("btnWhReportDownload")?.addEventListener("click", downloadCSV);
}

// ===================== CRUD & LOGIC =====================
async function createMasterItem() {
  if (!currentUser) return showToast("Harus login", "error");
  const name = ($("whItemName")?.value || "").trim();
  const unitBig = ($("whItemUnitBig")?.value || "").trim();
  const unitSmall = ($("whItemUnitSmall")?.value || "").trim();
  const packQty = Number($("whItemPackQty")?.value || 0);
  const initW1 = clampInt($("whItemInitStockW1")?.value);
  const initRest = clampInt($("whItemInitStockRest")?.value);

  if (!name) return showToast("Nama item wajib diisi", "error");
  if (!packQty || packQty <= 0) return showToast("Isi per dus wajib > 0", "error");

  try {
    await addDoc(collection(db, "wh_items"), {
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
    $("whItemName").value = ""; $("whItemInitStockW1").value = ""; $("whItemInitStockRest").value = "";
    await loadWhItems(); fillSelects(); renderOpnameTable();
  } catch (e) { showToast("Gagal: " + e.message, "error"); }
}

function fillSelects() {
    const moveSel = $("moveItemSelect");
    const wasteSel = $("wasteItemSelect");
    const kw = ($("moveSearch")?.value || "").toLowerCase();
    
    if(moveSel) {
        moveSel.innerHTML = `<option value="">Pilih item...</option>`;
        items.forEach(it => {
            if(kw && !it.name.toLowerCase().includes(kw)) return;
            const opt = document.createElement("option");
            opt.value = it.id; opt.textContent = it.name;
            moveSel.appendChild(opt);
        });
    }

    if(wasteSel) {
        wasteSel.innerHTML = `<option value="">Pilih item...</option>`;
        WASTE_PRESET_ITEMS.forEach(n => {
            const opt = document.createElement("option"); opt.value = n; opt.textContent = n; wasteSel.appendChild(opt);
        });
        items.forEach(it => {
            const opt = document.createElement("option"); opt.value = it.name; opt.textContent = it.name; wasteSel.appendChild(opt);
        });
        
        const wasteUnit = $("wasteUnit");
        if(wasteUnit) {
            wasteUnit.innerHTML = "";
            ["gram", "ml", "pcs", "pack"].forEach(u => {
                const opt = document.createElement("option"); opt.value = u; opt.textContent = u; wasteUnit.appendChild(opt);
            });
        }
    }
}

function updateMoveInfo() {
    const id = $("moveItemSelect")?.value;
    const moveInfo = $("moveInfo");
    if(!id || !moveInfo) return;
    const it = items.find(x => x.id === id);
    if(it) moveInfo.textContent = `Stok W1: ${it.stockW1} | Rest: ${it.stockRest} | W2: ${it.stockW2}`;
}

async function processTransfer() {
    const itemId = $("moveItemSelect")?.value;
    const type = $("transferType")?.value;
    const qtyP = clampInt($("moveQtyPack")?.value);
    const qtyL = clampInt($("moveQtyLoose")?.value);
    
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
        await addDoc(collection(db, "wh_tx"), {
            type: "TRANSFER", subtype: type, itemId, itemName: it.name,
            qtyTotalUnits: totalTx, createdBy: currentUser.email, createdAt: serverTimestamp()
        });
        showToast("Transfer Berhasil", "success");
        $("moveQtyPack").value = ""; $("moveQtyLoose").value = "";
        await loadWhItems(); renderOpnameTable(); updateDashboard();
    } catch(e) { showToast("Gagal: " + e.message, "error"); }
}

function renderOpnameTable() {
    const tableBody = $("whOpnameTableBody");
    if(!tableBody) return;
    tableBody.innerHTML = "";
    
    const gudang = $("whOpnameGudang")?.value || 'w1';
    const kw = ($("whOpnameSearch")?.value || "").toLowerCase();
    const showSmall = $("whOpnameModeSmall")?.checked;

    let filtered = items.filter(it => it.name.toLowerCase().includes(kw));
    if(filtered.length === 0) { tableBody.innerHTML = `<tr><td colspan="6">Item tidak ditemukan</td></tr>`; return; }

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
        tableBody.appendChild(tr);
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

async function saveWaste() {
    if (!currentUser) return showToast("Harus login", "error");
    const name = $("wasteItemSelect")?.value;
    const qty = clampInt($("wasteQty")?.value);
    const unit = $("wasteUnit")?.value;
    const date = $("wasteDate")?.value;
    
    if(!name || !date || qty <= 0) return showToast("Data waste tidak valid", "error");

    try {
        await addDoc(collection(db, "wh_waste"), {
            itemId: 'manual', itemName: name,
            qty, unit, dateKey: date, note: $("wasteNote")?.value || "",
            createdBy: currentUser.email, createdAt: serverTimestamp()
        });
        showToast("Waste tersimpan", "success");
        $("wasteQty").value = ""; $("wasteNote").value = "";
        loadWasteLogsAndRender();
    } catch(e) { showToast("Gagal: " + e.message, "error"); }
}

async function loadWasteLogsAndRender() {
    const historyBody = $("wasteHistoryBody");
    if(!historyBody) return;
    const start = parseDateOnly($("wasteFilterStart").value);
    const end = parseDateOnly($("wasteFilterEnd").value);
    if(!start || !end) return;

    const sKey = todayKey(start);
    const eKey = todayKey(end);
    const snap = await getDocs(query(collection(db, "wh_waste"), orderBy("createdAt", "desc"), limit(100)));
    historyBody.innerHTML = "";
    
    snap.forEach(d => {
        const w = d.data();
        if((w.dateKey || "") >= sKey && (w.dateKey || "") <= eKey) {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${w.dateKey}</td><td>${escapeHtml(w.itemName)}</td><td>${w.qty}</td><td>${w.unit}</td><td>${escapeHtml(w.note)}</td>
                <td>${iconBtn('<i class="lucide-trash-2"></i>', "Hapus", "btn-del-waste")}</td>
            `;
            tr.querySelector(".btn-del-waste").addEventListener("click", async () => {
                if(confirm("Hapus waste ini?")) { await deleteDoc(doc(db, "wh_waste", d.id)); loadWasteLogsAndRender(); }
            });
            historyBody.appendChild(tr);
        }
    });
}

async function generateReport() {
    const head = $("whReportHead");
    const body = $("whReportBody");
    if(!head || !body) return;
    const type = $("whReportType").value;
    const start = parseDateOnly($("whReportStart").value);
    const end = parseDateOnly($("whReportEnd").value);

    if(type !== 'total_asset' && (!start || !end)) return showToast("Pilih rentang tanggal dulu", "error");

    head.innerHTML = ""; body.innerHTML = "";

    if (type === 'total_asset') {
        head.innerHTML = `<th>Item</th><th>Isi/Dus</th><th>Total Dus</th><th>Total Pcs</th><th>Estimasi Pcs</th><th>Catatan Audit</th>`;
        items.forEach(it => {
            const pq = getPackQty(it);
            const totalPacks = (it.stockW1||0) + (it.stockW2||0) + (it.stockRest||0) + (it.stockBar||0) + (it.stockKitchen||0);
            const totalLoose = (it.stockW1Loose||0) + (it.stockW2Loose||0) + (it.stockRestLoose||0) + (it.stockBarLoose||0) + (it.stockKitchenLoose||0);
            const grandTotal = toTotalUnits(totalPacks, totalLoose, pq);
            const split = splitUnitsToPackLoose(grandTotal, pq);
            const tr = document.createElement("tr");
            tr.innerHTML = `<td>${it.name}</td><td>${pq}</td><td>${split.packs}</td><td>${split.loose}</td><td>${grandTotal}</td><td>${escapeHtml(it.info||"-")}</td>`;
            body.appendChild(tr);
        });
        showToast("Laporan Total Aset Selesai", "success");
    } else if (type === 'waste') {
        const sKey = todayKey(start);
        const eKey = todayKey(end);
        const snap = await getDocs(query(collection(db, "wh_waste"), orderBy("createdAt", "desc"), limit(500)));
        head.innerHTML = `<th>Tanggal</th><th>Item</th><th>Qty</th><th>Satuan</th><th>Ket</th>`;
        snap.forEach(d => {
            const w = d.data();
            if((w.dateKey || "") >= sKey && (w.dateKey || "") <= eKey) {
                const tr = document.createElement("tr");
                tr.innerHTML = `<td>${w.dateKey}</td><td>${w.itemName}</td><td>${w.qty}</td><td>${w.unit}</td><td>${w.note}</td>`;
                body.appendChild(tr);
            }
        });
        showToast("Laporan Waste Selesai", "success");
    }
}

function downloadCSV() {
    const type = $("whReportType").value;
    let csv = "";
    if (type === 'total_asset') {
        csv = "Item,IsiPerDus,TotalDus,TotalPcs,TotalUnitKecil,CatatanAudit\n";
        items.forEach(it => {
            const pq = getPackQty(it);
            const totalPacks = (it.stockW1||0) + (it.stockW2||0) + (it.stockRest||0) + (it.stockBar||0) + (it.stockKitchen||0);
            const totalLoose = (it.stockW1Loose||0) + (it.stockW2Loose||0) + (it.stockRestLoose||0) + (it.stockBarLoose||0) + (it.stockKitchenLoose||0);
            const grandTotal = toTotalUnits(totalPacks, totalLoose, pq);
            const split = splitUnitsToPackLoose(grandTotal, pq);
            csv += `"${it.name}",${pq},${split.packs},${split.loose},${grandTotal},"${(it.info||"").replace(/"/g, '""')}"\n`;
        });
        downloadText(`Total_Asset_${todayKey()}.csv`, csv);
    } else { showToast("Fitur download CSV untuk tipe ini belum aktif.", "info"); }
}

// ===================== INIT =====================
bindWarehouseEvents(); // <--- WAJIB DIPANGGIL DI LUAR AUTH AGAR TOMBOL SELALU AKTIF

onAuthStateChanged(auth, async (u) => {
  currentUser = u;
  if (u) {
    try {
        await loadWhItems();
        fillSelects();
        updateDashboard();
        renderOpnameTable();
        setReportRangeByWeekOffset(0); 
    } catch(e) { console.error("Data load error:", e); }
  }
});
