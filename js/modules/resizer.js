/* Multi-format resizer — the "Formatting Drain" killer.
   Drop one master asset; export every platform size in a click. Everything
   runs client-side: images are decoded with createImageBitmap and drawn onto
   <canvas> (no <img>, no blob: URLs), so the strict CSP and the
   "nothing leaves your device" promise both hold. Exports go out as PNG/JPG,
   zipped first-party via js/zip.js. */

import { toast } from '../toast.js';
import { esc } from '../ui.js';
import { makeZip } from '../zip.js';

const PRESETS = [
  { group: 'Instagram', slug: 'ig-square',    label: 'Post · 1:1',       w: 1080, h: 1080 },
  { group: 'Instagram', slug: 'ig-portrait',  label: 'Portrait · 4:5',   w: 1080, h: 1350 },
  { group: 'Instagram', slug: 'ig-story',     label: 'Story / Reel · 9:16', w: 1080, h: 1920 },
  { group: 'TikTok',    slug: 'tiktok',       label: 'Video · 9:16',     w: 1080, h: 1920 },
  { group: 'YouTube',   slug: 'yt-thumb',     label: 'Thumbnail · 16:9', w: 1280, h: 720  },
  { group: 'X',         slug: 'x-post',       label: 'Post · 16:9',      w: 1600, h: 900  },
  { group: 'LinkedIn',  slug: 'li-post',      label: 'Post · 1.91:1',    w: 1200, h: 627  },
];

const state = {
  source: null,           // ImageBitmap | HTMLCanvasElement
  w: 0, h: 0, name: 'image',
  fit: 'cover',           // 'cover' (crop) | 'contain' (pad)
  bg: '#0a0a09',
  format: 'png',          // 'png' | 'jpeg'
  selected: new Set(PRESETS.map((p) => p.slug)),
};

let els = {};

export function init() {
  els = {
    empty:   document.getElementById('rz-empty'),
    studio:  document.getElementById('rz-studio'),
    file:    document.getElementById('rz-file'),
    sample:  document.getElementById('rz-sample'),
    name:    document.getElementById('rz-name'),
    dims:    document.getElementById('rz-dims'),
    grid:    document.getElementById('rz-grid'),
    fit:     document.getElementById('rz-fit'),
    bgWrap:  document.getElementById('rz-bg-wrap'),
    bg:      document.getElementById('rz-bg'),
    format:  document.getElementById('rz-format'),
    replace: document.getElementById('rz-replace'),
    export:  document.getElementById('rz-export'),
    count:   document.getElementById('rz-count'),
  };

  // Reset per-mount state (the module object persists across navigations).
  state.source = null;
  state.fit = 'cover';
  state.format = 'png';
  state.selected = new Set(PRESETS.map((p) => p.slug));
  showEmpty();

  bindDropzone();
  els.sample.addEventListener('click', loadSample);
  els.replace.addEventListener('click', () => els.file.click());

  els.fit.addEventListener('click', (e) => {
    const b = e.target.closest('[data-fit]');
    if (!b) return;
    state.fit = b.dataset.fit;
    setSeg(els.fit, '[data-fit]', b);
    els.bgWrap.hidden = state.fit !== 'contain';
    renderAll();
  });
  els.format.addEventListener('click', (e) => {
    const b = e.target.closest('[data-fmt]');
    if (!b) return;
    state.format = b.dataset.fmt;
    setSeg(els.format, '[data-fmt]', b);
    updateExportLabel();
  });
  els.bg.addEventListener('input', () => { state.bg = els.bg.value; if (state.fit === 'contain') renderAll(); });

  els.export.addEventListener('click', exportAll);

  els.grid.addEventListener('change', (e) => {
    const cb = e.target.closest('input[type="checkbox"][data-slug]');
    if (!cb) return;
    if (cb.checked) state.selected.add(cb.dataset.slug);
    else state.selected.delete(cb.dataset.slug);
    document.querySelector(`.rz-card[data-slug="${cb.dataset.slug}"]`)?.classList.toggle('is-off', !cb.checked);
    updateExportLabel();
  });
  els.grid.addEventListener('click', (e) => {
    const dl = e.target.closest('.rz-dl');
    if (!dl) return;
    const p = PRESETS.find((x) => x.slug === dl.dataset.slug);
    if (p) exportOne(p);
  });
}

/* ── Load ────────────────────────────────────────────────── */

function bindDropzone() {
  const z = els.empty;
  z.addEventListener('click', (e) => { if (e.target.closest('#rz-sample')) return; els.file.click(); });
  z.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); els.file.click(); } });
  els.file.addEventListener('change', () => { if (els.file.files[0]) loadFile(els.file.files[0]); });

  ['dragenter', 'dragover'].forEach((t) => z.addEventListener(t, (e) => {
    e.preventDefault(); z.classList.add('is-drag');
  }));
  ['dragleave', 'drop'].forEach((t) => z.addEventListener(t, (e) => {
    e.preventDefault(); if (t === 'dragleave' && z.contains(e.relatedTarget)) return; z.classList.remove('is-drag');
  }));
  z.addEventListener('drop', (e) => {
    const f = e.dataTransfer?.files?.[0];
    if (f) loadFile(f);
  });
}

async function loadFile(file) {
  if (!file.type.startsWith('image/')) { toast('That doesn’t look like an image.', 'error'); return; }
  try {
    const bmp = await createImageBitmap(file);
    state.source = bmp;
    state.w = bmp.width;
    state.h = bmp.height;
    state.name = file.name.replace(/\.[^.]+$/, '') || 'image';
    showStudio();
  } catch (err) {
    console.error(err);
    toast('Could not read that image.', 'error');
  }
}

/* A branded gradient sample so the tool is explorable with no upload. */
function loadSample() {
  const c = document.createElement('canvas');
  c.width = 1600; c.height = 1000;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 1600, 1000);
  g.addColorStop(0, '#d4af80'); g.addColorStop(0.55, '#0a0a09'); g.addColorStop(1, '#1c1c1e');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 1600, 1000);
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(260 + i * 240, 500 + (i % 2 ? -120 : 120), 70, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#f5f3ec';
  ctx.font = '600 132px "Clash Display", sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText('SVN OS', 150, 500);
  ctx.font = '500 40px "Spline Sans Mono", monospace';
  ctx.fillStyle = 'rgba(245,243,236,0.7)';
  ctx.fillText('ONE MASTER · EVERY FORMAT', 156, 600);
  state.source = c;
  state.w = c.width; state.h = c.height; state.name = 'svn-sample';
  showStudio();
}

/* ── Views ───────────────────────────────────────────────── */

function showEmpty() {
  els.empty.hidden = false;
  els.studio.hidden = true;
}

function showStudio() {
  els.empty.hidden = true;
  els.studio.hidden = false;
  els.name.textContent = state.name;
  els.dims.textContent = `${state.w} × ${state.h}px`;
  els.bgWrap.hidden = state.fit !== 'contain';
  buildGrid();
  renderAll();
  updateExportLabel();
}

/* ── Render ──────────────────────────────────────────────── */

function buildGrid() {
  els.grid.innerHTML = PRESETS.map((p) => `
    <figure class="rz-card" data-slug="${p.slug}">
      <div class="rz-frame">
        <canvas class="rz-canvas" data-slug="${p.slug}"></canvas>
      </div>
      <figcaption class="rz-foot">
        <label class="rz-pick">
          <input type="checkbox" data-slug="${p.slug}" checked />
          <span class="rz-pick-label"><b>${esc(p.group)}</b>${esc(p.label.replace(/^[^·]*·\s*/, ' · '))}</span>
        </label>
        <span class="rz-dim">${p.w}×${p.h}</span>
        <button type="button" class="rz-dl" data-slug="${p.slug}" title="Download this size" aria-label="Download ${esc(p.group)} ${esc(p.label)}">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5v8M4.5 7.5 8 11l3.5-3.5M3 13h10"/></svg>
        </button>
      </figcaption>
    </figure>`).join('');
}

function renderAll() {
  if (!state.source) return;
  for (const p of PRESETS) {
    const canvas = els.grid.querySelector(`canvas[data-slug="${p.slug}"]`);
    if (canvas) drawInto(canvas, previewDims(p));
  }
}

function previewDims(p) {
  const cap = 360 * Math.min(window.devicePixelRatio || 1, 2);
  const s = Math.min(1, cap / Math.max(p.w, p.h));
  return { w: Math.max(1, Math.round(p.w * s)), h: Math.max(1, Math.round(p.h * s)) };
}

function drawInto(canvas, { w, h }) {
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  if (state.fit === 'contain') { ctx.fillStyle = state.bg; ctx.fillRect(0, 0, w, h); }
  const scale = state.fit === 'cover'
    ? Math.max(w / state.w, h / state.h)
    : Math.min(w / state.w, h / state.h);
  const dw = state.w * scale;
  const dh = state.h * scale;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(state.source, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

/* ── Export ──────────────────────────────────────────────── */

const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'image';
const ext = () => (state.format === 'jpeg' ? 'jpg' : 'png');
const mime = () => (state.format === 'jpeg' ? 'image/jpeg' : 'image/png');

function renderFull(p) {
  const c = document.createElement('canvas');
  drawInto(c, { w: p.w, h: p.h });
  return c;
}

const toBlob = (canvas) => new Promise((res) => canvas.toBlob(res, mime(), 0.92));

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportOne(p) {
  if (!state.source) return;
  const blob = await toBlob(renderFull(p));
  download(blob, `${slugify(state.name)}-${p.slug}.${ext()}`);
  toast(`${p.group} ${p.label.split('·')[0].trim()} downloaded.`, 'success');
}

async function exportAll() {
  if (!state.source) return;
  const chosen = PRESETS.filter((p) => state.selected.has(p.slug));
  if (!chosen.length) { toast('Pick at least one format.', 'error'); return; }
  els.export.disabled = true;
  const original = els.export.textContent;
  els.export.textContent = 'Rendering…';
  try {
    const files = [];
    for (const p of chosen) {
      const blob = await toBlob(renderFull(p));
      files.push({ name: `${slugify(state.name)}-${p.slug}.${ext()}`, blob });
    }
    const zip = await makeZip(files);
    download(zip, `${slugify(state.name)}-formats.zip`);
    toast(`${files.length} formats exported.`, 'success');
  } catch (err) {
    console.error(err);
    toast('Export failed — try again.', 'error');
  } finally {
    els.export.disabled = false;
    els.export.textContent = original;
    updateExportLabel();
  }
}

/* ── Helpers ─────────────────────────────────────────────── */

function setSeg(container, sel, active) {
  container.querySelectorAll(sel).forEach((b) => b.classList.toggle('is-on', b === active));
}

function updateExportLabel() {
  const n = state.selected.size;
  els.export.textContent = `Download ${n} ${n === 1 ? 'size' : 'sizes'} (.${ext() === 'jpg' ? 'zip' : 'zip'})`;
  if (els.count) els.count.textContent = `${n} of ${PRESETS.length} selected`;
}
