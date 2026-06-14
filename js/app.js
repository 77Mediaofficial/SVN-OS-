/* App entry: routes, auth gating, shell wiring, service worker. */

import { DEMO_MODE } from './supabase.js';
import { defineRoutes, startRouter, render } from './router.js';
import { initAuth, bindAuthForm, signOut } from './auth.js';
import { initAppLock, openPrivacySheet } from './applock.js';
import { applyAppearance } from './appearance.js';
import { expandRecurring, resetDemo } from './store.js';
import { initials } from './ui.js';
import { toast } from './toast.js';
import { initSpotlight } from './spotlight.js';

applyAppearance(); // before anything becomes visible — no flash
initSpotlight();   // desktop-only cursor glow on cards (no-op on touch)

const routes = [
  { path: '/',         nav: 'dashboard', title: 'Today',          page: 'pages/dashboard.html',      module: () => import('./modules/dashboard.js') },
  { path: '/content',  nav: 'content',   title: 'Content Engine', page: 'pages/content-engine.html', module: () => import('./modules/content-engine.js') },
  { path: '/calendar', nav: 'calendar',  title: 'Calendar',       page: 'pages/calendar.html',       module: () => import('./modules/calendar.js') },
  { path: '/deals',    nav: 'deals',     title: 'Deals & Ledger', page: 'pages/deals-ledger.html',   module: () => import('./modules/deals-ledger.js') },
  { path: '/analytics', nav: 'analytics', title: 'Analytics',     page: 'pages/analytics.html',      module: () => import('./modules/analytics.js') },
  { path: '/settings', nav: 'settings',   title: 'Settings',       page: 'pages/settings.html',       module: () => import('./modules/settings.js') },
];

const gate = document.getElementById('auth-gate');
const shell = document.getElementById('app');
let routerStarted = false;

defineRoutes(routes, {
  outlet: document.getElementById('outlet'),
  onChange(route) {
    document.querySelectorAll('.nav-link').forEach((a) => {
      if (a.dataset.nav === route.nav) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  },
});

function showApp(user) {
  gate.hidden = true;
  shell.hidden = false;
  const name = user.user_metadata?.full_name || user.email || 'Creator';
  setIdentity(name);

  if (!routerStarted) {
    routerStarted = true;
    startRouter();
    initAppLock();
    expandRecurring()
      .then((created) => {
        if (created.length) toast(`${created.length} recurring transaction${created.length > 1 ? 's' : ''} added to the ledger.`);
      })
      .catch((err) => console.warn('recurring expansion failed', err));
  } else {
    render(); // refresh current view for the signed-in user
  }
}

function setIdentity(name) {
  document.getElementById('user-name').textContent = name;
  document.getElementById('user-avatar').textContent = initials(name);
}

// Settings → Save profile dispatches this so the sidebar updates live.
window.addEventListener('svnos:identity', (e) => {
  if (e.detail?.name) setIdentity(e.detail.name);
});

function showGate() {
  shell.hidden = true;
  gate.hidden = false;
  document.getElementById('auth-email')?.focus();
}

initAuth((user) => (user ? showApp(user) : showGate()));
bindAuthForm();

document.getElementById('signout-btn').addEventListener('click', signOut);
document.getElementById('privacy-btn').addEventListener('click', openPrivacySheet);

if (DEMO_MODE) {
  const pill = document.getElementById('demo-pill');
  pill.hidden = false;
  pill.addEventListener('click', () => {
    toast('Demo mode: paste your Supabase URL + anon key into js/supabase.js, run sql/schema.sql, reload.');
  });
  // Console escape hatch for a fresh demo dataset.
  window.svnos = { resetDemo: () => { resetDemo(); location.reload(); } };
}

// Service worker: production only, so local development never fights a cache.
if ('serviceWorker' in navigator && !['localhost', '127.0.0.1'].includes(location.hostname)) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
