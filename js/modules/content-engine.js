import { db, getCurrentUser } from '../supabase.js';
import { showToast } from '../toast.js';

/* ── Constants ────────────────────────────────────────────── */
const STATUSES = ['idea', 'scripting', 'production', 'ready', 'posted'];
const PLATFORMS = ['youtube', 'tiktok', 'instagram', 'twitter', 'linkedin', 'podcast', 'blog', 'other'];

/** Pipeline step index (1-based) for progress indicator */
const STATUS_STEP = { idea: 1, scripting: 2, production: 3, ready: 4, posted: 5 };

/** Human-readable status labels */
const STATUS_LABEL = {
  idea: 'Idea',
  scripting: 'Scripting',
  production: 'Production',
  ready: 'Ready',
  posted: 'Posted',
  archived: 'Archived',
};

/* ── State ────────────────────────────────────────────────── */
let projects = [];          // all loaded projects (non-archived)
let archivedProjects = [];  // archived projects (loaded on demand)
let currentUser = null;
let editingId = null;       // null = create, uuid = edit
let draggedCardId = null;
let slideoverProjectId = null;   // id of project shown in detail panel
let searchQuery = '';
let platformFilter = '';
let showArchived = false;
let searchDebounceTimer = null;

/* ── Init (called by router after HTML partial is injected) ─ */
export async function init() {
  currentUser = await getCurrentUser();

  bindModal();
  bindDragAndDrop();
  bindFilters();
  bindSlideover();
  bindKeyboardShortcuts();
  await loadProjects();

  // Return a cleanup function so the router can tear down listeners
  return cleanup;
}

/* ── Data ─────────────────────────────────────────────────── */
async function loadProjects() {
  try {
    const { data, error } = await db
      .from('content_projects')
      .select('*')
      .in('status', STATUSES)
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
  let filtered = projects;

  // Platform filter
  if (platformFilter) {
    filtered = filtered.filter(p => p.platform === platformFilter);
  }

  // Search filter (title + description)
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(p => {
      const title = (p.title || '').toLowerCase();
      const desc = (p.description || '').toLowerCase();
      return title.includes(q) || desc.includes(q);
    });
  }

  return filtered;
}

function getFilteredArchived() {
  let filtered = archivedProjects;

  if (platformFilter) {
    filtered = filtered.filter(p => p.platform === platformFilter);
  }

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(p => {
      const title = (p.title || '').toLowerCase();
      const desc = (p.description || '').toLowerCase();
      return title.includes(q) || desc.includes(q);
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
  STATUSES.forEach(s => { counts[s] = 0; });
  filtered.forEach(p => {
    if (counts[p.status] !== undefined) counts[p.status]++;
  });

  const parts = [`<span>${total}</span> project${total !== 1 ? 's' : ''}`];
  STATUSES.forEach(s => {
    if (counts[s] > 0) {
      const label = s === 'production' ? 'in production' : STATUS_LABEL[s].toLowerCase();
      parts.push(`<span>${counts[s]}</span> ${label}`);
    }
  });

  el.innerHTML = parts.join(' &middot; ');
}

/* ── Render ───────────────────────────────────────────────── */
function renderBoard() {
  const filtered = getFilteredProjects();

  STATUSES.forEach(status => {
    const container = document.querySelector(`.kanban-col-cards[data-status="${status}"]`);
    const countEl = document.querySelector(`[data-count="${status}"]`);
    if (!container) return;

    const items = filtered.filter(p => p.status === status);

    // Update count badge
    if (countEl) countEl.textContent = items.length;

    if (items.length === 0) {
      const statusLabel = STATUS_LABEL[status] || status;
      container.innerHTML = `<div class="kanban-empty">No ${statusLabel.toLowerCase()} projects yet</div>`;
      return;
    }

    container.innerHTML = items.map(p => cardHTML(p)).join('');

    // Bind card-level events
    container.querySelectorAll('.kanban-card').forEach(card => {
      card.setAttribute('draggable', 'true');
      card.addEventListener('dragstart', onDragStart);
      card.addEventListener('dragend', onDragEnd);

      // Click to open detail panel (not on action buttons)
      card.addEventListener('click', onCardClick);
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
  });

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
  const step = STATUS_STEP[project.status] || 1;

  return `
    <div class="kanban-card" data-id="${project.id}">
      <div class="kanban-card-progress" data-step="${step}"></div>
      <div class="kanban-card-title">${escapeHtml(project.title)}</div>
      <div class="kanban-card-meta">
        <span class="kanban-card-platform ${platformClass}">${platformLabel}</span>
        <span class="kanban-card-time">${relativeTime(project.updated_at)}</span>
      </div>
      <div class="kanban-card-actions">
        <button class="kanban-card-btn" data-action="edit" data-id="${project.id}">Edit</button>
        <button class="kanban-card-btn danger" data-action="delete" data-id="${project.id}">Delete</button>
      </div>
    </div>
  `;
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
  setDetailValue('ce-detail-status', STATUS_LABEL[project.status] || project.status);
  setDetailValue('ce-detail-description', project.description);
  setDetailValue('ce-detail-scheduled', project.scheduled_at ? formatDateTime(project.scheduled_at) : null);
  setDetailValue('ce-detail-published', project.published_at ? formatDateTime(project.published_at) : null);
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

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

/* ── Drag and Drop ────────────────────────────────────────── */
function bindDragAndDrop() {
  document.querySelectorAll('.kanban-col-cards').forEach(zone => {
    zone.addEventListener('dragover', onDragOver);
    zone.addEventListener('dragenter', onDragEnter);
    zone.addEventListener('dragleave', onDragLeave);
    zone.addEventListener('drop', onDrop);
  });
}

function onDragStart(e) {
  const card = e.target.closest('.kanban-card');
  if (!card) return;
  draggedCardId = card.dataset.id;
  card.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', draggedCardId);
}

function onDragEnd(e) {
  const card = e.target.closest('.kanban-card');
  if (card) card.classList.remove('dragging');
  draggedCardId = null;
  // Remove all drag-over highlights
  document.querySelectorAll('.kanban-col-cards.drag-over').forEach(el => {
    el.classList.remove('drag-over');
  });
}

function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}

function onDragEnter(e) {
  e.preventDefault();
  const zone = e.currentTarget;
  zone.classList.add('drag-over');
}

function onDragLeave(e) {
  const zone = e.currentTarget;
  // Only remove if leaving the zone entirely (not entering a child)
  if (!zone.contains(e.relatedTarget)) {
    zone.classList.remove('drag-over');
  }
}

async function onDrop(e) {
  e.preventDefault();
  const zone = e.currentTarget;
  zone.classList.remove('drag-over');

  const id = e.dataTransfer.getData('text/plain');
  const newStatus = zone.dataset.status;
  if (!id || !newStatus) return;

  const project = projects.find(p => p.id === id);
  if (!project || project.status === newStatus) return;

  const oldStatus = project.status;

  // Optimistic update
  project.status = newStatus;
  if (newStatus === 'posted' && !project.published_at) {
    project.published_at = new Date().toISOString();
  }
  renderBoard();
  renderSummary();
  bindDragAndDrop();

  // Toast notification
  showToast(
    `Moved "${truncate(project.title, 30)}" to ${STATUS_LABEL[newStatus]}`,
    'success'
  );

  try {
    const update = { status: newStatus };
    if (newStatus === 'posted' && project.published_at) {
      update.published_at = project.published_at;
    }
    const { error } = await db
      .from('content_projects')
      .update(update)
      .eq('id', id);

    if (error) throw error;
  } catch {
    // Revert on failure
    showToast('Failed to update status. Reverting.', 'error');
    await loadProjects();
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

  if (!title) {
    if (errorEl) errorEl.textContent = 'Title is required.';
    if (submitBtn) submitBtn.disabled = false;
    return;
  }

  const scheduled_at = scheduledRaw ? new Date(scheduledRaw).toISOString() : null;
  const published_at = status === 'posted' ? new Date().toISOString() : null;

  try {
    if (editingId) {
      // Update
      const payload = { title, description, platform, status, scheduled_at, notes };
      // Only set published_at when transitioning to posted
      const existing = projects.find(p => p.id === editingId)
        || archivedProjects.find(p => p.id === editingId);
      if (status === 'posted' && existing && existing.status !== 'posted') {
        payload.published_at = published_at;
      }

      const { error } = await db
        .from('content_projects')
        .update(payload)
        .eq('id', editingId);

      if (error) throw error;
      showToast('Project updated', 'success');
    } else {
      // Create
      if (!currentUser) {
        if (errorEl) errorEl.textContent = 'You must be signed in.';
        if (submitBtn) submitBtn.disabled = false;
        return;
      }

      const { error } = await db
        .from('content_projects')
        .insert({
          user_id: currentUser.id,
          title,
          description: description || null,
          platform,
          status,
          scheduled_at,
          published_at,
          notes: notes || null,
        });

      if (error) throw error;
      showToast('Project created', 'success');
    }

    closeModal();
    await loadProjects();
    bindDragAndDrop();
    if (showArchived) await loadArchivedProjects();
  } catch (err) {
    if (errorEl) errorEl.textContent = err.message || 'Something went wrong.';
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
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
    bindDragAndDrop();
    if (showArchived) renderArchivedSection();
    showToast('Project deleted', 'info');
  } catch {
    // Silently reload to stay in sync
    await loadProjects();
    bindDragAndDrop();
  }
}

/* ── Keyboard Shortcuts ──────────────────────────────────── */
function bindKeyboardShortcuts() {
  document.addEventListener('keydown', onGlobalKeydown);
}

function onGlobalKeydown(e) {
  // Escape: close slideover first, then modal
  if (e.key === 'Escape') {
    if (slideoverProjectId !== null) {
      closeSlideover();
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
  clearTimeout(searchDebounceTimer);
  closeSlideover();
}

/* ── Helpers ──────────────────────────────────────────────── */
function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
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
