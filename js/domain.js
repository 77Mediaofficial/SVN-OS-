/* Domain vocabulary shared across modules.
   Keys mirror the Postgres enums in sql/schema.sql. */

export const CONTENT_STAGES = [
  { key: 'idea',       label: 'Idea',       tone: 'blue'  },
  { key: 'scripting',  label: 'Scripting',  tone: 'violet'},
  { key: 'production', label: 'Production', tone: 'amber' },
  { key: 'ready',      label: 'Ready',      tone: 'green' },
  { key: 'published',  label: 'Published',  tone: 'dim'   },
];

export const PLATFORMS = [
  { key: 'youtube',   label: 'YouTube',   badge: 'YT'  },
  { key: 'instagram', label: 'Instagram', badge: 'IG'  },
  { key: 'tiktok',    label: 'TikTok',    badge: 'TT'  },
  { key: 'twitter',   label: 'X',         badge: 'X'   },
  { key: 'linkedin',  label: 'LinkedIn',  badge: 'LI'  },
  { key: 'podcast',   label: 'Podcast',   badge: 'POD' },
  { key: 'blog',      label: 'Blog',      badge: 'BLOG'},
  { key: 'other',     label: 'Other',     badge: '—'   },
];

export const DEAL_STATUSES = [
  { key: 'lead',        label: 'Lead',        tone: 'blue'  },
  { key: 'negotiating', label: 'Negotiating', tone: 'amber' },
  { key: 'signed',      label: 'Signed',      tone: 'green' },
  { key: 'delivered',   label: 'Delivered',   tone: 'teal'  },
  { key: 'paid',        label: 'Paid',        tone: 'brass' },
  { key: 'lost',        label: 'Lost',        tone: 'red'   },
];

export const TXN_CATEGORIES = [
  { key: 'sponsorship',      label: 'Sponsorship' },
  { key: 'platform_revenue', label: 'Platform revenue' },
  { key: 'affiliate',        label: 'Affiliate' },
  { key: 'merchandise',      label: 'Merchandise' },
  { key: 'services',         label: 'Client services' },
  { key: 'software',         label: 'Software' },
  { key: 'equipment',        label: 'Equipment' },
  { key: 'travel',           label: 'Travel' },
  { key: 'contractors',      label: 'Contractors' },
  { key: 'marketing',        label: 'Marketing' },
  { key: 'other',            label: 'Other' },
];

export const RECURRENCE = [
  { key: 'none',    label: 'One-off' },
  { key: 'weekly',  label: 'Weekly'  },
  { key: 'monthly', label: 'Monthly' },
  { key: 'yearly',  label: 'Yearly'  },
];

const byKey = (list) => Object.fromEntries(list.map((item) => [item.key, item]));

export const STAGE_BY_KEY = byKey(CONTENT_STAGES);
export const PLATFORM_BY_KEY = byKey(PLATFORMS);
export const DEAL_STATUS_BY_KEY = byKey(DEAL_STATUSES);
export const CATEGORY_BY_KEY = byKey(TXN_CATEGORIES);

export const stageTone = (key) => STAGE_BY_KEY[key]?.tone ?? 'dim';
export const dealTone = (key) => DEAL_STATUS_BY_KEY[key]?.tone ?? 'dim';

export function optionsHtml(list, selected) {
  return list
    .map(({ key, label }) =>
      `<option value="${key}"${key === selected ? ' selected' : ''}>${label}</option>`)
    .join('');
}
