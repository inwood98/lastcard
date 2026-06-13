# Save Game — Design

**Date:** 2026-06-13
**Status:** Approved

## Goal

Let a solo player resume an in-progress single-player match after closing or
reloading the page. One auto-saved game at a time, restored exactly where it
was left.

Decisions made during brainstorming:

- **Scope:** solo (single-player vs bots) only. Multiplayer (host/guest) is
  host-authoritative P2P with no persistence/reconnection layer and is out of
  scope.
- **Save model:** auto-save to a single slot after every move. Starting a new
  game overwrites it.
- **Overwrite safety:** if an unfinished save exists, "Deal me in" first asks
  to confirm abandoning the game in progress. Resume is offered prominently on
  the menu.
- **Architecture:** snapshot the engine `GameState` (approach A), not an action
  journal or a generic multiplayer-ready session layer.

## Architecture

The engine `GameState` is already a flat, JSON-serializable object (pure
reducer, plain card objects, numeric `seed`) and self-describing: it carries
player names, hands, piles, rules, running `scores`, the shuffle `seed`, and
whose turn it is. A single `JSON.stringify(state)` therefore captures
everything needed to resume exactly. The only resume-relevant value *not* in
`GameState` is bot **difficulty** (a `BotDriver` setting), so the save stores it
alongside the state.

### 1. Persistence module — `src/save.ts`

A new file, sibling to `storage.ts`, kept separate because it is game-state I/O
rather than user preferences.

```ts
export interface SavedGame {
  version: number
  savedAt: number
  difficulty: Difficulty
  state: GameState
}
```

- Storage key: `uno-save`. `SAVE_VERSION` constant; bump it whenever the
  `GameState` shape changes, which invalidates older saves.
- `saveGame(state: GameState, difficulty: Difficulty): void` — serialize and
  write; swallow write failures (private mode), matching `storage.ts`.
- `loadSavedGame(): SavedGame | null` — read the key, hand the raw string to
  `parseSave`; if it returns `null`, clear the key and return `null`.
- `clearSavedGame(): void` — remove the key.
- `parseSave(raw: string | null): SavedGame | null` — **pure**: JSON-parse,
  require `version === SAVE_VERSION`, sanity-check that `state` has the expected
  shape (e.g. `players` array, `discardPile` array, numeric `currentPlayer`);
  return `null` on any failure so a stale or corrupt save can never crash a
  resume.
- `settingsFromSave(save: SavedGame): GameSettings` — **pure**: reconstruct
  `playerName` (`state.players[0].name`), `botCount`
  (`state.players.length - 1`), `rules` (`state.rules`), `scores`
  (`state.scores`), and `difficulty` (from the save), so the match can continue
  into later rounds through the existing `initGame` path.

### 2. Auto-save — `useGame`

The auto-save effect lives in `useGame` (the solo hook). `useHostGame` and
`useGuestGame` are untouched, so the feature is automatically scoped to solo.

- `useGame(settings, initialState?)` — when `initialState` is provided, the
  reducer initializes from a clone of it instead of calling `initGame`;
  `settings.difficulty` still drives the bot driver.
- An effect keyed on `state` runs after every change:
  - If the **match is over** — `state.phase === 'roundOver'` and some score has
    reached `TARGET_SCORE` — call `clearSavedGame()` so a finished match never
    lingers as resumable.
  - Otherwise call `saveGame(state, settings.difficulty)`.

This spans rounds naturally: each round remounts `useGame` (the existing
`key={round}` flow in `App`), and the new round's state — carrying scores —
overwrites the save. Mid-match resume keeps the running score because it lives
in `state.scores`.

### 3. Resume flow — `App.tsx` + `SetupScreen`

- On load, `App` reads `loadSavedGame()` once into state.
- `SetupScreen` shows a **Resume game** entry when a save exists, with a
  one-line summary derived from the saved state (e.g. "Round in progress —
  3 bots, you have 5 cards").
- **Resume** enters a `single` screen seeded from the save: the saved state is
  passed as `initialState` for the **first** round only; "next round" remounts
  normally through `initGame` with carried scores. Resume logic thus touches
  exactly one mount and leaves the rest of the existing round flow unchanged.
- **Deal me in** with an unfinished save present shows a confirm dialog
  ("Abandon your game in progress?"). On confirm, the normal setup proceeds and
  its first auto-save overwrites the slot — no explicit clear needed.
- "End game" from the in-game menu returns to the menu but leaves the save in
  place, so quitting to the menu is itself a valid "save and resume later". The
  save clears only on match completion or explicit overwrite.

## Error handling

- Corrupt or old-version save: `parseSave` returns `null`, `loadSavedGame`
  clears the key — Resume is simply not offered.
- `localStorage` unavailable (private mode): writes are swallowed; the game
  plays normally without persistence.
- `GameState` is JSON-safe (no Maps/Sets/functions); the module-level FX anchor
  registry is not part of `GameState` and is not persisted.

## Testing

- **Unit tests** (`src/save.test.ts`, Vitest) for the pure functions, no
  localStorage required:
  - `parseSave`: round-trips a valid save; returns `null` on version mismatch,
    malformed JSON, and missing/wrong-shaped `state`.
  - `settingsFromSave`: reconstructs `playerName`, `botCount`, `rules`,
    `scores`, and `difficulty` from a sample `SavedGame` built with `initGame`.
- **Browser verification** (preview): play a few solo moves, reload, confirm
  Resume appears with the right summary and restores the exact position (hand,
  scores, current player, top card); finish a match and confirm the save clears
  and Resume disappears; with a save present, confirm the overwrite dialog on
  "Deal me in"; quit via "End game" and confirm Resume is still offered.

## Out of scope

- Saving host or guest (multiplayer) games.
- Multiple save slots, named saves, or manual checkpoints.
- Cross-device/cloud sync.
