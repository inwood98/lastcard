# Social Features & Admin Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add player stats, achievements, and a password-protected admin page for leaderboard management.

**Architecture:** Player stats and achievements are fetched from Supabase by player name (no accounts) and computed client-side from `match_results`. The admin page is lazy-loaded only when the URL hash is `#admin`, keeping `@supabase/supabase-js` (needed for auth) out of the main bundle. All other Supabase calls continue to use raw `fetch` with the anon key.

**Tech Stack:** React, TypeScript, Vite, Supabase REST API (raw fetch for game/stats), `@supabase/supabase-js` (admin auth only, lazy-loaded), Vitest

---

## File Map

**New files:**
- `src/net/env.ts` — shared helper to read Supabase env vars (extracted from leaderboard.ts)
- `src/net/stats.ts` — fetch + compute player stats and achievements
- `src/net/stats.test.ts` — unit tests for pure stat/achievement functions
- `src/net/supabase.ts` — lazy-only: singleton supabase-js client for admin auth
- `src/net/admin.ts` — lazy-only: admin CRUD queries via supabase-js
- `src/components/StatsModal.tsx` — modal showing stats summary + achievement grid
- `src/components/AdminApp.tsx` — lazy-only: login form or dashboard root
- `src/components/AdminDashboard.tsx` — lazy-only: three-tab admin UI

**Modified files:**
- `src/net/leaderboard.ts` — import env from env.ts; extend MatchResult with caughtOpponents; add loadBannedNames + ban enforcement
- `src/hooks/useGame.ts` — count human catches via ref; pass caughtOpponents to submitResult
- `src/App.tsx` — lazy-load AdminApp when hash is `#admin`; call loadBannedNames on mount
- `src/components/SetupScreen.tsx` — add "My Stats" button alongside Leaderboard button

---

## Task 1: Supabase Database Migration

**Files:** none (manual Supabase steps)

- [ ] **Step 1: Run SQL in Supabase SQL editor**

Open your Supabase project → SQL editor → New query. Paste and run:

```sql
-- Add catch tracking column
alter table match_results add column caught_opponents int default 0;

-- Banned names table
create table banned_names (
  name text primary key,
  banned_at timestamptz default now()
);
grant select on banned_names to anon;

-- Admin RLS policies (requires an authenticated Supabase user for admin)
create policy "admin delete results" on match_results
  for delete to authenticated using (true);

create policy "admin update results" on match_results
  for update to authenticated using (true);

create policy "admin manage bans" on banned_names
  for all to authenticated using (true);

-- Rebuild leaderboard view to exclude banned names and expose games count
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

- [ ] **Step 2: Create admin user**

In Supabase Dashboard → Authentication → Users → Add user. Enter your email and a strong password. This is the credential used to log in to the admin page.

- [ ] **Step 3: Verify**

Run in the SQL editor:
```sql
select column_name from information_schema.columns
where table_name = 'match_results' and column_name = 'caught_opponents';
select * from banned_names limit 1;
select * from leaderboard limit 5;
```
Expected: `caught_opponents` column exists, banned_names is empty, leaderboard returns rows.

---

## Task 2: Extract Shared Env Helper

**Files:**
- Create: `src/net/env.ts`
- Modify: `src/net/leaderboard.ts`

The `env()` function is currently private to `leaderboard.ts`. Stats and admin modules need the same values. Extract it.

- [ ] **Step 1: Create src/net/env.ts**

```ts
export function supabaseEnv() {
  return {
    url: import.meta.env.VITE_SUPABASE_URL as string | undefined,
    anon: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
  }
}
```

- [ ] **Step 2: Update leaderboard.ts to use it**

Remove the private `env()` function and import from env.ts. Replace all 4 call sites of `env()` with `supabaseEnv()`.

Open `src/net/leaderboard.ts`. Replace:
```ts
function env() {
  return {
    url: import.meta.env.VITE_SUPABASE_URL as string | undefined,
    anon: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
  }
}
```
With:
```ts
import { supabaseEnv } from './env'
```
Then replace every `env()` call with `supabaseEnv()` (4 occurrences: `isConfigured`, `submitResult`, `fetchLeaderboard`, and the new ones we'll add).

- [ ] **Step 3: Run tests to confirm nothing broke**

```bash
npm test
```
Expected: 90 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/net/env.ts src/net/leaderboard.ts
git commit -m "refactor: extract supabase env helper to src/net/env.ts"
```

---

## Task 3: Extend MatchResult + Banned Names Enforcement

**Files:**
- Modify: `src/net/leaderboard.ts`

- [ ] **Step 1: Extend MatchResult type**

In `src/net/leaderboard.ts`, update the `MatchResult` interface:
```ts
export interface MatchResult {
  playerName: string
  won: boolean
  points: number
  caughtOpponents: number
}
```

- [ ] **Step 2: Update matchResultFor to include caughtOpponents**

```ts
export function matchResultFor(state: GameState, playerName: string): MatchResult | null {
  const matchOver = state.phase === 'roundOver' && state.scores.some((s) => s >= TARGET_SCORE)
  if (!matchOver) return null
  return {
    playerName,
    won: state.scores[0] >= TARGET_SCORE,
    points: state.scores[0],
    caughtOpponents: 0,  // caller (useGame) overrides this with the real count
  }
}
```

- [ ] **Step 3: Update submitResult to include caughtOpponents in body**

In `src/net/leaderboard.ts`, update the `JSON.stringify` body:
```ts
body: JSON.stringify({
  player_name: result.playerName,
  won: result.won,
  points: result.points,
  caught_opponents: result.caughtOpponents,
  mode: 'solo',
}),
```

- [ ] **Step 4: Add banned names cache + loadBannedNames**

Add below the `fetchLeaderboard` function in `src/net/leaderboard.ts`:

```ts
let bannedNames = new Set<string>()

export async function loadBannedNames(): Promise<void> {
  const { url, anon } = supabaseEnv()
  if (!url || !anon) return
  try {
    const res = await fetch(`${url}/rest/v1/banned_names?select=name`, {
      headers: { apikey: anon, Authorization: `Bearer ${anon}` },
    })
    if (!res.ok) return
    const rows = (await res.json()) as { name: string }[]
    bannedNames = new Set(rows.map((r) => r.name.toLowerCase()))
  } catch {
    // ignore — ban enforcement is best-effort
  }
}
```

- [ ] **Step 5: Enforce ban at the top of submitResult**

Add one line at the start of `submitResult`, after the env check:
```ts
export async function submitResult(result: MatchResult): Promise<void> {
  const { url, anon } = supabaseEnv()
  if (!url || !anon) return
  if (bannedNames.has(result.playerName.toLowerCase())) return  // banned player
  // ... rest unchanged
```

- [ ] **Step 6: Run tests**

```bash
npm test
```
Expected: 90 tests pass (TypeScript will catch any type mismatch).

- [ ] **Step 7: Commit**

```bash
git add src/net/leaderboard.ts
git commit -m "feat(leaderboard): extend MatchResult with caughtOpponents, add ban enforcement"
```

---

## Task 4: Count Human Catches in useGame

**Files:**
- Modify: `src/hooks/useGame.ts`

- [ ] **Step 1: Add catch counter ref and override catchPlayer**

In `src/hooks/useGame.ts`, update the `useGame` function. Add `catchCountRef` after the existing refs, then override `catchPlayer` in the returned value:

```ts
export function useGame(settings: GameSettings, initialState?: GameState): GameApi {
  const [state, dispatch] = useReducer(
    gameReducer,
    { settings, initialState },
    ({ settings, initialState }: { settings: GameSettings; initialState?: GameState }) =>
      initialState
        ? structuredClone(initialState)
        : initGame({
            playerName: settings.playerName,
            botCount: settings.botCount,
            rules: settings.rules,
            scores: settings.scores,
          }),
  )

  const driverRef = useRef<BotDriver | null>(null)
  const submittedRef = useRef(false)
  const catchCountRef = useRef(0)   // ← add this

  useEffect(() => {
    driverRef.current = new BotDriver(settings.difficulty, dispatch)
    return () => {
      driverRef.current?.stop()
      driverRef.current = null
    }
  }, [settings.difficulty])

  useEffect(() => {
    driverRef.current?.onState(state)
  }, [state])

  useEffect(() => {
    const result = matchResultFor(state, settings.playerName)
    if (result) {
      clearSavedGame()
      if (!submittedRef.current) {
        submittedRef.current = true
        void submitResult({ ...result, caughtOpponents: catchCountRef.current })  // ← pass count
      }
    } else {
      submittedRef.current = false
      saveGame(state, settings.difficulty)
    }
  }, [state, settings.playerName, settings.difficulty])

  return useMemo(
    () => ({
      ...makeApi(state, 0, dispatch),
      catchPlayer: (targetId: number) => {
        catchCountRef.current++                                          // ← count the catch
        dispatch({ type: 'CATCH_LAST_CARD', callerId: 0, targetId })
      },
    }),
    [state],
  )
}
```

- [ ] **Step 2: Run tests**

```bash
npm test
```
Expected: 90 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useGame.ts
git commit -m "feat(game): track human catch count and include in match result submission"
```

---

## Task 5: Stats Pure Functions + Tests

**Files:**
- Create: `src/net/stats.ts`
- Create: `src/net/stats.test.ts`

- [ ] **Step 1: Write the failing tests first**

Create `src/net/stats.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeStats, computeAchievements } from './stats'
import type { PlayerMatch } from './stats'

function match(
  won: boolean,
  opts: { caught_opponents?: number; created_at?: string } = {},
): PlayerMatch {
  return {
    id: Math.random().toString(),
    won,
    points: 0,
    caught_opponents: opts.caught_opponents ?? 0,
    created_at: opts.created_at ?? new Date().toISOString(),
  }
}

describe('computeStats', () => {
  it('returns zeros for empty match list', () => {
    expect(computeStats([])).toEqual({
      wins: 0, games: 0, winRate: 0, currentStreak: 0, bestStreak: 0,
    })
  })

  it('counts wins and games', () => {
    const stats = computeStats([match(true), match(false), match(true)])
    expect(stats.wins).toBe(2)
    expect(stats.games).toBe(3)
    expect(stats.winRate).toBe(67)
  })

  it('computes current streak from most recent games descending', () => {
    const matches = [
      match(true, { created_at: '2026-06-03T00:00:00Z' }),
      match(true, { created_at: '2026-06-02T00:00:00Z' }),
      match(false, { created_at: '2026-06-01T00:00:00Z' }),
    ]
    expect(computeStats(matches).currentStreak).toBe(2)
  })

  it('currentStreak is 0 when most recent game was a loss', () => {
    const matches = [
      match(false, { created_at: '2026-06-03T00:00:00Z' }),
      match(true, { created_at: '2026-06-02T00:00:00Z' }),
    ]
    expect(computeStats(matches).currentStreak).toBe(0)
  })

  it('computes best streak across all history', () => {
    const matches = [
      match(true, { created_at: '2026-06-06T00:00:00Z' }),
      match(false, { created_at: '2026-06-05T00:00:00Z' }),
      match(true, { created_at: '2026-06-04T00:00:00Z' }),
      match(true, { created_at: '2026-06-03T00:00:00Z' }),
      match(true, { created_at: '2026-06-02T00:00:00Z' }),
      match(false, { created_at: '2026-06-01T00:00:00Z' }),
    ]
    expect(computeStats(matches).bestStreak).toBe(3)
  })
})

describe('computeAchievements', () => {
  it('unlocks First Win after 1 win', () => {
    const achievements = computeAchievements([match(true)])
    expect(achievements.find((a) => a.id === 'first-win')?.unlocked).toBe(true)
  })

  it('locks Champion with fewer than 10 wins', () => {
    const achievements = computeAchievements([match(true)])
    expect(achievements.find((a) => a.id === 'champion')?.unlocked).toBe(false)
  })

  it('unlocks On a Roll with a 3-win streak', () => {
    const matches = [
      match(true, { created_at: '2026-06-03T00:00:00Z' }),
      match(true, { created_at: '2026-06-02T00:00:00Z' }),
      match(true, { created_at: '2026-06-01T00:00:00Z' }),
    ]
    expect(computeAchievements(matches).find((a) => a.id === 'on-a-roll')?.unlocked).toBe(true)
  })

  it('unlocks Snitch when any match has caught_opponents > 0', () => {
    const achievements = computeAchievements([match(false, { caught_opponents: 1 })])
    expect(achievements.find((a) => a.id === 'snitch')?.unlocked).toBe(true)
  })

  it('returns 8 achievements', () => {
    expect(computeAchievements([])).toHaveLength(8)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test src/net/stats.test.ts
```
Expected: FAIL — `computeStats` and `computeAchievements` not found.

- [ ] **Step 3: Implement src/net/stats.ts**

```ts
import { supabaseEnv } from './env'

export interface PlayerMatch {
  id: string
  won: boolean
  points: number
  caught_opponents: number
  created_at: string
}

export interface PlayerStats {
  wins: number
  games: number
  winRate: number
  currentStreak: number
  bestStreak: number
}

export interface Achievement {
  id: string
  emoji: string
  name: string
  condition: string
  unlocked: boolean
}

export function computeStats(matches: PlayerMatch[]): PlayerStats {
  const games = matches.length
  const wins = matches.filter((m) => m.won).length
  const winRate = games > 0 ? Math.round((wins / games) * 100) : 0

  const sorted = [...matches].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )

  let currentStreak = 0
  for (const m of sorted) {
    if (m.won) currentStreak++
    else break
  }

  let bestStreak = 0
  let streak = 0
  for (const m of [...sorted].reverse()) {
    if (m.won) {
      streak++
      if (streak > bestStreak) bestStreak = streak
    } else {
      streak = 0
    }
  }

  return { wins, games, winRate, currentStreak, bestStreak }
}

export function computeAchievements(matches: PlayerMatch[]): Achievement[] {
  const stats = computeStats(matches)
  const hasCaught = matches.some((m) => m.caught_opponents > 0)
  return [
    { id: 'first-win', emoji: '🏆', name: 'First Win', condition: '1 win', unlocked: stats.wins >= 1 },
    { id: 'champion', emoji: '🏅', name: 'Champion', condition: '10 wins', unlocked: stats.wins >= 10 },
    { id: 'legend', emoji: '👑', name: 'Legend', condition: '50 wins', unlocked: stats.wins >= 50 },
    { id: 'on-a-roll', emoji: '🔥', name: 'On a Roll', condition: '3 wins in a row', unlocked: stats.bestStreak >= 3 },
    { id: 'hot-streak', emoji: '⚡', name: 'Hot Streak', condition: '5 wins in a row', unlocked: stats.bestStreak >= 5 },
    { id: 'veteran', emoji: '🎖️', name: 'Veteran', condition: '25 games played', unlocked: stats.games >= 25 },
    { id: 'century', emoji: '💯', name: 'Century', condition: '100 games played', unlocked: stats.games >= 100 },
    { id: 'snitch', emoji: '👀', name: 'Snitch', condition: 'Catch an opponent', unlocked: hasCaught },
  ]
}

export async function fetchPlayerMatches(playerName: string): Promise<PlayerMatch[]> {
  const { url, anon } = supabaseEnv()
  if (!url || !anon) return []
  try {
    const encoded = encodeURIComponent(playerName)
    const res = await fetch(
      `${url}/rest/v1/match_results?player_name=eq.${encoded}&select=id,won,points,caught_opponents,created_at&order=created_at.desc`,
      { headers: { apikey: anon, Authorization: `Bearer ${anon}` } },
    )
    if (!res.ok) return []
    return (await res.json()) as PlayerMatch[]
  } catch {
    return []
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test
```
Expected: All tests pass (90 + new stats tests).

- [ ] **Step 5: Commit**

```bash
git add src/net/stats.ts src/net/stats.test.ts
git commit -m "feat(stats): pure stat and achievement computation with tests"
```

---

## Task 6: StatsModal Component

**Files:**
- Create: `src/components/StatsModal.tsx`

- [ ] **Step 1: Create src/components/StatsModal.tsx**

```tsx
import { useState, useEffect } from 'react'
import { fetchPlayerMatches, computeStats, computeAchievements } from '../net/stats'

interface StatsModalProps {
  playerName: string
  onClose: () => void
}

export function StatsModal({ playerName, onClose }: StatsModalProps) {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ wins: 0, games: 0, winRate: 0, currentStreak: 0, bestStreak: 0 })
  const [achievements, setAchievements] = useState(computeAchievements([]))

  useEffect(() => {
    fetchPlayerMatches(playerName).then((matches) => {
      setStats(computeStats(matches))
      setAchievements(computeAchievements(matches))
      setLoading(false)
    })
  }, [playerName])

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: '0 0 4px' }}>{playerName}'s Stats</h2>

        {loading ? (
          <p style={{ color: 'rgba(255,255,255,0.6)' }}>Loading…</p>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, margin: '16px 0' }}>
              {[
                { label: 'Wins', value: stats.wins },
                { label: 'Games', value: stats.games },
                { label: 'Win rate', value: `${stats.winRate}%` },
                { label: 'Current streak', value: stats.currentStreak },
                { label: 'Best streak', value: stats.bestStreak },
              ].map(({ label, value }) => (
                <div key={label} style={{ textAlign: 'center', background: 'rgba(255,255,255,0.07)', borderRadius: 10, padding: '10px 6px' }}>
                  <div style={{ fontSize: 22, fontWeight: 900 }}>{value}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>

            <h3 style={{ margin: '16px 0 10px', fontSize: 14, textTransform: 'uppercase', letterSpacing: 1, color: 'rgba(255,255,255,0.5)' }}>Achievements</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {achievements.map((a) => (
                <div
                  key={a.id}
                  title={a.unlocked ? a.name : `${a.name}: ${a.condition}`}
                  style={{
                    textAlign: 'center',
                    padding: '10px 4px',
                    borderRadius: 10,
                    background: a.unlocked ? 'rgba(255,206,0,0.12)' : 'rgba(255,255,255,0.05)',
                    filter: a.unlocked ? 'none' : 'grayscale(1) opacity(0.35)',
                  }}
                >
                  <div style={{ fontSize: 26 }}>{a.emoji}</div>
                  <div style={{ fontSize: 10, marginTop: 4, color: 'rgba(255,255,255,0.7)', lineHeight: 1.3 }}>{a.name}</div>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="modal-buttons" style={{ marginTop: 20 }}>
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run tests**

```bash
npm test
```
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/StatsModal.tsx
git commit -m "feat(stats): StatsModal component with stats summary and achievements"
```

---

## Task 7: My Stats Button on Setup Screen

**Files:**
- Modify: `src/components/SetupScreen.tsx`

- [ ] **Step 1: Add StatsModal import and state**

In `src/components/SetupScreen.tsx`:

Add import at the top:
```ts
import { StatsModal } from './StatsModal'
import { isConfigured } from '../net/leaderboard'
```

Add state alongside the existing `showBoard` state:
```ts
const [showStats, setShowStats] = useState(false)
```

- [ ] **Step 2: Add My Stats button**

Find the existing leaderboard button:
```tsx
<button className="option setup-board-btn" onClick={() => setShowBoard(true)}>
  🏆 Leaderboard
</button>
```

Replace with:
```tsx
<div style={{ display: 'flex', gap: 8 }}>
  <button className="option setup-board-btn" onClick={() => setShowBoard(true)}>
    🏆 Leaderboard
  </button>
  {isConfigured() && (
    <button className="option setup-board-btn" onClick={() => setShowStats(true)}>
      📊 My Stats
    </button>
  )}
</div>
```

- [ ] **Step 3: Add StatsModal below the existing Leaderboard modal**

Find:
```tsx
      {showBoard && (
        <Leaderboard currentName={name.trim() || undefined} onClose={() => setShowBoard(false)} />
      )}
```

Add below it:
```tsx
      {showStats && (
        <StatsModal playerName={name.trim() || 'You'} onClose={() => setShowStats(false)} />
      )}
```

- [ ] **Step 4: Run tests**

```bash
npm test
```
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/SetupScreen.tsx
git commit -m "feat(setup): add My Stats button to setup screen"
```

---

## Task 8: Install supabase-js + Admin Routing in App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Install supabase-js**

```bash
npm install --cache /tmp/npm-cache-uno @supabase/supabase-js
```
Expected: package added to node_modules and package.json.

- [ ] **Step 2: Create src/net/supabase.ts**

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

export function supabase(): SupabaseClient {
  if (!_client) {
    const url = import.meta.env.VITE_SUPABASE_URL as string
    const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string
    _client = createClient(url, anon)
  }
  return _client
}
```

- [ ] **Step 3: Add lazy admin routing to App.tsx**

Add these imports at the top of `src/App.tsx`:
```ts
import { lazy, Suspense, useEffect } from 'react'
import { loadBannedNames } from './net/leaderboard'

const AdminApp = lazy(() => import('./components/AdminApp'))
```

(Change existing `useEffect` import from `'react'` to include it — `import { useEffect, useState } from 'react'` → `import { lazy, Suspense, useEffect, useState } from 'react'`)

- [ ] **Step 4: Add hash check and loadBannedNames call**

In the `App` component body, add these two blocks before the `return`:

```tsx
// Load banned names cache for submission enforcement
useEffect(() => {
  void loadBannedNames()
}, [])

// Serve admin UI when URL hash is #admin
if (window.location.hash === '#admin') {
  return (
    <Suspense fallback={<div style={{ padding: 32, color: '#fff' }}>Loading admin…</div>}>
      <AdminApp />
    </Suspense>
  )
}
```

- [ ] **Step 5: Run tests**

```bash
npm test
```
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/net/supabase.ts package.json package-lock.json
git commit -m "feat(admin): install supabase-js, add lazy admin routing + load banned names on startup"
```

---

## Task 9: Admin Queries

**Files:**
- Create: `src/net/admin.ts`

- [ ] **Step 1: Create src/net/admin.ts**

```ts
import { supabase } from './supabase'

export interface AdminPlayer {
  player_name: string
  wins: number
  games: number
  winRate: number
}

export interface AdminMatch {
  id: string
  player_name: string
  won: boolean
  points: number
  caught_opponents: number
  created_at: string
}

export interface BannedName {
  name: string
  banned_at: string
}

export async function fetchAllPlayers(): Promise<AdminPlayer[]> {
  const { data } = await supabase()
    .from('match_results')
    .select('player_name, won')
  if (!data) return []
  const map = new Map<string, { wins: number; games: number }>()
  for (const row of data as { player_name: string; won: boolean }[]) {
    const entry = map.get(row.player_name) ?? { wins: 0, games: 0 }
    entry.games++
    if (row.won) entry.wins++
    map.set(row.player_name, entry)
  }
  return Array.from(map.entries())
    .map(([player_name, { wins, games }]) => ({
      player_name,
      wins,
      games,
      winRate: games > 0 ? Math.round((wins / games) * 100) : 0,
    }))
    .sort((a, b) => b.wins - a.wins)
}

export async function fetchMatchHistory(): Promise<AdminMatch[]> {
  const { data } = await supabase()
    .from('match_results')
    .select('id, player_name, won, points, caught_opponents, created_at')
    .order('created_at', { ascending: false })
  return (data ?? []) as AdminMatch[]
}

export async function fetchAdminBannedNames(): Promise<BannedName[]> {
  const { data } = await supabase()
    .from('banned_names')
    .select('name, banned_at')
    .order('banned_at', { ascending: false })
  return (data ?? []) as BannedName[]
}

export async function deletePlayerResults(playerName: string): Promise<void> {
  await supabase().from('match_results').delete().eq('player_name', playerName)
}

export async function deleteMatchResult(id: string): Promise<void> {
  await supabase().from('match_results').delete().eq('id', id)
}

export async function banName(name: string): Promise<void> {
  await supabase().from('banned_names').upsert({ name })
}

export async function unbanName(name: string): Promise<void> {
  await supabase().from('banned_names').delete().eq('name', name)
}
```

- [ ] **Step 2: Run tests**

```bash
npm test
```
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add src/net/admin.ts
git commit -m "feat(admin): admin CRUD queries via supabase-js"
```

---

## Task 10: AdminApp — Login + Session Shell

**Files:**
- Create: `src/components/AdminApp.tsx`

- [ ] **Step 1: Create src/components/AdminApp.tsx**

```tsx
import { useState, useEffect } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../net/supabase'
import { AdminDashboard } from './AdminDashboard'

export default function AdminApp() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [signingIn, setSigningIn] = useState(false)

  useEffect(() => {
    supabase().auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: { subscription } } = supabase().auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSigningIn(true)
    const { error } = await supabase().auth.signInWithPassword({ email, password })
    setSigningIn(false)
    if (error) setError(error.message)
  }

  const signOut = () => supabase().auth.signOut()

  const inputStyle: React.CSSProperties = {
    padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)',
    background: 'rgba(255,255,255,0.07)', color: '#fff', fontSize: 15, width: '100%', boxSizing: 'border-box',
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', color: '#fff' }}>
        Loading…
      </div>
    )
  }

  if (!session) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', background: '#16161d' }}>
        <form onSubmit={signIn} style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 320, padding: 32, background: '#1d2b22', borderRadius: 18, border: '1px solid rgba(255,255,255,0.1)' }}>
          <h2 style={{ margin: 0, color: '#fff', fontStyle: 'italic' }}>LAST CARD! Admin</h2>
          <input style={inputStyle} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input style={inputStyle} type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {error && <p style={{ color: '#eb1c24', margin: 0, fontSize: 14 }}>{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={signingIn}>
            {signingIn ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    )
  }

  return <AdminDashboard onSignOut={signOut} />
}
```

- [ ] **Step 2: Run tests**

```bash
npm test
```
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/AdminApp.tsx
git commit -m "feat(admin): AdminApp login form with Supabase Auth"
```

---

## Task 11: AdminDashboard — Full Three-Tab UI

**Files:**
- Create: `src/components/AdminDashboard.tsx`

- [ ] **Step 1: Create src/components/AdminDashboard.tsx**

```tsx
import { useState, useEffect, useCallback } from 'react'
import {
  fetchAllPlayers, fetchMatchHistory, fetchAdminBannedNames,
  deletePlayerResults, deleteMatchResult, banName, unbanName,
  type AdminPlayer, type AdminMatch, type BannedName,
} from '../net/admin'

type Tab = 'players' | 'history' | 'bans'

const th: React.CSSProperties = { padding: '8px 12px', textAlign: 'left', color: 'rgba(255,255,255,0.5)', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.1)' }
const td: React.CSSProperties = { padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 14 }

export function AdminDashboard({ onSignOut }: { onSignOut: () => void }) {
  const [tab, setTab] = useState<Tab>('players')
  const [players, setPlayers] = useState<AdminPlayer[]>([])
  const [history, setHistory] = useState<AdminMatch[]>([])
  const [bans, setBans] = useState<BannedName[]>([])
  const [historyFilter, setHistoryFilter] = useState('')
  const [newBan, setNewBan] = useState('')
  const [loading, setLoading] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    const [p, h, b] = await Promise.all([fetchAllPlayers(), fetchMatchHistory(), fetchAdminBannedNames()])
    setPlayers(p)
    setHistory(h)
    setBans(b)
    setLoading(false)
  }, [])

  useEffect(() => { void reload() }, [reload])

  const handleDeletePlayer = async (name: string) => {
    if (!confirm(`Delete ALL results for "${name}"?`)) return
    await deletePlayerResults(name)
    await reload()
  }

  const handleBanPlayer = async (name: string) => {
    if (!confirm(`Ban "${name}"? Their results will be hidden and future submissions blocked.`)) return
    await banName(name)
    await reload()
  }

  const handleDeleteMatch = async (id: string) => {
    if (!confirm('Delete this match result?')) return
    await deleteMatchResult(id)
    await reload()
  }

  const handleUnban = async (name: string) => {
    await unbanName(name)
    await reload()
  }

  const handleAddBan = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newBan.trim()) return
    await banName(newBan.trim())
    setNewBan('')
    await reload()
  }

  const filteredHistory = historyFilter.trim()
    ? history.filter((m) => m.player_name.toLowerCase().includes(historyFilter.toLowerCase()))
    : history

  const tabBtn = (t: Tab, label: string) => (
    <button
      className={tab === t ? 'option selected' : 'option'}
      onClick={() => setTab(t)}
      style={{ minWidth: 120 }}
    >
      {label}
    </button>
  )

  return (
    <div style={{ minHeight: '100dvh', background: '#16161d', color: '#fff', padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontStyle: 'italic', fontSize: 22 }}>LAST CARD! Admin</h1>
        <button className="btn" onClick={onSignOut}>Sign out</button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {tabBtn('players', '👥 Players')}
        {tabBtn('history', '📋 Match History')}
        {tabBtn('bans', '🚫 Banned Names')}
      </div>

      {loading && <p style={{ color: 'rgba(255,255,255,0.4)' }}>Loading…</p>}

      {!loading && tab === 'players' && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Name</th>
              <th style={th}>Wins</th>
              <th style={th}>Games</th>
              <th style={th}>Win %</th>
              <th style={th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.player_name}>
                <td style={td}>{p.player_name}</td>
                <td style={td}>{p.wins}</td>
                <td style={td}>{p.games}</td>
                <td style={td}>{p.winRate}%</td>
                <td style={{ ...td, display: 'flex', gap: 8 }}>
                  <button className="btn" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => handleDeletePlayer(p.player_name)}>Delete all</button>
                  <button className="btn btn-danger" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => handleBanPlayer(p.player_name)}>Ban</button>
                </td>
              </tr>
            ))}
            {players.length === 0 && <tr><td style={td} colSpan={5}>No players yet.</td></tr>}
          </tbody>
        </table>
      )}

      {!loading && tab === 'history' && (
        <>
          <input
            style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.07)', color: '#fff', fontSize: 14, width: 240 }}
            placeholder="Filter by name…"
            value={historyFilter}
            onChange={(e) => setHistoryFilter(e.target.value)}
          />
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Date</th>
                <th style={th}>Player</th>
                <th style={th}>Result</th>
                <th style={th}>Points</th>
                <th style={th}>Catches</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {filteredHistory.map((m) => (
                <tr key={m.id}>
                  <td style={td}>{new Date(m.created_at).toLocaleDateString()}</td>
                  <td style={td}>{m.player_name}</td>
                  <td style={{ ...td, color: m.won ? '#3bab23' : '#eb1c24' }}>{m.won ? 'Won' : 'Lost'}</td>
                  <td style={td}>{m.points}</td>
                  <td style={td}>{m.caught_opponents}</td>
                  <td style={td}>
                    <button className="btn btn-danger" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => handleDeleteMatch(m.id)}>Delete</button>
                  </td>
                </tr>
              ))}
              {filteredHistory.length === 0 && <tr><td style={td} colSpan={6}>No matches found.</td></tr>}
            </tbody>
          </table>
        </>
      )}

      {!loading && tab === 'bans' && (
        <>
          <form onSubmit={handleAddBan} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.07)', color: '#fff', fontSize: 14, width: 220 }}
              placeholder="Name to ban…"
              value={newBan}
              onChange={(e) => setNewBan(e.target.value)}
            />
            <button className="btn btn-danger" type="submit">Ban</button>
          </form>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Name</th>
                <th style={th}>Banned at</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {bans.map((b) => (
                <tr key={b.name}>
                  <td style={td}>{b.name}</td>
                  <td style={td}>{new Date(b.banned_at).toLocaleDateString()}</td>
                  <td style={td}>
                    <button className="btn" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => handleUnban(b.name)}>Unban</button>
                  </td>
                </tr>
              ))}
              {bans.length === 0 && <tr><td style={td} colSpan={3}>No banned names.</td></tr>}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Run tests**

```bash
npm test
```
Expected: all pass.

- [ ] **Step 3: Build to verify no TypeScript errors**

```bash
npm run build
```
Expected: build succeeds, no type errors. Admin chunk (supabase-js) will appear as a separate file in dist/assets/.

- [ ] **Step 4: Commit**

```bash
git add src/components/AdminDashboard.tsx
git commit -m "feat(admin): AdminDashboard with Players, Match History, and Banned Names tabs"
```

---

## Task 12: Deploy

- [ ] **Step 1: Deploy to GitHub Pages**

```bash
npm run deploy
```
Expected: tests pass, build succeeds, published.

- [ ] **Step 2: Smoke-test live site**

1. Open `https://inwood98.github.io/lastcard/` — setup screen loads normally
2. Play one solo game to completion — result submits without error
3. Click **🏆 Leaderboard** — your name appears
4. Click **📊 My Stats** — stats modal opens, shows your game, achievements update
5. Open `https://inwood98.github.io/lastcard/#admin` — login form appears
6. Sign in with your Supabase admin credentials — dashboard loads
7. Verify Players tab shows your entry
8. Test banning a name — it disappears from leaderboard
