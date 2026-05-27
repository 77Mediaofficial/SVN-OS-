const routes = {
  '/': { page: 'dashboard', module: () => import('./modules/dashboard.js') },
  '/content': { page: 'content-engine', module: () => import('./modules/content-engine.js') },
  '/calendar': { page: 'calendar', module: () => import('./modules/calendar.js') },
  '/deals': { page: 'deals-ledger', module: () => import('./modules/deals-ledger.js') },
  '/settings': { page: 'settings', module: () => import('./modules/settings.js') },
};

let currentCleanup = null;

async function loadRoute(path) {
  const route = routes[path] || routes['/'];
  const outlet = document.getElementById('app-outlet');

  if (currentCleanup) {
    currentCleanup();
    currentCleanup = null;
  }

  try {
    const res = await fetch(`/pages/${route.page}.html`);
    outlet.innerHTML = await res.text();
    const mod = await route.module();
    if (mod.init) {
      currentCleanup = await mod.init() || null;
    }
  } catch (e) {
    outlet.innerHTML = `<div class="error-state"><h2>Failed to load page</h2></div>`;
  }

  updateActiveNav(path);
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
