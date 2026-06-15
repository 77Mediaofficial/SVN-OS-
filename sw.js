/* SVN OS service worker — app-shell precache + runtime cache.
   Bump VERSION on every deploy to invalidate old caches. */
const VERSION = 'svn-os-v14';
const SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/js/theme-boot.js',
  '/css/fonts.css',
  '/css/main.css',
  '/fonts/switzer-400.woff2',
  '/fonts/switzer-500.woff2',
  '/fonts/switzer-600.woff2',
  '/fonts/switzer-700.woff2',
  '/fonts/clashdisplay-400.woff2',
  '/fonts/clashdisplay-500.woff2',
  '/fonts/clashdisplay-600.woff2',
  '/fonts/splinesansmono-400.woff2',
  '/fonts/splinesansmono-500.woff2',
  '/js/app.js',
  '/js/router.js',
  '/js/domain.js',
  '/js/applock.js',
  '/js/appearance.js',
  '/js/supabase.js',
  '/js/store.js',
  '/js/auth.js',
  '/js/toast.js',
  '/js/ui.js',
  '/js/drag.js',
  '/js/drawer.js',
  '/js/spotlight.js',
  '/js/nav-indicator.js',
  '/js/command.js',
  '/js/tabs.js',
  '/js/modules/dashboard.js',
  '/js/modules/content-engine.js',
  '/js/modules/calendar.js',
  '/js/modules/deals-ledger.js',
  '/js/modules/invoice.js',
  '/js/modules/analytics.js',
  '/js/modules/settings.js',
  '/pages/dashboard.html',
  '/pages/content-engine.html',
  '/pages/calendar.html',
  '/pages/deals-ledger.html',
  '/pages/analytics.html',
  '/pages/settings.html'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // SPA navigations: network first, fall back to the cached shell.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Same-origin static assets: stale-while-revalidate.
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fresh = fetch(request)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(VERSION).then((cache) => cache.put(request, copy));
            }
            return res;
          })
          .catch(() => cached);
        return cached || fresh;
      })
    );
  }
});
