-- ============================================================
-- SVN OS — Studio & workspace tables (migration 002)
-- Run AFTER sql/schema.sql. Adds the agency pillars + workspace:
-- team_members, clients, sow_items, milestones, gear, review_comments.
-- Every row is owner-scoped by RLS (auth.uid() = user_id), matching the
-- core tables. Column names mirror js/store.js / js/modules/studio.js exactly.
-- ============================================================

-- ── team_members ──────────────────────────────────────────────
create table public.team_members (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  name        text not null,
  role        text,
  email       text,
  created_at  timestamptz not null default now(),
  constraint team_name_length check (char_length(name) between 1 and 120),
  constraint team_email_length check (email is null or char_length(email) <= 254)
);
create index team_members_user_idx on public.team_members (user_id);

alter table public.team_members enable row level security;
create policy "team: owner select" on public.team_members
  for select using (auth.uid() = user_id);
create policy "team: owner insert" on public.team_members
  for insert with check (auth.uid() = user_id);
create policy "team: owner update" on public.team_members
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "team: owner delete" on public.team_members
  for delete using (auth.uid() = user_id);

-- ── clients ───────────────────────────────────────────────────
create table public.clients (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  name        text not null,
  status      text,
  contact     text,
  created_at  timestamptz not null default now(),
  constraint client_name_length check (char_length(name) between 1 and 120),
  constraint client_status_length check (status is null or char_length(status) <= 40)
);
create index clients_user_idx on public.clients (user_id);

alter table public.clients enable row level security;
create policy "clients: owner select" on public.clients
  for select using (auth.uid() = user_id);
create policy "clients: owner insert" on public.clients
  for insert with check (auth.uid() = user_id);
create policy "clients: owner update" on public.clients
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "clients: owner delete" on public.clients
  for delete using (auth.uid() = user_id);

-- ── sow_items (scope & change orders) ─────────────────────────
create table public.sow_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  client_id   uuid references public.clients (id) on delete cascade,
  kind        text not null default 'scope',
  label       text not null,
  qty         numeric(12,2) not null default 1,
  rate        numeric(12,2) not null default 0,
  created_at  timestamptz not null default now(),
  constraint sow_kind_valid check (kind in ('scope', 'change')),
  constraint sow_label_length check (char_length(label) between 1 and 200),
  constraint sow_qty_positive check (qty >= 0),
  constraint sow_rate_positive check (rate >= 0)
);
create index sow_items_user_idx   on public.sow_items (user_id);
create index sow_items_client_idx on public.sow_items (user_id, client_id);

alter table public.sow_items enable row level security;
create policy "sow: owner select" on public.sow_items
  for select using (auth.uid() = user_id);
create policy "sow: owner insert" on public.sow_items
  for insert with check (auth.uid() = user_id);
create policy "sow: owner update" on public.sow_items
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "sow: owner delete" on public.sow_items
  for delete using (auth.uid() = user_id);

-- ── milestones (payment-gated delivery) ───────────────────────
create table public.milestones (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  client_id   uuid references public.clients (id) on delete cascade,
  label       text not null,
  amount      numeric(12,2) not null default 0,
  due         date,
  status      text not null default 'pending',
  created_at  timestamptz not null default now(),
  constraint ms_label_length check (char_length(label) between 1 and 200),
  constraint ms_amount_positive check (amount >= 0),
  constraint ms_status_length check (char_length(status) <= 40)
);
create index milestones_user_idx   on public.milestones (user_id);
create index milestones_client_idx on public.milestones (user_id, client_id);

alter table public.milestones enable row level security;
create policy "milestones: owner select" on public.milestones
  for select using (auth.uid() = user_id);
create policy "milestones: owner insert" on public.milestones
  for insert with check (auth.uid() = user_id);
create policy "milestones: owner update" on public.milestones
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "milestones: owner delete" on public.milestones
  for delete using (auth.uid() = user_id);

-- ── gear (kit & liability register) ───────────────────────────
create table public.gear (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  name        text not null,
  category    text,
  value       numeric(12,2) not null default 0,
  status      text,
  insured     boolean not null default false,
  assignee    text,
  created_at  timestamptz not null default now(),
  constraint gear_name_length check (char_length(name) between 1 and 120),
  constraint gear_value_positive check (value >= 0),
  constraint gear_status_length check (status is null or char_length(status) <= 40)
);
create index gear_user_idx on public.gear (user_id);

alter table public.gear enable row level security;
create policy "gear: owner select" on public.gear
  for select using (auth.uid() = user_id);
create policy "gear: owner insert" on public.gear
  for insert with check (auth.uid() = user_id);
create policy "gear: owner update" on public.gear
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "gear: owner delete" on public.gear
  for delete using (auth.uid() = user_id);

-- ── review_comments (frame-accurate review rooms) ─────────────
create table public.review_comments (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  asset         text,
  duration_sec  integer,
  t_sec         integer not null default 0,
  author        text,
  body          text not null,
  resolved      boolean not null default false,
  created_at    timestamptz not null default now(),
  constraint rc_body_length check (char_length(body) between 1 and 2000),
  constraint rc_tsec_positive check (t_sec >= 0),
  constraint rc_duration_positive check (duration_sec is null or duration_sec >= 0)
);
create index review_comments_user_idx on public.review_comments (user_id);

alter table public.review_comments enable row level security;
create policy "reviews: owner select" on public.review_comments
  for select using (auth.uid() = user_id);
create policy "reviews: owner insert" on public.review_comments
  for insert with check (auth.uid() = user_id);
create policy "reviews: owner update" on public.review_comments
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "reviews: owner delete" on public.review_comments
  for delete using (auth.uid() = user_id);
