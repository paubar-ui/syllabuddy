-- Syllabuddy · Study Buddies schema (CLAUDE.md Phase 4)
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- It is safe to run more than once.
--
-- Privacy by design: only a display name and weekly aggregates (points, streak, minutes)
-- ever reach the server. Courses, grades and syllabi stay on the student's device.
-- Row Level Security (RLS) makes sure people can only read their own and their friends' rows.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 40),
  created_at timestamptz not null default now()
);

-- Kept apart from profiles so friends can never read each other's invite codes.
create table if not exists public.invite_codes (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  code text not null unique default upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6))
);

-- Stored in both directions (A→B and B→A) so "my friends" is one simple lookup.
create table if not exists public.friendships (
  user_id uuid not null references public.profiles (id) on delete cascade,
  friend_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

create table if not exists public.weekly_stats (
  user_id uuid not null references public.profiles (id) on delete cascade,
  week date not null, -- the Monday of the week
  points integer not null default 0 check (points >= 0),
  streak integer not null default 0 check (streak >= 0),
  minutes integer not null default 0 check (minutes >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, week)
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.invite_codes enable row level security;
alter table public.friendships enable row level security;
alter table public.weekly_stats enable row level security;

-- Helper: is `other` a friend of the signed-in user?
create or replace function public.is_friend(other uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.friendships f
    where f.user_id = (select auth.uid()) and f.friend_id = other
  );
$$;

-- profiles: read yourself and your friends; create and edit only yourself.
drop policy if exists "profiles: read self and friends" on public.profiles;
create policy "profiles: read self and friends" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.is_friend(id));

drop policy if exists "profiles: insert self" on public.profiles;
create policy "profiles: insert self" on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

drop policy if exists "profiles: update self" on public.profiles;
create policy "profiles: update self" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- invite_codes: only your own code is visible. Codes are created by ensure_my_profile().
drop policy if exists "invite_codes: read own" on public.invite_codes;
create policy "invite_codes: read own" on public.invite_codes
  for select to authenticated
  using (user_id = (select auth.uid()));

-- friendships: read your own list. Adding/removing happens only through the functions below.
drop policy if exists "friendships: read own" on public.friendships;
create policy "friendships: read own" on public.friendships
  for select to authenticated
  using (user_id = (select auth.uid()));

-- weekly_stats: read yourself and your friends; write only your own rows.
drop policy if exists "weekly_stats: read self and friends" on public.weekly_stats;
create policy "weekly_stats: read self and friends" on public.weekly_stats
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_friend(user_id));

drop policy if exists "weekly_stats: insert own" on public.weekly_stats;
create policy "weekly_stats: insert own" on public.weekly_stats
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "weekly_stats: update own" on public.weekly_stats;
create policy "weekly_stats: update own" on public.weekly_stats
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Functions the app calls (they run with extra rights, but check auth.uid() themselves)
-- ---------------------------------------------------------------------------

-- Creates or renames your profile and returns your invite code.
create or replace function public.ensure_my_profile(p_display_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  my_code text;
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  insert into public.profiles (id, display_name)
  values (me, trim(p_display_name))
  on conflict (id) do update set display_name = excluded.display_name;

  insert into public.invite_codes (user_id) values (me) on conflict (user_id) do nothing;
  select code into my_code from public.invite_codes where user_id = me;
  return my_code;
end;
$$;

-- Adds a friend (both directions) by their invite code. Returns their display name.
create or replace function public.add_friend_by_code(p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  other uuid;
  other_name text;
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  select ic.user_id, p.display_name into other, other_name
  from public.invite_codes ic join public.profiles p on p.id = ic.user_id
  where ic.code = upper(trim(p_code));

  if other is null then
    raise exception 'No one has that invite code';
  end if;
  if other = me then
    raise exception 'That is your own code';
  end if;
  if (select count(*) from public.friendships where user_id = me) >= 50 then
    raise exception 'You can have up to 50 study buddies';
  end if;

  insert into public.friendships (user_id, friend_id) values (me, other), (other, me)
  on conflict do nothing;
  return other_name;
end;
$$;

-- Removes a friend in both directions.
create or replace function public.remove_friend(p_friend uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.friendships
  where (user_id = auth.uid() and friend_id = p_friend)
     or (user_id = p_friend and friend_id = auth.uid());
$$;

-- Deletes everything Syllabuddy stores about you on the server (GDPR "right to erasure").
create or replace function public.delete_my_data()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.profiles where id = auth.uid(); -- cascades to codes, friendships and stats
$$;

-- Only signed-in users may call the functions.
revoke all on function public.is_friend(uuid) from public, anon;
revoke all on function public.ensure_my_profile(text) from public, anon;
revoke all on function public.add_friend_by_code(text) from public, anon;
revoke all on function public.remove_friend(uuid) from public, anon;
revoke all on function public.delete_my_data() from public, anon;
grant execute on function public.is_friend(uuid) to authenticated;
grant execute on function public.ensure_my_profile(text) to authenticated;
grant execute on function public.add_friend_by_code(text) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.delete_my_data() to authenticated;
