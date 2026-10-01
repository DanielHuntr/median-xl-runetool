-- Players' loot filters, saved to their account so they follow them to any device. Private:
-- only their owner can see or change them. Additive only, and safe to run again.

create table if not exists public.loot_filters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  -- The filter as the Filter Exchange's JSON ({ name, default_show_items, rules }), cleaned by
  -- the site when read (src/filters/lootFilter.js).
  filter jsonb not null check (jsonb_typeof(filter) = 'object' and pg_column_size(filter) <= 300000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists loot_filters_user_idx on public.loot_filters (user_id, updated_at desc);

alter table public.loot_filters enable row level security;

drop policy if exists "Read own filters" on public.loot_filters;
create policy "Read own filters" on public.loot_filters
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "Create own filters" on public.loot_filters;
create policy "Create own filters" on public.loot_filters
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "Update own filters" on public.loot_filters;
create policy "Update own filters" on public.loot_filters
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "Delete own filters" on public.loot_filters;
create policy "Delete own filters" on public.loot_filters
  for delete to authenticated using (user_id = auth.uid());

grant select, insert, update, delete on public.loot_filters to authenticated;

drop trigger if exists loot_filters_touch on public.loot_filters;
create trigger loot_filters_touch before update on public.loot_filters
  for each row execute function public.touch_updated_at();
