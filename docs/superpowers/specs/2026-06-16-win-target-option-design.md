# Selectable Win Target (150 / 300 / 500) — Design

**Date:** 2026-06-16
**Status:** Approved design, pending implementation plan

## Goal

Let players choose the match win target — **150, 300, or 500 points** — instead of the
fixed 500. The setting is available in single-player and when hosting an online room (the
host's choice applies to the whole table; guests inherit it). 500 stays the default.

## Non-goals

- Changing how the leaderboard counts wins. A win counts the same regardless of target
  (the user's explicit choice). No schema or submit-logic changes.
- Per-round or mid-match changes to the target. It is fixed for the life of a match.
- A free-form / custom number. Only the three preset values.
- Letting guests pick the target (they inherit the host's).

## Background

`TARGET_SCORE = 500` is a module constant in `src/engine/types.ts` (line 107), read in
three places:
- `src/engine/game.ts:270` — decides `matchOver` vs `roundOver` when a round is won.
- `src/components/WinScreen.tsx` — the match-over check and the "first to N" text.
- `src/net/leaderboard.ts` (`matchResultFor`) — the win / match-over decision.

The core change is moving this from a constant to a per-game value carried on `GameState`,
set from a new setting and defaulting to 500. All three readers switch to `state.targetScore`.

## Architecture / changes

### Engine — `src/engine/types.ts`, `src/engine/game.ts`

- Add `targetScore: number` to the `GameState` interface and to `GameConfig`.
- Add `export const TARGET_SCORES = [150, 300, 500] as const` for the UI to map over.
- Keep `export const TARGET_SCORE = 500` as the default value (used by `initGame` and
  `DEFAULT_SETTINGS`).
- `initGame` sets `targetScore: config.targetScore ?? TARGET_SCORE` on the new state.
- The reducer's round-resolution branch (`game.ts:270`) uses
  `state.scores[playerId] >= state.targetScore` instead of the constant.

### Consumers — `src/components/WinScreen.tsx`, `src/net/leaderboard.ts`

- `WinScreen`: replace `TARGET_SCORE` with `state.targetScore` in both the `matchOver`
  computation and the "first to {N} wins" text; drop the `TARGET_SCORE` import.
- `leaderboard.ts` `matchResultFor`: replace `TARGET_SCORE` with `state.targetScore` in the
  `matchOver` check and the `won` computation; drop the `TARGET_SCORE` import. Submission is
  otherwise unchanged.

### Settings & persistence — `src/hooks/useGame.ts`, `src/storage.ts`

- Add `targetScore: number` to the `GameSettings` interface.
- `useGame`'s reducer-init passes `targetScore: settings.targetScore` into `initGame`.
- `DEFAULT_SETTINGS.targetScore = TARGET_SCORE` (500). It persists automatically — `saveSettings`
  already stores the whole settings object minus `scores`, so no change to the persistence
  logic is required beyond the default.

### Setup UI — `src/components/SetupScreen.tsx`

- Add a **"First to"** selector rendered under the same `mode !== 'join'` condition as bot
  count and difficulty (so it shows for single-player and host, hidden on the join form).
- Three option buttons from `TARGET_SCORES` (150 / 300 / 500), styled with the existing
  `option` / `option selected` classes, backed by a `targetScore` `useState` seeded from
  `initial.targetScore`. Include it in the `settings` object passed to `onStart`.

### Multiplayer — `src/net/host.ts`, `src/hooks/useHostGame.ts`, `src/App.tsx`

- `HostConfig` (host.ts) gains `targetScore: number`.
- `HostSession` passes `targetScore: this.config.targetScore` into `initGame` in **both**
  `startGame` and `restart`.
- `App.tsx` `HostScreen` includes `targetScore: settings.targetScore` when building the
  `useHostGame` config (alongside `rules`, `difficulty`, etc.).
- No protocol or redaction change: `redactState` spreads `...state`, so `targetScore` reaches
  guests, and the guest `WinScreen` reads it. `LocalGame` already forwards `settings` to
  `useGame`, so single-player picks it up for free.

### Saved games — `src/save.ts`

- Bump `SAVE_VERSION` from 1 to 2. A pre-update save lacks `targetScore`; resuming it would
  leave `state.targetScore` undefined and the match could never end (`score >= undefined` is
  always false). Bumping the version makes `parseSave` reject those old saves cleanly (the
  player starts a fresh game) rather than risking a broken match. Solo saves are transient, so
  the cost is negligible.

## Testing

`src/engine/game.test.ts`:
- A match created with `targetScore: 150` emits a `matchOver` event (not `roundOver`) when a
  seat's total reaches 150 on a round win.
- A match created without an explicit `targetScore` defaults to 500: reaching ~160 still
  produces `roundOver`, and only crossing 500 produces `matchOver`.

The existing `matchResultFor` tests in `src/net/leaderboard.test.ts` continue to pass without
change, because their fixtures come from `initGame` (which now defaults `targetScore` to 500)
and use scores that cross 500.

The win-screen text and the setup selector are verified by running the dev server (this
codebase does not unit-test React components).

## Manual verification

1. Single-player: pick "First to 150", play; the match ends at 150 and the win screen reads
   "first to 150".
2. The choice persists after closing and reopening the app.
3. Host an online room with "First to 300"; a joining guest's win screen shows the 300 target
   and the match ends at 300 for everyone.
