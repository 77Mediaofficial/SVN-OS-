/* Appearance — device-level display preferences.
   Stored in localStorage (instant, per-device, offline + demo friendly)
   and applied to <html> so the app and the auth gate both inherit them.
   Applied before paint by theme-boot.js; this module is the source of
   truth for runtime changes and keeps the system theme in sync. */

const KEY = 'svnos-appearance-v1';
const DEFAULTS = { theme: 'light', textSize: 'normal', density: 'comfortable' };

let current = load();
let systemWatched = false;

function load() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY)) }; }
  catch { return { ...DEFAULTS }; }
}

export function getAppearance() {
  return { ...current };
}

/* 'system' resolves to the OS preference; everything else is literal. */
function resolveTheme() {
  if (current.theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return current.theme;
}

export function applyAppearance() {
  const root = document.documentElement;
  const dark = resolveTheme() === 'dark';
  root.classList.toggle('theme-dark', dark);
  root.classList.toggle('text-lg', current.textSize === 'large');
  root.classList.toggle('compact', current.density === 'compact');

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0a0a09' : '#ffffff');

  watchSystem();
}

/* When following the system, re-apply as the OS flips light/dark.
   The listener is guarded so it no-ops once the user picks a fixed theme. */
function watchSystem() {
  if (systemWatched) return;
  systemWatched = true;
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (current.theme === 'system') applyAppearance();
  });
}

export function setAppearance(patch) {
  current = { ...current, ...patch };
  localStorage.setItem(KEY, JSON.stringify(current));
  applyAppearance();
}
