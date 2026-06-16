-- Last Card! — Supabase backend setup
--
-- Run this once in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- It is safe to re-run: every statement uses IF NOT EXISTS / OR REPLACE / drop-first.
--
-- After running, also do the dashboard steps in the README "Backend setup" section:
--   1. Authentication → Users → Add user (your admin email + password, Auto Confirm).
--   2. Authentication → Sign In / Providers → turn OFF "Allow new users to sign up".
--   3. Put the project URL + anon key into .env (see .env.example).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- One row per finished solo match. The public site inserts with the anon key;
-- the admin dashboard reads/deletes while signed in.
create table if not exists match_results (
  id uuid primary key default gen_random_uuid(),
  player_name text not null,
  won boolean not null,
  points int,
  caught_opponents int default 0,
  mode text default 'solo',
  created_at timestamptz default now()
);

-- Names the admin has banned. The game loads these on startup and refuses to
-- submit results for a banned player.
create table if not exists banned_names (
  name text primary key,
  banned_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- Leaderboard view (matches won, ranked client-side)
-- ---------------------------------------------------------------------------

create or replace view leaderboard as
select player_name,
       count(*) filter (where won) as wins,
       count(*) as games
from match_results
group by player_name;

-- ---------------------------------------------------------------------------
-- Row-level security
--
-- anon          = the public game site (uses the public anon key)
-- authenticated = the admin, signed in via Supabase Auth on the #admin page
-- ---------------------------------------------------------------------------

alter table match_results enable row level security;
alter table banned_names enable row level security;

-- Public site: submit results, read results (for the "My Stats" page),
-- read the leaderboard, and read the ban list.
drop policy if exists "anon insert results" on match_results;
create policy "anon insert results" on match_results for insert to anon with check (true);

drop policy if exists "anon read results" on match_results;
create policy "anon read results" on match_results for select to anon using (true);

drop policy if exists "anon read bans" on banned_names;
create policy "anon read bans" on banned_names for select to anon using (true);

-- Admin (any signed-in user): full control over results and bans.
-- NOTE: this is why public sign-ups MUST be disabled — see the README.
drop policy if exists "auth manage results" on match_results;
create policy "auth manage results" on match_results for all to authenticated using (true) with check (true);

drop policy if exists "auth manage bans" on banned_names;
create policy "auth manage bans" on banned_names for all to authenticated using (true) with check (true);

grant select on leaderboard to anon;
