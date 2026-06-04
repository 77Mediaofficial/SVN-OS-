/* ============================================================
   SVN OS — Content Templates
   Turn a single topic into a coordinated set of content projects
   across formats (e.g. a launch → hero video + shorts + posts).
   Industry-agnostic so studios, agencies, and solo creators can
   all use them.
   ============================================================ */

/**
 * Each template produces several content_projects from one topic.
 * `steps` define the spawned items; {topic} is replaced with the
 * user's input. platform is one of the content_platform enum values
 * or null. status is a content_status enum value.
 */
export const TEMPLATES = [
  {
    id: 'launch',
    name: 'Product / Project Launch',
    description: 'A full launch rollout — announcement, hero piece, supporting clips, and recap.',
    tag: 'launch',
    steps: [
      { suffix: '— Announcement post',   platform: 'instagram', status: 'idea' },
      { suffix: '— Hero video',          platform: 'youtube',   status: 'idea' },
      { suffix: '— Teaser short',        platform: 'tiktok',    status: 'idea' },
      { suffix: '— Launch-day thread',   platform: 'twitter',   status: 'idea' },
      { suffix: '— Recap / results',     platform: 'blog',      status: 'idea' },
    ],
  },
  {
    id: 'video-repurpose',
    name: 'Long-form → Repurpose',
    description: 'One long-form video, broken into shorts and written follow-ups.',
    tag: 'repurpose',
    steps: [
      { suffix: '— Main video',          platform: 'youtube',   status: 'idea' },
      { suffix: '— Short clip 1',        platform: 'tiktok',    status: 'idea' },
      { suffix: '— Short clip 2',        platform: 'instagram', status: 'idea' },
      { suffix: '— Key takeaways post',  platform: 'linkedin',  status: 'idea' },
    ],
  },
  {
    id: 'client-deliverable',
    name: 'Client Deliverable',
    description: 'A standard client engagement — brief, drafts, review, and final delivery.',
    tag: 'client-work',
    steps: [
      { suffix: '— Brief & scope',       platform: 'other', status: 'idea' },
      { suffix: '— First draft',         platform: 'other', status: 'scripting' },
      { suffix: '— Client review',       platform: 'other', status: 'production' },
      { suffix: '— Final delivery',      platform: 'other', status: 'ready' },
    ],
  },
  {
    id: 'podcast',
    name: 'Podcast Episode',
    description: 'Record once, publish everywhere — episode, clips, and show notes.',
    tag: 'podcast',
    steps: [
      { suffix: '— Episode',             platform: 'podcast',   status: 'idea' },
      { suffix: '— Audiogram clip',      platform: 'instagram', status: 'idea' },
      { suffix: '— Highlight short',     platform: 'tiktok',    status: 'idea' },
      { suffix: '— Show notes',          platform: 'blog',      status: 'idea' },
    ],
  },
  {
    id: 'campaign',
    name: 'Weekly Campaign',
    description: 'A themed week of coordinated posts across your main channels.',
    tag: 'campaign',
    steps: [
      { suffix: '— Kickoff post',        platform: 'instagram', status: 'idea' },
      { suffix: '— Midweek video',       platform: 'youtube',   status: 'idea' },
      { suffix: '— Engagement thread',   platform: 'twitter',   status: 'idea' },
      { suffix: '— Wrap-up',             platform: 'linkedin',  status: 'idea' },
    ],
  },
];

/**
 * Build the rows for a template + topic, ready to insert into
 * content_projects (without user_id — the caller adds that).
 */
export function buildProjectsFromTemplate(template, topic) {
  const base = (topic || '').trim() || 'Untitled';
  return template.steps.map(step => ({
    title: `${base} ${step.suffix}`,
    platform: step.platform || null,
    status: step.status || 'idea',
    tags: [template.tag],
  }));
}
