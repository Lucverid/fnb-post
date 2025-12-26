// warehouse.js (FINAL FIX - Report Calculation Corrected & Waste Edit Added)
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

// ===================== STATE =====================
let currentUser = null;
let items = [];
let editingWasteId = null; 
let currentOpnameFilter = { status: null };

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

// Logic Normalisasi: Ubah Total Unit Kecil -> Pack + Loose
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

function getBucket(packEq) {
    if (packEq <= 0.001) return 'habis';
    if (packEq < LOW_STOCK_LT) return 'low';
    if (packEq > HIGH_STOCK_GT) return 'high';
    return 'mid';
}

// ===================== UI UPDATE =====================
function updateDashboard() {
    const w1Habis = $("w1Habis");
    if(!w1Habis) return; 
    
    let cW1 = {h:0, l:0, ok:0}, cW2 = {h:0, l:0, ok:0}, cRest = {h:0, l:0, ok:0};
    let expOk = 0, expSoon = 0, expBad = 0;
    const now = new Date();

    items.forEach(it => {
        const pq = getPackQty(it);
        
        const s1 = getBucket(toTotalUnits(it.stockW1, it.stockW1Loose, pq) / pq);
        if(s1 === 'habis') cW1.h++; else if(s1 === 'low') cW1.l++; else if(s1 === 'high') cW1.ok++; else cW1.ok++;

        const s2 = getBucket(toTotalUnits(it.stockW2, it.stockW2Loose, pq) / pq);
        if(s2 === 'habis') cW2.h++; else if(s2 === 'low') cW2.l++; else if(s2 === 'high') cW2.ok++; else cW2.ok++;

        const sR = getBucket(toTotalUnits(it.stockRest, it.stockRestLoose, pq) / pq);
        if(sR === 'habis') cRest.h++; else if(sR === 'low') cRest.l++; else if(sR === 'high') cRest.ok++; else cRest.ok++;

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

// ===================== LOADERS =====================
async function loadWhItems() {
  const snap = await getDocs(query(collection(db, "wh_items"), orderBy("name", "asc")));
  items = [];
  snap.forEach(d => {
    items.push({ id: d.id, ...d.data(), ...normalizeItemStock(d.data()) });
  });
}

// ===================== BIND EVENTS =====================
window.addEventListener('DOMContentLoaded', () => {
    console.log("Binding Events...");

    // NAV
    const sections = { dash: $("whDashboardSection"), op: $("whOpnameSection"), waste: $("whWasteSection"), rep: $("whReportSection") };
    const navs = { dash: $("navWhDashboard"), op: $("navWhOpname"), waste: $("navWhWaste"), rep: $("navWhReport") };

    function go(key) {
        Object.values(sections).forEach(el => el.classList.add("hidden"));
        Object.values(navs).forEach(el => el.classList.remove("active"));
        if(sections[key]) sections[key].classList.remove("hidden");
        if(navs[key]) navs[key].classList.add("active");
    }

    if(navs.dash) navs.dash.onclick = () => { go('dash'); updateDashboard(); };
    if(navs.op) navs.op.onclick = () => { go('op'); currentOpnameFilter.status=null; renderOpnameTable(); };
    if(navs.waste) navs.waste.onclick = () => { go('waste'); loadWasteLogsAndRender(); };
    if(navs.rep) navs.rep.onclick = () => { go('rep'); };

    // ACTIONS
    $("btnSaveItem")?.addEventListener("click", createMasterItem);
    $("moveSearch")?.addEventListener("input", fillSelects);
    $("moveItemSelect")?.addEventListener("change", updateMoveInfo);
    $("transferType")?.addEventListener("change", updateMoveInfo);
    $("btnMove")?.addEventListener("click", processTransfer);
    
    $("whOpnameGudang")?.addEventListener("change", () => { currentOpnameFilter.status = null; renderOpnameTable(); });
    $("whOpnameSearch")?.addEventListener("input", renderOpnameTable);
    $("whOpnameModeSmall")?.addEventListener("change", renderOpnameTable);
    $("btnResetFilter")?.addEventListener("click", () => { currentOpnameFilter.status = null; renderOpnameTable(); });

    $("btnSaveWaste")?.addEventListener("click", saveWaste);
    $("wasteFilterStart")?.addEventListener("change", loadWasteLogsAndRender);
    $("wasteFilterEnd")?.addEventListener("change", loadWasteLogsAndRender);

    $("btnWeekThis")?.addEventListener("click", () => setReportRangeByWeekOffset(0));
    $("btnWeekLast")?.addEventListener("click", () => setReportRangeByWeekOffset(1));
    $("btnWhReport")?.addEventListener("click", generateReport);
    $("btnWhReportDownload")?.addEventListener("click", downloadCSV);

    function bindFilter(cardId, gudang, status) {
        const card = $(cardId);
        if(card) {
            card.onclick = () => {
                go('op'); 
                $("whOpnameGudang").value = gudang;
                currentOpnameFilter = { status };
                renderOpnameTable();
                showToast(`Filter: ${gudang.toUpperCase()} - ${status.toUpperCase()}`, "info");
            }
        }
    }

    bindFilter("cardW1Habis", "w1", "habis"); bindFilter("cardW1Lumayan", "w1", "low"); bindFilter("cardW1Banyak", "w1", "ok");
    bindFilter("cardRestHabis", "rest", "habis"); bindFilter("cardRestLumayan", "rest", "low"); bindFilter("cardRestBanyak", "rest", "ok");
    bindFilter("cardW2Habis", "w2", "habis"); bindFilter("cardW2Lumayan", "w2", "low"); bindFilter("cardW2Banyak", "w2", "ok");
});

// ===================== CRUD LOGIC =====================
async function createMasterItem() {
  if (!currentUser) return showToast("Harus login", "error");
  const name = ($("whItemName")?.value || "").trim();
  
  if (!name) return showToast("Nama item wajib diisi", "error");

  const initLoc = $("whItemInitLoc").value; 
  const initQty = clampInt($("whItemInitQty").value);

  let stW1 = 0, stRest = 0;
  if(initLoc === 'w1') stW1 = initQty;
  if(initLoc === 'rest') stRest = initQty;

  try {
    const docRef = await addDoc(collection(db, "wh_items"), {
        name, 
        unitBig: $("whItemUnitBig")?.value || "",
        unitSmall: $("whItemUnitSmall")?.value || "",
        packQty: Number($("whItemPackQty")?.value || 0),
        expDate: $("whItemExp")?.value || "",
        receivedAt: $("whItemReceivedAt")?.value || "",
        supplier: $("whItemSupplier")?.value || "",
        info: $("whItemInfo")?.value || "",
        stockW1: stW1, stockW1Loose: 0,
        stockW2: 0, stockW2Loose: 0,
        stockRest: stRest, stockRestLoose: 0,
        stockBar: 0, stockBarLoose: 0,
        stockKitchen: 0, stockKitchenLoose: 0,
        createdAt: serverTimestamp()
    });

    if(initQty > 0) {
        // LOG KE WH_BATCHES (AGAR MUNCUL DI LAPORAN BARANG MASUK)
        await addDoc(collection(db, "wh_batches"), {
            itemId: docRef.id, itemName: name,
            receivedAt: $("whItemReceivedAt")?.value || todayKey(),
            supplier: $("whItemSupplier")?.value || "",
            qtyPack: initQty,
            note: `Stok Awal (${initLoc.toUpperCase()})`,
            createdAt: serverTimestamp()
        });
    }

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
    const btnReset = $("btnResetFilter");

    if(currentOpnameFilter.status) {
        btnReset.style.display = 'block';
        btnReset.textContent = `Filter Aktif: ${currentOpnameFilter.status.toUpperCase()} (Klik untuk Reset)`;
    } else {
        btnReset.style.display = 'none';
    }

    items.filter(it => it.name.toLowerCase().includes(kw)).forEach(it => {
        const pq = getPackQty(it);
        const stock = getItemStock(it, gudang);
        const totalUnits = toTotalUnits(stock.packs, stock.loose, pq);
        
        if(currentOpnameFilter.status) {
            const bucket = getBucket(totalUnits / pq);
            let statusMatch = false;
            if(currentOpnameFilter.status === 'habis' && bucket === 'habis') statusMatch = true;
            if(currentOpnameFilter.status === 'low' && bucket === 'low') statusMatch = true;
            if(currentOpnameFilter.status === 'ok' && (bucket === 'high' || bucket === 'mid')) statusMatch = true;
            if(!statusMatch) return;
        }

        const display = showSmall 
            ? `${totalUnits} ${it.unitSmall}`
            : `${stock.packs} ${it.unitBig} + ${stock.loose} ${it.unitSmall}`;

        const tr = document.createElement("tr");
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
            <td style="white-space:nowrap;">
                ${iconBtn('💾', 'Simpan', 'btn-save')}
                ${iconBtn('➕', 'Restock', 'btn-restock danger')}
                ${iconBtn('🗑️', 'Hapus', 'btn-del')}
            </td>
        `;
        
        tr.querySelector(".btn-save").onclick = () => saveOpnameSingle(it, gudang, tr);
        
        // Fitur Restock (Tambah Stok via Tombol Plus)
        tr.querySelector(".btn-restock").onclick = () => {
            const add = prompt(`Tambah stok (DUS/PACK) untuk ${it.name} di ${gudang}?`);
            if(add && Number(add) > 0) processRestockSingle(it, gudang, Number(add));
        };

        tr.querySelector(".btn-del").onclick = () => deleteItem(it.id);
        tbody.appendChild(tr);
    });
}

// LOGIC BARU: RESTOCK BUTTON
async function processRestockSingle(it, gudang, qtyPack) {
    let fP;
    if(gudang === 'w1') fP = 'stockW1';
    else if(gudang === 'rest') fP = 'stockRest';
    else { showToast("Restock hanya disarankan di W1 / Istirahat", "error"); return; }

    try {
        const payload = { updatedAt: serverTimestamp() };
        payload[fP] = (it[fP] || 0) + qtyPack; // Tambah stok
        
        await updateDoc(doc(db, "wh_items", it.id), payload);
        
        // LOG KE WH_BATCHES (Agar muncul di Laporan Barang Masuk)
        await addDoc(collection(db, "wh_batches"), {
            itemId: it.id, itemName: it.name,
            receivedAt: todayKey(),
            supplier: it.supplier || "Restock",
            qtyPack: qtyPack,
            note: `Restock Manual ke ${gudang.toUpperCase()}`,
            createdAt: serverTimestamp()
        });

        showToast("Restock berhasil & tercatat di laporan!", "success");
        await loadWhItems(); updateDashboard(); renderOpnameTable();
    } catch(e) { showToast(e.message, "error"); }
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
    showToast("Stok dikoreksi (Opname)", "success");
    await loadWhItems(); updateDashboard();
}

async function deleteItem(id) {
    if(!confirm("Hapus item ini dari database?")) return;
    try {
        await deleteDoc(doc(db, "wh_items", id));
        showToast("Item dihapus", "success");
        await loadWhItems(); renderOpnameTable(); updateDashboard();
    } catch(e) { showToast(e.message, "error"); }
}

// ===================== WASTE (EDIT & DELETE FIX) =====================
function fillWasteForm(w) {
    $("wasteItemSelect").value = w.itemName;
    $("wasteDate").value = w.dateKey;
    $("wasteUnit").value = w.unit;
    $("wasteQty").value = w.qty;
    $("wasteNote").value = w.note;
    
    editingWasteId = w.id; // Set ID yang sedang diedit
    $("btnSaveWaste").textContent = "Update Waste";
    $("whWasteSection").scrollIntoView({behavior: "smooth"});
}

async function saveWaste() {
    if (!currentUser) return showToast("Harus login", "error");
    const name = $("wasteItemSelect")?.value;
    const qty = clampInt($("wasteQty")?.value);
    const unit = $("wasteUnit")?.value;
    const date = $("wasteDate")?.value;
    const note = $("wasteNote")?.value || "";
    
    if(!name || !date || qty <= 0) return showToast("Data waste tidak valid", "error");

    try {
        if(editingWasteId) {
            // MODE UPDATE
            await updateDoc(doc(db, "wh_waste", editingWasteId), {
                itemName: name, qty, unit, dateKey: date, note,
                updatedAt: serverTimestamp()
            });
            showToast("Waste diupdate", "success");
            editingWasteId = null;
            $("btnSaveWaste").textContent = "Simpan Waste";
        } else {
            // MODE CREATE
            await addDoc(collection(db, "wh_waste"), {
                itemId: 'manual', itemName: name,
                qty, unit, dateKey: date, note,
                createdBy: currentUser.email, createdAt: serverTimestamp()
            });
            showToast("Waste tersimpan", "success");
        }
        
        $("wasteQty").value = ""; $("wasteNote").value = "";
        loadWasteLogsAndRender();
    } catch(e) { showToast("Gagal: " + e.message, "error"); }
}

async function loadWasteLogsAndRender() {
    const tbody = $("wasteHistoryBody");
    if(!tbody) return;
    tbody.innerHTML = "";
    
    const start = parseDateOnly($("wasteFilterStart").value);
    const end = parseDateOnly($("wasteFilterEnd").value);
    if(!start || !end) return;

    const sKey = todayKey(start);
    const eKey = todayKey(end);

    const snap = await getDocs(query(collection(db, "wh_waste"), orderBy("createdAt", "desc"), limit(100)));
    
    snap.forEach(d => {
        const w = d.data();
        if((w.dateKey || "") >= sKey && (w.dateKey || "") <= eKey) {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${w.dateKey}</td><td>${w.itemName}</td><td>${w.qty}</td><td>${w.unit}</td><td>${escapeHtml(w.note)}</td>
                <td style="white-space:nowrap;">
                    ${iconBtn('✏️', 'Edit', 'btn-edit')} 
                    ${iconBtn('❌', 'Hapus', 'btn-del')}
                </td>
            `;
            // Attach Event Listeners
            tr.querySelector(".btn-edit").onclick = () => fillWasteForm({id: d.id, ...w});
            tr.querySelector(".btn-del").onclick = async () => {
                if(confirm("Hapus waste ini?")) { await deleteDoc(doc(db, "wh_waste", d.id)); loadWasteLogsAndRender(); }
            };
            tbody.appendChild(tr);
        }
    });
}

// ===================== REPORT (FIXED LOGIC) =====================
async function generateReport() {
    const head = $("whReportHead");
    const body = $("whReportBody");
    if(!head || !body) return;
    const type = $("whReportType").value;
    const start = parseDateOnly($("whReportStart").value);
    const end = parseDateOnly($("whReportEnd").value);

    if(type !== 'total_asset' && (!start || !end)) return showToast("Pilih tanggal", "error");

    head.innerHTML = ""; body.innerHTML = "";

    if (type === 'total_asset') {
        head.innerHTML = `<th>Item</th><th>Total Dus</th><th>Total Pcs</th><th>Estimasi Pcs</th><th>Catatan Audit</th>`;
        items.forEach(it => {
            const pq = getPackQty(it);
            // Hitung total fisik (Pack & Loose terpisah) dari semua gudang
            const tp = (it.stockW1||0) + (it.stockW2||0) + (it.stockRest||0) + (it.stockBar||0) + (it.stockKitchen||0);
            const tl = (it.stockW1Loose||0) + (it.stockW2Loose||0) + (it.stockRestLoose||0) + (it.stockBarLoose||0) + (it.stockKitchenLoose||0);
            
            // Konversi total loose yang berlebih menjadi pack (Normalisasi Tampilan)
            const grandTotalSmall = toTotalUnits(tp, tl, pq);
            const normalized = splitUnitsToPackLoose(grandTotalSmall, pq);
            
            const tr = document.createElement("tr");
            tr.innerHTML = `<td>${it.name}</td><td>${normalized.packs}</td><td>${normalized.loose}</td><td>${grandTotalSmall}</td><td>${escapeHtml(it.info||"-")}</td>`;
            body.appendChild(tr);
        });
        showToast("Laporan Total Aset Siap", "success");

    } else if (type === 'receiving') {
        const sKey = todayKey(start);
        const eKey = todayKey(end);
        const snap = await getDocs(query(collection(db, "wh_batches"), orderBy("createdAt", "desc"), limit(500)));
        head.innerHTML = `<th>Tanggal</th><th>Item</th><th>Supplier</th><th>Qty (Dus)</th><th>Catatan</th>`;
        snap.forEach(d => {
            const b = d.data();
            if((b.receivedAt || "") >= sKey && (b.receivedAt || "") <= eKey) {
                const tr = document.createElement("tr");
                tr.innerHTML = `<td>${b.receivedAt}</td><td>${escapeHtml(b.itemName)}</td><td>${escapeHtml(b.supplier)}</td><td>${b.qtyPack}</td><td>${escapeHtml(b.note)}</td>`;
                body.appendChild(tr);
            }
        });
        showToast("Laporan Barang Masuk Siap", "success");

    } else if (type === 'waste') {
        const sKey = todayKey(start);
        const eKey = todayKey(end);
        const snap = await getDocs(query(collection(db, "wh_waste"), orderBy("createdAt", "desc"), limit(500)));
        head.innerHTML = `<th>Tanggal</th><th>Item</th><th>Qty</th><th>Satuan</th><th>Catatan</th>`;
        snap.forEach(d => {
            const w = d.data();
            if((w.dateKey || "") >= sKey && (w.dateKey || "") <= eKey) {
                const tr = document.createElement("tr");
                tr.innerHTML = `<td>${w.dateKey}</td><td>${w.itemName}</td><td>${w.qty}</td><td>${w.unit}</td><td>${escapeHtml(w.note)}</td>`;
                body.appendChild(tr);
            }
        });
        showToast("Laporan Waste Siap", "success");
    }
}

function downloadCSV() {
    const type = $("whReportType").value;
    let csv = "";
    
    if(type === 'total_asset') {
        csv = "Item,TotalDus,TotalPcs,EstimasiPcs,CatatanAudit\n";
        items.forEach(it => {
            const pq = getPackQty(it);
            const tp = (it.stockW1||0) + (it.stockW2||0) + (it.stockRest||0) + (it.stockBar||0) + (it.stockKitchen||0);
            const tl = (it.stockW1Loose||0) + (it.stockW2Loose||0) + (it.stockRestLoose||0) + (it.stockBarLoose||0) + (it.stockKitchen||0);
            const grand = toTotalUnits(tp, tl, pq);
            const normalized = splitUnitsToPackLoose(grand, pq);
            csv += `"${it.name}",${normalized.packs},${normalized.loose},${grand},"${(it.info||"").replace(/"/g, '""')}"\n`;
        });
        downloadText("total_aset.csv", csv);
    } else {
        showToast("Fitur download CSV ini menyusul.", "info");
    }
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
