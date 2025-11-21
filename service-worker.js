// service-worker.js
const CACHE_VERSION = 'v4';
const CACHE_NAME = `fnb-pos-${CACHE_VERSION}`;

const OFFLINE_ASSETS = [
  './',
  './index.html',
  './style.css?v=3',
  './script.js?v=3',
  './manifest.json',

  // eksternal (akan dicache saat pertama kali berhasil di-fetch)
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdn.jsdelivr.net/npm/lucide-static@latest/font/lucide.css'
];

// Install: pre-cache file utama
self.addEventListener('install', (event) => {
  console.log('[SW] Install');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(OFFLINE_ASSETS).catch((err) => {
        console.warn('[SW] Gagal pre-cache sebagian asset', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate: hapus cache lama
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate');
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('fnb-pos-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch: network first untuk navigasi, cache fallback; cache first untuk asset
self.addEventListener('fetch', (event) => {
  const req = event.request;

  if (req.method !== 'GET') return;

  // Navigasi (buka / reload halaman)
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(req, resClone);
          });
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Asset: cache-first
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;

      return fetch(req)
        .then((res) => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          return res;
        })
        .catch(() => cached);
    })
  );
});