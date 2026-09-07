-- Run once in the Supabase SQL editor (Project -> SQL Editor -> New query).
-- Safe to re-run: seed.sql uses ON CONFLICT DO NOTHING, and this file only
-- creates objects that don't yet exist would need `if not exists` if rerun --
-- for a clean project, run this once, then supabase/seed.sql once.

create extension if not exists pgcrypto;

-- ── Schema ──────────────────────────────────────────────────────────────
create table public.kanji (
  char text primary key,
  meaning text not null,
  onyomi text[] not null default '{}',
  kunyomi text[] not null default '{}'
);

create table public.words (
  word text primary key,
  reading text not null,
  meaning text not null,
  components text[] not null default '{}'
);
create index words_components_gin_idx on public.words using gin (components);

create table public.user_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_type text not null check (item_type in ('word', 'kanji')),
  item_id text not null,                        -- word text or kanji char
  status text not null default 'new' check (status in ('new', 'learning', 'known')),
  updated_at timestamptz not null default now(),
  unique (user_id, item_type, item_id)
);
create index user_progress_user_idx on public.user_progress (user_id);

create table public.saved_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_type text not null check (item_type = 'word'),
  item_id text not null,
  created_at timestamptz not null default now(),
  exported_at timestamptz,
  unique (user_id, item_type, item_id)
);
create index saved_items_user_idx on public.saved_items (user_id);

-- ── Row Level Security ─────────────────────────────────────────────────
alter table public.kanji enable row level security;
alter table public.words enable row level security;
alter table public.user_progress enable row level security;
alter table public.saved_items enable row level security;

create policy "kanji_public_read" on public.kanji for select using (true);
create policy "words_public_read" on public.words for select using (true);
-- No insert/update/delete policy on kanji/words: only the SQL editor (or a
-- service-role script) can write them. The anon/authenticated client can
-- only ever select from these two tables.

create policy "user_progress_owner_select" on public.user_progress
  for select using (auth.uid() = user_id);
create policy "user_progress_owner_insert" on public.user_progress
  for insert with check (auth.uid() = user_id);
create policy "user_progress_owner_update" on public.user_progress
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "user_progress_owner_delete" on public.user_progress
  for delete using (auth.uid() = user_id);

create policy "saved_items_owner_select" on public.saved_items
  for select using (auth.uid() = user_id);
create policy "saved_items_owner_insert" on public.saved_items
  for insert with check (auth.uid() = user_id);
create policy "saved_items_owner_update" on public.saved_items
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "saved_items_owner_delete" on public.saved_items
  for delete using (auth.uid() = user_id);
