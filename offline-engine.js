/* ========================================================================
   offline-engine.js  
   Turbo Offline Engine • IndexedDB • Snapshot Manager • AutoSync  
   ======================================================================== */

import { 
  addDoc, updateDoc, getDocs, doc, colProducts, colSales, colOpname, serverTimestamp 
} from "./firebase-core.js";

/* ========================================================================
   1) IndexedDB WRAPPER
   ======================================================================== */

const DB_NAME = "FNB_POS_TURBO_DB";
const DB_VERSION = 3;

export let turboDB = null;

export function openTurboDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = req.target.result;

      if (!db.objectStoreNames.contains("snapshot_products"))
        db.createObjectStore("snapshot_products", { keyPath: "id" });

      if (!db.objectStoreNames.contains("snapshot_sales"))
        db.createObjectStore("snapshot_sales", { keyPath: "id" });

      if (!db.objectStoreNames.contains("snapshot_opname"))
        db.createObjectStore("snapshot_opname", { keyPath: "id" });

      if (!db.objectStoreNames.contains("queue_sales"))
        db.createObjectStore("queue_sales", { autoIncrement: true });

      if (!db.objectStoreNames.contains("queue_opname"))
        db.createObjectStore("queue_opname", { autoIncrement: true });
    };

    req.onsuccess = () => {
      turboDB = req.result;
      console.log("⚡ IndexedDB Ready (Turbo Engine)");
      resolve(turboDB);
    };

    req.onerror = () => reject(req.error);
  });
}

await openTurboDB();

/* ========================================================================
   2) BASIC INDEXEDDB FUNCTIONS
   ======================================================================== */

function idbPut(store, data) {
  return new Promise((resolve) => {
    const tx = turboDB.transaction(store, "readwrite");
    tx.objectStore(store).put(data);
    tx.oncomplete = resolve;
  });
}

function idbAdd(store, data) {
  return new Promise((resolve) => {
    const tx = turboDB.transaction(store, "readwrite");
    tx.objectStore(store).add(data);
    tx.oncomplete = resolve;
  });
}

function idbGetAll(store) {
  return new Promise((resolve) => {
    const tx = turboDB.transaction(store, "readonly");
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result || []);
  });
}

function idbClear(store) {
  return new Promise((resolve) => {
    const tx = turboDB.transaction(store, "readwrite");
    tx.objectStore(store).clear();
    tx.oncomplete = resolve;
  });
}

/* ========================================================================
   3) SNAPSHOT MANAGER (products, sales, opname)
   ======================================================================== */

export async function saveSnapshot(storeName, list) {
  await idbClear(storeName);
  for (const item of list) await idbPut(storeName, item);
}

export async function loadSnapshot(storeName) {
  return await idbGetAll(storeName);
}

/* ========================================================================
   4) OFFLINE QUEUE (Sales & Opname)
   ======================================================================== */

export async function queueSaleOffline(data) {
  await idbAdd("queue_sales", data);
  console.log("🟡 Sale saved offline");
}

export async function queueOpnameOffline(data) {
  await idbAdd("queue_opname", data);
  console.log("🟡 Opname saved offline");
}

async function getSalesQueue() {
  return await idbGetAll("queue_sales");
}

async function getOpnameQueue() {
  return await idbGetAll("queue_opname");
}

async function clearSalesQueue() {
  await idbClear("queue_sales");
}

async function clearOpnameQueue() {
  await idbClear("queue_opname");
}

/* ========================================================================
   5) OFFLINE STOCK REDUCTION (BOM)
   ======================================================================== */

export async function applyBomOffline(products, saleDoc) {
  const delta = {};

  saleDoc.items.forEach((it) => {
    const menu = products.find((p) => p.id === it.productId && p.type === "menu");
    if (!menu?.bom) return;

    menu.bom.forEach((b) => {
      const use = Number(b.qty) * it.qty;
      if (!delta[b.materialId]) delta[b.materialId] = 0;
      delta[b.materialId] -= use;
    });
  });

  // Apply stock changes locally
  for (const id in delta) {
    const p = products.find((x) => x.id === id);
    if (!p) continue;
    p.stock = Math.max(0, (p.stock || 0) + delta[id]);
  }

  await saveSnapshot("snapshot_products", products);

  console.log("⚙ BOM applied offline");
}

/* ========================================================================
   6) SYNC OFFLINE QUEUE TO SERVER
   ======================================================================== */

export async function syncAllOfflineToServer(productsCache) {
  if (!navigator.onLine) return;

  console.log("🚀 Syncing offline data...");

  /* --- SALES --- */
  const salesQueue = await getSalesQueue();
  for (const s of salesQueue) {
    await addDoc(colSales, { ...s, createdAt: serverTimestamp() });
  }
  await clearSalesQueue();
  console.log(`✔ Sync Sales: ${salesQueue.length}`);

  /* --- OPNAME --- */
  const opnameQueue = await getOpnameQueue();
  for (const o of opnameQueue) {
    await addDoc(colOpname, {
      ...o,
      createdAt: serverTimestamp(),
    });

    await updateDoc(doc(colProducts, o.productId), {
      stock: o.physicalStock,
      updatedAt: serverTimestamp(),
    });
  }
  await clearOpnameQueue();
  console.log(`✔ Sync Opname: ${opnameQueue.length}`);

  /* --- STOCK MERGE BACK TO SERVER --- */
  const snapshotProducts = await loadSnapshot("snapshot_products");

  const serverList = [];
  const snap = await getDocs(colProducts);
  snap.forEach((d) => serverList.push({ id: d.id, ...d.data() }));

  const updates = [];

  for (const offline of snapshotProducts) {
    const server = serverList.find((p) => p.id === offline.id);
    if (!server) continue;

    if (offline.stock !== server.stock) {
      updates.push(
        updateDoc(doc(colProducts, offline.id), {
          stock: offline.stock,
          updatedAt: serverTimestamp(),
        })
      );
    }
  }

  if (updates.length) {
    await Promise.all(updates);
    console.log("🔧 Stock merged");
  }

  console.log("✅ Offline sync complete");
}

/* ========================================================================
   7) AUTOSYNC LISTENERS
   ======================================================================== */

window.addEventListener("online", () => {
  console.log("🌐 Online — starting autosync...");
  setTimeout(() => {
    if (window.turboSyncCallback) window.turboSyncCallback();
  }, 500);
});

console.log("🔥 offline-engine.js loaded successfully");