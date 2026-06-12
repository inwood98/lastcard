# Sound & Animation FX Layer — Design

**Date:** 2026-06-12
**Status:** Approved

## Goal

Add synthesized sound effects and a full animation package (card flight, deal,
reverse spin, wild color flash, win confetti) to Last Card!, working identically
in solo, host, and guest modes, with user toggles for sound and animations.

Decisions made during brainstorming:

- **Sound source:** synthesized via Web Audio API — no audio asset files.
- **Scope:** SFX only, no background music.
- **Animations:** full package (card flight, deal animation, reverse spin,
  wild flash, confetti), not just core moves.
- **Architecture:** structured FX events emitted by the engine (approach A),
  not UI-side state diffing or dispatch middleware.

## Architecture

The engine's existing `events: GameEvent[]` log becomes the single source of
truth for FX. Events already ride inside every `GameState` snapshot, including
the redacted views sent to guests, so no protocol changes are needed.

### 1. Engine — structured events

`GameEvent` (in `src/engine/types.ts`) gains a machine-readable kind and a
small payload while keeping the human-readable `text`:

```ts
interface GameEvent {
  id: number
  text: string
  kind:
    | 'play'        // a card was played
    | 'draw'        // player drew card(s)
    | 'skip'        // a player was skipped
    | 'reverse'     // direction changed
    | 'wildColor'   // a wild color was chosen
    | 'uno'         // "Last card!" called
    | 'caught'      // caught without calling last card
    | 'penalty'     // pending draw penalty taken
    | 'challenge'   // wild-draw-four challenge resolved
    | 'reshuffle'   // discard reshuffled into draw pile
    | 'roundOver'   // round won
    | 'matchOver'   // match (500 pts) won
    | 'info'        // everything else (existing text-only events)
  playerId?: number // who acted
  cardId?: number   // card played, so the UI can animate that exact card
  count?: number    // number of cards drawn
  color?: Color     // chosen wild color
}
```

- Every existing `addEvent(state, text)` call site supplies the appropriate
  kind + payload.
- Moments that currently emit no event but need FX (a plain number-card play,
  a normal single draw) gain events. To keep the ticker looking unchanged,
  routine events may carry empty `text`, and the ticker ignores events with no
  text.
- `MAX_EVENTS` trimming behavior is unchanged.
- Engine tests (`game.test.ts`) extend to assert kinds and payloads.

### 2. FX core — `src/fx/`

**`sounds.ts`** — Web Audio synth, no assets (~150 lines):

- One `AudioContext`, lazily created/resumed on first user gesture.
- One function per effect: card swish (filtered noise burst), draw tick, skip
  blip, reverse sweep, draw2/draw4 thuds, wild arpeggio, "Last card!" two-tone
  sting, caught-you buzz, round-win fanfare, match-win bigger fanfare.
- A module-level enabled flag set from settings.

**`useGameFx.ts`** — hook used by `GameTable`:

- Tracks the last-seen event id; on each state change processes only newer
  events, triggering the sound for each kind and pushing animation cues to the
  overlay.
- On mount mid-game (e.g. a guest joining) it fast-forwards the last-seen id
  without playing anything.
- The kind→effect mapping and last-seen-id logic live in a pure function so
  they are unit-testable without audio or DOM.

### 3. Animations — FX overlay + position registry

- **`FxOverlay.tsx`**: absolutely-positioned layer over the table rendering
  transient flying cards with the Web Animations API.
- **Position registry**: a lightweight map from anchor keys to DOM rects.
  Components register refs for: each opponent seat (by player id), the
  viewer's hand, the draw pile, and the discard pile.
- **`play` event**: a clone card flies from the actor's anchor to the discard
  pile — face-up for the viewer's own card; a card-back flipping to face-up
  mid-flight for opponents.
- **`draw` event**: card-back(s) fly draw pile → actor, staggered when
  `count > 1`.
- **Flourishes**: round-start deal (staggered card-backs from the deck to
  every seat), direction-spin badge on `reverse`, table tint flash on
  `wildColor`, CSS-particle confetti burst on `roundOver`/`matchOver`
  (no library).
- **`prefers-reduced-motion`**: flights, deal, and confetti are skipped;
  sounds still play.

### 4. Settings & UI

- `GameSettings` gains `sound: boolean` and `animations: boolean`, both
  defaulting to `true`. The existing spread-merge in `storage.ts` means old
  saved settings inherit the defaults.
- `GameMenu` gains the two toggles; the table gets a one-tap mute icon.

### 5. Testing

- Engine: event kinds/payloads asserted in `game.test.ts`.
- FX: pure event-consumption logic (last-seen-id tracking, fast-forward on
  join, kind→effect mapping) unit-tested with Vitest.
- Synth output and overlay animations verified manually in the browser
  preview (solo and a two-tab host/guest session).

## Error handling

- Audio: if `AudioContext` is unavailable or blocked, sounds silently no-op.
- Animations: if an anchor rect is missing (element unmounted, unknown player),
  the flight is skipped — game state rendering never depends on the overlay.
- Guests joining mid-game or receiving coalesced snapshots only ever replay
  events with ids above their last-seen id, so no double-playing.

## Out of scope

- Background music.
- Audio asset files.
- Haptics, themes/deck skins, and other enhancement directions discussed but
  not selected.
