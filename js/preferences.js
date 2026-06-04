/* ============================================================
   SVN OS — User Preferences
   Single source of truth for workspace customization:
   pipeline stage labels/order/visibility, deal status labels,
   tag presets, business name and type.

   Falls back to sensible defaults when the user_preferences row
   doesn't exist yet (table optional — feature degrades gracefully).
   ============================================================ */

import { db, getCurrentUser } from '/js/supabase.js';

export const DEFAULT_CONTENT_STAGES = [
  { key: 'idea',       label: 'Idea',       sort: 0, hidden: false },
  { key: 'scripting',  label: 'Scripting',  sort: 1, hidden: false },
  { key: 'production', label: 'Production', sort: 2, hidden: false },
  { key: 'ready',      label: 'Ready',      sort: 3, hidden: false },
  { key: 'posted',     label: 'Posted',     sort: 4, hidden: false },
];

export const DEFAULT_DEAL_STAGES = [
  { key: 'lead',         label: 'Lead',         sort: 0, hidden: false },
  { key: 'negotiating',  label: 'Negotiating',  sort: 1, hidden: false },
  { key: 'signed',       label: 'Signed',       sort: 2, hidden: false },
  { key: 'in_progress',  label: 'In Progress',  sort: 3, hidden: false },
  { key: 'completed',    label: 'Completed',    sort: 4, hidden: false },
  { key: 'lost',         label: 'Lost',         sort: 5, hidden: false },
];

const DEFAULT_PREFERENCES = {
  businessName: '',
  businessType: '',
  pipelineOverrides: {},    // { idea: { label, sort, hidden }, ... }
  dealStatusOverrides: {},
  contentTagPresets: [],
  dealTagPresets: [],
};

let cached = null;
let inflight = null;

/** Load (and cache) preferences for the current session. */
export async function loadPreferences({ force = false } = {}) {
  if (!force && cached) return cached;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const user = await getCurrentUser();
      if (!user) {
        cached = { ...DEFAULT_PREFERENCES };
        return cached;
      }
      const { data, error } = await db
        .from('user_preferences')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;

      cached = normalize(data);
      return cached;
    } catch {
      // Table missing or RLS blocked — degrade gracefully.
      cached = { ...DEFAULT_PREFERENCES };
      return cached;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function clearPreferencesCache() {
  cached = null;
}

/** Persist preferences for the current user (upsert). */
export async function savePreferences(patch) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not signed in');
  const merged = { ...(cached || DEFAULT_PREFERENCES), ...patch };

  const row = {
    user_id: user.id,
    business_name: merged.businessName || null,
    business_type: merged.businessType || null,
    pipeline_overrides: merged.pipelineOverrides || {},
    deal_status_overrides: merged.dealStatusOverrides || {},
    content_tag_presets: merged.contentTagPresets || [],
    deal_tag_presets: merged.dealTagPresets || [],
  };

  const { error } = await db
    .from('user_preferences')
    .upsert(row, { onConflict: 'user_id' });
  if (error) throw error;

  cached = merged;
  return cached;
}

function normalize(row) {
  if (!row) return { ...DEFAULT_PREFERENCES };
  return {
    businessName: row.business_name || '',
    businessType: row.business_type || '',
    pipelineOverrides: row.pipeline_overrides || {},
    dealStatusOverrides: row.deal_status_overrides || {},
    contentTagPresets: Array.isArray(row.content_tag_presets) ? row.content_tag_presets : [],
    dealTagPresets: Array.isArray(row.deal_tag_presets) ? row.deal_tag_presets : [],
  };
}

/* ── Stage helpers ────────────────────────────────────────── */

/** Ordered (visible-only) stages for content pipeline. */
export function getContentStages() {
  return mergeStages(DEFAULT_CONTENT_STAGES, (cached || DEFAULT_PREFERENCES).pipelineOverrides);
}

/** All stages including hidden ones, for the settings editor. */
export function getAllContentStages() {
  return mergeStages(DEFAULT_CONTENT_STAGES, (cached || DEFAULT_PREFERENCES).pipelineOverrides, true);
}

export function getDealStages() {
  return mergeStages(DEFAULT_DEAL_STAGES, (cached || DEFAULT_PREFERENCES).dealStatusOverrides);
}

export function getAllDealStages() {
  return mergeStages(DEFAULT_DEAL_STAGES, (cached || DEFAULT_PREFERENCES).dealStatusOverrides, true);
}

export function getContentStageLabel(key) {
  const o = (cached || DEFAULT_PREFERENCES).pipelineOverrides[key];
  if (o && o.label) return o.label;
  const def = DEFAULT_CONTENT_STAGES.find(s => s.key === key);
  return def ? def.label : key;
}

export function getDealStageLabel(key) {
  const o = (cached || DEFAULT_PREFERENCES).dealStatusOverrides[key];
  if (o && o.label) return o.label;
  const def = DEFAULT_DEAL_STAGES.find(s => s.key === key);
  return def ? def.label : key;
}

function mergeStages(defaults, overrides, includeHidden = false) {
  const merged = defaults.map(def => {
    const o = overrides[def.key] || {};
    return {
      key: def.key,
      label: o.label || def.label,
      sort: typeof o.sort === 'number' ? o.sort : def.sort,
      hidden: !!o.hidden,
    };
  });
  merged.sort((a, b) => a.sort - b.sort);
  if (!includeHidden) return merged.filter(s => !s.hidden);
  return merged;
}

/* ── Tag preset helpers ──────────────────────────────────── */

export function getContentTagPresets() {
  return (cached || DEFAULT_PREFERENCES).contentTagPresets;
}

export function getDealTagPresets() {
  return (cached || DEFAULT_PREFERENCES).dealTagPresets;
}

export function getBusinessName() {
  return (cached || DEFAULT_PREFERENCES).businessName || '';
}

export function getBusinessType() {
  return (cached || DEFAULT_PREFERENCES).businessType || '';
}
