# Realtime Live Leaderboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the open 🏆 Leaderboard modal re-rank itself live (with a row-flash and a `● Live` badge) whenever any player finishes a match.

**Architecture:** Subscribe to Supabase Realtime `INSERT`s on the `match_results` table while the modal is open; on each event re-fetch the `leaderboard` view and diff it to animate changed rows. The view stays the source of truth (no client-side aggregation). Realtime uses the Supabase SDK client (`supabase()`); reads stay on the existing `fetch` path.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, `@supabase/supabase-js` (Realtime + PostgREST), Supabase Postgres.

---

## File Structure

- **Modify** `src/net/leaderboard.ts` — add `changedPlayers` (pure diff helper) and `subscribeToResults` (SDK realtime channel). The module's single responsibility (talking to the leaderboard backend) is unchanged.
- **Modify** `src/net/leaderboard.test.ts` — unit tests for both additions.
- **Modify** `src/components/Leaderboard.tsx` — initial load + live subscription, flash state, `● Live` badge.
- **Modify** `src/components/table.css` — `row-flash` keyframes + `live-badge` style.
- **Modify** `docs/supabase-setup.sql` — add `match_results` to the realtime publication (idempotent).
- **Modify** `README.md` — note the realtime enablement step.

The component is not unit-tested (this codebase tests only `net`/engine logic, not React components). Its behavior is verified by running the dev server.

---

## Task 1: `changedPlayers` diff helper

**Files:**
- Modify: `src/net/leaderboard.ts`
- Test: `src/net/leaderboard.test.ts`

- [ ] **Step 1: Write the failing test**

Add `changedPlayers` to the existing import from `./leaderboard` at the top of `src/net/leaderboard.test.ts`, then add this block:

```ts
import type { LeaderboardRow } from './leaderboard'

describe('changedPlayers', () => {
  const base: LeaderboardRow[] = [
    { player_name: 'Ada', wins: 2, games: 3 },
    { player_name: 'Bob', wins: 1, games: 4 },
  ]

  it('returns nothing when prev and next match', () => {
    expect(changedPlayers(base, base)).toEqual([])
  })

  it('detects a brand-new player', () => {
    const next = [...base, { player_name: 'Cy', wins: 1, games: 1 }]
    expect(changedPlayers(base, next)).toEqual(['Cy'])
  })

  it('detects an increased win count', () => {
    const next = [{ player_name: 'Ada', wins: 3, games: 4 }, base[1]]
    expect(changedPlayers(base, next)).toEqual(['Ada'])
  })

  it('detects an increased games count with same wins', () => {
    const next = [base[0], { player_name: 'Bob', wins: 1, games: 5 }]
    expect(changedPlayers(base, next)).toEqual(['Bob'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- leaderboard`
Expected: FAIL — `changedPlayers` is not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `src/net/leaderboard.ts` (after `fetchLeaderboard`):

```ts
/** player_names in `next` that are new or whose wins/games differ from `prev`. */
export function changedPlayers(prev: LeaderboardRow[], next: LeaderboardRow[]): string[] {
  const before = new Map(prev.map((r) => [r.player_name, r]))
  const changed: string[] = []
  for (const row of next) {
    const old = before.get(row.player_name)
    if (!old || old.wins !== row.wins || old.games !== row.games) {
      changed.push(row.player_name)
    }
  }
  return changed
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- leaderboard`
Expected: PASS (4 new tests).

- [ ] **Step 5: Commit**

```bash
git add src/net/leaderboard.ts src/net/leaderboard.test.ts
git commit -m "feat(realtime): changedPlayers diff helper"
```

---

## Task 2: `subscribeToResults` realtime channel

**Files:**
- Modify: `src/net/leaderboard.ts`
- Test: `src/net/leaderboard.test.ts`

- [ ] **Step 1: Write the failing test**

At the top of `src/net/leaderboard.test.ts`, add the SDK mock and import (place `vi.mock` near the other top-level imports — Vitest hoists it):

```ts
import { supabase } from './supabase'

vi.mock('./supabase', () => ({ supabase: vi.fn() }))
```

Add `vi.clearAllMocks()` to the existing `afterEach` so the mock's call history resets between tests:

```ts
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})
```

Add `subscribeToResults` to the import from `./leaderboard`, then add this block:

```ts
describe('subscribeToResults', () => {
  it('returns a callable no-op when unconfigured and never touches the SDK', () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    const unsub = subscribeToResults(() => {})
    expect(typeof unsub).toBe('function')
    expect(() => unsub()).not.toThrow()
    expect(supabase).not.toHaveBeenCalled()
  })

  it('subscribes to match_results inserts and unsubscribes via removeChannel', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')

    const channel = {
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    }
    const removeChannel = vi.fn()
    const client = { channel: vi.fn().mockReturnValue(channel), removeChannel }
    vi.mocked(supabase).mockReturnValue(client as never)

    const onInsert = vi.fn()
    const onStatus = vi.fn()
    const unsub = subscribeToResults(onInsert, onStatus)

    expect(client.channel).toHaveBeenCalledWith('leaderboard-results')
    expect(channel.on).toHaveBeenCalledWith(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'match_results' },
      expect.any(Function),
    )

    // fire the insert handler (3rd arg of .on) → onInsert called
    const insertHandler = channel.on.mock.calls[0][2] as () => void
    insertHandler()
    expect(onInsert).toHaveBeenCalledTimes(1)

    // fire the subscribe status callback → onStatus(true) on SUBSCRIBED
    const statusCb = channel.subscribe.mock.calls[0][0] as (s: string) => void
    statusCb('SUBSCRIBED')
    expect(onStatus).toHaveBeenCalledWith(true)

    unsub()
    expect(removeChannel).toHaveBeenCalledWith(channel)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- leaderboard`
Expected: FAIL — `subscribeToResults` is not exported.

- [ ] **Step 3: Write minimal implementation**

Add the import at the TOP of `src/net/leaderboard.ts` (with the other imports):

```ts
import { supabase } from './supabase'
```

Add the function (after `changedPlayers`):

```ts
/**
 * Live-subscribe to new match results. Calls `onInsert` on every inserted row and
 * `onStatus(connected)` as the channel connects/disconnects. Returns an unsubscribe
 * function. No-op (returns a callable that does nothing) when Supabase isn't configured.
 */
export function subscribeToResults(
  onInsert: () => void,
  onStatus?: (connected: boolean) => void,
): () => void {
  if (!isConfigured()) return () => {}
  const channel = supabase()
    .channel('leaderboard-results')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'match_results' },
      () => onInsert(),
    )
    .subscribe((status) => onStatus?.(status === 'SUBSCRIBED'))
  return () => {
    supabase().removeChannel(channel)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- leaderboard`
Expected: PASS (2 new tests). Then run the full suite and type-check:

Run: `npm test && npx tsc -b`
Expected: all pass, `tsc` exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/net/leaderboard.ts src/net/leaderboard.test.ts
git commit -m "feat(realtime): subscribeToResults channel"
```

---

## Task 3: Live updates + flash + badge in the Leaderboard component

**Files:**
- Modify: `src/components/Leaderboard.tsx`
- Modify: `src/components/table.css`

No unit test (React component — verified via dev server).

- [ ] **Step 1: Replace the component body**

Replace the entire contents of `src/components/Leaderboard.tsx` with:

```tsx
import { useEffect, useRef, useState } from 'react'
import {
  changedPlayers,
  fetchLeaderboard,
  isConfigured,
  subscribeToResults,
  type LeaderboardRow,
} from '../net/leaderboard'

interface LeaderboardProps {
  /** highlight this player's row */
  currentName?: string
  onClose: () => void
}

type Status = 'loading' | 'ready' | 'error' | 'disabled'

function sortRows(data: LeaderboardRow[]): LeaderboardRow[] {
  return [...data].sort((a, b) => b.wins - a.wins || a.games - b.games)
}

export function Leaderboard({ currentName, onClose }: LeaderboardProps) {
  const [rows, setRows] = useState<LeaderboardRow[]>([])
  const [status, setStatus] = useState<Status>(() =>
    isConfigured() ? 'loading' : 'disabled',
  )
  const [live, setLive] = useState(false)
  const [flashing, setFlashing] = useState<Set<string>>(new Set())
  const rowsRef = useRef<LeaderboardRow[]>([])
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    rowsRef.current = rows
  }, [rows])

  useEffect(() => {
    if (!isConfigured()) return
    let active = true

    const flash = (names: string[]) => {
      setFlashing(new Set(names))
      if (flashTimer.current) clearTimeout(flashTimer.current)
      flashTimer.current = setTimeout(() => {
        if (active) setFlashing(new Set())
      }, 1000)
    }

    const refresh = (isInitial: boolean) => {
      fetchLeaderboard()
        .then((data) => {
          if (!active) return
          const sorted = sortRows(data)
          // ignore a transient empty refetch when a populated board is already shown
          if (!isInitial && sorted.length === 0 && rowsRef.current.length > 0) return
          if (!isInitial) {
            const changed = changedPlayers(rowsRef.current, sorted)
            if (changed.length > 0) flash(changed)
          }
          setRows(sorted)
          setStatus('ready')
        })
        .catch(() => {
          if (active && isInitial) setStatus('error')
        })
    }

    refresh(true)
    const unsubscribe = subscribeToResults(
      () => refresh(false),
      (connected) => {
        if (active) setLive(connected)
      },
    )

    return () => {
      active = false
      if (flashTimer.current) clearTimeout(flashTimer.current)
      unsubscribe()
    }
  }, [])

  return (
    <div className="overlay">
      <div className="modal">
        <h2>
          🏆 Leaderboard
          {live && <span className="live-badge">● Live</span>}
        </h2>

        {status === 'loading' && <p className="setup-note">Loading…</p>}
        {status === 'disabled' && <p className="setup-note">The leaderboard isn't configured.</p>}
        {status === 'error' && <p className="setup-note">Couldn't reach the leaderboard.</p>}
        {status === 'ready' && rows.length === 0 && (
          <p className="setup-note">No games recorded yet — be the first!</p>
        )}

        {status === 'ready' && rows.length > 0 && (
          <table className="scoreboard">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Player</th>
                <th scope="col">Wins</th>
                <th scope="col">Games</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={r.player_name}
                  className={[
                    r.player_name === currentName ? 'score-winner' : '',
                    flashing.has(r.player_name) ? 'row-flash' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
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

- [ ] **Step 2: Add the CSS**

Append to `src/components/table.css` (after the `.scoreboard .score-winner td` rule near line 411):

```css
@keyframes lb-flash {
  from {
    background: rgba(255, 206, 0, 0.45);
  }
  to {
    background: transparent;
  }
}

.scoreboard .row-flash td {
  animation: lb-flash 1s ease-out;
}

.live-badge {
  margin-left: 8px;
  font-size: 12px;
  font-weight: 700;
  color: #4ade80;
  vertical-align: middle;
}
```

- [ ] **Step 3: Type-check, lint, and test**

Run: `npx tsc -b && npm test`
Expected: `tsc` exit 0; all tests pass (components have no tests, nothing should break).

Run: `npm run lint`
Expected: no NEW errors in `Leaderboard.tsx` (the ~24 pre-existing errors in other files are unrelated; do not touch them).

- [ ] **Step 4: Commit**

```bash
git add src/components/Leaderboard.tsx src/components/table.css
git commit -m "feat(realtime): live updates, row flash, and live badge in leaderboard"
```

---

## Task 4: Enable realtime in the backend setup docs

**Files:**
- Modify: `docs/supabase-setup.sql`
- Modify: `README.md`

- [ ] **Step 1: Add the publication statement to the SQL**

Append to the end of `docs/supabase-setup.sql`:

```sql
-- ---------------------------------------------------------------------------
-- Realtime: broadcast match_results inserts so the open leaderboard updates live.
-- Idempotent — only adds the table to the publication if it isn't already there.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'match_results'
  ) then
    alter publication supabase_realtime add table match_results;
  end if;
end $$;
```

- [ ] **Step 2: Note it in the README**

In `README.md`, in the "Backend setup (Supabase — optional)" section, after the numbered
list, add this paragraph:

```markdown
The leaderboard updates live while it's open via Supabase Realtime. The SQL above already
adds `match_results` to the `supabase_realtime` publication; for an existing project you can
instead enable it once in the dashboard under **Database → Replication**. Without it the
leaderboard still works — it just won't update until reopened.
```

- [ ] **Step 3: Verify the full build**

Run: `npm test && npm run build`
Expected: all tests pass, build succeeds.

- [ ] **Step 4: Commit**

```bash
git add docs/supabase-setup.sql README.md
git commit -m "docs(realtime): enable match_results in the realtime publication"
```

---

## Manual end-to-end (after merge, with Supabase configured)

1. Run the new SQL (or toggle Database → Replication for `match_results`).
2. Open the app in two browser windows; open the leaderboard in window B.
3. Finish a solo match in window A.
4. Window B re-ranks within ~1s, flashes the changed row, and shows the `● Live` badge.
