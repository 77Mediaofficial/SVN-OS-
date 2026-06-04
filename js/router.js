import { requireAuth } from './auth.js';
import { isAuthenticated } from './supabase.js';

export const routes = {
  '/':        { page: 'dashboard',      module: () => import('./modules/dashboard.js'),      requiresAuth: true },
  '/welcome': { page: 'landing',        module: () => import('./modules/landing.js'),        requiresAuth: false },
  '/content': { page: 'content-engine',  module: () => import('./modules/content-engine.js'), requiresAuth: true },
  '/calendar':{ page: 'calendar',        module: () => import('./modules/calendar.js'),       requiresAuth: true },
  '/deals':   { page: 'deals-ledger',    module: () => import('./modules/deals-ledger.js'),   requiresAuth: true },
  '/analytics':{page: 'analytics',       module: () => import('./modules/analytics.js'),      requiresAuth: true },
  '/goals':   { page: 'goals',           module: () => import('./modules/goals.js'),          requiresAuth: true },
  '/settings':{ page: 'settings',        module: () => import('./modules/settings.js'),       requiresAuth: true },
};

// Dynamic-segment routes, matched in order if no static route matches.
const dynamicRoutes = [
  {
    pattern: /^\/u\/([a-z0-9_-]{3,32})$/i,
    page: 'public-profile',
    module: () => import('./modules/public-profile.js'),
    requiresAuth: false,
    paramName: 'username',
  },
];

let currentCleanup = null;

function matchRoute(path) {
  if (routes[path]) return { ...routes[path], path, params: {} };
  for (const r of dynamicRoutes) {
    const m = path.match(r.pattern);
    if (m) {
      return { ...r, path, params: { [r.paramName]: m[1] } };
    }
  }
  return null;
}

async function loadRoute(path) {
  let route = matchRoute(path);

  // Validate the route — redirect unknown paths to /
  if (!route) {
    window.history.replaceState({}, '', '/');
    route = matchRoute('/');
  }

  // Enforce auth for protected routes.
  if (route.requiresAuth) {
    // First-time / signed-out visitors landing on the root see the
    // marketing page instead of a bare auth modal. Deep links to a
    // specific protected route still prompt to sign in directly.
    if (!isAuthenticated() && (path === '/' || path === '')) {
      window.history.replaceState({}, '', '/welcome');
      route = matchRoute('/welcome');
    } else {
      const user = await requireAuth();
      if (!user) return; // Auth modal is displayed; don't load the route
    }
  }

  const outlet = document.getElementById('app-outlet');

  if (currentCleanup) {
    currentCleanup();
    currentCleanup = null;
  }

  try {
    const res = await fetch(`/pages/${route.page}.html`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    outlet.innerHTML = await res.text();
    const mod = await route.module();
    if (mod.init) {
      currentCleanup = await mod.init(route.params) || null;
    }
  } catch (e) {
    outlet.innerHTML = `<div class="error-state"><h2>Failed to load page</h2></div>`;
  }

  updateActiveNav(route.path);
}

function updateActiveNav(path) {
  document.querySelectorAll('.nav-link').forEach(link => {
    const href = link.getAttribute('data-route');
    link.classList.toggle('active', href === path);
  });
}

export function navigate(path) {
  window.history.pushState({}, '', path);
  loadRoute(path);
}

export function initRouter() {
  document.addEventListener('click', (e) => {
    const link = e.target.closest('[data-route]');
    if (link) {
      e.preventDefault();
      navigate(link.getAttribute('data-route'));
    }
  });

  window.addEventListener('popstate', () => {
    loadRoute(window.location.pathname);
  });

  loadRoute(window.location.pathname);
}
