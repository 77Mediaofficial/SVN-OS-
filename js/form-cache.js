/* ============================================================
   SVN OS — Form Draft Cache
   Auto-saves what you're typing into a "new …" form so a closed tab,
   a refresh, or an accidental dismissal never loses work. Drafts are
   per-form, stored in localStorage, restored when you reopen the
   create modal, and cleared once the record is saved.

   Only used for CREATE flows — edit forms are prefilled from the real
   record, so restoring a draft over them would clobber live data.
   ============================================================ */

import { showToast } from '/js/toast.js';

const PREFIX = 'svn-os-draft-';

/* Field types we persist. Buttons, hidden ids, files, passwords skip. */
function cacheableFields(form) {
  return Array.from(form.elements).filter((el) => {
    if (!el.id) return false;
    const tag = el.tagName.toLowerCase();
    if (tag === 'button') return false;
    const type = (el.type || '').toLowerCase();
    if (['hidden', 'file', 'password', 'submit', 'reset'].includes(type)) return false;
    return tag === 'input' || tag === 'textarea' || tag === 'select';
  });
}

/** Snapshot the form's current values into localStorage. */
export function saveDraft(key, form) {
  if (!form) return;
  const data = {};
  let hasContent = false;
  for (const el of cacheableFields(form)) {
    if (el.type === 'checkbox') {
      data[el.id] = el.checked;
      if (el.checked) hasContent = true;
    } else {
      data[el.id] = el.value;
      if (el.value && el.value.trim()) hasContent = true;
    }
  }
  // Don't persist an empty form — keeps storage clean and avoids a
  // pointless "draft restored" on the next open.
  if (!hasContent) { clearDraft(key); return; }
  try { localStorage.setItem(PREFIX + key, JSON.stringify(data)); } catch {}
}

/** True if a saved draft exists for this key. */
export function hasDraft(key) {
  try { return !!localStorage.getItem(PREFIX + key); } catch { return false; }
}

/**
 * Apply a saved draft to the form. Returns true if anything was
 * restored. Shows a quiet toast so the user knows their work came back.
 */
export function restoreDraft(key, form, { announce = true } = {}) {
  if (!form) return false;
  let raw;
  try { raw = localStorage.getItem(PREFIX + key); } catch { return false; }
  if (!raw) return false;

  let data;
  try { data = JSON.parse(raw); } catch { clearDraft(key); return false; }

  let restored = false;
  for (const el of cacheableFields(form)) {
    if (!(el.id in data)) continue;
    if (el.type === 'checkbox') {
      el.checked = !!data[el.id];
    } else {
      el.value = data[el.id] ?? '';
    }
    if (data[el.id]) restored = true;
  }
  if (restored && announce) showToast('Restored your unsaved draft', 'info');
  return restored;
}

/** Remove a saved draft (call after a successful save). */
export function clearDraft(key) {
  try { localStorage.removeItem(PREFIX + key); } catch {}
}

/**
 * Attach an input listener that persists the draft as the user types,
 * but only while `shouldSave()` is true (use it to skip edit mode).
 * Returns an unbind function. Pass an AbortSignal to auto-clean.
 */
export function bindDraft(key, form, shouldSave = () => true, { signal } = {}) {
  if (!form) return () => {};
  const handler = () => { if (shouldSave()) saveDraft(key, form); };
  form.addEventListener('input', handler, signal ? { signal } : undefined);
  form.addEventListener('change', handler, signal ? { signal } : undefined);
  return () => {
    form.removeEventListener('input', handler);
    form.removeEventListener('change', handler);
  };
}
