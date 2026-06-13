# Global Leaderboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global "matches won" leaderboard to *Last Card!*, fed by solo games, backed by Supabase.

**Architecture:** A dependency-free `fetch` wrapper (`src/net/leaderboard.ts`) talks to Supabase's PostgREST API with the public anon key. Ranking is aggregated by a SQL view; the client just selects and sorts. Solo match completion submits one row from the existing match-over effect in `useGame`. A new modal surfaces the board from the setup screen.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Supabase (hosted Postgres + PostgREST).

---

## File Structure

- **Create** `src/net/leaderboard.ts` — env detection, `submitResult`, `fetchLeaderboard`, `matchResultFor` helper, types. One responsibility: talking to the leaderboard backend.
- **Create** `src/net/leaderboard.test.ts` — unit tests with `fetch` mocked.
- **Create** `src/components/Leaderboard.tsx` — the leaderboard modal.
- **Create** `.env.example` — documents the two env vars (committed).
- **Modify** `.gitignore` — ignore `.env`.
- **Modify** `src/hooks/useGame.ts` — submit a result on solo match completion.
- **Modify** `src/components/SetupScreen.tsx` — add a "🏆 Leaderboard" button + modal toggle.
- **Modify** `README.md` — document the Supabase setup + env vars.

Component tests are intentionally omitted — this codebase tests only engine/ai/net/save/fx logic, never React components, and has no React testing library installed. UI tasks are verified by running the dev server.

---

## Task 1: Leaderboard module skeleton — env detection + types

**Files:**
- Create: `src/net/leaderboard.ts`
- Create: `src/net/leaderboard.test.ts`
- Create: `.env.example`
- Modify: `.gitignore`

- [ ] **Step 1: Ignore `.env` and add an example**

Append to `.gitignore` (after the `*.local` line):

```
# Local env (Supabase keys)
.env
```

Create `.env.example`:

```
# Supabase project URL and public anon key (Settings -> API).
# Copy this file to .env and fill in. Baked into the bundle at build time.
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

- [ ] **Step 2: Write the failing test**

Create `src/net/leaderboard.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isConfigured } from './leaderboard'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('isConfigured', () => {
  it('is false when env vars are missing', () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    expect(isConfigured()).toBe(false)
  })

  it('is true when both env vars are set', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
    expect(isConfigured()).toBe(true)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- leaderboard`
Expected: FAIL — cannot resolve `./leaderboard`.

- [ ] **Step 4: Write minimal implementation**

Create `src/net/leaderboard.ts`. Read env **inside** functions so `vi.stubEnv` works:

```ts
export interface LeaderboardRow {
  player_name: string
  wins: number
  games: number
}

export interface MatchResult {
  playerName: string
  won: boolean
  points: number
}

function env() {
  return {
    url: import.meta.env.VITE_SUPABASE_URL as string | undefined,
    anon: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
  }
}

export function isConfigured(): boolean {
  const { url, anon } = env()
  return Boolean(url && anon)
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- leaderboard`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add .gitignore .env.example src/net/leaderboard.ts src/net/leaderboard.test.ts
git commit -m "feat(leaderboard): module skeleton + env detection"
```

---

## Task 2: `submitResult` — POST a result

**Files:**
- Modify: `src/net/leaderboard.ts`
- Test: `src/net/leaderboard.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/net/leaderboard.test.ts`:

```ts
import { isConfigured, submitResult } from './leaderboard'

describe('submitResult', () => {
  it('POSTs the result to PostgREST with auth headers', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    await submitResult({ playerName: 'Ada', won: true, points: 510 })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('https://x.supabase.co/rest/v1/match_results')
    expect(opts.method).toBe('POST')
    expect(opts.headers.apikey).toBe('anon-key')
    expect(opts.headers.Authorization).toBe('Bearer anon-key')
    expect(JSON.parse(opts.body)).toEqual({
      player_name: 'Ada',
      won: true,
      points: 510,
      mode: 'solo',
    })
  })

  it('no-ops when unconfigured', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await submitResult({ playerName: 'Ada', won: true, points: 1 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('swallows network errors', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await expect(submitResult({ playerName: 'Ada', won: true, points: 1 })).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- leaderboard`
Expected: FAIL — `submitResult` is not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `src/net/leaderboard.ts`:

```ts
export async function submitResult(result: MatchResult): Promise<void> {
  const { url, anon } = env()
  if (!url || !anon) return
  try {
    await fetch(`${url}/rest/v1/match_results`, {
      method: 'POST',
      headers: {
        apikey: anon,
        Authorization: `Bearer ${anon}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        player_name: result.playerName,
        won: result.won,
        points: result.points,
        mode: 'solo',
      }),
    })
  } catch (err) {
    console.warn('leaderboard: submit failed', err)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- leaderboard`
Expected: PASS (5 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/net/leaderboard.ts src/net/leaderboard.test.ts
git commit -m "feat(leaderboard): submitResult POST"
```

---

## Task 3: `fetchLeaderboard` — GET the ranked view

**Files:**
- Modify: `src/net/leaderboard.ts`
- Test: `src/net/leaderboard.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/net/leaderboard.test.ts` (extend the import to include `fetchLeaderboard`):

```ts
describe('fetchLeaderboard', () => {
  it('GETs the leaderboard view and returns rows', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
    const rows = [{ player_name: 'Ada', wins: 3, games: 5 }]
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(rows) })
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchLeaderboard()

    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('https://x.supabase.co/rest/v1/leaderboard?select=*')
    expect(opts.headers.apikey).toBe('anon-key')
    expect(result).toEqual(rows)
  })

  it('returns [] when unconfigured', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    expect(await fetchLeaderboard()).toEqual([])
  })

  it('returns [] on network error', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    expect(await fetchLeaderboard()).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- leaderboard`
Expected: FAIL — `fetchLeaderboard` is not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `src/net/leaderboard.ts`:

```ts
export async function fetchLeaderboard(): Promise<LeaderboardRow[]> {
  const { url, anon } = env()
  if (!url || !anon) return []
  try {
    const res = await fetch(`${url}/rest/v1/leaderboard?select=*`, {
      headers: { apikey: anon, Authorization: `Bearer ${anon}` },
    })
    if (!res.ok) return []
    return (await res.json()) as LeaderboardRow[]
  } catch (err) {
    console.warn('leaderboard: fetch failed', err)
    return []
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- leaderboard`
Expected: PASS (8 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/net/leaderboard.ts src/net/leaderboard.test.ts
git commit -m "feat(leaderboard): fetchLeaderboard GET"
```

---

## Task 4: `matchResultFor` helper + wire into `useGame`

**Files:**
- Modify: `src/net/leaderboard.ts`
- Modify: `src/hooks/useGame.ts:84-90` (the match-over effect)
- Test: `src/net/leaderboard.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/net/leaderboard.test.ts`. This is a pure helper, no env/fetch needed:

```ts
import { matchResultFor } from './leaderboard'
import { initGame } from '../engine/game'
import { DEFAULT_RULES } from '../engine/types'
import type { GameState } from '../engine/types'

function midGame(): GameState {
  return initGame({ playerName: 'Ada', botCount: 2, rules: DEFAULT_RULES, seed: 1 })
}

describe('matchResultFor', () => {
  it('returns null mid-game', () => {
    expect(matchResultFor(midGame(), 'Ada')).toBeNull()
  })

  it('returns a win for the human when seat 0 reaches the target', () => {
    const state: GameState = { ...midGame(), phase: 'roundOver', scores: [510, 120, 90] }
    expect(matchResultFor(state, 'Ada')).toEqual({ playerName: 'Ada', won: true, points: 510 })
  })

  it('returns a loss for the human when a bot reaches the target', () => {
    const state: GameState = { ...midGame(), phase: 'roundOver', scores: [200, 505, 90] }
    expect(matchResultFor(state, 'Ada')).toEqual({ playerName: 'Ada', won: false, points: 200 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- leaderboard`
Expected: FAIL — `matchResultFor` is not exported.

- [ ] **Step 3: Write the helper**

Add to `src/net/leaderboard.ts` (import `TARGET_SCORE` and `GameState` at the top of the file):

```ts
import { TARGET_SCORE, type GameState } from '../engine/types'

/** The human (seat 0) result for a completed solo match, or null if the match isn't over. */
export function matchResultFor(state: GameState, playerName: string): MatchResult | null {
  const matchOver = state.phase === 'roundOver' && state.scores.some((s) => s >= TARGET_SCORE)
  if (!matchOver) return null
  return {
    playerName,
    won: state.scores[0] >= TARGET_SCORE,
    points: state.scores[0],
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- leaderboard`
Expected: PASS (11 tests total).

- [ ] **Step 5: Wire submission into `useGame`**

In `src/hooks/useGame.ts`, add imports near the existing `save` import:

```ts
import { matchResultFor, submitResult } from '../net/leaderboard'
```

Add a guard ref alongside `driverRef` (after the `useReducer` block):

```ts
  const submittedRef = useRef(false)
```

Replace the existing match-over effect (currently around lines 84-90):

```ts
  useEffect(() => {
    const matchOver = state.phase === 'roundOver' && state.scores.some((s) => s >= TARGET_SCORE)
    if (matchOver) clearSavedGame()
    else saveGame(state, settings.difficulty)
  }, [state, settings.difficulty])
```

with:

```ts
  useEffect(() => {
    const result = matchResultFor(state, settings.playerName)
    if (result) {
      clearSavedGame()
      if (!submittedRef.current) {
        submittedRef.current = true
        void submitResult(result)
      }
    } else {
      saveGame(state, settings.difficulty)
    }
  }, [state, settings.playerName, settings.difficulty])
```

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS — all existing tests plus the 11 leaderboard tests.

- [ ] **Step 7: Commit**

```bash
git add src/net/leaderboard.ts src/net/leaderboard.test.ts src/hooks/useGame.ts
git commit -m "feat(leaderboard): submit human result on solo match end"
```

---

## Task 5: Leaderboard modal component

**Files:**
- Create: `src/components/Leaderboard.tsx`

No automated test (consistent with the codebase — components are verified by running the app).

- [ ] **Step 1: Create the component**

Create `src/components/Leaderboard.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { fetchLeaderboard, isConfigured, type LeaderboardRow } from '../net/leaderboard'

interface LeaderboardProps {
  /** highlight this player's row */
  currentName?: string
  onClose: () => void
}

type Status = 'loading' | 'ready' | 'error' | 'disabled'

export function Leaderboard({ currentName, onClose }: LeaderboardProps) {
  const [rows, setRows] = useState<LeaderboardRow[]>([])
  const [status, setStatus] = useState<Status>('loading')

  useEffect(() => {
    if (!isConfigured()) {
      setStatus('disabled')
      return
    }
    let live = true
    fetchLeaderboard()
      .then((data) => {
        if (!live) return
        const sorted = [...data].sort((a, b) => b.wins - a.wins || a.games - b.games)
        setRows(sorted)
        setStatus('ready')
      })
      .catch(() => live && setStatus('error'))
    return () => {
      live = false
    }
  }, [])

  return (
    <div className="overlay">
      <div className="modal">
        <h2>🏆 Leaderboard</h2>

        {status === 'loading' && <p className="setup-note">Loading…</p>}
        {status === 'disabled' && <p className="setup-note">The leaderboard isn’t configured.</p>}
        {status === 'error' && <p className="setup-note">Couldn’t reach the leaderboard.</p>}
        {status === 'ready' && rows.length === 0 && (
          <p className="setup-note">No games recorded yet — be the first!</p>
        )}

        {status === 'ready' && rows.length > 0 && (
          <table className="scoreboard">
            <thead>
              <tr>
                <td>#</td>
                <td>Player</td>
                <td>Wins</td>
                <td>Games</td>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={r.player_name}
                  className={r.player_name === currentName ? 'score-winner' : ''}
                >
                  <td>{i + 1}</td>
                  <td>{r.player_name}</td>
                  <td>{r.wins}</td>
                  <td>{r.games}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="modal-buttons">
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
```

The `overlay`, `modal`, `scoreboard`, `score-winner`, `modal-buttons`, `btn`, and `setup-note` classes already exist (see `WinScreen.tsx` and `table.css`); no new CSS needed.

- [ ] **Step 2: Type-check**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/Leaderboard.tsx
git commit -m "feat(leaderboard): leaderboard modal component"
```

---

## Task 6: Open the leaderboard from the setup screen

**Files:**
- Modify: `src/components/SetupScreen.tsx`

- [ ] **Step 1: Add state and the modal**

In `src/components/SetupScreen.tsx`, add the import near the other component imports:

```ts
import { Leaderboard } from './Leaderboard'
```

Add state alongside the other `useState` hooks in `SetupScreen`:

```ts
  const [showBoard, setShowBoard] = useState(false)
```

- [ ] **Step 2: Add the button**

In the JSX, add a button just before the closing `</div>` of `setup-panel` (immediately after the `confirmNew ? ... : ...` block, before line 226's `</div>`):

```tsx
        <button className="option setup-board-btn" onClick={() => setShowBoard(true)}>
          🏆 Leaderboard
        </button>
```

- [ ] **Step 3: Render the modal**

Add just before the final closing `</div>` of the `setup-screen` root (after `</div>` that closes `setup-panel`, before the outer `</div>` on line 227):

```tsx
      {showBoard && (
        <Leaderboard currentName={name.trim() || undefined} onClose={() => setShowBoard(false)} />
      )}
```

- [ ] **Step 4: Verify in the browser**

Run: `npm run dev`, open the app, click "🏆 Leaderboard" on the setup screen. With no `.env` configured it should show "The leaderboard isn’t configured." Confirm the modal opens and closes cleanly.

- [ ] **Step 5: Commit**

```bash
git add src/components/SetupScreen.tsx
git commit -m "feat(leaderboard): open leaderboard from setup screen"
```

---

## Task 7: "View leaderboard" link on the win screen (solo)

**Files:**
- Modify: `src/components/WinScreen.tsx`
- Modify: `src/components/GameTable.tsx:138` (where `WinScreen` is rendered)

This is the optional extra from the spec. Keep it minimal: a button that calls a new optional `onLeaderboard` prop.

- [ ] **Step 1: Add the prop and button to WinScreen**

In `src/components/WinScreen.tsx`, add to `WinScreenProps`:

```ts
  /** open the global leaderboard — solo only */
  onLeaderboard?: () => void
```

Destructure it in the function signature, and add a button inside the existing `modal-buttons` div (after the existing buttons, before `</div>`):

```tsx
          {onLeaderboard && (
            <button className="btn" onClick={onLeaderboard}>
              🏆 Leaderboard
            </button>
          )}
```

- [ ] **Step 2: Wire it from GameTable**

In `src/components/GameTable.tsx`, add near the top with the other imports:

```ts
import { Leaderboard } from './Leaderboard'
```

Add state inside the `GameTable` component (near its other hooks):

```ts
  const [showBoard, setShowBoard] = useState(false)
```

(If `useState` isn't already imported in this file, add it to the existing `react` import.)

Pass the prop to the `<WinScreen ... />` at line 138 — add `onLeaderboard={() => setShowBoard(true)}`. Then render the modal alongside `WinScreen`:

```tsx
        {showBoard && (
          <Leaderboard onClose={() => setShowBoard(false)} />
        )}
```

- [ ] **Step 3: Verify**

Run: `npx tsc -b` (expect no errors). If a solo match is easy to finish in dev, confirm the button appears on the win modal and opens the board.

- [ ] **Step 4: Commit**

```bash
git add src/components/WinScreen.tsx src/components/GameTable.tsx
git commit -m "feat(leaderboard): view leaderboard from win screen"
```

---

## Task 8: Supabase SQL + docs

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document setup in the README**

Add a "Leaderboard" subsection under Development in `README.md`:

````markdown
### Global leaderboard (optional)

The setup screen's 🏆 Leaderboard reads from a Supabase project. Without
configuration it shows "not configured" and the game works normally.

To enable it:

1. Create a free Supabase project and run this in the SQL editor:

   ```sql
   create table match_results (
     id uuid primary key default gen_random_uuid(),
     player_name text not null,
     won boolean not null,
     points int,
     mode text default 'solo',
     created_at timestamptz default now()
   );

   create view leaderboard as
   select player_name,
          count(*) filter (where won) as wins,
          count(*) as games
   from match_results
   group by player_name;

   alter table match_results enable row level security;
   create policy "anon insert" on match_results for insert to anon with check (true);
   grant select on leaderboard to anon;
   ```

2. Copy `.env.example` to `.env` and fill in `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY` from Settings → API.
3. `npm run build` / `npm run deploy` bakes them into the bundle.

There is no authentication or anti-cheat: any client can submit results.
````

- [ ] **Step 2: Full verification**

Run: `npm test && npm run build`
Expected: all tests pass, build succeeds.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(leaderboard): Supabase setup instructions"
```

---

## Manual end-to-end (after author supplies Supabase keys)

1. Run the SQL from Task 8 in a real Supabase project.
2. Put the URL + anon key in `.env`.
3. `npm run dev`, finish a solo match, then open the leaderboard — your name should appear with 1 game.
4. Confirm a losing solo match also records a game (won = false).
