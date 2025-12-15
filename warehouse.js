// warehouse.js (NEW FEATURES ONLY - Dashboard + Opname Gudang 1/2 + Waste + Report)
// ================= FIREBASE =================
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  updateDoc,
  setDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

// ✅ pake config kamu
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

// ================= UTIL =================
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

function cleanNumber(val) {
  if (val == null) return 0;
  const num = parseInt(val.toString().replace(/\D/g, ""), 10);
  return isNaN(num) ? 0 : num;
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

// ================= COLLECTIONS (NEW) =================
// items master + stok per gudang
const colItems = collection(db, "wh_items");
// log opname per gudang
const colOpname = collection(db, "wh_opname_logs");
// log transfer gudang 1 -> gudang 2
const colMoves = collection(db, "wh_moves");
// waste
const colWaste = collection(db, "wh_waste");

// ================= DOM (NEW UI) =================
// Sections
const dashSection = $("whDashboardSection");
const opnameSection = $("whOpnameSection");
const wasteSection = $("whWasteSection");
const reportSection = $("whReportSection");

// Nav buttons
const navDash = $("navWhDashboard");
const navOpname = $("navWhOpname");
const navWaste = $("navWhWaste");
const navReport = $("navWhReport");

// Dashboard widgets
const w1Habis = $("w1Habis");
const w1Lumayan = $("w1Lumayan");
const w1Banyak = $("w1Banyak");
const w2Habis = $("w2Habis");
const w2Lumayan = $("w2Lumayan");
const w2Banyak = $("w2Banyak");

// Opname UI
const opnameGudangSelect = $("opnameGudang"); // "w1" | "w2"
const opnameSearch = $("opnameSearch");
const opnameTableBody = $("opnameTableBody");

// Item form (tambah item baru / update cepat)
const itemName = $("itemName");
const itemUnit = $("itemUnit"); // dus/pcs/pack
const itemExp = $("itemExp"); // date
const itemInfo = $("itemInfo");
const itemSupplier = $("itemSupplier");
const itemReceivedAt = $("itemReceivedAt"); // date
const btnSaveItem = $("btnSaveItem");

// Transfer W1 -> W2
const moveSearch = $("moveSearch");
const moveItemSelect = $("moveItemSelect"); // select item
const moveQty = $("moveQty");
const btnMove = $("btnMove");

// Waste UI
const wasteGudangSelect = $("wasteGudang"); // w1/w2
const wasteSearch = $("wasteSearch");
const wasteItemSelect = $("wasteItemSelect");
const wasteDate = $("wasteDate");
const wasteGram = $("wasteGram");
const wasteMl = $("wasteMl");
const wasteNote = $("wasteNote");
const btnSaveWaste = $("btnSaveWaste");

// Reports UI
const reportType = $("whReportType"); // opname_w1, opname_w2, waste_w1, waste_w2
const reportStart = $("whReportStart");
const reportEnd = $("whReportEnd");
const btnReport = $("btnWhReport");
const reportTableHead = $("whReportHead");
const reportTableBody = $("whReportBody");

// ================= STATE =================
let currentUser = null;
let itemsCache = []; // [{id, name, unit, expDate, info, supplier, receivedAt, stockW1, stockW2}]
let unsubItems = null;

// filter dashboard click → opname
let pendingOpnameFilter = { gudang: "w1", status: null };

// ================= NAV =================
function showOnly(sectionName) {
  [dashSection, opnameSection, wasteSection, reportSection].forEach((sec) => {
    if (sec) sec.classList.add("hidden");
  });

  if (sectionName === "dash" && dashSection) dashSection.classList.remove("hidden");
  if (sectionName === "opname" && opnameSection) opnameSection.classList.remove("hidden");
  if (sectionName === "waste" && wasteSection) wasteSection.classList.remove("hidden");
  if (sectionName === "report" && reportSection) reportSection.classList.remove("hidden");
}

if (navDash) navDash.addEventListener("click", () => showOnly("dash"));
if (navOpname) navOpname.addEventListener("click", () => showOnly("opname"));
if (navWaste) navWaste.addEventListener("click", () => showOnly("waste"));
if (navReport) navReport.addEventListener("click", () => showOnly("report"));

// ================= STOCK STATUS (per gudang) =================
function stockStatus(stock) {
  const s = Number(stock || 0);
  if (s <= 0) return { key: "habis", label: "Habis" };
  if (s < 10) return { key: "lumayan", label: "Lumayan banyak" };
  if (s > 50) return { key: "banyak", label: "Banyak" };
  return { key: "normal", label: "Normal" };
}

// ================= DASHBOARD =================
function updateDashboard() {
  let w1 = { habis: 0, lumayan: 0, banyak: 0 };
  let w2 = { habis: 0, lumayan: 0, banyak: 0 };

  itemsCache.forEach((it) => {
    const st1 = stockStatus(it.stockW1).key;
    const st2 = stockStatus(it.stockW2).key;

    if (st1 === "habis") w1.habis++;
    if (st1 === "lumayan") w1.lumayan++;
    if (st1 === "banyak") w1.banyak++;

    if (st2 === "habis") w2.habis++;
    if (st2 === "lumayan") w2.lumayan++;
    if (st2 === "banyak") w2.banyak++;
  });

  if (w1Habis) w1Habis.textContent = String(w1.habis);
  if (w1Lumayan) w1Lumayan.textContent = String(w1.lumayan);
  if (w1Banyak) w1Banyak.textContent = String(w1.banyak);

  if (w2Habis) w2Habis.textContent = String(w2.habis);
  if (w2Lumayan) w2Lumayan.textContent = String(w2.lumayan);
  if (w2Banyak) w2Banyak.textContent = String(w2.banyak);
}

function bindDashboardClicks() {
  const bind = (el, gudang, statusKey) => {
    if (!el) return;
    el.style.cursor = "pointer";
    el.addEventListener("click", () => {
      pendingOpnameFilter = { gudang, status: statusKey };
      if (opnameGudangSelect) opnameGudangSelect.value = gudang;
      if (opnameSearch) opnameSearch.value = "";
      showOnly("opname");
      renderOpnameTable();
    });
  };

  bind($("cardW1Habis"), "w1", "habis");
  bind($("cardW1Lumayan"), "w1", "lumayan");
  bind($("cardW1Banyak"), "w1", "banyak");

  bind($("cardW2Habis"), "w2", "habis");
  bind($("cardW2Lumayan"), "w2", "lumayan");
  bind($("cardW2Banyak"), "w2", "banyak");
}

// ================= ITEMS REALTIME =================
function startItemsRealtime() {
  if (unsubItems) unsubItems();
  const qItems = query(colItems, orderBy("name", "asc"));
  unsubItems = onSnapshot(
    qItems,
    (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      itemsCache = list;

      updateDashboard();
      renderOpnameTable();
      refreshItemSelects();
    },
    (err) => {
      console.error(err);
      showToast("Gagal realtime items", "error");
    }
  );
}

// ================= ITEM SELECT (MOVE/WASTE) =================
function refreshItemSelects() {
  const makeOptions = (selectEl) => {
    if (!selectEl) return;
    const cur = selectEl.value || "";
    selectEl.innerHTML = `<option value="">Pilih item...</option>` + itemsCache
      .map((it) => `<option value="${it.id}">${it.name} (${it.unit || "-"})</option>`)
      .join("");
    if (cur) selectEl.value = cur;
  };

  makeOptions(moveItemSelect);
  makeOptions(wasteItemSelect);
}

// ================= ADD/UPDATE ITEM =================
async function saveItem() {
  try {
    const name = (itemName?.value || "").trim();
    const unit = (itemUnit?.value || "").trim(); // dus/pcs/pack
    const expDate = itemExp?.value || ""; // YYYY-MM-DD
    const info = (itemInfo?.value || "").trim();
    const supplierName = (itemSupplier?.value || "").trim();
    const receivedAt = itemReceivedAt?.value || "";

    if (!name) return showToast("Nama item wajib diisi", "error");
    if (!unit) return showToast("Satuan wajib diisi (dus/pcs/pack)", "error");

    // id pakai slug biar konsisten (boleh juga auto ID, tapi ini lebih gampang)
    const id = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-_]/g, "");
    const ref = doc(db, "wh_items", id);

    await setDoc(
      ref,
      {
        name,
        unit,
        expDate,
        info,
        supplierName,
        receivedAt,
        stockW1: 0,
        stockW2: 0,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser?.email || "-",
      },
      { merge: true }
    );

    showToast("Item tersimpan", "success");
    if (itemName) itemName.value = "";
    if (itemInfo) itemInfo.value = "";
  } catch (e) {
    console.error(e);
    showToast("Gagal simpan item", "error");
  }
}

if (btnSaveItem) btnSaveItem.addEventListener("click", saveItem);

// ================= OPNAME TABLE =================
function renderOpnameTable() {
  if (!opnameTableBody) return;

  const gudang = opnameGudangSelect?.value || pendingOpnameFilter.gudang || "w1";
  const q = (opnameSearch?.value || "").trim().toLowerCase();
  const statusFilter = pendingOpnameFilter?.status || null;

  let list = [...itemsCache];

  // search
  if (q) {
    list = list.filter((it) => {
      return (
        (it.name || "").toLowerCase().includes(q) ||
        (it.supplierName || "").toLowerCase().includes(q) ||
        (it.unit || "").toLowerCase().includes(q)
      );
    });
  }

  // status filter dari dashboard
  if (statusFilter) {
    list = list.filter((it) => {
      const st = stockStatus(gudang === "w1" ? it.stockW1 : it.stockW2).key;
      return st === statusFilter;
    });
  }

  opnameTableBody.innerHTML = "";

  if (!list.length) {
    opnameTableBody.innerHTML = `<tr><td colspan="9">Tidak ada item.</td></tr>`;
    return;
  }

  list.forEach((it) => {
    const stockNow = gudang === "w1" ? Number(it.stockW1 || 0) : Number(it.stockW2 || 0);
    const st = stockStatus(stockNow);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${it.name || "-"}</td>
      <td>${it.unit || "-"}</td>
      <td>${it.expDate || "-"}</td>
      <td>${it.info || "-"}</td>
      <td>${it.receivedAt || "-"}</td>
      <td>${it.supplierName || "-"}</td>
      <td>${stockNow}</td>
      <td>
        <input type="number" min="0" step="1" value="${stockNow}" data-id="${it.id}" class="opname-input" />
      </td>
      <td>
        <span class="badge badge-${st.key}">${st.label}</span>
        <button class="btn-table small" data-act="save-opname" data-id="${it.id}">Simpan</button>
      </td>
    `;
    opnameTableBody.appendChild(tr);
  });

  opnameTableBody.querySelectorAll("button[data-act='save-opname']").forEach((btn) => {
    btn.addEventListener("click", () => saveOpname(btn.getAttribute("data-id")));
  });
}

if (opnameGudangSelect) {
  opnameGudangSelect.addEventListener("change", () => {
    pendingOpnameFilter.status = null; // kalau user ganti gudang manual, reset filter status
    renderOpnameTable();
  });
}
if (opnameSearch) opnameSearch.addEventListener("input", renderOpnameTable);

// ================= SAVE OPNAME =================
async function saveOpname(itemId) {
  try {
    const gudang = opnameGudangSelect?.value || "w1";
    const it = itemsCache.find((x) => x.id === itemId);
    if (!it) return;

    const inp = opnameTableBody.querySelector(`input[data-id="${itemId}"]`);
    if (!inp) return;

    const physical = Number(inp.value || 0);
    const system = gudang === "w1" ? Number(it.stockW1 || 0) : Number(it.stockW2 || 0);
    const diff = physical - system;
    const now = new Date();

    // log opname
    await addDoc(colOpname, {
      itemId: it.id,
      itemName: it.name,
      gudang, // w1/w2
      systemStock: system,
      physicalStock: physical,
      diff,
      unit: it.unit || "",
      expDate: it.expDate || "",
      supplierName: it.supplierName || "",
      dateKey: todayKey(now),
      createdAtLocal: now.toISOString(),
      createdAt: serverTimestamp(),
      createdBy: currentUser?.email || "-",
    });

    // update stok item sesuai gudang
    const patch = gudang === "w1" ? { stockW1: physical } : { stockW2: physical };
    await updateDoc(doc(db, "wh_items", it.id), {
      ...patch,
      updatedAt: serverTimestamp(),
      updatedBy: currentUser?.email || "-",
    });

    showToast(`Opname tersimpan (${gudang.toUpperCase()})`, "success");
  } catch (e) {
    console.error(e);
    showToast("Gagal simpan opname", "error");
  }
}

// ================= TRANSFER W1 -> W2 =================
async function doMoveW1toW2() {
  try {
    const keyword = (moveSearch?.value || "").trim().toLowerCase();
    const itemId = moveItemSelect?.value || "";
    const qty = Number(moveQty?.value || 0);

    if (!itemId) return showToast("Pilih item untuk dipindah", "error");
    if (!qty || qty <= 0) return showToast("Qty pindah wajib > 0", "error");

    const it = itemsCache.find((x) => x.id === itemId);
    if (!it) return;

    const w1 = Number(it.stockW1 || 0);
    if (qty > w1) return showToast(`Stok Gudang 1 kurang (stok ${w1})`, "error");

    const now = new Date();

    // log move
    await addDoc(colMoves, {
      itemId: it.id,
      itemName: it.name,
      qty,
      unit: it.unit || "",
      from: "w1",
      to: "w2",
      dateKey: todayKey(now),
      createdAtLocal: now.toISOString(),
      createdAt: serverTimestamp(),
      createdBy: currentUser?.email || "-",
    });

    // update stok
    await updateDoc(doc(db, "wh_items", it.id), {
      stockW1: w1 - qty,
      stockW2: Number(it.stockW2 || 0) + qty,
      updatedAt: serverTimestamp(),
      updatedBy: currentUser?.email || "-",
    });

    showToast("Transfer W1 → W2 berhasil", "success");
    if (moveQty) moveQty.value = "";
  } catch (e) {
    console.error(e);
    showToast("Gagal transfer", "error");
  }
}

if (btnMove) btnMove.addEventListener("click", doMoveW1toW2);

// ================= WASTE =================
async function saveWaste() {
  try {
    const gudang = wasteGudangSelect?.value || "w1";
    const itemId = wasteItemSelect?.value || "";
    const date = wasteDate?.value || todayKey(new Date());
    const gram = Number(wasteGram?.value || 0);
    const ml = Number(wasteMl?.value || 0);
    const note = (wasteNote?.value || "").trim();

    if (!itemId) return showToast("Pilih item waste", "error");
    if ((gram <= 0) && (ml <= 0)) return showToast("Isi waste gram atau ml", "error");

    const it = itemsCache.find((x) => x.id === itemId);
    if (!it) return;

    const now = new Date();

    await addDoc(colWaste, {
      itemId: it.id,
      itemName: it.name,
      gudang,
      wasteDate: date,
      gram,
      ml,
      unit: it.unit || "",
      note,
      dateKey: date, // pakai tanggal waste sebagai filter laporan
      createdAtLocal: now.toISOString(),
      createdAt: serverTimestamp(),
      createdBy: currentUser?.email || "-",
    });

    // ✅ waste juga potong stok (anggap 1 unit stok = 1 “paket/dus/pcs”)
    // kalau kamu mau waste gram/ml tidak memotong stok unit, bilang ya nanti aku bikin konversi per item.
    const cur = gudang === "w1" ? Number(it.stockW1 || 0) : Number(it.stockW2 || 0);
    const next = Math.max(cur - 1, 0); // default: waste 1 unit
    const patch = gudang === "w1" ? { stockW1: next } : { stockW2: next };

    await updateDoc(doc(db, "wh_items", it.id), {
      ...patch,
      updatedAt: serverTimestamp(),
      updatedBy: currentUser?.email || "-",
    });

    showToast("Waste tersimpan", "success");
    if (wasteGram) wasteGram.value = "";
    if (wasteMl) wasteMl.value = "";
    if (wasteNote) wasteNote.value = "";
  } catch (e) {
    console.error(e);
    showToast("Gagal simpan waste", "error");
  }
}

if (btnSaveWaste) btnSaveWaste.addEventListener("click", saveWaste);

// ================= REPORTS =================
function renderReportHead(kind) {
  if (!reportTableHead) return;
  reportTableHead.innerHTML = "";

  const tr = document.createElement("tr");
  if (kind.startsWith("opname_")) {
    tr.innerHTML = `
      <th>Tanggal</th>
      <th>Item</th>
      <th>Gudang</th>
      <th>Stok Sistem</th>
      <th>Stok Fisik</th>
      <th>Selisih</th>
      <th>User</th>
    `;
  } else {
    tr.innerHTML = `
      <th>Tanggal Waste</th>
      <th>Item</th>
      <th>Gudang</th>
      <th>Gram</th>
      <th>ML</th>
      <th>Catatan</th>
      <th>User</th>
    `;
  }
  reportTableHead.appendChild(tr);
}

async function generateReport() {
  if (!reportTableBody || !reportType || !reportStart || !reportEnd) return;

  const kind = reportType.value || "opname_w1";
  const start = reportStart.value || todayKey(new Date());
  const end = reportEnd.value || todayKey(new Date());

  if (end < start) return showToast("Tanggal akhir tidak boleh < tanggal awal", "error");

  reportTableBody.innerHTML = "";
  renderReportHead(kind);

  try {
    if (kind.startsWith("opname_")) {
      const gudang = kind.endsWith("_w2") ? "w2" : "w1";
      const qy = query(
        colOpname,
        where("gudang", "==", gudang),
        where("dateKey", ">=", start),
        where("dateKey", "<=", end),
        orderBy("dateKey", "desc")
      );

      const snap = await getDocs(qy);
      if (snap.empty) {
        reportTableBody.innerHTML = `<tr><td colspan="7">Tidak ada data.</td></tr>`;
        return;
      }

      snap.forEach((d) => {
        const r = d.data();
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${r.dateKey || "-"}</td>
          <td>${r.itemName || "-"}</td>
          <td>${(r.gudang || "-").toUpperCase()}</td>
          <td>${Number(r.systemStock || 0)}</td>
          <td>${Number(r.physicalStock || 0)}</td>
          <td>${Number(r.diff || 0)}</td>
          <td>${r.createdBy || "-"}</td>
        `;
        reportTableBody.appendChild(tr);
      });
    } else {
      const gudang = kind.endsWith("_w2") ? "w2" : "w1";
      const qy = query(
        colWaste,
        where("gudang", "==", gudang),
        where("dateKey", ">=", start),
        where("dateKey", "<=", end),
        orderBy("dateKey", "desc")
      );

      const snap = await getDocs(qy);
      if (snap.empty) {
        reportTableBody.innerHTML = `<tr><td colspan="7">Tidak ada data.</td></tr>`;
        return;
      }

      snap.forEach((d) => {
        const r = d.data();
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${r.dateKey || "-"}</td>
          <td>${r.itemName || "-"}</td>
          <td>${(r.gudang || "-").toUpperCase()}</td>
          <td>${Number(r.gram || 0)}</td>
          <td>${Number(r.ml || 0)}</td>
          <td>${r.note || "-"}</td>
          <td>${r.createdBy || "-"}</td>
        `;
        reportTableBody.appendChild(tr);
      });
    }

    showToast("Laporan dibuat", "success");
  } catch (e) {
    console.error(e);
    showToast("Gagal generate laporan (cek index Firestore)", "error", 4000);
  }
}

if (btnReport) btnReport.addEventListener("click", generateReport);

// ================= AUTH =================
onAuthStateChanged(auth, (user) => {
  currentUser = user || null;
  if (!user) {
    showToast("Silakan login dulu", "info");
    return;
  }
  bindDashboardClicks();
  showOnly("dash");
  startItemsRealtime();
});