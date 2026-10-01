-- Players' builds, saved to their account. A build is private to its owner until they publish
-- it; published builds can be read by anyone (the Builds page's community list).
-- Additive only, and safe to run again: creates the table, its rules and grants.

create table if not exists public.builds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  cls text not null check (cls in ('Amazon', 'Assassin', 'Barbarian', 'Druid', 'Necromancer', 'Paladin', 'Sorceress')),
  level int check (level between 1 and 150),
  -- The planner's share code (base64url JSON, checked and cleaned by the planner when opened).
  code text not null check (char_length(code) between 8 and 20000 and code ~ '^[A-Za-z0-9_-]+$'),
  skills text[] not null default '{}' check (cardinality(skills) <= 2),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists builds_user_idx on public.builds (user_id, updated_at desc);
create index if not exists builds_published_idx on public.builds (cls, updated_at desc) where published;

-- Row Level Security: nothing is visible or writable except by these rules.
alter table public.builds enable row level security;

drop policy if exists "Read own builds" on public.builds;
create policy "Read own builds" on public.builds
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "Read published builds" on public.builds;
create policy "Read published builds" on public.builds
  for select to anon, authenticated using (published);
drop policy if exists "Create own builds" on public.builds;
create policy "Create own builds" on public.builds
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "Update own builds" on public.builds;
create policy "Update own builds" on public.builds
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "Delete own builds" on public.builds;
create policy "Delete own builds" on public.builds
  for delete to authenticated using (user_id = auth.uid());

-- The Data API doesn't expose new tables by default (project setting): grant exactly this.
grant select on public.builds to anon;
grant select, insert, update, delete on public.builds to authenticated;

-- Keep updated_at current on every change.
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;
drop trigger if exists builds_touch on public.builds;
create trigger builds_touch before update on public.builds
  for each row execute function public.touch_updated_at();
