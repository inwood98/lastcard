# Social Features & Admin Page — Design Spec

## Overview

Add player-facing social features (personal stats, achievements) and a password-protected admin page for leaderboard management. All player identity remains name-based (no player accounts). Admin access uses Supabase Auth with a single admin user.

---

## 1. Database Changes

Run in Supabase SQL editor:

```sql
-- Track catches per game (enables Snitch achievement)
alter table match_results add column caught_opponents int default 0;

-- Banned names table
create table banned_names (
  name text primary key,
  banned_at timestamptz default now()
);
grant select on banned_names to anon;

-- Allow authenticated admin to manage data
create policy "admin delete" on match_results for delete to authenticated using (true);
create policy "admin update" on match_results for update to authenticated using (true);
create policy "admin manage bans" on banned_names for all to authenticated using (true);

-- Rebuild leaderboard view to exclude banned names
drop view leaderboard;
create view leaderboard as
select player_name,
       count(*) filter (where won) as wins,
       count(*) as games
from match_results
where player_name not in (select name from banned_names)
group by player_name;
grant select on leaderboard to anon;
```

Create one admin user in Supabase Dashboard → Authentication → Users. That account's email/password is the admin login credential.

---

## 2. Player Stats & Achievements

### Entry point

A **"My Stats"** button on the setup screen opens a modal. Only available in solo mode (same scope as leaderboard — multiplayer results are not submitted).

### Stats summary

Queried from Supabase by the player's current name from `match_results`:

- **Wins** — `count(*) filter (where won)`
- **Games played** — `count(*)`
- **Win rate** — wins / games as a percentage
- **Current streak** — consecutive wins counting back from most recent game
- **Best streak** — longest consecutive win run across all history

Streak is computed client-side from match history sorted by `created_at` descending.

### Achievements

Eight achievements computed client-side from match history. Locked achievements show greyed out with the unlock condition.

| Badge | Name | Condition |
|-------|------|-----------|
| 🏆 | First Win | 1 win |
| 🏅 | Champion | 10 wins |
| 👑 | Legend | 50 wins |
| 🔥 | On a Roll | 3 wins in a row |
| ⚡ | Hot Streak | 5 wins in a row |
| 🎖️ | Veteran | 25 games played |
| 💯 | Century | 100 games played |
| 👀 | Snitch | `caught_opponents > 0` in at least one game |

### Data loading

- Fetch all `match_results` for the player name on modal open (not on app load)
- No caching — always fetch fresh to reflect recent games
- If Supabase is not configured, hide the My Stats button entirely (same behaviour as leaderboard)

### Submitting catches

The `useGame` hook already calls `submitResult` at match end. Extend the result payload to include `caught_opponents` (count of opponents the human player caught during the match). The engine already emits `CATCH_LAST_CARD` events — count those during the match.

---

## 3. Admin Page

### Access

Navigating to `/#admin` renders the Admin screen instead of the game. No link in the game UI — accessed by typing the URL directly. The hash check happens in `App.tsx` on mount.

### Authentication

Uses Supabase Auth. On load, the admin screen checks for an active session:
- **No session** → show login form (email + password)
- **Active session** → show dashboard
- Session persists in localStorage via Supabase's built-in session management
- Sign-out button in the dashboard header clears the session

### Dashboard — three tabs

#### Players tab
Table of all players sorted by wins descending, sourced directly from `match_results` (not the view, so banned players are still visible for management).

Columns: Name · Wins · Games · Win Rate

Per-row actions:
- **Delete all results** — removes all `match_results` rows for that player name
- **Ban name** — inserts into `banned_names`; player disappears from leaderboard and future submissions are blocked

#### Match History tab
All `match_results` rows sorted newest first.

Columns: Date · Player Name · Result (Won/Lost) · Points

- Text filter by player name (client-side, no extra query)
- Per-row **Delete** button removes a single entry

#### Banned Names tab
All `banned_names` rows sorted by `banned_at` descending.

Columns: Name · Banned At

- Per-row **Unban** button deletes the row
- Text input + **Ban** button to add a new name manually

### In-game enforcement

On app startup, fetch `banned_names` and cache in memory. When `submitResult` is called, check the player's name against the cache first. If banned, skip the submission silently — the game continues normally, the result just doesn't reach Supabase.

---

## 4. Component Structure

### New files

```
src/components/StatsModal.tsx      — My Stats modal (stats summary + achievements)
src/components/AdminApp.tsx        — Admin root: login form or dashboard
src/components/AdminDashboard.tsx  — Tabs: Players, Match History, Banned Names
src/net/stats.ts                   — Supabase queries for player stats + achievements
src/net/admin.ts                   — Supabase queries for admin CRUD operations
```

### Modified files

```
src/App.tsx          — hash check on mount; render AdminApp if /#admin
src/components/SetupScreen.tsx  — add "My Stats" button
src/net/leaderboard.ts          — load banned_names on init; enforce ban in submitResult
src/engine/game.ts / types.ts   — no changes needed (CATCH_LAST_CARD already exists)
src/hooks/useGame.ts            — count catches during match, pass to submitResult
```

---

## 5. Out of Scope

- Friend leaderboards (private groups) — future feature
- Multiplayer result submission — no change, stays solo-only
- Achievement notifications during gameplay — achievements only visible in My Stats modal
- Server-side achievement validation — computed client-side from submitted data
