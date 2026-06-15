/* Global keyboard shortcuts + the ? cheat-sheet.
   Vim-style "g then key" navigation and a help overlay — the kind of
   keyboard-first affordance that signals a serious tool. Ignores keystrokes
   while typing, while a dialog/palette is open, or on the signed-out gate.
   The palette's "Keyboard shortcuts" command opens this via a custom event. */

import { navigate } from './router.js';

const NAV = {
  t: '/', c: '/content', r: '/resizer', l: '/calendar',
  d: '/deals', a: '/analytics', s: '/settings',
};

let root = null;
let awaitingG = false;
let gTimer = 0;

function editable(el) {
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT' || el.isContentEditable);
}

function blocked() {
  if (document.querySelector('dialog[open]')) return true;
  const ob = document.querySelector('.ob-root');
  if (ob && !ob.hidden) return true;
  const cmd = document.querySelector('.cmd-root');
  if (cmd && !cmd.hidden) return true;
  if (document.body.classList.contains('locked')) return true;
  const shell = document.getElementById('app');
  return !shell || shell.hidden;
}

const ROWS_NAV = [
  ['Today', ['G', 'T']], ['Content Engine', ['G', 'C']], ['Resizer', ['G', 'R']],
  ['Calendar', ['G', 'L']], ['Deals & Ledger', ['G', 'D']], ['Analytics', ['G', 'A']],
  ['Settings', ['G', 'S']],
];
const ROWS_CMD = [
  ['Command palette', ['⌘', 'K']], ['Quick find / create', ['⌘', 'K']],
  ['This shortcuts menu', ['?']], ['Close / cancel', ['Esc']],
];

function rowHtml([label, keys]) {
  return `<div class="keys-row"><span>${label}</span>
    <span class="keys-combo">${keys.map((k) => `<kbd>${k}</kbd>`).join('')}</span></div>`;
}

function build() {
  root = document.createElement('div');
  root.className = 'keys-root';
  root.hidden = true;
  root.innerHTML = `
    <div class="keys-backdrop" data-keys-close></div>
    <div class="keys-panel" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
      <header class="keys-head">
        <h2 class="keys-title">Keyboard shortcuts</h2>
        <button type="button" class="modal-close" data-keys-close aria-label="Close">✕</button>
      </header>
      <div class="keys-cols">
        <section><p class="keys-group">Navigate</p>${ROWS_NAV.map(rowHtml).join('')}</section>
        <section><p class="keys-group">Commands</p>${ROWS_CMD.map(rowHtml).join('')}</section>
      </div>
    </div>`;
  document.body.appendChild(root);
  root.addEventListener('click', (e) => { if (e.target.closest('[data-keys-close]')) close(); });
}

function open() {
  if (!root) build();
  if (blocked() && !document.querySelector('.cmd-root:not([hidden])')) { /* allow from palette */ }
  root.hidden = false;
  void root.offsetWidth;
  root.classList.add('is-open');
}

function close() {
  if (!root || root.hidden) return;
  root.classList.remove('is-open');
  setTimeout(() => { if (root) root.hidden = true; }, 180);
}

export function initShortcuts() {
  build();
  window.addEventListener('svnos:shortcuts', open);

  document.addEventListener('keydown', (e) => {
    if (root && !root.hidden) { if (e.key === 'Escape') close(); return; }
    if (editable(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (blocked()) return;

    if (e.key === '?') { e.preventDefault(); open(); return; }

    if (awaitingG) {
      awaitingG = false;
      clearTimeout(gTimer);
      const path = NAV[e.key.toLowerCase()];
      if (path) { e.preventDefault(); navigate(path); }
      return;
    }
    if (e.key === 'g' || e.key === 'G') {
      awaitingG = true;
      clearTimeout(gTimer);
      gTimer = setTimeout(() => { awaitingG = false; }, 1500);
    }
  });
}
