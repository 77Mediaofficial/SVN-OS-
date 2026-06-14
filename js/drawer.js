/* Slide-over drawer — a single right-anchored detail panel, reused
   across the app. openDrawer() fills and reveals it; closeDrawer()
   (Esc, backdrop, or any [data-close]) hides it. Footer buttons
   delegate through onAction(key) so each caller keeps its own
   handlers. Themed entirely through CSS tokens, so it matches both
   the white and warm-black themes without changes here. */

import { esc } from './ui.js';

let root = null;
let panel = null;
let titleEl = null;
let eyebrowEl = null;
let bodyEl = null;
let actionsEl = null;
let lastFocus = null;
let onActionFn = null;
let hideTimer = null;

function build() {
  root = document.createElement('div');
  root.className = 'drawer-root';
  root.hidden = true;
  root.innerHTML = `
    <div class="drawer-backdrop" data-close></div>
    <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" tabindex="-1">
      <header class="drawer-head">
        <div>
          <p class="drawer-eyebrow" id="drawer-eyebrow"></p>
          <h2 class="drawer-title" id="drawer-title"></h2>
        </div>
        <button type="button" class="modal-close" data-close aria-label="Close">✕</button>
      </header>
      <div class="drawer-body" id="drawer-body"></div>
      <footer class="drawer-actions" id="drawer-actions"></footer>
    </aside>`;
  document.body.appendChild(root);

  panel = root.querySelector('.drawer');
  titleEl = root.querySelector('#drawer-title');
  eyebrowEl = root.querySelector('#drawer-eyebrow');
  bodyEl = root.querySelector('#drawer-body');
  actionsEl = root.querySelector('#drawer-actions');

  root.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]');
    if (action) { onActionFn?.(action.dataset.action); return; }
    if (e.target.closest('[data-close]')) closeDrawer();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && root && !root.hidden) closeDrawer();
  });
}

export function openDrawer({ title = '', eyebrow = '', body = '', actions = [], onAction = null } = {}) {
  if (!root) build();
  clearTimeout(hideTimer);
  onActionFn = onAction;
  lastFocus = document.activeElement;

  eyebrowEl.textContent = eyebrow;
  eyebrowEl.hidden = !eyebrow;
  titleEl.textContent = title;
  bodyEl.innerHTML = body;
  bodyEl.scrollTop = 0;
  actionsEl.innerHTML = actions.map((a) =>
    `<button type="button" class="btn${a.variant ? ` btn-${a.variant}` : ''}" data-action="${esc(a.key)}">${esc(a.label)}</button>`
  ).join('');
  actionsEl.hidden = !actions.length;

  root.hidden = false;
  document.body.classList.add('drawer-open');
  // Commit the off-canvas start state with a forced reflow, then add
  // the open class so the transform transitions in. More reliable than
  // requestAnimationFrame, which is throttled when the tab isn't painting.
  void panel.offsetWidth;
  root.classList.add('is-open');
  panel.focus();
}

export function closeDrawer() {
  if (!root || root.hidden) return;
  root.classList.remove('is-open');
  document.body.classList.remove('drawer-open');
  onActionFn = null;
  if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
  // Keep it in the DOM until the slide-out finishes, then hide.
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => { if (root) root.hidden = true; }, 340);
}
