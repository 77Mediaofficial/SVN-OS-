import { db } from '../supabase.js';
import { showToast } from '../toast.js';
import { navigate } from '../router.js';

const PLATFORM_COLORS = {
  youtube:   '#ff4444',
  tiktok:    '#00f2ea',
  instagram: '#e1306c',
  twitter:   '#1da1f2',
  linkedin:  '#0077b5',
  podcast:   '#9b59b6',
  blog:      '#2ecc71',
  other:     '#777777'
};

const MAX_PILLS = 3;

let currentYear;
let currentMonth; // 0-indexed
let contentByDay = {}; // { "YYYY-MM-DD": [ ...items ] }
let activePlatformFilter = 'all'; // 'all' or a specific platform key
let cleanupFns = [];

export async function init() {
  const now = new Date();
  currentYear = now.getFullYear();
  currentMonth = now.getMonth();
  activePlatformFilter = 'all';

  const prevBtn = document.getElementById('cal-prev');
  const nextBtn = document.getElementById('cal-next');
  const todayBtn = document.getElementById('cal-today');

  function onPrev() { navigateMonth(-1); }
  function onNext() { navigateMonth(1); }
  function onToday() {
    const today = new Date();
    currentYear = today.getFullYear();
    currentMonth = today.getMonth();
    renderMonth();
    loadContent();
  }

  prevBtn.addEventListener('click', onPrev);
  nextBtn.addEventListener('click', onNext);
  todayBtn.addEventListener('click', onToday);

  cleanupFns.push(() => {
    prevBtn.removeEventListener('click', onPrev);
    nextBtn.removeEventListener('click', onNext);
    todayBtn.removeEventListener('click', onToday);
  });

  // Platform filter chip clicks
  const filterBar = document.getElementById('cal-platform-filters');
  if (filterBar) {
    function onFilterClick(e) {
      const chip = e.target.closest('.calendar-chip');
      if (!chip) return;

      const platform = chip.getAttribute('data-platform');
      activePlatformFilter = platform;

      filterBar.querySelectorAll('.calendar-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');

      // Re-render pills without re-fetching
      renderPills();
      updateCountBadge();
    }
    filterBar.addEventListener('click', onFilterClick);
    cleanupFns.push(() => filterBar.removeEventListener('click', onFilterClick));
  }

  // Keyboard navigation: left/right arrow keys to change months
  function onKeydown(e) {
    // Only when no input/textarea/select is focused
    const tag = document.activeElement?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      navigateMonth(-1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      navigateMonth(1);
    } else if (e.key === 'Escape') {
      closeDayDetail();
    }
  }
  document.addEventListener('keydown', onKeydown);
  cleanupFns.push(() => document.removeEventListener('keydown', onKeydown));

  renderMonth();
  await loadContent();

  return cleanup;
}

function cleanup() {
  closeDayDetail();
  cleanupFns.forEach(fn => fn());
  cleanupFns = [];
}

function navigateMonth(delta) {
  currentMonth += delta;
  if (currentMonth > 11) {
    currentMonth = 0;
    currentYear++;
  } else if (currentMonth < 0) {
    currentMonth = 11;
    currentYear--;
  }
  renderMonth();
  loadContent();
}

async function loadContent() {
  contentByDay = {};

  const startOfMonth = new Date(currentYear, currentMonth, 1);
  const endOfMonth = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999);

  try {
    const { data, error } = await db
      .from('content_projects')
      .select('id, title, description, status, platform, scheduled_at, notes')
      .gte('scheduled_at', startOfMonth.toISOString())
      .lte('scheduled_at', endOfMonth.toISOString())
      .order('scheduled_at', { ascending: true });

    if (error) throw error;
    if (!data) return;

    data.forEach(item => {
      const dateKey = toDateKey(new Date(item.scheduled_at));
      if (!contentByDay[dateKey]) contentByDay[dateKey] = [];
      contentByDay[dateKey].push(item);
    });
  } catch {
    // Supabase not connected or query failed — grid stays empty
  }

  renderPills();
  updateCountBadge();
}

/** Get all items for the month, filtered by the active platform filter */
function getFilteredItems() {
  const result = {};
  Object.keys(contentByDay).forEach(dateKey => {
    const items = contentByDay[dateKey];
    const filtered = activePlatformFilter === 'all'
      ? items
      : items.filter(i => (i.platform || 'other') === activePlatformFilter);
    if (filtered.length > 0) {
      result[dateKey] = filtered;
    }
  });
  return result;
}

function updateCountBadge() {
  const badge = document.getElementById('cal-count-badge');
  if (!badge) return;

  const filtered = getFilteredItems();
  let total = 0;
  Object.values(filtered).forEach(items => { total += items.length; });

  badge.textContent = total > 0 ? total : '';

  // Show/hide the empty month overlay
  const emptyOverlay = document.getElementById('cal-empty-overlay');
  if (emptyOverlay) {
    emptyOverlay.style.display = total === 0 ? 'flex' : 'none';
  }
}

/** Get ISO week number for a date */
function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function renderMonth() {
  const monthText = document.getElementById('cal-month-text');
  const grid = document.getElementById('cal-grid');
  if (!grid) return;

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  if (monthText) {
    monthText.textContent = `${monthNames[currentMonth]} ${currentYear}`;
  }

  // Remove old day cells and week numbers (keep the header row: Wk + 7 DOWs)
  const existing = grid.querySelectorAll('.calendar-cell, .calendar-week-num');
  existing.forEach(el => el.remove());

  const firstDay = new Date(currentYear, currentMonth, 1);
  const lastDay = new Date(currentYear, currentMonth + 1, 0);
  const startDow = firstDay.getDay(); // 0=Sun
  const daysInMonth = lastDay.getDate();

  const today = new Date();
  const todayKey = toDateKey(today);

  // Build rows with week numbers
  // Collect all days (prev-month trailing, current month, next-month leading)
  const cells = [];

  // Previous month trailing days
  const prevMonthLast = new Date(currentYear, currentMonth, 0).getDate();
  for (let i = startDow - 1; i >= 0; i--) {
    const day = prevMonthLast - i;
    cells.push({ day, outside: true, dateKey: null, isToday: false });
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const dateKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isToday = dateKey === todayKey;
    cells.push({ day: d, outside: false, dateKey, isToday });
  }

  // Next month leading days to fill the final row
  const totalCells = cells.length;
  const remainder = totalCells % 7;
  if (remainder > 0) {
    const fill = 7 - remainder;
    for (let d = 1; d <= fill; d++) {
      cells.push({ day: d, outside: true, dateKey: null, isToday: false });
    }
  }

  // Render rows of 7, each preceded by a week number cell
  for (let i = 0; i < cells.length; i += 7) {
    // Determine the week number from the first non-outside day in this row,
    // or fall back to the date that represents the row
    let weekDate;
    const rowCells = cells.slice(i, i + 7);
    const nonOutside = rowCells.find(c => !c.outside);
    if (nonOutside) {
      weekDate = new Date(currentYear, currentMonth, nonOutside.day);
    } else {
      // All outside (unlikely but safe)
      weekDate = new Date(currentYear, currentMonth, 1);
    }
    const wn = getWeekNumber(weekDate);

    const weekNumEl = document.createElement('div');
    weekNumEl.className = 'calendar-week-num';
    weekNumEl.textContent = wn;
    grid.appendChild(weekNumEl);

    for (let j = 0; j < 7; j++) {
      const c = rowCells[j];
      const cell = createCell(c.day, c.outside, c.dateKey, c.isToday);
      grid.appendChild(cell);
    }
  }
}

function createCell(dayNum, isOutside, dateKey, isToday) {
  const cell = document.createElement('div');
  cell.className = 'calendar-cell';
  if (isOutside) cell.classList.add('outside');
  if (isToday) cell.classList.add('today');

  const num = document.createElement('div');
  num.className = 'calendar-day-num';
  num.textContent = dayNum;
  cell.appendChild(num);

  if (!isOutside && dateKey) {
    cell.setAttribute('data-date', dateKey);

    const itemsContainer = document.createElement('div');
    itemsContainer.className = 'calendar-items';
    itemsContainer.setAttribute('data-items-for', dateKey);
    cell.appendChild(itemsContainer);

    cell.addEventListener('click', () => {
      showDayDetail(dateKey);
    });
  }

  return cell;
}

function renderPills() {
  // Clear all existing pills
  document.querySelectorAll('.calendar-items').forEach(container => {
    container.innerHTML = '';
  });

  const filteredByDay = getFilteredItems();

  Object.keys(filteredByDay).forEach(dateKey => {
    const container = document.querySelector(`[data-items-for="${dateKey}"]`);
    if (!container) return;

    const items = filteredByDay[dateKey];
    const showCount = Math.min(items.length, MAX_PILLS);

    for (let i = 0; i < showCount; i++) {
      const pill = document.createElement('span');
      pill.className = 'calendar-pill';
      pill.setAttribute('data-platform', items[i].platform || 'other');
      pill.setAttribute('data-content-id', items[i].id);
      pill.textContent = escapeHtml(items[i].title);
      pill.title = escapeHtml(items[i].title);

      // Click pill to navigate to Content Engine
      pill.addEventListener('click', (e) => {
        e.stopPropagation(); // prevent day detail from opening
        showToast('Opening in Content Engine...', 'info');
        navigate('/content');
      });

      container.appendChild(pill);
    }

    if (items.length > MAX_PILLS) {
      const overflow = document.createElement('span');
      overflow.className = 'calendar-overflow';
      overflow.textContent = `+${items.length - MAX_PILLS} more`;
      container.appendChild(overflow);
    }
  });
}

function showDayDetail(dateKey) {
  closeDayDetail();

  // Show filtered items in the day detail
  const allItems = contentByDay[dateKey] || [];
  const items = activePlatformFilter === 'all'
    ? allItems
    : allItems.filter(i => (i.platform || 'other') === activePlatformFilter);

  const date = new Date(dateKey + 'T00:00:00');
  const formatted = date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  const overlay = document.createElement('div');
  overlay.className = 'day-detail-overlay';
  overlay.id = 'day-detail-overlay';

  let itemsHtml;
  if (items.length === 0) {
    itemsHtml = '<p class="day-detail-empty">No content scheduled for this day.</p>';
  } else {
    itemsHtml = items.map(item => {
      const time = item.scheduled_at
        ? new Date(item.scheduled_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
        : '';
      const desc = item.description
        ? `<div class="day-detail-item-desc">${escapeHtml(item.description)}</div>`
        : '';
      const notes = item.notes
        ? `<div class="day-detail-item-desc">${escapeHtml(item.notes)}</div>`
        : '';

      return `
        <div class="day-detail-item" data-content-id="${item.id}">
          <div class="day-detail-item-header">
            <span class="day-detail-platform" data-platform="${item.platform || 'other'}">${escapeHtml(item.platform || 'other')}</span>
            <span class="day-detail-status">${escapeHtml(item.status || '')}</span>
          </div>
          <div class="day-detail-item-title">${escapeHtml(item.title)}</div>
          ${desc}
          ${notes}
          ${time ? `<div class="day-detail-item-time">${time}</div>` : ''}
        </div>
      `;
    }).join('');

    itemsHtml += '<p class="day-detail-edit-hint">Click an item to edit in Content Engine</p>';
  }

  overlay.innerHTML = `
    <div class="day-detail-panel">
      <div class="day-detail-header">
        <div class="day-detail-title">${formatted}</div>
        <button class="day-detail-close" id="day-detail-close" aria-label="Close">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <line x1="4" y1="4" x2="14" y2="14"/>
            <line x1="14" y1="4" x2="4" y2="14"/>
          </svg>
        </button>
      </div>
      ${itemsHtml}
    </div>
  `;

  document.body.appendChild(overlay);

  // Close handlers
  const closeBtn = document.getElementById('day-detail-close');
  closeBtn.addEventListener('click', closeDayDetail);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeDayDetail();
  });

  // Click on day-detail-item navigates to Content Engine
  overlay.querySelectorAll('.day-detail-item').forEach(itemEl => {
    itemEl.addEventListener('click', () => {
      closeDayDetail();
      showToast('Opening in Content Engine...', 'info');
      navigate('/content');
    });
  });

  function onEsc(e) {
    if (e.key === 'Escape') closeDayDetail();
  }
  document.addEventListener('keydown', onEsc);

  // Store the keydown cleanup so closeDayDetail can remove it
  overlay._escCleanup = onEsc;
}

function closeDayDetail() {
  const overlay = document.getElementById('day-detail-overlay');
  if (!overlay) return;
  if (overlay._escCleanup) {
    document.removeEventListener('keydown', overlay._escCleanup);
  }
  overlay.remove();
}

function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}
