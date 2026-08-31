const CACHE_NAME = 'shailputri-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './login.html',
  './style.css',
  './script.js',
  './manifest.json',
  './images/placeholder.png'
];

// Install Event
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate Event
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event (Network first, then cache fallback)
self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('/api/')) {
    // API calls should always hit network
    return;
  }
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});