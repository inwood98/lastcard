# Realtime Live Leaderboard — Design

**Date:** 2026-06-16
**Status:** Approved design, pending implementation plan

## Goal

Make the 🏆 Leaderboard modal update live while it is open: when any player finishes
a match, the open board re-ranks itself with an animated highlight on changed rows and
a `● Live` indicator, without the user reloading or reopening the modal.

## Non-goals

- Live updates anywhere other than the open Leaderboard modal (the board is not shown
  elsewhere).
- Live updates to the "My Stats" page or the admin dashboard.
- Client-side aggregation of results (the `leaderboard` view stays authoritative).
- Presence / "who's online" (a separate future feature).

## Background

The `Leaderboard` component (`src/components/Leaderboard.tsx`) currently fetches the
`leaderboard` view once on mount via `fetchLeaderboard()` (a `fetch` against PostgREST),
sorts by wins desc then games asc, and renders a table. It is rendered from both the
setup screen and the solo win screen, so making this one component live covers both.

Supabase Realtime broadcasts row changes on **tables**, not views. `leaderboard` is a
view, so we subscribe to `INSERT`s on the underlying `match_results` table and, on each
event, re-fetch the view. Matches finish rarely, so a full re-fetch per event is cheap
and keeps the aggregation server-authoritative.

Realtime is part of `@supabase/supabase-js` (already a dependency; `realtime-js` is
present). Realtime honors row-level security: anon already has `SELECT` on
`match_results` (policy `anon read results`), so public clients receive insert events.

## Architecture

```
match_results INSERT ──(Supabase Realtime, postgres_changes)──▶ subscribeToResults callback
                                                                      │
                                                                      ▼
                                                            load(): fetchLeaderboard()
                                                                      │
                                                  changedPlayers(prev, next) → flash set
                                                                      ▼
                                                        Leaderboard re-renders (+ badge)
```

The realtime subscription uses the Supabase **SDK** client (`supabase()` from
`src/net/supabase.ts`), because realtime is not available over the plain `fetch`/PostgREST
path that `fetchLeaderboard` uses. The two access styles coexisting in `leaderboard.ts`
is acceptable: reads stay on `fetch`, the realtime channel needs the SDK.

## Components

### `src/net/leaderboard.ts` — two additions

**`subscribeToResults(onInsert: () => void): () => void`**
- If `!isConfigured()`, return a no-op unsubscribe function (`() => {}`).
- Otherwise create a channel (name `leaderboard-results`) and listen on
  `postgres_changes` with `{ event: 'INSERT', schema: 'public', table: 'match_results' }`,
  invoking `onInsert` on each event.
- Return an unsubscribe function that calls `supabase().removeChannel(channel)`.

**`changedPlayers(prev: LeaderboardRow[], next: LeaderboardRow[]): string[]`** (pure)
- Returns the `player_name`s in `next` that are new, or whose `wins` or `games` differ
  from `prev`. Used to drive the row-flash animation.

### `src/components/Leaderboard.tsx`

- Extract the existing fetch+sort into a `load()` callback returning the sorted rows.
- On mount: run `load()` for the initial render (current behavior), then call
  `subscribeToResults`. On each event, call `load()` again; diff old vs new rows with
  `changedPlayers` to populate a `flashing` set of player names; store the unsubscribe
  function and clean it up on unmount.
- Track whether the channel is connected (the subscribe status callback reports
  `'SUBSCRIBED'`); show a `● Live` badge in the modal header only while connected, so the
  badge never claims "live" when realtime is actually down.
- Rows whose name is in `flashing` get a `row-flash` class; a timer clears the set ~1s
  after it is set. All timers and the subscription are torn down on unmount.

### `src/components/table.css`

- `@keyframes lb-flash` (e.g. a brief background-color pulse) and a `.row-flash` rule.
- A `.live-badge` style for the `● Live` indicator.

## Data flow

1. User opens the Leaderboard modal → initial `load()` renders the board → component
   subscribes to `match_results` inserts.
2. Somewhere, a player finishes a match → `submitResult` inserts a row → Supabase
   Realtime broadcasts the INSERT.
3. The component's callback runs `load()`, diffs with `changedPlayers`, flashes the
   affected rows, and re-renders in new rank order.
4. User closes the modal → unmount → unsubscribe + clear timers.

## Error handling

- **Not configured:** `subscribeToResults` returns a no-op; the board behaves exactly as
  today (one-time fetch, no badge).
- **Realtime unavailable / channel error:** the last successfully fetched board stays on
  screen, the `● Live` badge is hidden, and nothing throws. The initial `fetch` load is
  unaffected.
- **Refetch failure after an event:** `fetchLeaderboard` swallows the error and returns
  `[]`. To avoid blanking a populated board on a transient failure, the realtime refresh
  ignores an empty result when rows are already shown: it keeps the existing rows and does
  not flash. (The initial load still renders a genuinely empty board as "No games
  recorded yet.")

## Backend / configuration

Add `match_results` to the realtime publication so inserts are broadcast:

```sql
alter publication supabase_realtime add table match_results;
```

- Add this statement to `docs/supabase-setup.sql` (guarded so re-running is safe).
- Document it in the README backend section.
- For the existing project, this is a one-time action: either run the statement, or
  toggle it in the dashboard (Database → Replication → enable `match_results`).

## Testing

`src/net/leaderboard.test.ts` (Vitest, Supabase SDK mocked):
- `changedPlayers`: detects a new player, an increased `wins`, an increased `games`, and
  returns nothing when `prev` and `next` match.
- `subscribeToResults`: when configured, creates a channel and registers a
  `postgres_changes` INSERT listener on `match_results`; the returned function calls
  `removeChannel`. When unconfigured, returns a callable no-op and never touches the SDK.

The flash animation and `● Live` badge rendering are verified by running the dev server
(consistent with the codebase, which does not unit-test React components).

## Manual verification

1. With Supabase configured and `match_results` in the realtime publication, open the
   leaderboard in two browser windows.
2. Finish a solo match in window A.
3. Window B's open leaderboard re-ranks within ~1s, flashes the changed row, and shows
   the `● Live` badge.
