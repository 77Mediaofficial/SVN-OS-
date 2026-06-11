-- ============================================================
-- SVN OS — foundational schema
-- Run this file once in the Supabase SQL Editor (Database → SQL).
-- Creates: profiles, content_projects, brand_deals, transactions
-- plus enums, row-level security, and updated_at triggers.
-- ============================================================

-- ── Enumerated types ─────────────────────────────────────────

create type content_status as enum (
  'idea', 'scripting', 'production', 'ready', 'published'
);

create type content_platform as enum (
  'youtube', 'instagram', 'tiktok', 'twitter', 'linkedin',
  'podcast', 'blog', 'other'
);

create type deal_status as enum (
  'lead', 'negotiating', 'signed', 'delivered', 'paid', 'lost'
);

create type transaction_type as enum ('income', 'expense');

create type transaction_category as enum (
  'sponsorship', 'platform_revenue', 'affiliate', 'merchandise',
  'services', 'software', 'equipment', 'travel', 'contractors',
  'marketing', 'other'
);

create type recurrence_interval as enum ('none', 'weekly', 'monthly', 'yearly');

-- ── updated_at helper ─────────────────────────────────────────

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── profiles ──────────────────────────────────────────────────
-- One row per auth user, created automatically on signup.

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  username    text unique,
  full_name   text,
  avatar_url  text,
  bio         text,
  website     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint username_lowercase check (username = lower(username)),
  constraint username_length check (char_length(username) between 3 and 30)
);

create trigger profiles_touch
  before update on public.profiles
  for each row execute function public.touch_updated_at();

alter table public.profiles enable row level security;

create policy "profiles: owner read"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles: public read when published"
  on public.profiles for select
  using (username is not null);

create policy "profiles: owner insert"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles: owner update"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Auto-create a profile when a user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── user_preferences ──────────────────────────────────────────
-- One row per user: business identity (for invoices), monthly
-- goals, and workspace customisation (label overrides, presets).

create table public.user_preferences (
  user_id               uuid primary key references public.profiles (id) on delete cascade,
  business_name         text,
  business_type         text,
  invoice_details       text,
  invoice_seq           int not null default 0,
  goal_monthly_revenue  numeric(12,2),
  goal_monthly_posts    int,
  pipeline_overrides    jsonb not null default '{}'::jsonb,
  deal_status_overrides jsonb not null default '{}'::jsonb,
  content_tag_presets   text[] not null default '{}',
  deal_tag_presets      text[] not null default '{}',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint prefs_business_name_length check (business_name is null or char_length(business_name) <= 120),
  constraint prefs_business_type_length check (business_type is null or char_length(business_type) <= 120),
  constraint prefs_invoice_details_length check (invoice_details is null or char_length(invoice_details) <= 2000),
  constraint prefs_goal_revenue_range check (goal_monthly_revenue is null or goal_monthly_revenue >= 0),
  constraint prefs_goal_posts_range check (goal_monthly_posts is null or goal_monthly_posts between 0 and 1000)
);

create trigger user_preferences_touch
  before update on public.user_preferences
  for each row execute function public.touch_updated_at();

alter table public.user_preferences enable row level security;

create policy "prefs: owner select" on public.user_preferences
  for select using (auth.uid() = user_id);
create policy "prefs: owner insert" on public.user_preferences
  for insert with check (auth.uid() = user_id);
create policy "prefs: owner update" on public.user_preferences
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "prefs: owner delete" on public.user_preferences
  for delete using (auth.uid() = user_id);

-- ── content_projects ──────────────────────────────────────────
-- A piece of content moving through the pipeline.

create table public.content_projects (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  title         text not null,
  description   text,
  notes         text,
  status        content_status not null default 'idea',
  platform      content_platform not null default 'youtube',
  scheduled_at  timestamptz,
  published_at  timestamptz,
  tags          text[] not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint content_title_length check (char_length(title) between 1 and 200),
  constraint content_description_length check (description is null or char_length(description) <= 5000),
  constraint content_notes_length check (notes is null or char_length(notes) <= 5000),
  constraint content_tags_count check (cardinality(tags) <= 24)
);

create index content_projects_user_idx      on public.content_projects (user_id);
create index content_projects_status_idx    on public.content_projects (user_id, status);
create index content_projects_scheduled_idx on public.content_projects (user_id, scheduled_at);
create index content_projects_tags_idx      on public.content_projects using gin (tags);

create trigger content_projects_touch
  before update on public.content_projects
  for each row execute function public.touch_updated_at();

alter table public.content_projects enable row level security;

create policy "content: owner select" on public.content_projects
  for select using (auth.uid() = user_id);
create policy "content: owner insert" on public.content_projects
  for insert with check (auth.uid() = user_id);
create policy "content: owner update" on public.content_projects
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "content: owner delete" on public.content_projects
  for delete using (auth.uid() = user_id);

-- ── brand_deals ───────────────────────────────────────────────
-- Sponsorship CRM: lead → negotiating → signed → delivered → paid.

create table public.brand_deals (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  brand_name     text not null,
  contact_name   text,
  contact_email  text,
  status         deal_status not null default 'lead',
  value          numeric(12,2) not null default 0,
  deadline       date,
  notes          text,
  tags           text[] not null default '{}',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint deal_brand_length check (char_length(brand_name) between 1 and 120),
  constraint deal_contact_name_length check (contact_name is null or char_length(contact_name) <= 120),
  constraint deal_contact_email_length check (contact_email is null or char_length(contact_email) <= 254),
  constraint deal_notes_length check (notes is null or char_length(notes) <= 5000),
  constraint deal_tags_count check (cardinality(tags) <= 24),
  constraint deal_value_positive check (value >= 0)
);

create index brand_deals_user_idx     on public.brand_deals (user_id);
create index brand_deals_status_idx   on public.brand_deals (user_id, status);
create index brand_deals_deadline_idx on public.brand_deals (user_id, deadline);
create index brand_deals_tags_idx     on public.brand_deals using gin (tags);

create trigger brand_deals_touch
  before update on public.brand_deals
  for each row execute function public.touch_updated_at();

alter table public.brand_deals enable row level security;

create policy "deals: owner select" on public.brand_deals
  for select using (auth.uid() = user_id);
create policy "deals: owner insert" on public.brand_deals
  for insert with check (auth.uid() = user_id);
create policy "deals: owner update" on public.brand_deals
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "deals: owner delete" on public.brand_deals
  for delete using (auth.uid() = user_id);

-- ── transactions ──────────────────────────────────────────────
-- Income & expense ledger. Recurring rows are expanded client-side:
-- children carry parent_transaction_id and recurrence = 'none'.

create table public.transactions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references public.profiles (id) on delete cascade,
  type                   transaction_type not null,
  category               transaction_category not null default 'other',
  description            text not null,
  amount                 numeric(12,2) not null check (amount >= 0),
  occurred_at            date not null default current_date,
  recurrence             recurrence_interval not null default 'none',
  recurrence_end         date,
  parent_transaction_id  uuid references public.transactions (id) on delete set null,
  deal_id                uuid references public.brand_deals (id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint txn_description_length check (char_length(description) between 1 and 300)
);

create index transactions_user_idx     on public.transactions (user_id);
create index transactions_occurred_idx on public.transactions (user_id, occurred_at desc);
create index transactions_deal_idx     on public.transactions (deal_id);
create index transactions_parent_idx   on public.transactions (parent_transaction_id);

create trigger transactions_touch
  before update on public.transactions
  for each row execute function public.touch_updated_at();

alter table public.transactions enable row level security;

create policy "transactions: owner select" on public.transactions
  for select using (auth.uid() = user_id);
create policy "transactions: owner insert" on public.transactions
  for insert with check (auth.uid() = user_id);
create policy "transactions: owner update" on public.transactions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "transactions: owner delete" on public.transactions
  for delete using (auth.uid() = user_id);
