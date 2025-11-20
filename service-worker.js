// =============================
// F&B POS — Service Worker PWA
// =============================

const CACHE_NAME = "fnb-pos-cache-v1";

const FILES_TO_CACHE = [
  "/fnb-post/",
  "/fnb-post/index.html",
  "/fnb-post/script.js",
  "/fnb-post/style.css",
  "/fnb-post/manifest.json",
  "/fnb-post/icon-192.png",
  "/fnb-post/icon-512.png",
];

// Firebase CDN (harus dicache agar app bisa load offline)
const FIREBASE_SDK = [
  "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js",
  "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js",
  "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js"
];

const CHART_JS = [
  "https://cdn.jsdelivr.net/npm/chart.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([...FILES_TO_CACHE, ...FIREBASE_SDK, ...CHART_JS]);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keyList) =>
      Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      )
    )
  );
  self.clients.claim();
});

// =============================
// NETWORK FALLBACK
// =============================
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Avoid caching Firestore / Auth API calls
  if (req.url.includes("firestore") || req.url.includes("googleapis")) {
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      return (
        cached ||
        fetch(req)
          .then((res) => {
            // cache new files dynamically
            return caches.open(CACHE_NAME).then((cache) => {
              cache.put(req, res.clone());
              return res;
            });
          })
          .catch(() => {
            // Offline fallback
            if (req.mode === "navigate") {
              return caches.match("/fnb-post/index.html");
            }
          })
      );
    })
  );
});