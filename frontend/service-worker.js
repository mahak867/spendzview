const CACHE_NAME = 'spendsense-v1';
const STATIC_ASSETS = [
  '/',
  '/dashboard',
  '/styles.css',
  '/app.js',
  '/manifest.json',
];

// Install: cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS.filter(Boolean))).catch(() => {})
  );
  self.skipWaiting();
});

// Activate: remove old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first for API, cache-first for static
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET and API requests (always network)
  if (event.request.method !== 'GET' || url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// Background sync for offline expense adds
self.addEventListener('sync', event => {
  if (event.tag === 'sync-expenses') {
    event.waitUntil(syncOfflineExpenses());
  }
});

async function syncOfflineExpenses() {
  try {
    const db = await openIDB();
    const tx = db.transaction('offline-expenses', 'readwrite');
    const store = tx.objectStore('offline-expenses');
    const all = await getAllFromStore(store);
    for (const expense of all) {
      await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(expense)
      });
      store.delete(expense._offlineId);
    }
  } catch (e) {
    console.error('Offline sync failed:', e);
  }
}

function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('spendsense-offline', 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('offline-expenses', { keyPath: '_offlineId', autoIncrement: true });
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = e => reject(e);
  });
}

function getAllFromStore(store) {
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = e => reject(e);
  });
}
