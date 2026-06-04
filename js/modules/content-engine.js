import { db, getCurrentUser } from '../supabase.js';
import { showToast } from '../toast.js';
import { makeDraggable, registerDropZone } from '/js/drag.js';
import { queueOrRun, newId } from '/js/offline.js';
import { TEMPLATES, buildProjectsFromTemplate } from './content-templates.js';
import {
  loadPreferences,
  getContentStages,
  getContentStageLabel,
  getContentTagPresets,
} from '/js/preferences.js';

/* ── Constants ────────────────────────────────────────────── */
const PLATFORMS = ['youtube', 'tiktok', 'instagram', 'twitter', 'linkedin', 'podcast', 'blog', 'other'];

/** Current ordered stages (rebuilt after preferences load) */
let stages = [];
function STATUSES() { return stages.map(s => s.key); }
function statusStep(key) {
  const idx = stages.findIndex(s => s.key === key);
  return idx === -1 ? 1 : idx + 1;
}
function statusLabel(key) {
  if (key === 'archived') return 'Archived';
  return getContentStageLabel(key);
}
let dragCleanups = []; // teardown handles from drag helper bindings

/* ── State ────────────────────────────────────────────────── */
let projects = [];          // all loaded projects (non-archived)
let archivedProjects = [];  // archived projects (loaded on demand)
let currentUser = null;
let editingId = null;       // null = create, uuid = edit
let slideoverProjectId = null;   // id of project shown in detail panel
let searchQuery = '';
let platformFilter = '';
let tagFilter = '';
let showArchived = false;
let searchDebounceTimer = null;
let selectedIds = new Set();

/* ── Init (called by router after HTML partial is injected) ─ */
export async function init() {
  currentUser = await getCurrentUser();
  searchQuery = '';
  platformFilter = '';
  tagFilter = '';
  showArchived = false;
  selectedIds = new Set();

  await loadPreferences();
  stages = getContentStages();

  renderBoardSkeleton();
  populateStatusSelects();
  renderTagPresets();
  bindModal();
  bindFilters();
  bindSlideover();
  bindIdeasModal();
  bindTemplatesModal();
  bindBulkBar();
  bindKeyboardShortcuts();
  renderActiveTagFilter();
  await loadProjects();

  // Refresh the board once offline changes finish syncing.
  window.addEventListener('svn-os:synced', onSynced);

  // Return a cleanup function so the router can tear down listeners
  return cleanup;
}

function onSynced() {
  loadProjects();
}

/** Build column shells dynamically from preferences. */
function renderBoardSkeleton() {
  const board = document.getElementById('kanban-board');
  if (!board) return;
  board.innerHTML = stages.map(s => `
    <div class="kanban-col" data-status="${s.key}">
      <div class="kanban-col-header">
        <span class="kanban-col-title">${escapeHtml(s.label)}</span>
        <span class="kanban-col-count" data-count="${s.key}">0</span>
      </div>
      <div class="kanban-col-cards" data-status="${s.key}"></div>
    </div>
  `).join('');
}

/** Populate the modal + bulk-bar status <select> elements with custom labels. */
function populateStatusSelects() {
  const opts = stages.map(s => `<option value="${s.key}">${escapeHtml(s.label)}</option>`).join('');
  const ceStatus = document.getElementById('ce-status');
  if (ceStatus) ceStatus.innerHTML = opts;
  const bulkMove = document.getElementById('ce-bulk-move');
  if (bulkMove) bulkMove.innerHTML = `<option value="">Move to…</option>` + opts;
}

/** Render tag preset chips into the modal's tag field. */
function renderTagPresets() {
  const slot = document.getElementById('ce-tag-presets');
  if (!slot) return;
  const presets = getContentTagPresets();
  if (!presets.length) { slot.innerHTML = ''; return; }
  slot.innerHTML = presets.map(t =>
    `<button type="button" class="tag-chip tag-chip-clickable" data-preset="${escapeAttr(t)}">${escapeHtml(t)}</button>`
  ).join('');
  slot.querySelectorAll('[data-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById('ce-tags');
      if (!input) return;
      const current = input.value.split(',').map(s => s.trim()).filter(Boolean);
      const t = btn.dataset.preset;
      if (!current.includes(t)) current.push(t);
      input.value = current.join(', ');
    });
  });
}

/* ── Data ─────────────────────────────────────────────────── */
async function loadProjects() {
  try {
    const { data, error } = await db
      .from('content_projects')
      .select('*')
      .in('status', STATUSES())
      .order('updated_at', { ascending: false });

    if (error) throw error;
    projects = data || [];
  } catch {
    projects = [];
  }

  renderBoard();
  renderSummary();
}

async function loadArchivedProjects() {
  try {
    const { data, error } = await db
      .from('content_projects')
      .select('*')
      .eq('status', 'archived')
      .order('updated_at', { ascending: false });

    if (error) throw error;
    archivedProjects = data || [];
  } catch {
    archivedProjects = [];
  }

  renderArchivedSection();
}

/* ── Filtering ───────────────────────────────────────────── */
function getFilteredProjects() {
  return applyFilters(projects);
}

function getFilteredArchived() {
  return applyFilters(archivedProjects);
}

function applyFilters(list) {
  let filtered = list;

  if (platformFilter) {
    filtered = filtered.filter(p => p.platform === platformFilter);
  }

  if (tagFilter) {
    filtered = filtered.filter(p => Array.isArray(p.tags) && p.tags.includes(tagFilter));
  }

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(p => {
      const title = (p.title || '').toLowerCase();
      const desc = (p.description || '').toLowerCase();
      const tagMatch = Array.isArray(p.tags) && p.tags.some(t => t.toLowerCase().includes(q));
      return title.includes(q) || desc.includes(q) || tagMatch;
    });
  }

  return filtered;
}

function bindFilters() {
  const searchInput = document.getElementById('ce-search');
  const platformSelect = document.getElementById('ce-platform-filter');
  const archivedToggle = document.getElementById('ce-show-archived');

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        searchQuery = searchInput.value.trim();
        renderBoard();
        renderSummary();
        if (showArchived) renderArchivedSection();
      }, 300);
    });
  }

  if (platformSelect) {
    platformSelect.addEventListener('change', () => {
      platformFilter = platformSelect.value;
      renderBoard();
      renderSummary();
      if (showArchived) renderArchivedSection();
    });
  }

  if (archivedToggle) {
    archivedToggle.addEventListener('change', () => {
      showArchived = archivedToggle.checked;
      if (showArchived) {
        loadArchivedProjects();
      } else {
        const section = document.getElementById('ce-archived-section');
        if (section) section.style.display = 'none';
      }
    });
  }
}

/* ── Summary ─────────────────────────────────────────────── */
function renderSummary() {
  const el = document.getElementById('ce-summary');
  if (!el) return;

  const filtered = getFilteredProjects();
  const total = filtered.length;
  const counts = {};
  STATUSES().forEach(s => { counts[s] = 0; });
  filtered.forEach(p => {
    if (counts[p.status] !== undefined) counts[p.status]++;
  });

  const parts = [`<span>${total}</span> project${total !== 1 ? 's' : ''}`];
  stages.forEach(s => {
    if (counts[s.key] > 0) {
      parts.push(`<span>${counts[s.key]}</span> ${s.label.toLowerCase()}`);
    }
  });

  el.innerHTML = parts.join(' &middot; ');
}

/* ── Render ───────────────────────────────────────────────── */
function renderBoard() {
  const filtered = getFilteredProjects();

  // Tear down previous drag bindings before re-rendering.
  dragCleanups.forEach(fn => { try { fn(); } catch {} });
  dragCleanups = [];

  STATUSES().forEach(status => {
    const container = document.querySelector(`.kanban-col-cards[data-status="${status}"]`);
    const countEl = document.querySelector(`[data-count="${status}"]`);
    if (!container) return;

    const items = filtered.filter(p => p.status === status);

    // Update count badge
    if (countEl) countEl.textContent = items.length;

    if (items.length === 0) {
      const label = statusLabel(status);
      container.innerHTML = `<div class="kanban-empty">No ${label.toLowerCase()} projects yet</div>`;
    } else {
      container.innerHTML = items.map(p => cardHTML(p)).join('');
    }

    // Register this column as a drop zone.
    dragCleanups.push(registerDropZone(container, {
      highlightClass: 'drag-over',
      accept: (payload) => payload && payload.kind === 'content-card',
      onDrop: (payload) => moveProjectToStatus(payload.id, status),
    }));

    // Bind card-level events + draggable
    container.querySelectorAll('.kanban-card').forEach(card => {
      const id = card.dataset.id;
      dragCleanups.push(makeDraggable(card, {
        getPayload: () => ({ kind: 'content-card', id }),
        clickFallback: (ev) => onCardClick({ target: ev.target, currentTarget: card, stopPropagation() {} }),
      }));
    });

    container.querySelectorAll('[data-action="edit"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openEditModal(btn.dataset.id);
      });
    });

    container.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteProject(btn.dataset.id);
      });
    });

    container.querySelectorAll('[data-action="filter-tag"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        setTagFilter(btn.dataset.tag);
      });
    });

    container.querySelectorAll('[data-action="toggle-select"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleSelection(btn.dataset.id);
      });
    });
  });

  syncBulkBar();

  // Show/hide board-level empty state
  const boardEmpty = document.getElementById('kanban-board-empty');
  if (boardEmpty) {
    const totalProjects = projects.length;
    boardEmpty.style.display = totalProjects === 0 ? 'flex' : 'none';
    // Bind the CTA button to open modal
    const ctaBtn = boardEmpty.querySelector('#btn-new-project');
    if (ctaBtn) {
      ctaBtn.onclick = () => openCreateModal();
    }
  }
}

function cardHTML(project) {
  const platformClass = project.platform ? `platform-${project.platform}` : '';
  const platformLabel = project.platform
    ? escapeHtml(project.platform)
    : 'none';
  const step = statusStep(project.status);
  const isSelected = selectedIds.has(project.id);

  return `
    <div class="kanban-card${isSelected ? ' selected' : ''}" data-id="${project.id}">
      <div class="kanban-card-progress" data-step="${step}"></div>
      <button class="kanban-card-select${isSelected ? ' checked' : ''}" data-action="toggle-select" data-id="${project.id}" aria-label="Select project" title="Select">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M1.5 5L4 7.5L8.5 2.5"/>
        </svg>
      </button>
      <div class="kanban-card-title">${escapeHtml(project.title)}</div>
      <div class="kanban-card-meta">
        <span class="kanban-card-platform ${platformClass}">${platformLabel}</span>
        <span class="kanban-card-time">${relativeTime(project.updated_at)}</span>
      </div>
      ${tagChipsHTML(project.tags)}
      <div class="kanban-card-actions">
        <button class="kanban-card-btn" data-action="edit" data-id="${project.id}">Edit</button>
        <button class="kanban-card-btn danger" data-action="delete" data-id="${project.id}">Delete</button>
      </div>
    </div>
  `;
}

function tagChipsHTML(tags) {
  if (!Array.isArray(tags) || tags.length === 0) return '';
  return `<div class="tag-chip-row">${tags.map(t =>
    `<button type="button" class="tag-chip tag-chip-clickable" data-action="filter-tag" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`
  ).join('')}</div>`;
}

function renderActiveTagFilter() {
  const el = document.getElementById('ce-tag-filter-active');
  if (!el) return;
  if (!tagFilter) {
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }
  el.style.display = 'inline-flex';
  el.innerHTML = `
    Filtering by
    <span class="tag-chip">${escapeHtml(tagFilter)}</span>
    <button type="button" class="tag-clear-btn" id="ce-tag-clear" aria-label="Clear tag filter">&times;</button>
  `;
  const clearBtn = document.getElementById('ce-tag-clear');
  if (clearBtn) clearBtn.addEventListener('click', clearTagFilter);
}

function setTagFilter(tag) {
  if (!tag) return;
  tagFilter = tag;
  renderActiveTagFilter();
  renderBoard();
  renderSummary();
  if (showArchived) renderArchivedSection();
}

function clearTagFilter() {
  tagFilter = '';
  renderActiveTagFilter();
  renderBoard();
  renderSummary();
  if (showArchived) renderArchivedSection();
}

function parseTagsInput(value) {
  if (!value) return [];
  return value
    .split(',')
    .map(t => t.trim().toLowerCase().replace(/^#/, ''))
    .filter(Boolean)
    .filter((t, i, arr) => arr.indexOf(t) === i)
    .slice(0, 12);
}

function archivedCardHTML(project) {
  const platformClass = project.platform ? `platform-${project.platform}` : '';
  const platformLabel = project.platform
    ? escapeHtml(project.platform)
    : 'none';

  return `
    <div class="kanban-card" data-id="${project.id}" data-archived="true">
      <div class="kanban-card-title">${escapeHtml(project.title)}</div>
      <div class="kanban-card-meta">
        <span class="kanban-card-platform ${platformClass}">${platformLabel}</span>
        <span class="kanban-card-time">${relativeTime(project.updated_at)}</span>
      </div>
    </div>
  `;
}

function renderArchivedSection() {
  const section = document.getElementById('ce-archived-section');
  const grid = document.getElementById('ce-archived-grid');
  if (!section || !grid) return;

  const filtered = getFilteredArchived();

  if (!showArchived || filtered.length === 0) {
    section.style.display = showArchived ? 'block' : 'none';
    if (showArchived && filtered.length === 0) {
      grid.innerHTML = '<div class="kanban-empty" style="grid-column:1/-1;">No archived projects</div>';
    }
    return;
  }

  section.style.display = 'block';
  grid.innerHTML = filtered.map(p => archivedCardHTML(p)).join('');

  // Bind click to open slideover
  grid.querySelectorAll('.kanban-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.id;
      const project = archivedProjects.find(p => p.id === id);
      if (project) openSlideover(project);
    });
  });
}

/* ── Card Click → Slide-over ─────────────────────────────── */
function onCardClick(e) {
  // Don't open slideover if user clicked an action button
  if (e.target.closest('[data-action]')) return;

  // Don't open slideover if this was a drag
  const card = e.currentTarget;
  const id = card.dataset.id;
  const project = projects.find(p => p.id === id);
  if (project) openSlideover(project);
}

/* ── Slide-over Panel ────────────────────────────────────── */
function bindSlideover() {
  const closeBtn = document.getElementById('ce-slideover-close');
  const overlay = document.getElementById('ce-slideover-overlay');
  const editBtn = document.getElementById('ce-detail-edit');
  const deleteBtn = document.getElementById('ce-detail-delete');

  if (closeBtn) closeBtn.addEventListener('click', closeSlideover);
  if (overlay) overlay.addEventListener('click', closeSlideover);

  if (editBtn) {
    editBtn.addEventListener('click', () => {
      if (!slideoverProjectId) return;
      closeSlideover();
      openEditModal(slideoverProjectId);
    });
  }

  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      if (!slideoverProjectId) return;
      const id = slideoverProjectId;
      closeSlideover();
      deleteProject(id);
    });
  }
}

function openSlideover(project) {
  slideoverProjectId = project.id;

  const panel = document.getElementById('ce-slideover');
  const overlay = document.getElementById('ce-slideover-overlay');
  if (!panel || !overlay) return;

  // Populate fields
  setText('ce-slideover-title', project.title || 'Untitled');
  setDetailValue('ce-detail-platform', project.platform ? capitalize(project.platform) : null);
  setDetailValue('ce-detail-status', statusLabel(project.status));
  setDetailValue('ce-detail-description', project.description);
  setDetailValue('ce-detail-scheduled', project.scheduled_at ? formatDateTime(project.scheduled_at) : null);
  setDetailValue('ce-detail-published', project.published_at ? formatDateTime(project.published_at) : null);
  setTagsDetail('ce-detail-tags', project.tags);
  setDetailValue('ce-detail-notes', project.notes);
  setDetailValue('ce-detail-created', project.created_at ? formatDateTime(project.created_at) : null);
  setDetailValue('ce-detail-updated', project.updated_at ? formatDateTime(project.updated_at) : null);

  // Show
  panel.classList.add('active');
  overlay.classList.add('active');
}

function closeSlideover() {
  const panel = document.getElementById('ce-slideover');
  const overlay = document.getElementById('ce-slideover-overlay');
  if (panel) panel.classList.remove('active');
  if (overlay) overlay.classList.remove('active');
  slideoverProjectId = null;
}

function setDetailValue(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  if (value) {
    el.textContent = value;
    el.classList.remove('empty');
  } else {
    el.textContent = '--';
    el.classList.add('empty');
  }
}

function setTagsDetail(id, tags) {
  const el = document.getElementById(id);
  if (!el) return;
  if (Array.isArray(tags) && tags.length) {
    el.innerHTML = tagChipsHTML(tags);
    el.classList.remove('empty');
  } else {
    el.textContent = '--';
    el.classList.add('empty');
  }
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

/* ── Move project to a different stage (used by drag + bulk) ── */
async function moveProjectToStatus(id, newStatus) {
  const project = projects.find(p => p.id === id);
  if (!project || project.status === newStatus) return;

  const oldStatus = project.status;
  const oldPublished = project.published_at;

  // Optimistic update
  project.status = newStatus;
  if (newStatus === 'posted' && !project.published_at) {
    project.published_at = new Date().toISOString();
  }
  renderBoard();
  renderSummary();

  const update = { status: newStatus };
  if (newStatus === 'posted' && project.published_at) {
    update.published_at = project.published_at;
  }

  // Persist — queues automatically if offline, replays on reconnect.
  const result = await queueOrRun(
    { table: 'content_projects', action: 'update', payload: update, match: { id } },
    `Move "${truncate(project.title, 30)}" to ${statusLabel(newStatus)}`
  );

  if (result.error) {
    // Real (non-network) failure — revert.
    project.status = oldStatus;
    project.published_at = oldPublished;
    renderBoard();
    renderSummary();
    showToast('Failed to update status. Reverting.', 'error');
  } else if (!result.queued) {
    showToast(
      `Moved "${truncate(project.title, 30)}" to ${statusLabel(newStatus)}`,
      'success'
    );
  }
}

/* ── Modal ────────────────────────────────────────────────── */
function bindModal() {
  const newBtn = document.getElementById('ce-new-project');
  const closeBtn = document.getElementById('ce-modal-close');
  const cancelBtn = document.getElementById('ce-cancel');
  const form = document.getElementById('ce-form');
  const overlay = document.getElementById('ce-modal');

  if (newBtn) newBtn.addEventListener('click', openCreateModal);
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
  if (form) form.addEventListener('submit', handleSubmit);

  // Close on overlay click (not card click)
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });
  }
}

function openCreateModal() {
  editingId = null;
  resetForm();

  const titleEl = document.getElementById('ce-modal-title');
  const subtitleEl = document.getElementById('ce-modal-subtitle');
  const submitEl = document.getElementById('ce-submit');

  if (titleEl) titleEl.textContent = 'New Project';
  if (subtitleEl) subtitleEl.textContent = 'Add a new content project to your pipeline';
  if (submitEl) submitEl.textContent = 'Create Project';

  showModal();
}

function openEditModal(id) {
  const project = projects.find(p => p.id === id)
    || archivedProjects.find(p => p.id === id);
  if (!project) return;

  editingId = id;

  const titleEl = document.getElementById('ce-modal-title');
  const subtitleEl = document.getElementById('ce-modal-subtitle');
  const submitEl = document.getElementById('ce-submit');

  if (titleEl) titleEl.textContent = 'Edit Project';
  if (subtitleEl) subtitleEl.textContent = 'Update project details';
  if (submitEl) submitEl.textContent = 'Save Changes';

  // Populate form fields
  setVal('ce-id', project.id);
  setVal('ce-title', project.title || '');
  setVal('ce-description', project.description || '');
  setVal('ce-platform', project.platform || '');
  setVal('ce-status', project.status || 'idea');
  setVal('ce-notes', project.notes || '');
  setVal('ce-tags', Array.isArray(project.tags) ? project.tags.join(', ') : '');

  // Format scheduled_at for datetime-local input
  if (project.scheduled_at) {
    const d = new Date(project.scheduled_at);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    setVal('ce-scheduled', local);
  } else {
    setVal('ce-scheduled', '');
  }

  showModal();
}

function showModal() {
  const modal = document.getElementById('ce-modal');
  if (modal) modal.style.display = 'flex';
}

function closeModal() {
  const modal = document.getElementById('ce-modal');
  if (modal) modal.style.display = 'none';
  resetForm();
  editingId = null;
}

function resetForm() {
  const form = document.getElementById('ce-form');
  if (form) form.reset();
  setVal('ce-id', '');
  const errorEl = document.getElementById('ce-error');
  if (errorEl) errorEl.textContent = '';
}

async function handleSubmit(e) {
  e.preventDefault();

  const errorEl = document.getElementById('ce-error');
  const submitBtn = document.getElementById('ce-submit');
  if (errorEl) errorEl.textContent = '';
  if (submitBtn) submitBtn.disabled = true;

  const title = getVal('ce-title').trim();
  const description = getVal('ce-description').trim();
  const platform = getVal('ce-platform') || null;
  const status = getVal('ce-status') || 'idea';
  const scheduledRaw = getVal('ce-scheduled');
  const notes = getVal('ce-notes').trim();
  const tags = parseTagsInput(getVal('ce-tags'));

  if (!title) {
    if (errorEl) errorEl.textContent = 'Title is required.';
    if (submitBtn) submitBtn.disabled = false;
    return;
  }

  const scheduled_at = scheduledRaw ? new Date(scheduledRaw).toISOString() : null;
  const published_at = status === 'posted' ? new Date().toISOString() : null;

  const now = new Date().toISOString();

  try {
    if (editingId) {
      // Update
      const payload = { title, description: description || null, platform, status, scheduled_at, notes: notes || null, tags };
      // Only set published_at when transitioning to posted
      const existing = projects.find(p => p.id === editingId)
        || archivedProjects.find(p => p.id === editingId);
      if (status === 'posted' && existing && existing.status !== 'posted') {
        payload.published_at = published_at;
      }

      const result = await queueOrRun(
        { table: 'content_projects', action: 'update', payload, match: { id: editingId } },
        `Edit "${truncate(title, 30)}"`
      );
      if (result.error) throw result.error;

      // Optimistic local merge so the edit shows instantly (online or not).
      if (existing) {
        Object.assign(existing, payload, { updated_at: now });
        // Status may have moved the row in/out of the archived bucket.
        applyLocalStatusBucket(existing);
      }
      showToast(result.queued ? 'Saved offline — will sync' : 'Project updated', result.queued ? 'info' : 'success');
    } else {
      // Create
      if (!currentUser) {
        if (errorEl) errorEl.textContent = 'You must be signed in.';
        if (submitBtn) submitBtn.disabled = false;
        return;
      }

      // Client-minted id so the optimistic row keeps its identity on sync.
      const id = newId();
      const row = {
        id,
        user_id: currentUser.id,
        title,
        description: description || null,
        platform,
        status,
        scheduled_at,
        published_at,
        notes: notes || null,
        tags,
        created_at: now,
        updated_at: now,
      };

      const result = await queueOrRun(
        { table: 'content_projects', action: 'insert', payload: row },
        `New project "${truncate(title, 30)}"`
      );
      if (result.error) throw result.error;

      // Optimistic insert into the right bucket.
      if (status === 'archived') archivedProjects.unshift(row);
      else projects.unshift(row);
      showToast(result.queued ? 'Saved offline — will sync' : 'Project created', result.queued ? 'info' : 'success');
    }

    closeModal();
    renderBoard();
    renderSummary();
    if (showArchived) renderArchivedSection();
  } catch (err) {
    if (errorEl) errorEl.textContent = err.message || 'Something went wrong.';
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

/**
 * Keep a project in the correct in-memory bucket after an edit changes
 * its status. Active statuses live in `projects`; 'archived' lives in
 * `archivedProjects`.
 */
function applyLocalStatusBucket(project) {
  const isArchived = project.status === 'archived';
  projects = projects.filter(p => p.id !== project.id);
  archivedProjects = archivedProjects.filter(p => p.id !== project.id);
  if (isArchived) archivedProjects.unshift(project);
  else projects.unshift(project);
}

/* ── Delete ───────────────────────────────────────────────── */
async function deleteProject(id) {
  // Simple confirmation — no third-party libs
  const project = projects.find(p => p.id === id)
    || archivedProjects.find(p => p.id === id);
  const name = project ? project.title : 'this project';
  if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;

  try {
    const { error } = await db
      .from('content_projects')
      .delete()
      .eq('id', id);

    if (error) throw error;

    projects = projects.filter(p => p.id !== id);
    archivedProjects = archivedProjects.filter(p => p.id !== id);
    renderBoard();
    renderSummary();
    /* drag bindings re-applied by renderBoard */
    if (showArchived) renderArchivedSection();
    showToast('Project deleted', 'info');
  } catch {
    // Silently reload to stay in sync
    await loadProjects();
    /* drag bindings re-applied by renderBoard */
  }
}

/* ── Bulk Selection ──────────────────────────────────────── */
function toggleSelection(id) {
  if (selectedIds.has(id)) selectedIds.delete(id);
  else selectedIds.add(id);

  // Update only this card's visual state to avoid a full re-render.
  const cards = document.querySelectorAll(`.kanban-card[data-id="${id}"]`);
  cards.forEach(card => {
    card.classList.toggle('selected', selectedIds.has(id));
    const btn = card.querySelector('[data-action="toggle-select"]');
    if (btn) btn.classList.toggle('checked', selectedIds.has(id));
  });
  syncBulkBar();
}

function clearSelection() {
  if (selectedIds.size === 0) return;
  selectedIds.clear();
  document.querySelectorAll('.kanban-card.selected').forEach(card => {
    card.classList.remove('selected');
    const btn = card.querySelector('[data-action="toggle-select"]');
    if (btn) btn.classList.remove('checked');
  });
  syncBulkBar();
}

function bindBulkBar() {
  const moveSelect = document.getElementById('ce-bulk-move');
  const archiveBtn = document.getElementById('ce-bulk-archive');
  const deleteBtn = document.getElementById('ce-bulk-delete');
  const clearBtn = document.getElementById('ce-bulk-clear');

  if (moveSelect) {
    moveSelect.addEventListener('change', async () => {
      const newStatus = moveSelect.value;
      if (!newStatus) return;
      await bulkMove(newStatus);
      moveSelect.value = '';
    });
  }
  if (archiveBtn) archiveBtn.addEventListener('click', () => bulkMove('archived'));
  if (deleteBtn) deleteBtn.addEventListener('click', bulkDelete);
  if (clearBtn) clearBtn.addEventListener('click', clearSelection);
}

function syncBulkBar() {
  const bar = document.getElementById('ce-bulk-bar');
  const countEl = document.getElementById('ce-bulk-count');
  if (!bar) return;
  if (selectedIds.size === 0) {
    bar.classList.remove('visible');
    return;
  }
  bar.classList.add('visible');
  if (countEl) countEl.textContent = `${selectedIds.size} selected`;
}

async function bulkMove(newStatus) {
  if (selectedIds.size === 0) return;
  const ids = Array.from(selectedIds);
  const payload = { status: newStatus };
  if (newStatus === 'posted') payload.published_at = new Date().toISOString();

  try {
    const { error } = await db
      .from('content_projects')
      .update(payload)
      .in('id', ids);
    if (error) throw error;
    showToast(`Moved ${ids.length} project${ids.length !== 1 ? 's' : ''} to ${statusLabel(newStatus)}`, 'success');
    clearSelection();
    await loadProjects();
    /* drag bindings re-applied by renderBoard */
    if (showArchived) await loadArchivedProjects();
  } catch (err) {
    showToast(err.message || 'Failed to move projects', 'error');
  }
}

async function bulkDelete() {
  if (selectedIds.size === 0) return;
  const ids = Array.from(selectedIds);
  if (!confirm(`Delete ${ids.length} project${ids.length !== 1 ? 's' : ''}? This cannot be undone.`)) return;

  try {
    const { error } = await db.from('content_projects').delete().in('id', ids);
    if (error) throw error;
    showToast(`Deleted ${ids.length} project${ids.length !== 1 ? 's' : ''}`, 'info');
    clearSelection();
    await loadProjects();
    /* drag bindings re-applied by renderBoard */
    if (showArchived) await loadArchivedProjects();
  } catch (err) {
    showToast(err.message || 'Failed to delete projects', 'error');
  }
}

/* ── AI Idea Generator ───────────────────────────────────── */
function bindIdeasModal() {
  const triggerBtn = document.getElementById('ce-generate-ideas');
  const modal = document.getElementById('ce-ideas-modal');
  const closeBtn = document.getElementById('ce-ideas-close');
  const runBtn = document.getElementById('ce-ideas-run');

  if (triggerBtn && modal) {
    triggerBtn.addEventListener('click', () => {
      modal.style.display = 'flex';
      const input = document.getElementById('ce-ideas-niche');
      if (input) setTimeout(() => input.focus(), 40);
    });
  }

  if (closeBtn) closeBtn.addEventListener('click', closeIdeasModal);
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeIdeasModal();
    });
  }

  if (runBtn) runBtn.addEventListener('click', runIdeas);

  const nicheInput = document.getElementById('ce-ideas-niche');
  if (nicheInput) {
    nicheInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        runIdeas();
      }
    });
  }
}

function closeIdeasModal() {
  const modal = document.getElementById('ce-ideas-modal');
  if (modal) modal.style.display = 'none';
}

/* ── Project Templates ───────────────────────────────────── */
function bindTemplatesModal() {
  const triggerBtn = document.getElementById('ce-templates');
  const modal = document.getElementById('ce-templates-modal');
  const closeBtn = document.getElementById('ce-templates-close');

  if (triggerBtn && modal) {
    triggerBtn.addEventListener('click', () => {
      renderTemplates();
      modal.style.display = 'flex';
      const input = document.getElementById('ce-template-topic');
      if (input) setTimeout(() => input.focus(), 40);
    });
  }
  if (closeBtn) closeBtn.addEventListener('click', closeTemplatesModal);
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeTemplatesModal();
    });
  }
}

function closeTemplatesModal() {
  const modal = document.getElementById('ce-templates-modal');
  if (modal) modal.style.display = 'none';
}

function renderTemplates() {
  const list = document.getElementById('ce-templates-list');
  if (!list) return;
  list.innerHTML = TEMPLATES.map(t => `
    <div class="ce-template-card" data-template="${t.id}">
      <div class="ce-template-head">
        <span class="ce-template-name">${escapeHtml(t.name)}</span>
        <button class="btn btn-primary" data-action="use-template" data-template="${t.id}">Create ${t.steps.length}</button>
      </div>
      <div class="ce-template-desc">${escapeHtml(t.description)}</div>
      <div class="ce-template-steps">
        ${t.steps.map(s => `<span class="ce-template-step">${escapeHtml(s.suffix.replace(/^—\s*/, ''))}</span>`).join('')}
      </div>
    </div>
  `).join('');

  list.querySelectorAll('[data-action="use-template"]').forEach(btn => {
    btn.addEventListener('click', () => applyTemplate(btn.dataset.template, btn));
  });
}

async function applyTemplate(templateId, btn) {
  if (!currentUser) {
    showToast('You must be signed in', 'error');
    return;
  }
  const template = TEMPLATES.find(t => t.id === templateId);
  if (!template) return;

  const topic = document.getElementById('ce-template-topic')?.value.trim() || '';
  if (!topic) {
    showToast('Add a topic or working title first', 'warning');
    document.getElementById('ce-template-topic')?.focus();
    return;
  }

  btn.disabled = true;
  const rows = buildProjectsFromTemplate(template, topic).map(r => ({
    ...r,
    user_id: currentUser.id,
  }));

  try {
    const { error } = await db.from('content_projects').insert(rows);
    if (error) throw error;
    showToast(`Created ${rows.length} projects from "${template.name}"`, 'success');
    closeTemplatesModal();
    const topicInput = document.getElementById('ce-template-topic');
    if (topicInput) topicInput.value = '';
    await loadProjects();
  } catch (err) {
    btn.disabled = false;
    showToast(err.message || 'Failed to create projects', 'error');
  }
}

async function runIdeas() {
  const body = document.getElementById('ce-ideas-body');
  const runBtn = document.getElementById('ce-ideas-run');
  const niche = document.getElementById('ce-ideas-niche')?.value.trim() || '';
  if (!body) return;

  if (runBtn) runBtn.disabled = true;
  body.innerHTML = '<div class="ce-ideas-loading">Asking Claude for fresh ideas&hellip;</div>';

  try {
    const { data, error } = await db.functions.invoke('generate-content-ideas', {
      body: { niche, platform: platformFilter || undefined },
    });

    if (error) {
      const detail = error?.context?.body
        ? safeParseErrorMessage(await error.context.text?.()) || error.message
        : error.message;
      throw new Error(detail || 'Failed to generate ideas');
    }

    const ideas = Array.isArray(data?.ideas) ? data.ideas : [];
    renderIdeas(ideas);
  } catch (err) {
    body.innerHTML = `<div class="ce-ideas-error">${escapeHtml(err.message || 'Failed to generate ideas. Check the function is deployed and ANTHROPIC_API_KEY is set.')}</div>`;
  } finally {
    if (runBtn) runBtn.disabled = false;
  }
}

function safeParseErrorMessage(text) {
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed?.error || null;
  } catch {
    return null;
  }
}

function renderIdeas(ideas) {
  const body = document.getElementById('ce-ideas-body');
  if (!body) return;
  if (!ideas.length) {
    body.innerHTML = '<div class="ce-ideas-error">No ideas returned. Try again with more context.</div>';
    return;
  }

  body.innerHTML = `<div class="ce-idea-list">${ideas.map((idea, i) => `
    <div class="ce-idea" data-idx="${i}">
      <div class="ce-idea-header">
        <div class="ce-idea-title">${escapeHtml(idea.title || 'Untitled')}</div>
        ${idea.platform ? `<span class="ce-idea-platform">${escapeHtml(idea.platform)}</span>` : ''}
      </div>
      <div class="ce-idea-desc">${escapeHtml(idea.description || '')}</div>
      <div class="ce-idea-actions">
        <button class="ce-idea-add" data-action="add-idea" data-idx="${i}">Add to pipeline</button>
      </div>
    </div>
  `).join('')}</div>`;

  body.querySelectorAll('[data-action="add-idea"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.idx, 10);
      const idea = ideas[idx];
      if (!idea || btn.classList.contains('added')) return;
      await addIdeaToPipeline(idea, btn);
    });
  });
}

async function addIdeaToPipeline(idea, btn) {
  if (!currentUser) {
    showToast('You must be signed in', 'error');
    return;
  }
  btn.disabled = true;
  try {
    const validPlatforms = ['youtube','tiktok','instagram','twitter','linkedin','podcast','blog','other'];
    const platform = validPlatforms.includes((idea.platform || '').toLowerCase())
      ? idea.platform.toLowerCase() : null;

    const { error } = await db.from('content_projects').insert({
      user_id: currentUser.id,
      title: idea.title,
      description: idea.description || null,
      platform,
      status: 'idea',
      tags: ['ai-generated'],
    });
    if (error) throw error;

    btn.textContent = 'Added';
    btn.classList.add('added');
    showToast(`Added "${truncate(idea.title, 40)}" to your pipeline`, 'success');
    // Refresh board in the background
    loadProjects();
  } catch (err) {
    btn.disabled = false;
    showToast(err.message || 'Failed to add idea', 'error');
  }
}

/* ── Keyboard Shortcuts ──────────────────────────────────── */
function bindKeyboardShortcuts() {
  document.addEventListener('keydown', onGlobalKeydown);
}

function onGlobalKeydown(e) {
  // Escape: close slideover, ideas modal, create modal, or clear selection
  if (e.key === 'Escape') {
    if (slideoverProjectId !== null) {
      closeSlideover();
      return;
    }
    const ideasModal = document.getElementById('ce-ideas-modal');
    if (ideasModal && ideasModal.style.display === 'flex') {
      closeIdeasModal();
      return;
    }
    const templatesModal = document.getElementById('ce-templates-modal');
    if (templatesModal && templatesModal.style.display === 'flex') {
      closeTemplatesModal();
      return;
    }
    if (selectedIds.size > 0) {
      clearSelection();
      return;
    }
    closeModal();
    return;
  }

  // 'n' opens new project modal when no input is focused
  if (e.key === 'n' && !isInputFocused()) {
    e.preventDefault();
    openCreateModal();
  }
}

function isInputFocused() {
  const active = document.activeElement;
  if (!active) return false;
  const tag = active.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || active.isContentEditable;
}

/* ── Cleanup (called by router on route change) ──────────── */
function cleanup() {
  document.removeEventListener('keydown', onGlobalKeydown);
  window.removeEventListener('svn-os:synced', onSynced);
  clearTimeout(searchDebounceTimer);
  closeSlideover();
  dragCleanups.forEach(fn => { try { fn(); } catch {} });
  dragCleanups = [];
}

/* ── Helpers ──────────────────────────────────────────────── */
function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

function escapeAttr(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function relativeTime(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function formatDateTime(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '...' : str;
}

function getVal(id) {
  const el = document.getElementById(id);
  return el ? el.value : '';
}

function setVal(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}
