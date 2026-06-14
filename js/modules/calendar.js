/* Posting Calendar — temporal view of scheduled content.
   Drag chips between days to reschedule (mouse/pen); tap a chip
   to edit, tap an empty day to plan content for it. */

import { projects } from '../store.js';
import { toast } from '../toast.js';
import { enableDrag } from '../drag.js';
import {
  esc, dayKey, todayKey, toLocalInput, fmtTime, formData, bindDialog, confirmAction, isoWeek,
} from '../ui.js';
import { CONTENT_STAGES, PLATFORMS, STAGE_BY_KEY, PLATFORM_BY_KEY, stageTone, optionsHtml } from '../domain.js';

const MAX_CHIPS = 3;

let rows = [];
let cursor = startOfMonth(new Date());
let editingId = null;
let platformFilter = 'all';
let selectedDay = null;

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

  // A slide-down agenda lives just beneath the grid, inside the panel.
  const detail = document.createElement('div');
  detail.className = 'cal-day-detail';
  detail.id = 'cal-day-detail';
  grid.insertAdjacentElement('afterend', detail);
  detail.addEventListener('click', (e) => {
    if (e.target.closest('[data-cdd-close]')) { closeDayDetail(); return; }
    if (e.target.closest('[data-cdd-add]')) { openModal(null, selectedDay); return; }
    const item = e.target.closest('[data-id]');
    if (item) openModal(item.dataset.id);
  });

  document.getElementById('cal-filters').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-platform]');
    if (!chip) return;
    platformFilter = chip.dataset.platform;
    renderMonth();
    if (selectedDay) renderDayDetail();
  });

  document.getElementById('cal-prev').addEventListener('click', () => shift(-1));
  document.getElementById('cal-next').addEventListener('click', () => shift(1));
  document.getElementById('cal-today-btn').addEventListener('click', () => {
    closeDayDetail();
    cursor = startOfMonth(new Date());
    renderMonth();
  });

  grid.addEventListener('click', (e) => {
    const chip = e.target.closest('.cal-chip');
    if (chip) { openModal(chip.dataset.id); return; }
    const cell = e.target.closest('.cal-cell');
    if (cell) openDayDetail(cell.dataset.date);
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
      if (selectedDay) renderDayDetail();
      try {
        await projects.update(row.id, { scheduled_at: row.scheduled_at });
        toast('Rescheduled.', 'success');
      } catch (err) {
        console.error(err);
        toast('Could not reschedule — reloading.', 'error');
        rows = await projects.list();
        renderMonth();
        if (selectedDay) renderDayDetail();
      }
    },
  });

  form.addEventListener('submit', onSubmit);
  document.getElementById('cf-delete').addEventListener('click', onDelete);

  return () => disposeDrag();
}

/* ── Rendering ───────────────────────────────────────────── */

function shift(months) {
  closeDayDetail();
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
      <div class="cal-cell ${d.getMonth() !== month ? 'cal-out' : ''} ${key === today ? 'cal-today' : ''} ${key === selectedDay ? 'cal-selected' : ''}"
           data-date="${key}" role="button" aria-pressed="${key === selectedDay}" aria-label="${d.toDateString()}">
        <span class="cal-daynum">${d.getDate()}</span>
        ${shown.map(chipHtml).join('')}
        ${extra > 0 ? `<span class="cal-more">+${extra} more</span>` : ''}
        <span class="cal-dots">${items.slice(0, 4).map((p) => `<span class="dot tone-${stageTone(p.status)}"></span>`).join('')}</span>
      </div>`);
  }

  document.getElementById('cal-grid').innerHTML = cells.join('');
}

/* ── Day detail — slide-down agenda for one day ──────────── */

function openDayDetail(date) {
  if (!date) return;
  if (selectedDay === date) { closeDayDetail(); return; } // re-tap closes
  selectedDay = date;
  renderMonth();
  renderDayDetail();
}

function closeDayDetail() {
  if (!selectedDay) return;
  selectedDay = null;
  document.getElementById('cal-day-detail')?.classList.remove('open');
  renderMonth();
}

function renderDayDetail() {
  const el = document.getElementById('cal-day-detail');
  if (!el || !selectedDay) return;

  const d = new Date(`${selectedDay}T00:00:00`);
  const heading = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const items = visibleRows()
    .filter((p) => p.scheduled_at && dayKey(p.scheduled_at) === selectedDay)
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));

  const list = items.length
    ? `<div class="cdd-list">${items.map((p) => `
        <button type="button" class="cdd-item" data-id="${esc(p.id)}">
          <span class="dot tone-${stageTone(p.status)}"></span>
          <span class="cdd-item-body">
            <span class="cdd-item-title">${esc(p.title)}</span>
            <span class="cdd-item-meta">${esc(PLATFORM_BY_KEY[p.platform]?.label ?? p.platform)} · ${esc(STAGE_BY_KEY[p.status]?.label ?? p.status)} · ${fmtTime(p.scheduled_at)}</span>
          </span>
          <span class="cdd-item-go" aria-hidden="true">→</span>
        </button>`).join('')}</div>`
    : `<p class="cdd-empty">Nothing scheduled${platformFilter === 'all' ? '' : ' for this platform'} on this day.</p>`;

  el.innerHTML = `
    <div class="cdd-inner">
      <div class="cdd-head">
        <div>
          <p class="cdd-eyebrow">${heading}</p>
          <h3 class="cdd-title">${items.length ? `${items.length} scheduled` : 'Open day'}</h3>
        </div>
        <button type="button" class="cdd-close" data-cdd-close aria-label="Close">✕</button>
      </div>
      ${list}
      <button type="button" class="btn btn-block cdd-add" data-cdd-add>Plan content for this day</button>
    </div>`;
  // Commit the collapsed start state, then expand (reliable without rAF).
  void el.offsetHeight;
  el.classList.add('open');
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
    if (selectedDay) renderDayDetail();
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
    if (selectedDay) renderDayDetail();
    toast('Deleted.');
  } catch (err) {
    console.error(err);
    toast('Could not delete.', 'error');
  }
}
