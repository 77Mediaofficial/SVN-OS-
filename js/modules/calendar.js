import { db } from '../supabase.js';

const PLATFORM_COLORS = {
  youtube:   '#ff0000',
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
let cleanupFns = [];

export async function init() {
  const now = new Date();
  currentYear = now.getFullYear();
  currentMonth = now.getMonth();

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
}

function renderMonth() {
  const label = document.getElementById('cal-month-label');
  const grid = document.getElementById('cal-grid');
  if (!label || !grid) return;

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  label.textContent = `${monthNames[currentMonth]} ${currentYear}`;

  // Remove old day cells (keep the 7 DOW headers)
  const existing = grid.querySelectorAll('.calendar-cell');
  existing.forEach(el => el.remove());

  const firstDay = new Date(currentYear, currentMonth, 1);
  const lastDay = new Date(currentYear, currentMonth + 1, 0);
  const startDow = firstDay.getDay(); // 0=Sun
  const daysInMonth = lastDay.getDate();

  // Previous month trailing days
  const prevMonthLast = new Date(currentYear, currentMonth, 0).getDate();
  for (let i = startDow - 1; i >= 0; i--) {
    const day = prevMonthLast - i;
    const cell = createCell(day, true);
    grid.appendChild(cell);
  }

  // Current month days
  const today = new Date();
  const todayKey = toDateKey(today);

  for (let d = 1; d <= daysInMonth; d++) {
    const dateKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isToday = dateKey === todayKey;
    const cell = createCell(d, false, dateKey, isToday);
    grid.appendChild(cell);
  }

  // Next month leading days to fill the final row
  const totalCells = startDow + daysInMonth;
  const remainder = totalCells % 7;
  if (remainder > 0) {
    const fill = 7 - remainder;
    for (let d = 1; d <= fill; d++) {
      const cell = createCell(d, true);
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

  Object.keys(contentByDay).forEach(dateKey => {
    const container = document.querySelector(`[data-items-for="${dateKey}"]`);
    if (!container) return;

    const items = contentByDay[dateKey];
    const showCount = Math.min(items.length, MAX_PILLS);

    for (let i = 0; i < showCount; i++) {
      const pill = document.createElement('span');
      pill.className = 'calendar-pill';
      pill.setAttribute('data-platform', items[i].platform || 'other');
      pill.textContent = escapeHtml(items[i].title);
      pill.title = escapeHtml(items[i].title);
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

  const items = contentByDay[dateKey] || [];
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
        <div class="day-detail-item">
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
