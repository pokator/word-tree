-- Run once in the Supabase SQL editor (Project -> SQL Editor -> New query).
-- Safe to re-run: every create is guarded (if not exists / drop-then-create
-- for policies), so re-running this after a schema update only adds what's
-- new -- it never drops or truncates your existing data. Then run
-- supabase/seed.sql (also safe to re-run -- it upserts).

create extension if not exists pgcrypto;

-- ── Schema ──────────────────────────────────────────────────────────────
create table if not exists public.kanji (
  char text primary key,
  meaning text not null,
  onyomi text[] not null default '{}',
  kunyomi text[] not null default '{}'
);
-- JLPT level (5=N5/easiest .. 1=N1/hardest), null when not JLPT-tagged.
alter table public.kanji add column if not exists jlpt integer;

create table if not exists public.words (
  word text primary key,
  reading text not null,
  meaning text not null,
  components text[] not null default '{}'
);
create index if not exists words_components_gin_idx on public.words using gin (components);
-- Frequency rank (lower = more common), null when unranked. Used to order
-- which words appear first when a kanji branch is capped by the client's
-- "max words per branch" setting.
alter table public.words add column if not exists rank integer;
-- Structured per-sense dictionary data (part of speech, usage-register
-- tags, free-text notes, loanword origin) -- `meaning` stays as a flat,
-- search-friendly string derived from the same senses at generation time;
-- `senses` is what the UI renders. Array of
-- { gloss: string[], pos?: string[], misc?: string[], info?: string[], origin?: string }.
alter table public.words add column if not exists senses jsonb;

create table if not exists public.user_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_type text not null check (item_type in ('word', 'kanji')),
  item_id text not null,                        -- word text or kanji char
  status text not null default 'new' check (status in ('new', 'learning', 'known')),
  updated_at timestamptz not null default now(),
  unique (user_id, item_type, item_id)
);
create index if not exists user_progress_user_idx on public.user_progress (user_id);

create table if not exists public.saved_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_type text not null check (item_type = 'word'),
  item_id text not null,
  created_at timestamptz not null default now(),
  exported_at timestamptz,
  unique (user_id, item_type, item_id)
);
create index if not exists saved_items_user_idx on public.saved_items (user_id);

-- User-created word collections ("groups") -- e.g. "JLPT N4 review",
-- "Kitchen vocab". A word can belong to any number of a user's groups.
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  created_at timestamptz not null default now(),
  unique (user_id, name)
);
create index if not exists groups_user_idx on public.groups (user_id);

create table if not exists public.group_words (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  word text not null,
  added_at timestamptz not null default now(),
  unique (group_id, word)
);
create index if not exists group_words_group_idx on public.group_words (group_id);

-- ── Row Level Security ─────────────────────────────────────────────────
alter table public.kanji enable row level security;
alter table public.words enable row level security;
alter table public.user_progress enable row level security;
alter table public.saved_items enable row level security;
alter table public.groups enable row level security;
alter table public.group_words enable row level security;

drop policy if exists "kanji_public_read" on public.kanji;
create policy "kanji_public_read" on public.kanji for select using (true);
drop policy if exists "words_public_read" on public.words;
create policy "words_public_read" on public.words for select using (true);
-- No insert/update/delete policy on kanji/words: only the SQL editor (or a
-- service-role script) can write them. The anon/authenticated client can
-- only ever select from these two tables.

drop policy if exists "user_progress_owner_select" on public.user_progress;
create policy "user_progress_owner_select" on public.user_progress
  for select using (auth.uid() = user_id);
drop policy if exists "user_progress_owner_insert" on public.user_progress;
create policy "user_progress_owner_insert" on public.user_progress
  for insert with check (auth.uid() = user_id);
drop policy if exists "user_progress_owner_update" on public.user_progress;
create policy "user_progress_owner_update" on public.user_progress
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "user_progress_owner_delete" on public.user_progress;
create policy "user_progress_owner_delete" on public.user_progress
  for delete using (auth.uid() = user_id);

drop policy if exists "saved_items_owner_select" on public.saved_items;
create policy "saved_items_owner_select" on public.saved_items
  for select using (auth.uid() = user_id);
drop policy if exists "saved_items_owner_insert" on public.saved_items;
create policy "saved_items_owner_insert" on public.saved_items
  for insert with check (auth.uid() = user_id);
drop policy if exists "saved_items_owner_update" on public.saved_items;
create policy "saved_items_owner_update" on public.saved_items
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "saved_items_owner_delete" on public.saved_items;
create policy "saved_items_owner_delete" on public.saved_items
  for delete using (auth.uid() = user_id);

drop policy if exists "groups_owner_select" on public.groups;
create policy "groups_owner_select" on public.groups
  for select using (auth.uid() = user_id);
drop policy if exists "groups_owner_insert" on public.groups;
create policy "groups_owner_insert" on public.groups
  for insert with check (auth.uid() = user_id);
drop policy if exists "groups_owner_update" on public.groups;
create policy "groups_owner_update" on public.groups
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "groups_owner_delete" on public.groups;
create policy "groups_owner_delete" on public.groups
  for delete using (auth.uid() = user_id);

-- group_words has no user_id column of its own -- ownership is via its
-- parent group.
drop policy if exists "group_words_owner_select" on public.group_words;
create policy "group_words_owner_select" on public.group_words
  for select using (exists (
    select 1 from public.groups g where g.id = group_words.group_id and g.user_id = auth.uid()
  ));
drop policy if exists "group_words_owner_insert" on public.group_words;
create policy "group_words_owner_insert" on public.group_words
  for insert with check (exists (
    select 1 from public.groups g where g.id = group_words.group_id and g.user_id = auth.uid()
  ));
drop policy if exists "group_words_owner_delete" on public.group_words;
create policy "group_words_owner_delete" on public.group_words
  for delete using (exists (
    select 1 from public.groups g where g.id = group_words.group_id and g.user_id = auth.uid()
  ));
