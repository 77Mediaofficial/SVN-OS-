/* ============================================================
   SVN OS — Command Palette (Cmd+K / Ctrl+K)
   Spotlight-style quick navigation and actions
   ============================================================ */

import { navigate } from '/js/router.js';

let overlay = null;
let styleInjected = false;
let activeIndex = 0;

const commands = [
  { section: 'Navigate', label: 'Dashboard',       action: () => navigate('/'),        hint: 'G then D' },
  { section: 'Navigate', label: 'Content Engine',   action: () => navigate('/content'), hint: 'G then C' },
  { section: 'Navigate', label: 'Calendar',         action: () => navigate('/calendar'),hint: 'G then A' },
  { section: 'Navigate', label: 'Deals & Ledger',   action: () => navigate('/deals'),   hint: 'G then L' },
  { section: 'Actions',  label: 'New Project',      action: () => { navigate('/content'); }, hint: 'N then P' },
  { section: 'Actions',  label: 'New Deal',         action: () => { navigate('/deals'); },   hint: 'N then D' },
  { section: 'Actions',  label: 'New Transaction',  action: () => { navigate('/deals'); },   hint: 'N then T' },
  { section: 'Quick',    label: 'Sign Out',         action: () => signOut(),             hint: '' },
];

async function signOut() {
  try {
    const { db } = await import('/js/supabase.js');
    await db.auth.signOut();
    window.location.reload();
  } catch (_) {
    window.location.reload();
  }
}

function fuzzyMatch(query, text) {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t.includes(q)) return true;
  // Simple character-by-character fuzzy
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

function injectStyles() {
  if (styleInjected) return;
  styleInjected = true;

  const style = document.createElement('style');
  style.textContent = `
    .cmd-palette-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(8px);
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding-top: 18vh;
      z-index: 10000;
      opacity: 0;
      transition: opacity 180ms ease;
    }

    .cmd-palette-overlay.cmd-palette--visible {
      opacity: 1;
    }

    .cmd-palette {
      width: 100%;
      max-width: 520px;
      background: #161616;
      border: 1px solid #2a2a2a;
      border-radius: 12px;
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.04);
      overflow: hidden;
      transform: scale(0.95);
      opacity: 0;
      transition: transform 180ms cubic-bezier(0.4, 0, 0.2, 1),
                  opacity 180ms cubic-bezier(0.4, 0, 0.2, 1);
    }

    .cmd-palette-overlay.cmd-palette--visible .cmd-palette {
      transform: scale(1);
      opacity: 1;
    }

    .cmd-palette-input-wrap {
      display: flex;
      align-items: center;
      padding: 0 18px;
      border-bottom: 1px solid #222;
    }

    .cmd-palette-search-icon {
      width: 18px;
      height: 18px;
      color: #555;
      flex-shrink: 0;
    }

    .cmd-palette-input {
      flex: 1;
      background: none;
      border: none;
      outline: none;
      color: #f0f0f0;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 0.95rem;
      padding: 16px 14px;
      caret-color: #777;
    }

    .cmd-palette-input::placeholder {
      color: #444;
    }

    .cmd-palette-results {
      max-height: 340px;
      overflow-y: auto;
      padding: 6px 0;
    }

    .cmd-palette-results::-webkit-scrollbar {
      width: 4px;
    }

    .cmd-palette-results::-webkit-scrollbar-track {
      background: transparent;
    }

    .cmd-palette-results::-webkit-scrollbar-thumb {
      background: #333;
      border-radius: 4px;
    }

    .cmd-palette-section {
      padding: 8px 18px 4px;
      font-size: 0.65rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #555;
    }

    .cmd-palette-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 18px;
      cursor: pointer;
      transition: background 100ms ease;
    }

    .cmd-palette-item:hover,
    .cmd-palette-item.cmd-palette-item--active {
      background: #1e1e1e;
    }

    .cmd-palette-item--active {
      background: #1e1e1e;
    }

    .cmd-palette-item-label {
      font-size: 0.87rem;
      font-weight: 400;
      color: #e0e0e0;
    }

    .cmd-palette-item--active .cmd-palette-item-label {
      color: #fff;
      font-weight: 500;
    }

    .cmd-palette-item-hint {
      font-size: 0.7rem;
      font-family: 'JetBrains Mono', 'SF Mono', monospace;
      color: #444;
      flex-shrink: 0;
      margin-left: 12px;
    }

    .cmd-palette-empty {
      padding: 24px 18px;
      text-align: center;
      color: #444;
      font-size: 0.82rem;
    }

    .cmd-palette-footer {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 10px 18px;
      border-top: 1px solid #222;
    }

    .cmd-palette-footer-hint {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 0.68rem;
      color: #444;
    }

    .cmd-palette-footer-hint kbd {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 20px;
      height: 20px;
      padding: 0 5px;
      background: #222;
      border: 1px solid #333;
      border-radius: 4px;
      font-family: 'Inter', -apple-system, sans-serif;
      font-size: 0.62rem;
      color: #666;
    }

    @media (max-width: 600px) {
      .cmd-palette-overlay {
        padding-top: 10vh;
        padding-left: 12px;
        padding-right: 12px;
      }

      .cmd-palette {
        max-width: 100%;
      }
    }
  `;
  document.head.appendChild(style);
}

function getFiltered(query) {
  if (!query) return commands;
  return commands.filter(cmd => fuzzyMatch(query, cmd.label));
}

function renderResults(filtered) {
  const container = overlay.querySelector('.cmd-palette-results');
  container.innerHTML = '';

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'cmd-palette-empty';
    empty.textContent = 'No results found';
    container.appendChild(empty);
    return;
  }

  // Clamp active index
  if (activeIndex >= filtered.length) activeIndex = filtered.length - 1;
  if (activeIndex < 0) activeIndex = 0;

  let lastSection = '';
  filtered.forEach((cmd, i) => {
    if (cmd.section !== lastSection) {
      lastSection = cmd.section;
      const sectionEl = document.createElement('div');
      sectionEl.className = 'cmd-palette-section';
      sectionEl.textContent = cmd.section;
      container.appendChild(sectionEl);
    }

    const item = document.createElement('div');
    item.className = 'cmd-palette-item';
    if (i === activeIndex) item.classList.add('cmd-palette-item--active');

    const label = document.createElement('span');
    label.className = 'cmd-palette-item-label';
    label.textContent = cmd.label;
    item.appendChild(label);

    if (cmd.hint) {
      const hint = document.createElement('span');
      hint.className = 'cmd-palette-item-hint';
      hint.textContent = cmd.hint;
      item.appendChild(hint);
    }

    item.addEventListener('click', () => {
      close();
      cmd.action();
    });

    item.addEventListener('mouseenter', () => {
      activeIndex = i;
      container.querySelectorAll('.cmd-palette-item').forEach((el, j) => {
        el.classList.toggle('cmd-palette-item--active', j === i);
      });
    });

    container.appendChild(item);
  });
}

function scrollActiveIntoView() {
  if (!overlay) return;
  const active = overlay.querySelector('.cmd-palette-item--active');
  if (active) {
    active.scrollIntoView({ block: 'nearest' });
  }
}

function open() {
  if (overlay) return;

  injectStyles();

  activeIndex = 0;

  overlay = document.createElement('div');
  overlay.className = 'cmd-palette-overlay';
  overlay.innerHTML = `
    <div class="cmd-palette">
      <div class="cmd-palette-input-wrap">
        <svg class="cmd-palette-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input class="cmd-palette-input" type="text" placeholder="Search commands..." autocomplete="off" spellcheck="false" />
      </div>
      <div class="cmd-palette-results"></div>
      <div class="cmd-palette-footer">
        <span class="cmd-palette-footer-hint"><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
        <span class="cmd-palette-footer-hint"><kbd>↵</kbd> select</span>
        <span class="cmd-palette-footer-hint"><kbd>esc</kbd> close</span>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Animate in
  requestAnimationFrame(() => {
    overlay.classList.add('cmd-palette--visible');
  });

  const input = overlay.querySelector('.cmd-palette-input');
  input.focus();

  renderResults(getFiltered(''));

  // Close on overlay background click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  input.addEventListener('input', () => {
    activeIndex = 0;
    renderResults(getFiltered(input.value.trim()));
  });

  input.addEventListener('keydown', (e) => {
    const filtered = getFiltered(input.value.trim());

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (filtered.length > 0) {
        activeIndex = (activeIndex + 1) % filtered.length;
        renderResults(filtered);
        scrollActiveIntoView();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (filtered.length > 0) {
        activeIndex = (activeIndex - 1 + filtered.length) % filtered.length;
        renderResults(filtered);
        scrollActiveIntoView();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered.length > 0 && filtered[activeIndex]) {
        close();
        filtered[activeIndex].action();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  });
}

function close() {
  if (!overlay) return;

  overlay.classList.remove('cmd-palette--visible');

  const ref = overlay;
  overlay = null;

  ref.addEventListener('transitionend', () => ref.remove(), { once: true });
  // Fallback removal
  setTimeout(() => { if (ref.parentNode) ref.remove(); }, 250);
}

/**
 * Initialize the command palette.
 * Call once on app startup to register the global keyboard shortcut.
 */
export function initCommandPalette() {
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      if (overlay) {
        close();
      } else {
        open();
      }
    }
  });
}
