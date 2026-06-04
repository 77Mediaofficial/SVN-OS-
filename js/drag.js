/* ============================================================
   SVN OS — Universal Drag & Drop
   Pointer-events based so it works equally on mouse, touch, pen.
   Replaces native HTML5 DnD which doesn't fire on touch devices.
   ============================================================ */

const dropZones = new Map(); // element → { accept, onDrop }
let active = null;           // current drag session

const DRAG_THRESHOLD = 6;    // pixels before we commit to a drag (avoids fighting taps)
const LONG_PRESS_MS = 180;   // long-press to start drag on touch (lets scroll pass through)

let styleInjected = false;

function injectStyles() {
  if (styleInjected) return;
  styleInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .drag-ghost {
      position: fixed;
      top: 0;
      left: 0;
      pointer-events: none;
      z-index: 10000;
      opacity: 0.92;
      transform: translate3d(-9999px, -9999px, 0);
      box-shadow: 0 16px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08);
      border-radius: 10px;
      max-width: 320px;
    }
    .drag-source-hidden { opacity: 0.35; }
    .drag-pressing { transition: transform 100ms ease-out; }
    .drag-pressing[data-pressing="1"] { transform: scale(0.97); }
    body.dragging-active { cursor: grabbing; user-select: none; -webkit-user-select: none; }
    body.dragging-active * { user-select: none !important; -webkit-user-select: none !important; }
  `;
  document.head.appendChild(style);
}

/**
 * Mark `el` as a drop zone.
 *  - accept(payload) → boolean (optional; defaults to true)
 *  - onDrop(payload, zoneEl) → void
 *  - highlightClass — class added while hovered, default 'drop-target'
 */
export function registerDropZone(el, opts = {}) {
  if (!el) return () => {};
  injectStyles();
  const cfg = {
    accept: opts.accept || (() => true),
    onDrop: opts.onDrop || (() => {}),
    highlightClass: opts.highlightClass || 'drop-target',
  };
  dropZones.set(el, cfg);
  return () => dropZones.delete(el);
}

export function unregisterDropZone(el) {
  dropZones.delete(el);
}

/**
 * Make `el` draggable.
 *  - getPayload() → any (called at drag start)
 *  - handleSelector — optional, restrict drag to a child element
 *  - clickFallback(e) — called if pointerup happens without enough movement
 *    so the element can still behave like a normal clickable.
 *  - dragImage — optional element to clone as the ghost (default: el itself)
 */
export function makeDraggable(el, opts = {}) {
  if (!el) return () => {};
  injectStyles();

  // touch-action: none disables native gestures so we get full pointer control
  el.style.touchAction = el.style.touchAction || 'none';

  function onPointerDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    if (opts.handleSelector && !e.target.closest(opts.handleSelector)) return;
    // Allow native clicks on interactive children unless they are the handle.
    const interactive = e.target.closest('button, a, input, select, textarea, [data-no-drag]');
    if (interactive && interactive !== el && (!opts.handleSelector || !interactive.matches(opts.handleSelector))) {
      return;
    }

    const isTouch = e.pointerType === 'touch';
    const startX = e.clientX;
    const startY = e.clientY;
    let committed = false;
    let pressTimer = null;

    const session = {
      el,
      payload: null,
      ghost: null,
      currentZone: null,
      pointerId: e.pointerId,
      startX, startY,
    };

    function commit() {
      if (committed) return;
      committed = true;
      active = session;
      session.payload = opts.getPayload ? opts.getPayload() : { id: el.dataset.id };
      el.classList.add('drag-source-hidden');
      document.body.classList.add('dragging-active');
      try { el.setPointerCapture(e.pointerId); } catch {}
      buildGhost(session, opts.dragImage || el);
      moveGhost(session, e.clientX, e.clientY);
    }

    function onMove(ev) {
      if (ev.pointerId !== session.pointerId) return;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!committed) {
        // For touch we use long-press OR a strong movement to commit.
        if (Math.hypot(dx, dy) > DRAG_THRESHOLD) {
          if (isTouch) {
            // If the gesture is mostly vertical and the user moved before
            // the long-press fired, treat it as a scroll — abort the drag.
            // (Long-press will have committed by this point if held still.)
            if (!committed) { cancel(); return; }
          } else {
            commit();
          }
        }
      }
      if (!committed) return;
      ev.preventDefault();
      moveGhost(session, ev.clientX, ev.clientY);
      updateHover(session, ev.clientX, ev.clientY);
    }

    function onUp(ev) {
      if (ev.pointerId !== session.pointerId) return;
      cleanup();
      if (!committed) {
        if (opts.clickFallback) opts.clickFallback(ev);
        return;
      }
      const zoneCfg = session.currentZone ? dropZones.get(session.currentZone) : null;
      if (zoneCfg && zoneCfg.accept(session.payload)) {
        try { zoneCfg.onDrop(session.payload, session.currentZone, ev); } catch (err) {
          console.error('drag onDrop error', err);
        }
      }
    }

    function cancel() {
      cleanup();
      committed = false;
    }

    function cleanup() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', cancel);
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
      if (session.ghost) {
        session.ghost.remove();
        session.ghost = null;
      }
      if (session.currentZone) {
        const cfg = dropZones.get(session.currentZone);
        if (cfg) session.currentZone.classList.remove(cfg.highlightClass);
        session.currentZone = null;
      }
      el.classList.remove('drag-source-hidden');
      el.removeAttribute('data-pressing');
      document.body.classList.remove('dragging-active');
      try { el.releasePointerCapture(e.pointerId); } catch {}
      if (active === session) active = null;
    }

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', cancel);

    if (isTouch) {
      // Visual press feedback then long-press commit so vertical scrolls pass through.
      el.setAttribute('data-pressing', '1');
      pressTimer = setTimeout(() => {
        if (!committed) commit();
      }, LONG_PRESS_MS);
    }
  }

  el.addEventListener('pointerdown', onPointerDown);

  // Suppress the synthetic click that follows a drag pointerup,
  // so clicking through to detail panels doesn't fire when we just dragged.
  el.addEventListener('click', (ev) => {
    if (el.dataset.justDragged === '1') {
      ev.preventDefault();
      ev.stopPropagation();
      delete el.dataset.justDragged;
    }
  }, true);

  return () => el.removeEventListener('pointerdown', onPointerDown);
}

function buildGhost(session, source) {
  const rect = source.getBoundingClientRect();
  const ghost = source.cloneNode(true);
  ghost.classList.add('drag-ghost');
  ghost.style.width = rect.width + 'px';
  // Strip ids/duplicates so labels & form controls don't collide
  ghost.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
  document.body.appendChild(ghost);
  session.ghost = ghost;
  session.ghostOffsetX = session.startX - rect.left;
  session.ghostOffsetY = session.startY - rect.top;
}

function moveGhost(session, x, y) {
  if (!session.ghost) return;
  const tx = x - session.ghostOffsetX;
  const ty = y - session.ghostOffsetY;
  session.ghost.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
}

function updateHover(session, x, y) {
  // Temporarily hide the ghost so elementFromPoint sees what's underneath.
  let underEl = null;
  if (session.ghost) session.ghost.style.display = 'none';
  underEl = document.elementFromPoint(x, y);
  if (session.ghost) session.ghost.style.display = '';

  let zone = null;
  while (underEl && underEl !== document.body) {
    if (dropZones.has(underEl)) { zone = underEl; break; }
    underEl = underEl.parentElement;
  }

  if (zone === session.currentZone) return;
  if (session.currentZone) {
    const cfg = dropZones.get(session.currentZone);
    if (cfg) session.currentZone.classList.remove(cfg.highlightClass);
  }
  if (zone) {
    const cfg = dropZones.get(zone);
    if (cfg && cfg.accept(session.payload)) {
      zone.classList.add(cfg.highlightClass);
    }
  }
  session.currentZone = zone;
}
