// warehouse.js (FINAL ROBUST) — Safe Event Loading
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

// ===================== CONFIG =====================
let currentUser = null;
let items = [];
const LOW_STOCK_LT = 2; 
const HIGH_STOCK_GT = 50; 
const EXP_SOON_DAYS = 7;

const WASTE_PRESET_ITEMS = [
  "Milktea", "Teh Hijau", "Teh Hitam", "Teh Blooming", "Teh oolong", "Boba", "Susu", "Pudding", "Kopi", "Crystal jelly"
];

// ===================== UTILS =====================
function showToast(msg, type = "info") {
  const container = $("toast-container");
  if (!container) return alert(msg);
  const div = document.createElement("div");
  div.className = `toast toast-${type}`;
  div.textContent = msg;
  container.appendChild(div);
  setTimeout(() => div.remove(), 3000);
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

function clampInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function escapeHtml(str) {
  return String(str || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function iconBtn(html, title, extraClass = "") {
  return `<button class="btn-icon-mini ${extraClass}" type="button" title="${title}">${html}</button>`;
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function setReportRangeByWeekOffset(weekOffset = 0) {
  const d = new Date();
  d.setHours(0,0,0,0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff - (weekOffset * 7));
  
  const startStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  
  const e = new Date(d);
  e.setDate(e.getDate() + 6);
  const endStr = `${e.getFullYear()}-${String(e.getMonth()+1).padStart(2,'0')}-${String(e.getDate()).padStart(2,'0')}`;

  if ($("whReportStart")) $("whReportStart").value = startStr;
  if ($("whReportEnd")) $("whReportEnd").value = endStr;
  if ($("wasteFilterStart")) $("wasteFilterStart").value = startStr;
  if ($("wasteFilterEnd")) $("wasteFilterEnd").value = endStr;
}

// ===================== LOGIC =====================
function getPackQty(it) {
  return (it?.packQty > 0) ? it.packQty : 1;
}

function toTotalUnits(packs, loose, packQty) {
  return (clampInt(packs) * clampInt(packQty)) + clampInt(loose);
}

function splitUnitsToPackLoose(total, packQty) {
  const pq = Math.max(1, clampInt(packQty));
  const t = Math.max(0, clampInt(total));
  return { packs: Math.floor(t / pq), loose: t % pq };
}

function getItemStock(it, gudang) {
  if (gudang === 'w1') return { packs: it.stockW1, loose: it.stockW1Loose };
  if (gudang === 'w2') return { packs: it.stockW2, loose: it.stockW2Loose };
  if (gudang === 'rest') return { packs: it.stockRest, loose: it.stockRestLoose };
  if (gudang === 'bar') return { packs: it.stockBar, loose: it.stockBarLoose };
  if (gudang === 'kitchen') return { packs: it.stockKitchen, loose: it.stockKitchenLoose };
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

// ===================== UI UPDATE =====================
function updateDashboard() {
    const w1Habis = $("w1Habis");
    if(!w1Habis) return; // Belum load HTML
    
    let cW1 = {h:0, l:0, ok:0}, cW2 = {h:0, l:0, ok:0}, cRest = {h:0, l:0, ok:0};
    let expOk = 0, expSoon = 0, expBad = 0;
    const now = new Date();

    function check(val) {
        if (val <= 0.001) return 'h';
        if (val < LOW_STOCK_LT) return 'l';
        return 'ok';
    }

    items.forEach(it => {
        const pq = getPackQty(it);
        
        const s1 = check(toTotalUnits(it.stockW1, it.stockW1Loose, pq) / pq);
        cW1[s1]++;

        const s2 = check(toTotalUnits(it.stockW2, it.stockW2Loose, pq) / pq);
        cW2[s2]++;

        const sR = check(toTotalUnits(it.stockRest, it.stockRestLoose, pq) / pq);
        cRest[sR]++;

        if(it.expDate) {
            const exp = parseDateOnly(it.expDate);
            if(exp) {
                const diff = Math.floor((exp - now) / (86400000));
                if(diff < 0) expBad++; else if(diff <= EXP_SOON_DAYS) expSoon++; else expOk++;
            } else expOk++;
        } else expOk++;
    });

    $("w1Habis").textContent = cW1.h; $("w1Lumayan").textContent = cW1.l; $("w1Banyak").textContent = cW1.ok;
    $("w2Habis").textContent = cW2.h; $("w2Lumayan").textContent = cW2.l; $("w2Banyak").textContent = cW2.ok;
    $("restHabis").textContent = cRest.h; $("restLumayan").textContent = cRest.l; $("restBanyak").textContent = cRest.ok;

    const expiryWrap = $("whExpiryWrap");
    if(expiryWrap) {
        expiryWrap.innerHTML = `
            <div class="metric-card green"><b>${expOk}</b> Aman</div>
            <div class="metric-card yellow"><b>${expSoon}</b> Mau Exp</div>
            <div class="metric-card red"><b>${expBad}</b> Expired</div>
        `;
        expiryWrap.style.display = 'flex';
        expiryWrap.style.gap = '10px';
    }
}

// ===================== CRUD & LOAD =====================
async function loadWhItems() {
  const snap = await getDocs(query(collection(db, "wh_items"), orderBy("name", "asc")));
  items = [];
  snap.forEach(d => {
    items.push({ id: d.id, ...d.data(), ...normalizeItemStock(d.data()) });
  });
}

// ===================== BIND EVENTS (SAFE MODE) =====================
window.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Ready - Binding Events...");

    // NAV
    const navs = {
        dash: $("navWhDashboard"),
        op: $("navWhOpname"),
        waste: $("navWhWaste"),
        rep: $("navWhReport")
    };
    
    const sections = {
        dash: $("whDashboardSection"),
        op: $("whOpnameSection"),
        waste: $("whWasteSection"),
        rep: $("whReportSection")
    };

    function go(key) {
        Object.values(sections).forEach(el => el.classList.add("hidden"));
        Object.values(navs).forEach(el => el.classList.remove("active"));
        if(sections[key]) sections[key].classList.remove("hidden");
        if(navs[key]) navs[key].classList.add("active");
    }

    if(navs.dash) navs.dash.onclick = () => { go('dash'); updateDashboard(); };
    if(navs.op) navs.op.onclick = () => { go('op'); renderOpnameTable(); };
    if(navs.waste) navs.waste.onclick = () => { go('waste'); loadWasteLogsAndRender(); };
    if(navs.rep) navs.rep.onclick = () => { go('rep'); };

    // ACTIONS
    $("btnSaveItem")?.addEventListener("click", createMasterItem);
    $("moveSearch")?.addEventListener("input", fillSelects);
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
});

// ===================== LOGIC FUNCTIONS =====================
async function createMasterItem() {
  if (!currentUser) return showToast("Harus login", "error");
  const name = ($("whItemName")?.value || "").trim();
  
  if (!name) return showToast("Nama item wajib diisi", "error");

  try {
    await addDoc(collection(db, "wh_items"), {
        name, 
        unitBig: $("whItemUnitBig")?.value || "",
        unitSmall: $("whItemUnitSmall")?.value || "",
        packQty: Number($("whItemPackQty")?.value || 0),
        expDate: $("whItemExp")?.value || "",
        receivedAt: $("whItemReceivedAt")?.value || "",
        supplier: $("whItemSupplier")?.value || "",
        info: $("whItemInfo")?.value || "",
        stockW1: clampInt($("whItemInitStockW1")?.value), stockW1Loose: 0,
        stockW2: 0, stockW2Loose: 0,
        stockRest: clampInt($("whItemInitStockRest")?.value), stockRestLoose: 0,
        stockBar: 0, stockBarLoose: 0,
        stockKitchen: 0, stockKitchenLoose: 0,
        createdAt: serverTimestamp()
    });
    showToast("Item tersimpan", "success");
    await loadWhItems(); renderOpnameTable(); fillSelects();
  } catch (e) { showToast(e.message, "error"); }
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
        
        // Unit
        const wUnit = $("wasteUnit");
        if(wUnit && wUnit.children.length === 0) {
             ["gram", "ml", "pcs", "pack"].forEach(u => {
                const opt = document.createElement("option"); opt.value = u; opt.textContent = u; wUnit.appendChild(opt);
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
    
    if(!itemId || (qtyP===0 && qtyL===0)) return showToast("Isi data transfer", "error");

    const it = items.find(x => x.id === itemId);
    const pq = getPackQty(it);
    const totalTx = (qtyP * pq) + qtyL;

    let srcP, srcL, dstP, dstL;
    if(type === 'w1_to_w2') { srcP='stockW1'; srcL='stockW1Loose'; dstP='stockW2'; dstL='stockW2Loose'; }
    else if (type === 'w1_to_bar') { srcP='stockW1'; srcL='stockW1Loose'; dstP='stockBar'; dstL='stockBarLoose'; }
    else if (type === 'rest_to_bar') { srcP='stockRest'; srcL='stockRestLoose'; dstP='stockBar'; dstL='stockBarLoose'; }
    else if (type === 'w2_to_kitchen') { srcP='stockW2'; srcL='stockW2Loose'; dstP='stockKitchen'; dstL='stockKitchenLoose'; }

    const curSrc = toTotalUnits(it[srcP], it[srcL], pq);
    if(totalTx > curSrc) return showToast("Stok kurang!", "error");

    const newSrc = splitUnitsToPackLoose(curSrc - totalTx, pq);
    const curDst = toTotalUnits(it[dstP], it[dstL], pq);
    const newDst = splitUnitsToPackLoose(curDst + totalTx, pq);

    try {
        const payload = { updatedAt: serverTimestamp() };
        payload[srcP] = newSrc.packs; payload[srcL] = newSrc.loose;
        payload[dstP] = newDst.packs; payload[dstL] = newDst.loose;
        await updateDoc(doc(db, "wh_items", itemId), payload);
        await addDoc(collection(db, "wh_tx"), {
            type: "TRANSFER", subtype: type, itemId, itemName: it.name, qty: totalTx, user: currentUser.email, createdAt: serverTimestamp()
        });
        showToast("Transfer sukses", "success");
        await loadWhItems(); renderOpnameTable(); updateDashboard();
    } catch(e) { showToast(e.message, "error"); }
}

function renderOpnameTable() {
    const tbody = $("whOpnameTableBody");
    if(!tbody) return;
    tbody.innerHTML = "";
    
    const gudang = $("whOpnameGudang")?.value || 'w1';
    const kw = ($("whOpnameSearch")?.value || "").toLowerCase();
    const showSmall = $("whOpnameModeSmall")?.checked;

    items.filter(it => it.name.toLowerCase().includes(kw)).forEach(it => {
        const tr = document.createElement("tr");
        const pq = getPackQty(it);
        const stock = getItemStock(it, gudang);
        const display = showSmall 
            ? `${toTotalUnits(stock.packs, stock.loose, pq)} ${it.unitSmall}`
            : `${stock.packs} ${it.unitBig} + ${stock.loose} ${it.unitSmall}`;

        tr.innerHTML = `
            <td>${escapeHtml(it.name)}</td>
            <td>${it.unitBig}/${it.unitSmall} (${pq})</td>
            <td><b>${gudang}</b></td>
            <td>${display}</td>
            <td>
               <div style="display:flex;gap:4px;">
                 <input type="number" class="op-p" value="${stock.packs}" style="width:50px">
                 <input type="number" class="op-l" value="${stock.loose}" style="width:50px">
               </div>
            </td>
            <td>${iconBtn('💾', 'Simpan', 'btn-save')}</td>
        `;
        tr.querySelector(".btn-save").onclick = () => saveOpnameSingle(it, gudang, tr);
        tbody.appendChild(tr);
    });
}

async function saveOpnameSingle(it, gudang, tr) {
    const p = clampInt(tr.querySelector(".op-p").value);
    const l = clampInt(tr.querySelector(".op-l").value);
    
    let fP, fL;
    if(gudang === 'w1') { fP = 'stockW1'; fL = 'stockW1Loose'; }
    else if(gudang === 'w2') { fP = 'stockW2'; fL = 'stockW2Loose'; }
    else if(gudang === 'rest') { fP = 'stockRest'; fL = 'stockRestLoose'; }
    else if(gudang === 'bar') { fP = 'stockBar'; fL = 'stockBarLoose'; }
    else if(gudang === 'kitchen') { fP = 'stockKitchen'; fL = 'stockKitchenLoose'; }

    const payload = {}; payload[fP] = p; payload[fL] = l;
    await updateDoc(doc(db, "wh_items", it.id), payload);
    showToast("Update stok berhasil", "success");
    await loadWhItems(); updateDashboard();
}

async function saveWaste() {
    try {
        await addDoc(collection(db, "wh_waste"), {
            dateKey: $("wasteDate").value,
            itemName: $("wasteItemSelect").value,
            qty: clampInt($("wasteQty").value),
            unit: $("wasteUnit").value,
            note: $("wasteNote").value,
            createdAt: serverTimestamp()
        });
        showToast("Waste saved", "success");
        loadWasteLogsAndRender();
    } catch(e) { showToast(e.message, "error"); }
}

async function loadWasteLogsAndRender() {
    const tbody = $("wasteHistoryBody");
    if(!tbody) return;
    tbody.innerHTML = "";
    
    const snap = await getDocs(query(collection(db, "wh_waste"), orderBy("createdAt", "desc"), limit(50)));
    snap.forEach(d => {
        const w = d.data();
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${w.dateKey}</td><td>${w.itemName}</td><td>${w.qty}</td><td>${w.unit}</td><td>${w.note}</td><td><button class="del-w">X</button></td>`;
        tr.querySelector(".del-w").onclick = async () => {
            if(confirm("Hapus?")) { await deleteDoc(doc(db, "wh_waste", d.id)); loadWasteLogsAndRender(); }
        };
        tbody.appendChild(tr);
    });
}

async function generateReport() {
    const body = $("whReportBody");
    const head = $("whReportHead");
    const type = $("whReportType").value;
    head.innerHTML = ""; body.innerHTML = "";

    if(type === 'total_asset') {
        head.innerHTML = `<th>Item</th><th>Total Dus</th><th>Total Pcs</th><th>Estimasi Pcs</th><th>Info</th>`;
        items.forEach(it => {
            const pq = getPackQty(it);
            const tp = (it.stockW1||0) + (it.stockW2||0) + (it.stockRest||0) + (it.stockBar||0) + (it.stockKitchen||0);
            const tl = (it.stockW1Loose||0) + (it.stockW2Loose||0) + (it.stockRestLoose||0) + (it.stockBarLoose||0) + (it.stockKitchenLoose||0);
            const grand = toTotalUnits(tp, tl, pq);
            const split = splitUnitsToPackLoose(grand, pq);
            
            const tr = document.createElement("tr");
            tr.innerHTML = `<td>${it.name}</td><td>${split.packs}</td><td>${split.loose}</td><td>${grand}</td><td>${it.info||""}</td>`;
            body.appendChild(tr);
        });
    } else {
        // Simple generic report for waste/receiving
        const snap = await getDocs(query(collection(db, "wh_waste"), limit(50))); // Simplification
        head.innerHTML = `<th>Tanggal</th><th>Item</th><th>Qty</th>`;
        snap.forEach(d => {
            const w = d.data();
            const tr = document.createElement("tr");
            tr.innerHTML = `<td>${w.dateKey}</td><td>${w.itemName}</td><td>${w.qty} ${w.unit}</td>`;
            body.appendChild(tr);
        });
    }
}

function downloadCSV() {
    let csv = "Item,TotalDus,TotalPcs,EstimasiPcs,Info\n";
    items.forEach(it => {
        const pq = getPackQty(it);
        const tp = (it.stockW1||0) + (it.stockW2||0) + (it.stockRest||0) + (it.stockBar||0) + (it.stockKitchen||0);
        const tl = (it.stockW1Loose||0) + (it.stockW2Loose||0) + (it.stockRestLoose||0) + (it.stockBarLoose||0) + (it.stockKitchenLoose||0);
        const grand = toTotalUnits(tp, tl, pq);
        const split = splitUnitsToPackLoose(grand, pq);
        csv += `"${it.name}",${split.packs},${split.loose},${grand},"${it.info||""}"\n`;
    });
    downloadText("report.csv", csv);
}

// ===================== AUTH INIT =====================
onAuthStateChanged(auth, async (u) => {
  currentUser = u;
  if (u) {
    try {
        await loadWhItems();
        fillSelects();
        updateDashboard();
        renderOpnameTable();
        setReportRangeByWeekOffset(0);
    } catch(e) { console.error("Init Error", e); }
  }
});
