/* Appearance — device-level display preferences.
   Stored in localStorage (instant, per-device, offline + demo friendly)
   and applied to <html> so the app and the auth gate both inherit them.
   Applied at boot before anything becomes visible, so there's no flash. */

const KEY = 'svnos-appearance-v1';
const DEFAULTS = { textSize: 'normal', density: 'comfortable' };

let current = load();

function load() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY)) }; }
  catch { return { ...DEFAULTS }; }
}

export function getAppearance() {
  return { ...current };
}

export function applyAppearance() {
  const root = document.documentElement;
  root.classList.toggle('text-lg', current.textSize === 'large');
  root.classList.toggle('compact', current.density === 'compact');
}

export function setAppearance(patch) {
  current = { ...current, ...patch };
  localStorage.setItem(KEY, JSON.stringify(current));
  applyAppearance();
}
