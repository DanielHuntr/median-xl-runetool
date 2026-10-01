-- Likes on published builds: one per account per build, never on your own. Each build keeps
-- its count (builds.likes), kept by the database, so who liked what stays private.
-- Additive only, and safe to run again.

alter table public.builds add column if not exists likes int not null default 0;
create index if not exists builds_liked_idx on public.builds (cls, likes desc) where published;

create table if not exists public.build_likes (
  build_id uuid not null references public.builds (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (build_id, user_id)
);

alter table public.build_likes enable row level security;

-- Only your own likes are visible (to show which builds you've liked).
drop policy if exists "Read own likes" on public.build_likes;
create policy "Read own likes" on public.build_likes
  for select to authenticated using (user_id = auth.uid());
-- Like someone else's published build.
drop policy if exists "Like published builds" on public.build_likes;
create policy "Like published builds" on public.build_likes
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (select 1 from public.builds b where b.id = build_id and b.published and b.user_id <> auth.uid())
  );
drop policy if exists "Remove own likes" on public.build_likes;
create policy "Remove own likes" on public.build_likes
  for delete to authenticated using (user_id = auth.uid());

grant select, insert, delete on public.build_likes to authenticated;

-- The count follows the likes. Runs with the owner's rights: players can't write the count.
create or replace function public.count_build_likes() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.builds set likes = likes + 1 where id = new.build_id;
  else
    update public.builds set likes = greatest(likes - 1, 0) where id = old.build_id;
  end if;
  return null;
end $$;
drop trigger if exists build_likes_count on public.build_likes;
create trigger build_likes_count after insert or delete on public.build_likes
  for each row execute function public.count_build_likes();

-- Players write their builds' own columns, never the count.
revoke insert, update on public.builds from authenticated;
grant insert (name, cls, level, code, skills, published) on public.builds to authenticated;
grant update (name, cls, level, code, skills, published) on public.builds to authenticated;

-- A like isn't an edit: "last edited" only moves when the build itself changes.
drop trigger if exists builds_touch on public.builds;
create trigger builds_touch before update of name, cls, level, code, skills, published on public.builds
  for each row execute function public.touch_updated_at();
