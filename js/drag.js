/* Pointer-based drag & drop for mouse/pen.
   Touch users get the same actions through each card's edit modal,
   so drag is an enhancement, not the only path.

   enableDrag({ root, cardSelector, zoneSelector, onDrop }) → disposer */

const DRAG_THRESHOLD = 6; // px of travel before a press becomes a drag

export function enableDrag({ root, cardSelector, zoneSelector, onDrop }) {
  let drag = null;

  function onPointerDown(e) {
    if (e.button !== 0 || e.pointerType === 'touch') return;
    const card = e.target.closest(cardSelector);
    if (!card || !root.contains(card)) return;
    // Cards are often buttons themselves — only ignore nested controls.
    const interactive = e.target.closest('button, a, input, select, textarea');
    if (interactive && interactive !== card) return;

    drag = { card, startX: e.clientX, startY: e.clientY, active: false, ghost: null, zone: null };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', abort);
  }

  function begin(e) {
    const rect = drag.card.getBoundingClientRect();
    drag.active = true;
    drag.offsetX = drag.startX - rect.left;
    drag.offsetY = drag.startY - rect.top;

    const ghost = drag.card.cloneNode(true);
    ghost.classList.add('drag-ghost');
    ghost.style.width = `${rect.width}px`;
    document.body.appendChild(ghost);

    drag.ghost = ghost;
    drag.card.classList.add('drag-source');
    document.body.classList.add('is-dragging');
    track(e);
  }

  function track(e) {
    drag.ghost.style.transform =
      `translate(${e.clientX - drag.offsetX}px, ${e.clientY - drag.offsetY}px) rotate(1.2deg)`;
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const zone = under ? under.closest(zoneSelector) : null;
    if (zone !== drag.zone) {
      drag.zone?.classList.remove('drop-hover');
      zone?.classList.add('drop-hover');
      drag.zone = zone;
    }
  }

  function onPointerMove(e) {
    if (!drag) return;
    if (!drag.active) {
      if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < DRAG_THRESHOLD) return;
      begin(e);
    } else {
      e.preventDefault();
      track(e);
    }
  }

  function onPointerUp(e) {
    if (!drag) return;
    const finished = drag.active ? { card: drag.card, zone: drag.zone } : null;
    if (drag.active) {
      track(e);
      finished.zone = drag.zone;
      swallowNextClick(); // the click that follows a drag must not open modals
    }
    teardown();
    if (finished?.zone) onDrop(finished.card, finished.zone);
  }

  function abort() { teardown(); }

  function teardown() {
    if (!drag) return;
    drag.ghost?.remove();
    drag.card.classList.remove('drag-source');
    drag.zone?.classList.remove('drop-hover');
    document.body.classList.remove('is-dragging');
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', abort);
    drag = null;
  }

  function swallowNextClick() {
    const swallow = (e) => { e.stopPropagation(); e.preventDefault(); };
    window.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 150);
  }

  root.addEventListener('pointerdown', onPointerDown);
  return () => {
    root.removeEventListener('pointerdown', onPointerDown);
    teardown();
  };
}
