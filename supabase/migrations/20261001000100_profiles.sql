-- Players' public profiles (a chosen display name, never their Google name) and deleting an
-- account. Additive only, and safe to run again.

create table if not exists public.profiles (
  id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  display_name text not null
    check (char_length(display_name) between 3 and 24 and display_name ~ '^[A-Za-z0-9 _-]+$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- One of each name, whatever its case.
create unique index if not exists profiles_display_name_key on public.profiles (lower(display_name));

alter table public.profiles enable row level security;

-- Display names are public: they appear on published builds.
drop policy if exists "Read profiles" on public.profiles;
create policy "Read profiles" on public.profiles
  for select to anon, authenticated using (true);
drop policy if exists "Create own profile" on public.profiles;
create policy "Create own profile" on public.profiles
  for insert to authenticated with check (id = auth.uid());
drop policy if exists "Update own profile" on public.profiles;
create policy "Update own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

grant select on public.profiles to anon;
grant select, insert, update on public.profiles to authenticated;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Deletes the signed-in player's account: their login, and with it (on delete cascade) their
-- profile and builds. Runs with the owner's rights, only ever on the caller's own account.
create or replace function public.delete_my_account() returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
