/* Content Engine — kanban pipeline from idea to published.
   Drag between stages (mouse/pen); every action also available
   through the edit modal for touch and keyboard users. */

import { projects } from '../store.js';
import { toast } from '../toast.js';
import { enableDrag } from '../drag.js';
import {
  esc, fmtDate, fmtTime, relDay, dayKey, toLocalInput,
  formData, parseTags, bindDialog, confirmAction,
} from '../ui.js';
import {
  CONTENT_STAGES, PLATFORMS, PLATFORM_BY_KEY, optionsHtml,
} from '../domain.js';

let rows = [];
let editingId = null;
let platformFilter = 'all';
let search = '';

function visibleRows() {
  const q = search.trim().toLowerCase();
  return rows.filter((p) => {
    if (platformFilter !== 'all' && p.platform !== platformFilter) return false;
    if (q && !`${p.title} ${(p.tags || []).join(' ')}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

export async function init() {
  const board = document.getElementById('board');
  const modal = document.getElementById('project-modal');
  const form = document.getElementById('project-form');

  document.getElementById('pf-platform').innerHTML = optionsHtml(PLATFORMS, 'youtube');
  document.getElementById('pf-status').innerHTML = optionsHtml(CONTENT_STAGES, 'idea');
  bindDialog(modal);

  rows = await projects.list();
  renderBoard();

  document.getElementById('new-project-btn').addEventListener('click', () => openModal(null));

  document.getElementById('ce-chips').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-platform]');
    if (!chip) return;
    platformFilter = chip.dataset.platform;
    renderBoard();
  });
  document.getElementById('ce-search').addEventListener('input', (e) => {
    search = e.target.value;
    renderBoard();
  });

  board.addEventListener('click', (e) => {
    const card = e.target.closest('.kcard');
    if (card) openModal(card.dataset.id);
  });

  const disposeDrag = enableDrag({
    root: board,
    cardSelector: '.kcard',
    zoneSelector: '.klist',
    onDrop: async (card, zone) => {
      const id = card.dataset.id;
      const status = zone.dataset.status;
      const row = rows.find((r) => r.id === id);
      if (!row || row.status === status) return;

      const patch = { status };
      if (status === 'published' && !row.published_at) patch.published_at = new Date().toISOString();
      Object.assign(row, patch);
      renderBoard(); // optimistic
      try {
        await projects.update(id, patch);
        toast(`Moved to ${status}.`, 'success');
      } catch (err) {
        console.error(err);
        toast('Could not save the move — reloading.', 'error');
        rows = await projects.list();
        renderBoard();
      }
    },
  });

  form.addEventListener('submit', onSubmit);
  document.getElementById('pf-delete').addEventListener('click', onDelete);

  return () => disposeDrag();
}

/* ── Rendering ───────────────────────────────────────────── */

function cardHtml(p) {
  let sched = '';
  if (p.status === 'published') {
    const when = p.published_at || p.scheduled_at;
    if (when) sched = `<span>out ${fmtDate(when)}</span>`;
  } else if (p.scheduled_at) {
    const rel = relDay(p.scheduled_at);
    const overdue = dayKey(p.scheduled_at) < dayKey(new Date());
    sched = `<span class="${overdue ? 'tone-danger' : rel.tone === 'warn' ? 'tone-warn' : ''}">
               ${rel.label} · ${fmtTime(p.scheduled_at)}</span>`;
  }
  const platform = PLATFORM_BY_KEY[p.platform];
  const tags = (p.tags || []).slice(0, 3)
    .map((t) => `<span class="tagchip">${esc(t)}</span>`).join('');

  return `
    <button type="button" class="kcard" data-id="${esc(p.id)}">
      <span class="kcard-title">${esc(p.title)}</span>
      <span class="kcard-meta">
        <span class="badge">${platform?.badge ?? '—'}</span>
        ${sched}
      </span>
      ${tags ? `<span class="kcard-tags">${tags}</span>` : ''}
    </button>`;
}

function renderChips() {
  const present = new Set(rows.map((p) => p.platform));
  if (platformFilter !== 'all' && !present.has(platformFilter)) platformFilter = 'all';
  const chips = [{ key: 'all', label: 'All' }, ...PLATFORMS.filter((p) => present.has(p.key))];
  document.getElementById('ce-chips').innerHTML = chips.map((c) =>
    `<button type="button" class="chip ${c.key === platformFilter ? 'is-active' : ''}" data-platform="${c.key}">${c.label}</button>`
  ).join('');
}

function renderBoard() {
  renderChips();
  const visible = visibleRows();

  for (const stage of CONTENT_STAGES) {
    const list = document.querySelector(`.klist[data-status="${stage.key}"]`);
    const col = document.querySelector(`.kcol[data-status="${stage.key}"] .count`);
    if (!list) continue;

    const inStage = visible
      .filter((p) => p.status === stage.key)
      .sort((a, b) => {
        if (a.scheduled_at && b.scheduled_at) return new Date(a.scheduled_at) - new Date(b.scheduled_at);
        if (a.scheduled_at) return -1;
        if (b.scheduled_at) return 1;
        return new Date(b.updated_at) - new Date(a.updated_at);
      });

    col.textContent = String(inStage.length);
    list.innerHTML = inStage.map(cardHtml).join('');
  }
}

/* ── Modal ───────────────────────────────────────────────── */

function openModal(id) {
  const modal = document.getElementById('project-modal');
  const form = document.getElementById('project-form');
  const row = id ? rows.find((r) => r.id === id) : null;
  editingId = row?.id ?? null;

  form.reset();
  document.getElementById('project-modal-title').textContent = row ? 'Edit project' : 'New project';
  document.getElementById('pf-save').textContent = row ? 'Save changes' : 'Create project';
  document.getElementById('pf-delete').hidden = !row;

  if (row) {
    form.title.value = row.title;
    form.platform.value = row.platform;
    form.status.value = row.status;
    form.scheduled_at.value = toLocalInput(row.scheduled_at);
    form.tags.value = (row.tags || []).join(', ');
    form.description.value = row.description || '';
    form.notes.value = row.notes || '';
  }

  modal.showModal();
}

async function onSubmit(e) {
  e.preventDefault();
  const form = e.currentTarget;
  if (!form.title.value.trim()) { form.title.focus(); return; }

  const raw = formData(form);
  const values = {
    title: raw.title,
    platform: raw.platform,
    status: raw.status,
    scheduled_at: raw.scheduled_at ? new Date(raw.scheduled_at).toISOString() : null,
    tags: parseTags(raw.tags),
    description: raw.description || '',
    notes: raw.notes || '',
  };
  // Stamp the publish date once — don't reset it when re-saving an edit to an
  // already-published project (mirrors the drag path's !published_at guard).
  if (values.status === 'published') {
    const existing = editingId ? rows.find((r) => r.id === editingId) : null;
    if (!existing?.published_at) values.published_at = new Date().toISOString();
  }

  try {
    if (editingId) {
      const updated = await projects.update(editingId, values);
      rows = rows.map((r) => (r.id === editingId ? updated : r));
      toast('Project updated.', 'success');
    } else {
      rows.unshift(await projects.create(values));
      toast('Project created.', 'success');
    }
    document.getElementById('project-modal').close();
    renderBoard();
  } catch (err) {
    console.error(err);
    toast('Could not save the project.', 'error');
  }
}

async function onDelete() {
  if (!editingId) return;
  const row = rows.find((r) => r.id === editingId);
  const ok = await confirmAction(`Delete “${row?.title ?? 'this project'}”? This can't be undone.`);
  if (!ok) return;

  try {
    await projects.remove(editingId);
    rows = rows.filter((r) => r.id !== editingId);
    document.getElementById('project-modal').close();
    renderBoard();
    toast('Project deleted.');
  } catch (err) {
    console.error(err);
    toast('Could not delete the project.', 'error');
  }
}
