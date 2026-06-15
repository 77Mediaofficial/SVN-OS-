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

/* ── Subscription plans (commercial scaffold) ─────────────────
   Prices are per-seat-equivalent in GBP. `monthly` is the rolling
   price; `annual` is the per-month price when billed yearly.
   The feature lists deliberately name the studio pillars on the
   roadmap (SOW & change orders, milestone billing, white-label
   portal, review rooms, gear matrix) so the pricing page tells the
   product story. Billing stays dormant until Stripe keys + a
   checkout endpoint are wired — choosing a plan only persists locally. */
export const PLANS = [
  {
    id: 'solo',
    name: 'Solo',
    tagline: 'For the creator running the whole show.',
    monthly: 19,
    annual: 15,
    seats: '1 workspace seat',
    features: [
      'Content engine, calendar & scheduling',
      'Deals pipeline & financial ledger',
      'Branded invoicing & analytics',
      'Up to 25 active brand deals',
    ],
  },
  {
    id: 'studio',
    name: 'Studio',
    tagline: 'For small teams shipping client work.',
    monthly: 49,
    annual: 39,
    seats: 'Up to 5 workspace seats',
    featured: true,
    badge: 'Most popular',
    inherits: 'Everything in Solo, plus',
    features: [
      'Scope of work & change orders',
      'Milestone billing & payment-gated delivery',
      'Unlimited deals, projects & invoices',
      'Priority support',
    ],
  },
  {
    id: 'agency',
    name: 'Agency',
    tagline: 'For studios & media companies at scale.',
    monthly: 129,
    annual: 99,
    seats: 'Unlimited seats',
    inherits: 'Everything in Studio, plus',
    features: [
      'White-label client portal',
      'Frame-accurate review rooms',
      'Gear & liability register',
      'Custom roles & SSO',
      'Dedicated onboarding',
    ],
  },
];

export const PLAN_BY_ID = byKey(PLANS.map((p) => ({ ...p, key: p.id })));
