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
  updated_at    timestamptz not null default now()
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
  updated_at     timestamptz not null default now()
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
  updated_at             timestamptz not null default now()
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
