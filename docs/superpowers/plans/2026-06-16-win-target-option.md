# Selectable Win Target Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let players choose the match win target (150 / 300 / 500, default 500) in single-player and online-host games.

**Architecture:** Replace the hardcoded `TARGET_SCORE` constant with a per-game `GameState.targetScore`, set from a new setting via `initGame` (default 500). The engine reducer, win screen, and leaderboard read `state.targetScore`; the value threads through solo settings and the multiplayer host config, and reaches guests automatically via the redacted state.

**Tech Stack:** React 19, TypeScript, Vite, Vitest.

---

## File Structure

- **Modify** `src/engine/types.ts` — add `targetScore` to `GameState` & `GameConfig`; add `TARGET_SCORES`.
- **Modify** `src/engine/game.ts` — `initGame` sets `targetScore`; reducer reads `state.targetScore`.
- **Modify** `src/engine/game.test.ts` — update the `makeState` helper; add target tests.
- **Modify** `src/components/WinScreen.tsx` — read `state.targetScore`.
- **Modify** `src/net/leaderboard.ts` — `matchResultFor` reads `state.targetScore`.
- **Modify** `src/hooks/useGame.ts` — `GameSettings.targetScore`; pass to `initGame`.
- **Modify** `src/storage.ts` — `DEFAULT_SETTINGS.targetScore`.
- **Modify** `src/net/host.ts` — `HostConfig.targetScore`; pass to `initGame` (start + restart).
- **Modify** `src/App.tsx` — pass `targetScore` into the `useHostGame` config.
- **Modify** `src/save.ts` — bump `SAVE_VERSION` to 2.
- **Modify** `src/components/SetupScreen.tsx` — the "First to" selector.

React components are not unit-tested in this codebase; the win screen and selector are verified by running the dev server.

---

## Task 1: Per-game `targetScore` in the engine

**Files:**
- Modify: `src/engine/types.ts`
- Modify: `src/engine/game.ts:59-75` (initGame state literal) and `src/engine/game.ts:270` (reducer)
- Test: `src/engine/game.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/engine/game.test.ts`, add a `targetScore` field to the `StateOptions` interface (around line 12) so it reads:

```ts
interface StateOptions {
  hands: Card[][]
  top: Card
  currentColor?: GameState['currentColor']
  rules?: Partial<HouseRules>
  currentPlayer?: number
  direction?: 1 | -1
  drawPile?: Card[]
  scores?: number[]
  targetScore?: number
}
```

Add this test inside the existing `describe('initGame')` block:

```ts
  it('defaults targetScore to 500 and honors an explicit value', () => {
    expect(initGame({ playerName: 'A', botCount: 1, rules: DEFAULT_RULES }).targetScore).toBe(500)
    expect(
      initGame({ playerName: 'A', botCount: 1, rules: DEFAULT_RULES, targetScore: 150 }).targetScore,
    ).toBe(150)
  })
```

Add these tests inside the `describe('winning')` block (next to the existing
"distinguishes roundOver from matchOver" test):

```ts
  it('ends the match at a custom target score', () => {
    const winning = card('red', 5)
    const state = makeState({
      hands: [[winning], [card(null, 'wild4')]],
      top: card('red', 9),
      scores: [120, 0],
      targetScore: 150,
    })
    const next = gameReducer(state, { type: 'PLAY_CARD', playerId: 0, cardId: winning.id })
    expect(next.events[next.events.length - 1].kind).toBe('matchOver')
  })

  it('stays a round win below the default 500 target', () => {
    const winning = card('red', 5)
    const state = makeState({
      hands: [[winning], [card(null, 'wild4')]],
      top: card('red', 9),
      scores: [160, 0],
    })
    const next = gameReducer(state, { type: 'PLAY_CARD', playerId: 0, cardId: winning.id })
    expect(next.events[next.events.length - 1].kind).toBe('roundOver')
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- game.test`
Expected: FAIL — `targetScore` is not a property of the state literal in `makeState` (TS error) / the new tests don't compile because `targetScore` isn't on `GameState` yet.

- [ ] **Step 3: Add the type fields and constant**

In `src/engine/types.ts`, add to the `GameState` interface (after the `scores` field, before `seed`):

```ts
  /** match points needed to win; carried per game so it can vary by setting */
  targetScore: number
```

Add to the `GameConfig` interface (after `scores?`):

```ts
  /** match points needed to win; defaults to 500 when omitted */
  targetScore?: number
```

After `export const TARGET_SCORE = 500`, add:

```ts
/** Selectable match targets offered on the setup screen */
export const TARGET_SCORES = [150, 300, 500] as const
```

- [ ] **Step 4: Set it in `initGame` and read it in the reducer**

In `src/engine/game.ts`, in the `initGame` state literal (after `scores: config.scores ?? seats.map(() => 0),`), add:

```ts
    targetScore: config.targetScore ?? TARGET_SCORE,
```

At `src/engine/game.ts:270`, change the event kind line from:

```ts
          kind: state.scores[playerId] >= TARGET_SCORE ? 'matchOver' : 'roundOver',
```

to:

```ts
          kind: state.scores[playerId] >= state.targetScore ? 'matchOver' : 'roundOver',
```

`TARGET_SCORE` is still imported and used (as the `initGame` default), so leave the import.

- [ ] **Step 5: Update the test helper**

In `src/engine/game.test.ts`, in `makeState`, add to the returned object (after `scores: opts.scores ?? opts.hands.map(() => 0),`):

```ts
    targetScore: opts.targetScore ?? TARGET_SCORE,
```

Add `TARGET_SCORE` to the existing import from `./types` at the top of the test file (it already imports `DEFAULT_RULES`; add `TARGET_SCORE` alongside).

- [ ] **Step 6: Run tests**

Run: `npm test -- game.test`
Expected: PASS — the new tests plus all existing engine tests.

Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/engine/types.ts src/engine/game.ts src/engine/game.test.ts
git commit -m "feat(target): per-game targetScore in the engine"
```

---

## Task 2: Win screen and leaderboard read `state.targetScore`

**Files:**
- Modify: `src/components/WinScreen.tsx`
- Modify: `src/net/leaderboard.ts`

- [ ] **Step 1: Update the win screen**

In `src/components/WinScreen.tsx`:

Change the import on line 2 from:

```ts
import { TARGET_SCORE, type GameState } from '../engine/types'
```

to:

```ts
import type { GameState } from '../engine/types'
```

Change the `matchOver` line (around line 19) from:

```ts
  const matchOver = state.scores[winner.id] >= TARGET_SCORE
```

to:

```ts
  const matchOver = state.scores[winner.id] >= state.targetScore
```

Change the "first to N" text (around line 39) from:

```tsx
          {winner.name} scores {roundPoints} points{matchOver ? '' : ` — first to ${TARGET_SCORE} wins`}
```

to:

```tsx
          {winner.name} scores {roundPoints} points{matchOver ? '' : ` — first to ${state.targetScore} wins`}
```

- [ ] **Step 2: Update `matchResultFor`**

In `src/net/leaderboard.ts`, change the import on line 1 from:

```ts
import { TARGET_SCORE, type GameState } from '../engine/types'
```

to:

```ts
import type { GameState } from '../engine/types'
```

In `matchResultFor`, change:

```ts
  const matchOver = state.phase === 'roundOver' && state.scores.some((s) => s >= TARGET_SCORE)
  if (!matchOver) return null
  return {
    playerName,
    won: state.scores[0] >= TARGET_SCORE,
```

to:

```ts
  const matchOver = state.phase === 'roundOver' && state.scores.some((s) => s >= state.targetScore)
  if (!matchOver) return null
  return {
    playerName,
    won: state.scores[0] >= state.targetScore,
```

- [ ] **Step 3: Run tests and type-check**

Run: `npm test && npx tsc -b`
Expected: all pass (the existing `matchResultFor` tests use `initGame`-derived state, which now defaults `targetScore` to 500, so they still cross 500 and behave identically), `tsc` exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/components/WinScreen.tsx src/net/leaderboard.ts
git commit -m "feat(target): win screen and leaderboard use state.targetScore"
```

---

## Task 3: Thread the setting through solo, persistence, multiplayer, and saves

**Files:**
- Modify: `src/hooks/useGame.ts`
- Modify: `src/storage.ts`
- Modify: `src/net/host.ts`
- Modify: `src/App.tsx`
- Modify: `src/save.ts`

- [ ] **Step 1: `GameSettings` + pass to `initGame`**

In `src/hooks/useGame.ts`, add to the `GameSettings` interface (after `rules: HouseRules`):

```ts
  /** match points needed to win (150 / 300 / 500) */
  targetScore: number
```

In `useGame`, in the `initGame({ ... })` call inside the reducer initializer, add `targetScore`:

```ts
        : initGame({
            playerName: settings.playerName,
            botCount: settings.botCount,
            rules: settings.rules,
            scores: settings.scores,
            targetScore: settings.targetScore,
          }),
```

- [ ] **Step 2: Default in storage**

In `src/storage.ts`, add `targetScore` to `DEFAULT_SETTINGS`. It already imports from `./engine/types`; import `TARGET_SCORE` there and set:

```ts
import { DEFAULT_RULES, TARGET_SCORE } from './engine/types'
```

```ts
export const DEFAULT_SETTINGS: GameSettings = {
  playerName: '',
  botCount: 3,
  difficulty: 'medium',
  rules: DEFAULT_RULES,
  targetScore: TARGET_SCORE,
}
```

(The `loadSettings`/`saveSettings` logic needs no other change — it spreads the whole
settings object, so `targetScore` persists automatically.)

- [ ] **Step 3: Host config**

In `src/net/host.ts`, add to the `HostConfig` interface (after `rules: HouseRules`):

```ts
  targetScore: number
```

In `startGame`, change:

```ts
    this.state = initGame({ seats, rules: this.config.rules })
```

to:

```ts
    this.state = initGame({ seats, rules: this.config.rules, targetScore: this.config.targetScore })
```

In `restart`, change:

```ts
    this.state = initGame({
      seats,
      rules: this.config.rules,
      scores: resetScores ? undefined : this.state.scores,
    })
```

to:

```ts
    this.state = initGame({
      seats,
      rules: this.config.rules,
      scores: resetScores ? undefined : this.state.scores,
      targetScore: this.config.targetScore,
    })
```

- [ ] **Step 4: Pass it from `App.tsx`**

In `src/App.tsx`, in `HostScreen`, add `targetScore` to the `useHostGame({ ... })` config:

```ts
  const host = useHostGame({
    hostName: settings.playerName,
    botCount: settings.botCount,
    difficulty: settings.difficulty,
    rules: settings.rules,
    targetScore: settings.targetScore,
  })
```

(`LocalGame` already forwards the full `settings` object to `useGame`, so single-player
needs no change here.)

- [ ] **Step 5: Bump the save version**

In `src/save.ts`, change:

```ts
export const SAVE_VERSION = 1
```

to:

```ts
export const SAVE_VERSION = 2
```

- [ ] **Step 6: Type-check and test**

Run: `npx tsc -b && npm test`
Expected: `tsc` exit 0; all tests pass. (`save.test.ts` references the `SAVE_VERSION`
constant rather than a literal, so the bump keeps it green.)

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useGame.ts src/storage.ts src/net/host.ts src/App.tsx src/save.ts
git commit -m "feat(target): thread targetScore through settings, host, and saves"
```

---

## Task 4: "First to" selector on the setup screen

**Files:**
- Modify: `src/components/SetupScreen.tsx`

No unit test (React component — verified via dev server).

- [ ] **Step 1: Import the options and add state**

In `src/components/SetupScreen.tsx`:

Add `TARGET_SCORES` to the import from `../engine/types`. The file currently imports types
from there; ensure the import line includes it, e.g.:

```ts
import { TARGET_SCORES, type Difficulty, type HouseRules } from '../engine/types'
```

(If the existing import is `import type { Difficulty, HouseRules } from '../engine/types'`,
replace it with the line above so the value `TARGET_SCORES` is imported alongside the types.)

Add state next to the other `useState` hooks in `SetupScreen`:

```ts
  const [targetScore, setTargetScore] = useState(initial.targetScore)
```

- [ ] **Step 2: Include it in the settings object**

In the `settings` object built in the component, add `targetScore`:

```ts
  const settings: GameSettings = {
    playerName: name.trim() || 'You',
    botCount,
    difficulty,
    rules,
    targetScore,
  }
```

- [ ] **Step 3: Render the selector**

Inside the `mode !== 'join'` block, after the Difficulty `setup-field` and before the
House rules `setup-field`, add:

```tsx
            <div className="setup-field">
              <span>First to</span>
              <div className="setup-options">
                {TARGET_SCORES.map((n) => (
                  <button
                    key={n}
                    className={n === targetScore ? 'option selected' : 'option'}
                    onClick={() => setTargetScore(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
```

- [ ] **Step 4: Verify**

Run: `npx tsc -b`
Expected: exit 0.

Run: `npm run lint`
Expected: no NEW errors in `SetupScreen.tsx` (pre-existing errors in other files are
unrelated and must not be touched).

Run: `npm run dev`, open the app. Confirm the "First to" row shows 150 / 300 / 500 with 500
selected by default, that selecting 150 then starting a single-player game ends the match at
150 (the win screen reads "first to 150"), and that the choice is remembered after a reload.

- [ ] **Step 5: Commit**

```bash
git add src/components/SetupScreen.tsx
git commit -m "feat(target): First to 150/300/500 selector on the setup screen"
```

---

## Manual end-to-end

1. Single-player → "First to 150" → play to 150; the win screen shows the match-over copy.
2. Reload the page; "First to 150" is still selected.
3. Host an online room with "First to 300"; a guest's win screen shows the 300 target and the
   match ends at 300 for both players.
