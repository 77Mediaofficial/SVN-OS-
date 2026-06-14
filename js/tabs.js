/* Animated tab underline — a single bar that slides under the selected tab.
   Hand-ported from the Aceternity / 21st "animated tabs": a drop-in for any
   <div class="tabs"> whose tabs carry aria-selected. A MutationObserver tracks
   selection changes, so whatever flips aria-selected — pointer, keyboard, or
   programmatic — the bar follows. The observer's lifetime is tied to the .tabs
   node, and there are no window listeners, so it GC's cleanly when the view
   unmounts. The bar slide is a CSS transition (see main.css), so reduced motion
   is honoured there. */

export function initTabUnderline(root = document) {
  root.querySelectorAll('.tabs').forEach((tabs) => {
    if (tabs.querySelector(':scope > .tab-underline')) return; // already wired

    tabs.classList.add('has-underline');
    const bar = document.createElement('span');
    bar.className = 'tab-underline';
    bar.setAttribute('aria-hidden', 'true');
    tabs.appendChild(bar);

    const move = () => moveUnderline(tabs, bar);
    const observer = new MutationObserver(move);
    observer.observe(tabs, { attributes: true, attributeFilter: ['aria-selected'], subtree: true });
    tabs.__underlineObserver = observer; // lifetime follows the node → no leak

    move();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(move);
  });
}

function moveUnderline(tabs, bar) {
  const active = tabs.querySelector('.tab[aria-selected="true"]');
  if (!active || !active.offsetWidth) return; // not laid out / none selected

  // Place the first time without a slide; glide on every change after.
  const first = !bar.classList.contains('is-ready');
  if (first) bar.style.transition = 'none';

  bar.style.setProperty('--ul-x', `${active.offsetLeft}px`);
  bar.style.setProperty('--ul-w', `${active.offsetWidth}px`);
  bar.classList.add('is-ready');

  if (first) {
    void bar.offsetWidth;
    bar.style.transition = '';
  }
}
