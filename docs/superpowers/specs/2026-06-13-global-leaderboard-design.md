# Global Leaderboard — Design

**Date:** 2026-06-13
**Status:** Approved design, pending implementation plan

## Goal

Add a global leaderboard to *Last Card!* that ranks players by **matches won**.
Results are submitted from **solo games only** (single-device), against a hosted
Supabase backend. Identity is the player's typed-in name — no accounts, no auth,
no anti-cheat in this version. The author accepts that anyone can write arbitrary
results and will migrate to auth/server validation later if it ever becomes a
problem.

## Non-goals (explicitly out of scope)

- Authentication or user accounts.
- Server-side validation / anti-cheat.
- Submitting results from online multiplayer matches (deferred — `mode` column
  leaves the door open).
- Win-rate, total-points, or any ranking other than matches won.
- Realtime updates / live subscriptions.

## Architecture

The app is a fully static React + Vite site on GitHub Pages with no backend.
This feature adds the project's first network datastore via **Supabase**
(hosted Postgres + auto-generated PostgREST API). The browser talks to it
directly with the public anon key; ranking is computed in the database via a
SQL view so the client stays trivial.

### Data model (Supabase)

Table `match_results`:

| column        | type          | notes                                    |
|---------------|---------------|------------------------------------------|
| `id`          | `uuid`        | PK, `default gen_random_uuid()`          |
| `player_name` | `text`        | not null                                 |
| `won`         | `boolean`     | not null — did this player win the match |
| `points`      | `int`         | winner's final match score (nullable)    |
| `mode`        | `text`        | `default 'solo'` — future-proofs online  |
| `created_at`  | `timestamptz` | `default now()`                          |

View `leaderboard`:

```sql
create view leaderboard as
select
  player_name,
  count(*) filter (where won) as wins,
  count(*)                    as games
from match_results
group by player_name;
```

The client selects all rows from `leaderboard` and sorts client-side by
`wins` desc, then `games` asc (fewer games to reach the same wins ranks higher).

### Row-level security

```sql
alter table match_results enable row level security;

create policy "anon insert" on match_results
  for insert to anon with check (true);

grant select on leaderboard to anon;
```

`anon insert with check (true)` is deliberately open — consistent with the
"no anti-cheat yet" decision. The `leaderboard` view is granted select to anon.
The base `match_results` table has no anon select policy, so individual rows are
not publicly readable — only the aggregated view is.

## Components

### `src/net/leaderboard.ts` (new)

A thin, dependency-free module over PostgREST using `fetch`.

- `isConfigured(): boolean` — true when both env vars are present.
- `submitResult(result: { playerName: string; won: boolean; points: number }): Promise<void>`
  — POST to `${URL}/rest/v1/match_results` with headers `apikey`, `Authorization: Bearer <anon>`,
  `Content-Type: application/json`. Best-effort: catches and logs all errors, never throws.
- `fetchLeaderboard(): Promise<LeaderboardRow[]>` — GET `${URL}/rest/v1/leaderboard?select=*`,
  returns `[]` on any failure. Caller sorts.
- `LeaderboardRow = { player_name: string; wins: number; games: number }`.

If `isConfigured()` is false, `submitResult` is a no-op and `fetchLeaderboard`
returns `[]`. Gameplay must never break because the leaderboard is unreachable.

### Configuration

- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, read via `import.meta.env`.
- Stored in a gitignored `.env` at the repo root; baked into the bundle at build
  time. `npm run deploy` runs locally, so the local `.env` supplies them.
- Add `.env` to `.gitignore`. Add a committed `.env.example` documenting both keys.

### Submission point — `src/hooks/useGame.ts`

The existing match-over effect already detects completion:

```ts
const matchOver = state.phase === 'roundOver' && state.scores.some((s) => s >= TARGET_SCORE)
```

Extend it: on the transition into `matchOver`, submit one row for the human
(seat 0). `won = state.scores[0] >= TARGET_SCORE` (equivalently `state.winner === 0`),
`points = state.scores[0]`, `playerName = settings.playerName`. A `useRef<boolean>`
guard ensures exactly one submission per match, since the effect re-runs on every
state change. Submission is fire-and-forget; it does not block the existing
`clearSavedGame()` call.

### UI — `src/components/Leaderboard.tsx` (new)

- A modal overlay following the existing `.overlay` / `.modal` pattern (see
  `WinScreen.tsx`).
- Opened by a "🏆 Leaderboard" button added to `SetupScreen`.
- On open, calls `fetchLeaderboard()`, sorts, and renders a table: rank • name •
  wins • games. Handles loading, empty ("No games recorded yet"), and error states.
- The current player's name is highlighted if present.
- Optional: a "View leaderboard" link on `WinScreen` after a solo match opens the
  same modal. Included by default; trivial to remove.

## Data flow

1. Human finishes a solo match → `useGame` effect fires with `matchOver` true.
2. Guard ref flips; `submitResult({ playerName, won, points })` POSTs to Supabase.
3. Later, player opens the Leaderboard modal → `fetchLeaderboard()` GETs the
   `leaderboard` view → client sorts → table renders.

## Error handling

- All Supabase calls are wrapped in try/catch; failures are `console.warn`-logged
  and swallowed.
- Unconfigured env → module self-disables (no-op submit, empty fetch).
- The Leaderboard modal shows a friendly error state if `fetchLeaderboard`
  returns nothing due to a network error vs. genuinely empty (distinguish by a
  thrown/flagged failure inside the component's own try/catch around the call).

## Testing

`src/net/leaderboard.test.ts` (Vitest, `fetch` mocked):

- `submitResult` POSTs to the correct URL with correct headers and JSON body.
- `fetchLeaderboard` GETs the view and returns parsed rows.
- Both no-op / return `[]` when env is unconfigured.
- Network failure is swallowed (no throw) and yields `[]` for fetch.

The once-per-match submission guard is covered by a focused test around the
submission logic (extract the guard decision into a testable pure helper if it
keeps the hook clean; otherwise assert via a mocked `submitResult`).

Engine, AI, and network tests remain untouched.

## Manual setup checklist (author)

1. Create a free Supabase project.
2. Run the table, view, and RLS SQL above in the SQL editor.
3. Copy Project URL + anon public key (Settings → API) into local `.env`.
4. `npm test && npm run build` to confirm, then `npm run deploy`.
