/* ============================================================
   SVN OS — Skeleton Loaders
   Shared builders that emit shape-of-content placeholders, so every
   list, table, and card shows its layout immediately instead of a
   spinner or a blank box while data loads. Pure markup helpers —
   each returns an HTML string the caller drops into a container.
   ============================================================ */

/** A single shimmering line. `w` is a width utility suffix (90/75/60/40/25). */
export function skLine(w = 90, size = '') {
  const wCls = w ? ` sk-w-${w}` : '';
  const sizeCls = size ? ` ${size}` : '';
  return `<div class="skeleton sk-line${sizeCls}${wCls}"></div>`;
}

/** A block of `n` lines with tapering widths — reads like a paragraph. */
export function skLines(n = 3) {
  const widths = [90, 75, 60, 40, 25];
  let out = '';
  for (let i = 0; i < n; i++) out += skLine(widths[i % widths.length]);
  return out;
}

/** A card-shaped placeholder containing a title + a few lines. */
export function skCard(lines = 3) {
  return `<div class="sk-card">${skLine(40, 'sk-lg')}<div style="height:10px"></div>${skLines(lines)}</div>`;
}

/** `n` card placeholders. */
export function skCards(n = 3, lines = 3) {
  let out = '';
  for (let i = 0; i < n; i++) out += skCard(lines);
  return out;
}

/**
 * `rows` × `cols` table-body placeholder. Returns <tr> markup ready to
 * drop into a <tbody>. Cell widths vary so it looks like real data.
 */
export function skTableRows(rows = 5, cols = 4) {
  const widths = ['70%', '45%', '60%', '35%', '50%', '80%'];
  let out = '';
  for (let r = 0; r < rows; r++) {
    let cells = '';
    for (let c = 0; c < cols; c++) {
      cells += `<td><span class="skeleton sk-cell" style="width:${widths[(r + c) % widths.length]}"></span></td>`;
    }
    out += `<tr class="sk-row">${cells}</tr>`;
  }
  return out;
}

/**
 * Render a skeleton into an element and return a function that clears it.
 * Convenience for the common "show skeleton, await, replace" flow.
 */
export function mountSkeleton(el, html) {
  if (!el) return () => {};
  el.innerHTML = html;
  return () => { if (el) el.innerHTML = ''; };
}
