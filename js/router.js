/* Minimal History-API SPA router.
   Routes declare a page fragment (fetched once, cached) and a lazy module
   whose init(params) runs after the fragment is in the DOM. init may return
   a cleanup function, called before the next navigation. */

const routes = [];
let outlet = null;
let onChange = null;
let currentCleanup = null;
let renderSeq = 0;
const pageCache = new Map();

export function defineRoutes(defs, options) {
  routes.push(...defs);
  outlet = options.outlet;
  onChange = options.onChange || null;
}

function matchRoute(path) {
  for (const route of routes) {
    const keys = [];
    const pattern = route.path.replace(/:[^/]+/g, (seg) => {
      keys.push(seg.slice(1));
      return '([^/]+)';
    });
    const hit = path.match(new RegExp(`^${pattern}/?$`));
    if (hit) {
      const params = {};
      keys.forEach((k, i) => { params[k] = decodeURIComponent(hit[i + 1]); });
      return { route, params };
    }
  }
  return null;
}

async function loadPage(url) {
  if (!pageCache.has(url)) {
    const res = await fetch(url, { cache: 'no-cache' }); // revalidate fragments
    if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
    pageCache.set(url, await res.text());
  }
  return pageCache.get(url);
}

export async function render() {
  let matched = matchRoute(location.pathname);
  if (!matched) {
    history.replaceState({}, '', '/');
    matched = matchRoute('/');
  }
  const seq = ++renderSeq;

  if (typeof currentCleanup === 'function') {
    try { currentCleanup(); } catch (err) { console.warn('route cleanup failed', err); }
    currentCleanup = null;
  }

  const { route, params } = matched;
  document.title = route.title ? `${route.title} — SVN OS` : 'SVN OS';

  const html = await loadPage(route.page);
  if (seq !== renderSeq) return;

  outlet.innerHTML = html;
  window.scrollTo(0, 0);
  if (onChange) onChange(route);

  let mod;
  try {
    mod = await route.module();
  } catch (err) {
    console.error('view module failed to load', err);
    if (seq === renderSeq) outlet.innerHTML = viewError();
    return;
  }
  if (seq !== renderSeq) return;

  try {
    const cleanup = await mod.init(params);
    if (seq === renderSeq && typeof cleanup === 'function') currentCleanup = cleanup;
  } catch (err) {
    console.error('view failed to render', err);
    if (seq === renderSeq) outlet.innerHTML = viewError();
  }
}

/* Shown in the outlet when a view can't load — no blank screen, ever. */
function viewError() {
  return `
    <div class="view-error empty">
      <p class="empty-title">Something went sideways.</p>
      <p class="empty-sub">This view didn’t load. Your data is safe — try again.</p>
      <button type="button" class="btn" data-view-retry>Try again</button>
    </div>`;
}

export function navigate(path, { replace = false } = {}) {
  if (replace) history.replaceState({}, '', path);
  else history.pushState({}, '', path);
  render();
}

export function startRouter() {
  window.addEventListener('popstate', render);
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-view-retry]')) { e.preventDefault(); render(); return; }
    const link = e.target.closest('a[data-link]');
    if (!link) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    const href = link.getAttribute('href');
    if (href && href !== location.pathname) navigate(href);
  });
  render();
}
