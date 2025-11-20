// service-worker.js
const CACHE_NAME = "fnb-pos-cache-v1";

// Daftar file yang *wajib* ada offline (app shell)
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./style.css",      // ganti kalau namanya beda, misal styles.css
  "./script.js",
  "./favicon.png"     // kalau belum ada, boleh dihapus baris ini
];

// Install: pre-cache semua ASSETS
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate: bersihin cache lama kalau ada versi baru
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch: strategi **cache-first** untuk file statis,
// dan **network-first** dengan fallback cache untuk sisanya
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Hanya handle GET
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // ====== SAME-ORIGIN (file web kamu sendiri) -> CACHE FIRST ======
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          // simpan ke cache untuk kunjungan berikutnya
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(req, res.clone());
            return res;
          });
        });
      })
    );
    return;
  }

  // ====== CROSS-ORIGIN (firebase, chart.js, dll) -> NETWORK FIRST ======
  event.respondWith(
    fetch(req)
      .then((res) => {
        // simpan di cache juga supaya kalau offline masih bisa pakai
        return caches.open(CACHE_NAME).then((cache) => {
          cache.put(req, res.clone());
          return res;
        });
      })
      .catch(() =>
        // kalau offline dan sudah pernah di-cache
        caches.match(req)
      )
  );
});