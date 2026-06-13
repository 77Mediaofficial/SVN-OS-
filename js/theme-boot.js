/* Pre-paint theme + appearance application.
   Loaded as a render-blocking classic script in <head> so the chosen
   theme is on <html> before the first paint — no flash of the wrong
   theme. First-party, so it satisfies the strict CSP (script-src 'self').
   The ES-module appearance.js remains the source of truth for changes. */
(function () {
  try {
    var a = JSON.parse(localStorage.getItem('svnos-appearance-v1')) || {};
    var theme = a.theme || 'light';
    if (theme === 'system') {
      theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    var root = document.documentElement;
    if (theme === 'dark') root.classList.add('theme-dark');
    if (a.textSize === 'large') root.classList.add('text-lg');
    if (a.density === 'compact') root.classList.add('compact');
  } catch (e) { /* fall through to the light default */ }
})();
