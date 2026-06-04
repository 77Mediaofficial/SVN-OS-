/* ============================================================
   SVN OS — Tooltips
   Accessible hover/focus hints driven by [data-tooltip]. The visual
   tooltip is pure CSS (see main.css). This module handles the parts
   CSS can't:
     • screen-reader fallback — icon-only controls get an aria-label
     • touch fallback — pointer-coarse devices keep a native `title`
       (no hover), desktop drops `title` so it doesn't double up
     • dynamic content — a MutationObserver upgrades partials the
       router injects after navigation
   ============================================================ */

let canHover = true;
let observer = null;

export function initTooltips(root = document.body) {
  canHover = window.matchMedia('(hover: hover)').matches;

  scan(root);

  // Upgrade anything the router injects later.
  if (observer) observer.disconnect();
  observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((node) => {
        if (node.nodeType !== 1) return;
        if (node.matches?.('[data-tooltip], [title]')) apply(node);
        node.querySelectorAll?.('[data-tooltip], [title]').forEach(apply);
      });
    }
  });
  observer.observe(root, { childList: true, subtree: true });
}

function scan(root) {
  root.querySelectorAll('[data-tooltip], [title]').forEach(apply);
  if (root.matches?.('[data-tooltip], [title]')) apply(root);
}

function apply(el) {
  // Promote a plain `title` into a styled tooltip.
  if (!el.hasAttribute('data-tooltip') && el.hasAttribute('title')) {
    el.setAttribute('data-tooltip', el.getAttribute('title'));
  }
  const tip = el.getAttribute('data-tooltip');
  if (!tip) return;

  // Give icon-only controls an accessible name.
  if (!el.getAttribute('aria-label') && !el.textContent.trim()) {
    el.setAttribute('aria-label', tip);
  }

  if (canHover) {
    // Desktop: CSS tooltip handles it — drop native title to avoid two.
    el.removeAttribute('title');
  } else if (!el.hasAttribute('title')) {
    // Touch: no hover, so keep the native hint as a fallback.
    el.setAttribute('title', tip);
  }
}
