/* ============================================================
   Key Vault - Service Worker
   Caches core assets for offline viewing
   ============================================================ */

const CACHE_NAME = 'key-vault-v1';
const CORE_ASSETS = [
  '/index.html',
  '/style.css',
  '/script.js',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;800&display=swap'
];

// Install: cache core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching core assets');
      return cache.addAll(CORE_ASSETS).catch((err) => {
        console.warn('[SW] Failed to cache some assets:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    })
  );
  self.clients.claim();
});

// Fetch: network-first for API calls, cache-first for assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests and Firebase requests (always need network)
  if (
    event.request.method !== 'GET' ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('google') ||
    url.hostname.includes('googleapis')
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request).then((response) => {
        if (response && response.status === 200) {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
        }
        return response;
      }).catch(() => cached); // fallback to cache on network error

      return cached || fetchPromise;
    })
  );
});
