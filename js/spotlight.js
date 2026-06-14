/* Pointer spotlight — a soft glow that tracks the cursor across cards
   and panels. One delegated pointermove feeds --mx/--my to the card
   under the cursor; the glow itself is pure CSS (see main.css). It
   no-ops on touch / coarse pointers and when the user prefers reduced
   motion, so phones and the iOS build pay nothing for it. */

const SELECTOR = '.panel, .kcard, .stat';
const enabled =
  matchMedia('(hover: hover) and (pointer: fine)').matches &&
  !matchMedia('(prefers-reduced-motion: reduce)').matches;

let frame = 0;
let pending = null;

function onMove(e) {
  const card = e.target.closest && e.target.closest(SELECTOR);
  if (!card) return;
  pending = { card, x: e.clientX, y: e.clientY };
  if (!frame) frame = requestAnimationFrame(flush);
}

function flush() {
  frame = 0;
  if (!pending) return;
  const { card, x, y } = pending;
  const r = card.getBoundingClientRect();
  card.style.setProperty('--mx', `${(x - r.left).toFixed(1)}px`);
  card.style.setProperty('--my', `${(y - r.top).toFixed(1)}px`);
}

export function initSpotlight() {
  if (!enabled) return;
  document.addEventListener('pointermove', onMove, { passive: true });
}
