/* Sliding nav indicator — a single pill that glides to the active link.
   Hand-ported from the Aceternity "tabs" moving highlight: instead of a
   background that snaps per link, one absolutely-positioned pill is
   FLIP-translated to the active link's box. Reading offsetLeft/Top/Width/
   Height means the same code drives the vertical desktop rail and the
   horizontal mobile bar. The glide itself is a CSS transition (see the
   .nav-pill rules in main.css), so reduced motion is honoured there. */

let pill = null;
let nav = null;

export function initNavIndicator() {
  nav = document.querySelector('.nav');
  if (!nav || pill) return;

  pill = document.createElement('span');
  pill.className = 'nav-pill';
  pill.setAttribute('aria-hidden', 'true');
  nav.prepend(pill);

  // Re-measure when the rail flips orientation or web fonts settle widths.
  let raf = 0;
  addEventListener('resize', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(moveNavPill);
  }, { passive: true });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(moveNavPill);
}

export function moveNavPill() {
  if (!pill || !nav) return;
  const active = nav.querySelector('.nav-link[aria-current="page"]');
  if (!active || !active.offsetWidth) return; // signed out, or shell not laid out yet

  // Place the very first time without a slide; animate every move after.
  const first = !pill.classList.contains('is-ready');
  if (first) pill.style.transition = 'none';

  pill.style.setProperty('--pill-x', `${active.offsetLeft}px`);
  pill.style.setProperty('--pill-y', `${active.offsetTop}px`);
  pill.style.setProperty('--pill-w', `${active.offsetWidth}px`);
  pill.style.setProperty('--pill-h', `${active.offsetHeight}px`);
  pill.classList.add('is-ready');

  if (first) {
    void pill.offsetWidth;       // flush the static placement…
    pill.style.transition = '';  // …then hand back to the CSS transition
  }
}
