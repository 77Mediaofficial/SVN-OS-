/* Posting Calendar — temporal view of scheduled content.
   Drag chips between days to reschedule (mouse/pen); tap a chip
   to edit, tap an empty day to plan content for it. */

import { projects } from '../store.js';
import { toast } from '../toast.js';
import { enableDrag } from '../drag.js';
import {
  esc, dayKey, todayKey, toLocalInput, formData, bindDialog, confirmAction, isoWeek,
} from '../ui.js';
import { CONTENT_STAGES, PLATFORMS, stageTone, optionsHtml } from '../domain.js';

const MAX_CHIPS = 3;

let rows = [];
let cursor = startOfMonth(new Date());
let editingId = null;
let platformFilter = 'all';

const visibleRows = () =>
  platformFilter === 'all' ? rows : rows.filter((p) => p.platform === platformFilter);

function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }

export async function init() {
  const grid = document.getElementById('cal-grid');
  const modal = document.getElementById('cal-modal');
  const form = document.getElementById('cal-form');

  document.getElementById('cf-platform').innerHTML = optionsHtml(PLATFORMS, 'youtube');
  document.getElementById('cf-status').innerHTML = optionsHtml(CONTENT_STAGES, 'idea');
  bindDialog(modal);

  rows = await projects.list();
  cursor = startOfMonth(new Date());
  renderMonth();

  document.getElementById('cal-filters').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-platform]');
    if (!chip) return;
    platformFilter = chip.dataset.platform;
    renderMonth();
  });

  document.getElementById('cal-prev').addEventListener('click', () => shift(-1));
  document.getElementById('cal-next').addEventListener('click', () => shift(1));
  document.getElementById('cal-today-btn').addEventListener('click', () => {
    cursor = startOfMonth(new Date());
    renderMonth();
  });

  grid.addEventListener('click', (e) => {
    const chip = e.target.closest('.cal-chip');
    if (chip) { openModal(chip.dataset.id); return; }
    const cell = e.target.closest('.cal-cell');
    if (cell) openModal(null, cell.dataset.date);
  });

  const disposeDrag = enableDrag({
    root: grid,
    cardSelector: '.cal-chip',
    zoneSelector: '.cal-cell',
    onDrop: async (chip, cell) => {
      const row = rows.find((r) => r.id === chip.dataset.id);
      const date = cell.dataset.date;
      if (!row || !date || dayKey(row.scheduled_at) === date) return;

      // Keep the original time of day; default to 10:00 if none existed.
      const prev = row.scheduled_at ? new Date(row.scheduled_at) : null;
      const next = new Date(`${date}T00:00:00`);
      next.setHours(prev ? prev.getHours() : 10, prev ? prev.getMinutes() : 0, 0, 0);

      row.scheduled_at = next.toISOString();
      renderMonth(); // optimistic
      try {
        await projects.update(row.id, { scheduled_at: row.scheduled_at });
        toast('Rescheduled.', 'success');
      } catch (err) {
        console.error(err);
        toast('Could not reschedule — reloading.', 'error');
        rows = await projects.list();
        renderMonth();
      }
    },
  });

  form.addEventListener('submit', onSubmit);
  document.getElementById('cf-delete').addEventListener('click', onDelete);

  return () => disposeDrag();
}

/* ── Rendering ───────────────────────────────────────────── */

function shift(months) {
  cursor = new Date(cursor.getFullYear(), cursor.getMonth() + months, 1);
  renderMonth();
}

function chipHtml(p) {
  return `
    <button type="button" class="cal-chip ${p.status === 'published' ? 'is-published' : ''}" data-id="${esc(p.id)}">
      <span class="dot tone-${stageTone(p.status)}"></span>
      <span class="chip-title">${esc(p.title)}</span>
    </button>`;
}

function renderFilters() {
  const present = new Set(rows.filter((p) => p.scheduled_at).map((p) => p.platform));
  if (platformFilter !== 'all' && !present.has(platformFilter)) platformFilter = 'all';

  const chips = [{ key: 'all', label: 'All' }, ...PLATFORMS.filter((p) => present.has(p.key))];
  document.getElementById('cal-filters').innerHTML = chips.map((c) =>
    `<button type="button" class="chip ${c.key === platformFilter ? 'is-active' : ''}" data-platform="${c.key}">${c.label}</button>`
  ).join('');
}

function renderMonth() {
  renderFilters();

  const monthName = cursor.toLocaleDateString('en-GB', { month: 'long' });
  document.getElementById('cal-title').innerHTML =
    `${monthName} <span class="title-dim">${cursor.getFullYear()}</span>`;

  const byDay = new Map();
  for (const p of visibleRows()) {
    if (!p.scheduled_at) continue;
    const key = dayKey(p.scheduled_at);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(p);
  }
  for (const list of byDay.values()) {
    list.sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
  }

  // Monday-first grid, 42 cells.
  const first = new Date(cursor);
  const lead = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - lead);

  const today = todayKey();
  const month = cursor.getMonth();
  const cells = [];

  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    if (i % 7 === 0) cells.push(`<div class="cal-week"><span>${isoWeek(d)}</span></div>`);
    const key = dayKey(d);
    const items = byDay.get(key) ?? [];
    const shown = items.slice(0, MAX_CHIPS);
    const extra = items.length - shown.length;

    cells.push(`
      <div class="cal-cell ${d.getMonth() !== month ? 'cal-out' : ''} ${key === today ? 'cal-today' : ''}"
           data-date="${key}" role="button" aria-label="${d.toDateString()}">
        <span class="cal-daynum">${d.getDate()}</span>
        ${shown.map(chipHtml).join('')}
        ${extra > 0 ? `<span class="cal-more">+${extra} more</span>` : ''}
        <span class="cal-dots">${items.slice(0, 4).map((p) => `<span class="dot tone-${stageTone(p.status)}"></span>`).join('')}</span>
      </div>`);
  }

  document.getElementById('cal-grid').innerHTML = cells.join('');
}

/* ── Modal ───────────────────────────────────────────────── */

function openModal(id, presetDate) {
  const modal = document.getElementById('cal-modal');
  const form = document.getElementById('cal-form');
  const row = id ? rows.find((r) => r.id === id) : null;
  editingId = row?.id ?? null;

  form.reset();
  document.getElementById('cal-modal-title').textContent = row ? 'Edit content' : 'Plan content';
  document.getElementById('cf-save').textContent = row ? 'Save changes' : 'Add to calendar';
  document.getElementById('cf-delete').hidden = !row;

  if (row) {
    form.title.value = row.title;
    form.platform.value = row.platform;
    form.status.value = row.status;
    form.scheduled_at.value = toLocalInput(row.scheduled_at);
  } else if (presetDate) {
    form.scheduled_at.value = `${presetDate}T10:00`;
  }

  modal.showModal();
}

async function onSubmit(e) {
  e.preventDefault();
  const form = e.currentTarget;
  if (!form.title.value.trim()) { form.title.focus(); return; }
  if (!form.scheduled_at.value) { form.scheduled_at.focus(); return; }

  const raw = formData(form);
  const values = {
    title: raw.title,
    platform: raw.platform,
    status: raw.status,
    scheduled_at: new Date(raw.scheduled_at).toISOString(),
  };

  try {
    if (editingId) {
      const updated = await projects.update(editingId, values);
      rows = rows.map((r) => (r.id === editingId ? updated : r));
      toast('Updated.', 'success');
    } else {
      rows.unshift(await projects.create(values));
      toast('Added to the calendar.', 'success');
    }
    document.getElementById('cal-modal').close();
    renderMonth();
  } catch (err) {
    console.error(err);
    toast('Could not save.', 'error');
  }
}

async function onDelete() {
  if (!editingId) return;
  const row = rows.find((r) => r.id === editingId);
  const ok = await confirmAction(`Delete “${row?.title ?? 'this content'}”?`);
  if (!ok) return;

  try {
    await projects.remove(editingId);
    rows = rows.filter((r) => r.id !== editingId);
    document.getElementById('cal-modal').close();
    renderMonth();
    toast('Deleted.');
  } catch (err) {
    console.error(err);
    toast('Could not delete.', 'error');
  }
}
