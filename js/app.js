/* App entry: routes, auth gating, shell wiring, service worker. */

import { DEMO_MODE } from './supabase.js';
import { defineRoutes, startRouter, render } from './router.js';
import { initAuth, bindAuthForm, signOut } from './auth.js';
import { initAppLock, openPrivacySheet } from './applock.js';
import { applyAppearance } from './appearance.js';
import { expandRecurring, resetDemo, team as teamRepo, getPrefs } from './store.js';
import { initials, esc } from './ui.js';
import { toast } from './toast.js';
import { initSpotlight } from './spotlight.js';
import { initNavIndicator, moveNavPill } from './nav-indicator.js';
import { initCommand } from './command.js';
import { initShortcuts } from './shortcuts.js';
import { initOutbox } from './outbox.js';
import { maybeOnboard } from './onboarding.js';
import { PLAN_BY_ID, PLANS } from './domain.js';

applyAppearance(); // before anything becomes visible — no flash
initSpotlight();   // desktop-only cursor glow on cards (no-op on touch)
initNavIndicator(); // sliding active-link pill in the sidebar
initCommand();      // ⌘K command palette + global quick-create
initShortcuts();    // g-then-key navigation + ? cheat sheet
initOutbox();       // offline indicator + write queue (PWA)
renderLandingPricing(); // pricing strip on the signed-out front door

// The signed-out landing is a real marketing front door: pitch + pricing
// + sign-in. Rendered from the PLANS catalog so it never drifts.
function renderLandingPricing() {
  const el = document.getElementById('landing-pricing');
  if (!el) return;
  el.innerHTML = PLANS.map((p) => `
    <div class="lp-tier${p.featured ? ' is-featured' : ''}">
      <span class="lp-name">${p.name}</span>
      <span class="lp-price"><span class="lp-cur">£</span>${p.monthly}<span class="lp-per">/mo</span></span>
      <span class="lp-seats">${p.seats}</span>
    </div>`).join('');
}

const routes = [
  { path: '/',         nav: 'dashboard', title: 'Today',          page: 'pages/dashboard.html',      module: () => import('./modules/dashboard.js') },
  { path: '/content',  nav: 'content',   title: 'Content Engine', page: 'pages/content-engine.html', module: () => import('./modules/content-engine.js') },
  { path: '/resizer',  nav: 'resizer',   title: 'Resizer',        page: 'pages/resizer.html',         module: () => import('./modules/resizer.js') },
  { path: '/calendar', nav: 'calendar',  title: 'Calendar',       page: 'pages/calendar.html',       module: () => import('./modules/calendar.js') },
  { path: '/deals',    nav: 'deals',     title: 'Deals & Ledger', page: 'pages/deals-ledger.html',   module: () => import('./modules/deals-ledger.js') },
  { path: '/studio',   nav: 'studio',    title: 'Studio',         page: 'pages/studio.html',          module: () => import('./modules/studio.js') },
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
    moveNavPill(); // glide the active-link indicator to the new route
  },
});

function showApp(user) {
  gate.hidden = true;
  shell.hidden = false;
  const name = user.user_metadata?.full_name || user.email || 'Creator';
  setIdentity(name);
  renderWorkspace(); // workspace name + team presence in the sidebar

  if (!routerStarted) {
    routerStarted = true;
    startRouter();
    initAppLock();
    maybeOnboard(); // first-run welcome (shows once)
    expandRecurring()
      .then((created) => {
        if (created.length) {
          toast(`${created.length} recurring transaction${created.length > 1 ? 's' : ''} added to the ledger.`);
          render(); // W2: repaint the current view so just-expanded recurring rows aren't missed
        }
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

// Workspace strip: name + a stacked cluster of teammate avatars, so every
// screen signals this is a multi-seat studio, not a solo tool.
async function renderWorkspace() {
  const strip = document.getElementById('workspace-strip');
  if (!strip) return;
  try {
    const [members, prefs] = await Promise.all([teamRepo.list(), getPrefs()]);
    if (!members.length) return;
    document.getElementById('ws-name').textContent = prefs.business_name || 'Your workspace';
    const planLabel = PLAN_BY_ID[prefs.plan]?.name;
    document.getElementById('ws-sub').textContent =
      `${planLabel ? planLabel + ' · ' : ''}${members.length} ${members.length === 1 ? 'person' : 'people'}`;
    document.getElementById('ws-avatars').innerHTML =
      members.slice(0, 4).map((m) => `<span class="ws-av">${esc(initials(m.name))}</span>`).join('') +
      (members.length > 4 ? `<span class="ws-av ws-av-more">+${members.length - 4}</span>` : '');
    strip.hidden = false;
  } catch { /* leave the strip hidden if the workspace can't load */ }
}

// Settings → Save profile dispatches this so the sidebar updates live.
window.addEventListener('svnos:identity', (e) => {
  if (e.detail?.name) setIdentity(e.detail.name);
});

// Onboarding / workspace changes → refresh the sidebar workspace strip.
window.addEventListener('svnos:workspace', () => renderWorkspace());

function showGate() {
  shell.hidden = true;
  gate.hidden = false;
  document.getElementById('auth-email')?.focus();
}

initAuth((user) => (user ? showApp(user) : showGate()));
bindAuthForm();

document.getElementById('signout-btn').addEventListener('click', signOut);
document.getElementById('privacy-btn').addEventListener('click', openPrivacySheet);

// Preview the signed-out front door from inside the app (palette command).
const landingBack = document.getElementById('landing-back');
window.addEventListener('svnos:landing', () => {
  gate.hidden = false;
  if (landingBack) landingBack.hidden = false;
});
landingBack?.addEventListener('click', () => {
  gate.hidden = true;
  if (landingBack) landingBack.hidden = true;
});

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
