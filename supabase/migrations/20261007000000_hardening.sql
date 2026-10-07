-- Hardening. Additive only, and safe to run again.
--   1. Players write only the columns they're meant to (not created_at, updated_at or likes).
--   2. A cap on how many builds and loot filters one account can keep, so nobody can fill the
--      database (the site itself keeps up to 50 filters in a browser).
--   3. The trigger functions run with a fixed search_path and can't be called directly.

-- 1. Column grants. A display name is saved by upsert (id and display_name; RLS checks the id).
revoke insert, update on public.profiles from authenticated;
grant insert (id, display_name) on public.profiles to authenticated;
grant update (id, display_name) on public.profiles to authenticated;

revoke insert, update on public.loot_filters from authenticated;
grant insert (name, filter) on public.loot_filters to authenticated;
grant update (name, filter) on public.loot_filters to authenticated;

revoke insert on public.build_likes from authenticated;
grant insert (build_id) on public.build_likes to authenticated;

-- 2. Caps per account. Runs as the player: Row Level Security already limits the count to
-- their own rows.
create or replace function public.cap_rows() returns trigger
  language plpgsql set search_path = '' as $$
declare
  cap int := tg_argv[0]::int;
  n int;
begin
  execute format('select count(*) from %I.%I where user_id = $1', tg_table_schema, tg_table_name)
    into n using new.user_id;
  if n >= cap then
    raise exception 'You can keep up to % of these in your account. Delete one first.', cap
      using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists builds_cap on public.builds;
create trigger builds_cap before insert on public.builds
  for each row execute function public.cap_rows('500');
drop trigger if exists loot_filters_cap on public.loot_filters;
create trigger loot_filters_cap before insert on public.loot_filters
  for each row execute function public.cap_rows('100');

-- 3. A fixed search_path (Supabase's security advisor flags functions without one).
create or replace function public.touch_updated_at() returns trigger
  language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Trigger functions are only ever run by their triggers.
revoke all on function public.touch_updated_at() from public, anon, authenticated;
revoke all on function public.count_build_likes() from public, anon, authenticated;
revoke all on function public.cap_rows() from public, anon, authenticated;
