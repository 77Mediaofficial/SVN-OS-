/* SVN OS — service worker
   Caches the static app shell so the UI loads instantly and works
   without network. Supabase API requests always go to the network
   (they're auth + user-scoped data; never cache those). */

const VERSION = 'svn-os-v8';
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;

// Pre-cache the static app shell on install.
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
  '/icons/icon.svg',
  '/css/main.css',
  '/css/modules/content-engine.css',
  '/js/router.js',
  '/js/supabase.js',
  '/js/auth.js',
  '/js/toast.js',
  '/js/command-palette.js',
  '/js/notifications.js',
  '/js/install-prompt.js',
  '/js/offline.js',
  '/js/drag.js',
  '/js/preferences.js',
  '/js/skeleton.js',
  '/js/tooltips.js',
  '/js/form-cache.js',
  '/js/modules/dashboard.js',
  '/js/modules/content-engine.js',
  '/js/modules/calendar.js',
  '/js/modules/deals-ledger.js',
  '/js/modules/invoice.js',
  '/js/modules/content-templates.js',
  '/js/modules/landing.js',
  '/js/modules/analytics.js',
  '/js/modules/goals.js',
  '/js/modules/settings.js',
  '/js/modules/demo-data.js',
  '/js/modules/export.js',
  '/js/modules/recurrence.js',
  '/js/modules/public-profile.js',
  '/pages/dashboard.html',
  '/pages/content-engine.html',
  '/pages/calendar.html',
  '/pages/deals-ledger.html',
  '/pages/analytics.html',
  '/pages/goals.html',
  '/pages/settings.html',
  '/pages/public-profile.html',
  '/pages/landing.html',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      // Use individual adds so one missing asset doesn't fail the whole install.
      Promise.all(
        SHELL_ASSETS.map((url) =>
          cache.add(url).catch(() => { /* skip missing asset */ })
        )
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== SHELL_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never cache cross-origin requests (Supabase API, CDN scripts).
  if (url.origin !== self.location.origin) return;

  // Navigation: serve the cached app shell so the SPA can boot offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() =>
        caches.match('/index.html', { ignoreSearch: true })
          .then((r) => r || caches.match('/'))
      )
    );
    return;
  }

  // Static assets: cache-first with background refresh.
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req).then((response) => {
        if (response && response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(req, copy));
        }
        return response;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
