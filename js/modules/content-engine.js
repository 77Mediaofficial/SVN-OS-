import { db, getCurrentUser } from '../supabase.js';

/* ── Constants ────────────────────────────────────────────── */
const STATUSES = ['idea', 'scripting', 'production', 'ready', 'posted'];
const PLATFORMS = ['youtube', 'tiktok', 'instagram', 'twitter', 'linkedin', 'podcast', 'blog', 'other'];

/* ── State ────────────────────────────────────────────────── */
let projects = [];
let currentUser = null;
let editingId = null;       // null = create, uuid = edit
let draggedCardId = null;

/* ── Init (called by router after HTML partial is injected) ─ */
export async function init() {
  currentUser = await getCurrentUser();

  bindModal();
  bindDragAndDrop();
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
}

/* ── Render ───────────────────────────────────────────────── */
function renderBoard() {
  STATUSES.forEach(status => {
    const container = document.querySelector(`.kanban-col-cards[data-status="${status}"]`);
    const countEl = document.querySelector(`[data-count="${status}"]`);
    if (!container) return;

    const items = projects.filter(p => p.status === status);

    // Update count badge
    if (countEl) countEl.textContent = items.length;

    if (items.length === 0) {
      container.innerHTML = '<div class="kanban-empty">No projects</div>';
      return;
    }

    container.innerHTML = items.map(p => cardHTML(p)).join('');

    // Bind card-level events
    container.querySelectorAll('.kanban-card').forEach(card => {
      card.setAttribute('draggable', 'true');
      card.addEventListener('dragstart', onDragStart);
      card.addEventListener('dragend', onDragEnd);
    });

    container.querySelectorAll('[data-action="edit"]').forEach(btn => {
      btn.addEventListener('click', () => openEditModal(btn.dataset.id));
    });

    container.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', () => deleteProject(btn.dataset.id));
    });
  });
}

function cardHTML(project) {
  const platformClass = project.platform ? `platform-${project.platform}` : '';
  const platformLabel = project.platform
    ? escapeHtml(project.platform)
    : 'none';

  return `
    <div class="kanban-card" data-id="${project.id}">
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

  // Optimistic update
  project.status = newStatus;
  if (newStatus === 'posted' && !project.published_at) {
    project.published_at = new Date().toISOString();
  }
  renderBoard();
  bindDragAndDrop();

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

  // Close on Escape key
  document.addEventListener('keydown', onEscapeKey);
}

function onEscapeKey(e) {
  if (e.key === 'Escape') closeModal();
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
  const project = projects.find(p => p.id === id);
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
      const existing = projects.find(p => p.id === editingId);
      if (status === 'posted' && existing && existing.status !== 'posted') {
        payload.published_at = published_at;
      }

      const { error } = await db
        .from('content_projects')
        .update(payload)
        .eq('id', editingId);

      if (error) throw error;
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
    }

    closeModal();
    await loadProjects();
    bindDragAndDrop();
  } catch (err) {
    if (errorEl) errorEl.textContent = err.message || 'Something went wrong.';
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

/* ── Delete ───────────────────────────────────────────────── */
async function deleteProject(id) {
  // Simple confirmation — no third-party libs
  const project = projects.find(p => p.id === id);
  const name = project ? project.title : 'this project';
  if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;

  try {
    const { error } = await db
      .from('content_projects')
      .delete()
      .eq('id', id);

    if (error) throw error;

    projects = projects.filter(p => p.id !== id);
    renderBoard();
    bindDragAndDrop();
  } catch {
    // Silently reload to stay in sync
    await loadProjects();
    bindDragAndDrop();
  }
}

/* ── Cleanup (called by router on route change) ──────────── */
function cleanup() {
  document.removeEventListener('keydown', onEscapeKey);
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

function getVal(id) {
  const el = document.getElementById(id);
  return el ? el.value : '';
}

function setVal(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}
