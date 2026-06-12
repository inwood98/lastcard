# Sound & Animation FX Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add synthesized sound effects and full animations (card flight, deal, reverse spin, wild flash, confetti) driven by structured engine events, working in solo, host, and guest modes.

**Architecture:** The engine's existing `events` log gains a machine-readable `kind` + payload per event (spec approach A). A pure planner (`src/fx/plan.ts`) maps new events to sound/animation cues; `useGameFx` consumes them in `GameTable`; `FxOverlay` renders flying-card clones between DOM anchors registered by the existing table components. Sounds are Web Audio synth, no assets.

**Tech Stack:** TypeScript, React 19, Vitest, Web Audio API, Web Animations API. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-06-12-sound-animation-fx-design.md`

**One refinement vs the spec:** FX preferences (sound/animations) are stored as a separate `FxPrefs` object in `storage.ts` (key `uno-fx`) rather than fields on `GameSettings`, because guests never construct a `GameSettings` — they join with just a name and room code, but still need working toggles. Everything else follows the spec.

**Commands:** `npm test` (vitest run), `npm run lint`, `npm run build`. npm needs `--cache /tmp/npm-cache-uno` if installing anything (it shouldn't).

---

### Task 1: Engine — structured FX events

**Files:**
- Modify: `src/engine/types.ts` (GameEvent)
- Modify: `src/engine/game.ts` (addEvent + every call site)
- Test: `src/engine/game.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/engine/game.test.ts`. The existing `makeState` helper needs an optional `scores` field — extend `StateOptions` with `scores?: number[]` and change the `scores:` line in `makeState` to `scores: opts.scores ?? opts.hands.map(() => 0),`.

Append this describe block:

```ts
describe('event kinds', () => {
  it('emits a deal event first when a game starts', () => {
    const state = initGame({ playerName: 'You', botCount: 2, rules: DEFAULT_RULES, seed: 1 })
    expect(state.events[0].kind).toBe('deal')
  })

  it('tags plays with player and card', () => {
    const c = card('red', 5)
    const state = makeState({ hands: [[c, card('blue', 7)], [card('green', 2)]], top: card('red', 9) })
    const next = gameReducer(state, { type: 'PLAY_CARD', playerId: 0, cardId: c.id })
    const e = next.events[next.events.length - 1]
    expect(e).toMatchObject({ kind: 'play', playerId: 0, cardId: c.id })
  })

  it('tags draws with player and count', () => {
    const state = makeState({ hands: [[card('blue', 7)], [card('green', 2)]], top: card('red', 9) })
    const next = gameReducer(state, { type: 'DRAW_CARD', playerId: 0 })
    const e = next.events[next.events.length - 1]
    expect(e.kind).toBe('draw')
    expect(e.playerId).toBe(0)
    expect(e.count).toBe(1)
  })

  it('tags reverse, skip and wild color choices', () => {
    const rev = card('red', 'reverse')
    const state = makeState({
      hands: [[rev, card('blue', 7)], [card('green', 2)], [card('green', 3)]],
      top: card('red', 9),
    })
    const afterRev = gameReducer(state, { type: 'PLAY_CARD', playerId: 0, cardId: rev.id })
    expect(afterRev.events.some((e) => e.kind === 'reverse')).toBe(true)

    const skip = card('red', 'skip')
    const state2 = makeState({
      hands: [[skip, card('blue', 7)], [card('green', 2)], [card('green', 3)]],
      top: card('red', 9),
    })
    const afterSkip = gameReducer(state2, { type: 'PLAY_CARD', playerId: 0, cardId: skip.id })
    const skipEvent = afterSkip.events.find((e) => e.kind === 'skip')
    expect(skipEvent?.playerId).toBe(1)

    const wild = card(null, 'wild')
    const state3 = makeState({ hands: [[wild, card('blue', 7)], [card('green', 2)]], top: card('red', 9) })
    const afterWild = gameReducer(state3, {
      type: 'PLAY_CARD', playerId: 0, cardId: wild.id, chosenColor: 'green',
    })
    const colorEvent = afterWild.events.find((e) => e.kind === 'wildColor')
    expect(colorEvent).toMatchObject({ playerId: 0, color: 'green' })
  })

  it('tags penalties and catches', () => {
    const state = makeState({ hands: [[card('blue', 7)], [card('green', 2)]], top: card('red', 9) })
    state.pendingDraw = 4
    const next = gameReducer(state, { type: 'TAKE_PENALTY', playerId: 0 })
    expect(next.events[next.events.length - 1]).toMatchObject({ kind: 'penalty', playerId: 0, count: 4 })

    const s2 = makeState({ hands: [[card('blue', 7), card('blue', 8)], [card('green', 2)]], top: card('red', 9) })
    const caught = gameReducer(s2, { type: 'CATCH_UNO', callerId: 0, targetId: 1 })
    const e = caught.events.find((ev) => ev.kind === 'caught')
    expect(e).toMatchObject({ playerId: 1, count: 2 })
  })

  it('distinguishes roundOver from matchOver at the target score', () => {
    const winning = card('red', 5)
    const roundState = makeState({ hands: [[winning], [card(null, 'wild4')]], top: card('red', 9) })
    const round = gameReducer(roundState, { type: 'PLAY_CARD', playerId: 0, cardId: winning.id })
    expect(round.events[round.events.length - 1].kind).toBe('roundOver')

    const w2 = card('red', 5)
    const matchState = makeState({
      hands: [[w2], [card(null, 'wild4')]],
      top: card('red', 9),
      scores: [460, 0],
    })
    const match = gameReducer(matchState, { type: 'PLAY_CARD', playerId: 0, cardId: w2.id })
    expect(match.events[match.events.length - 1].kind).toBe('matchOver')
  })

  it('tags uno calls', () => {
    const state = makeState({ hands: [[card('blue', 7)], [card('green', 2)]], top: card('red', 9) })
    const next = gameReducer(state, { type: 'CALL_UNO', playerId: 0 })
    expect(next.events[next.events.length - 1]).toMatchObject({ kind: 'uno', playerId: 0 })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/engine/game.test.ts`
Expected: FAIL — `kind` does not exist on `GameEvent` (TypeScript) / assertions fail.

- [ ] **Step 3: Update `GameEvent` in `src/engine/types.ts`**

Replace the existing `GameEvent` interface:

```ts
export type EventKind =
  | 'play'        // a card was played
  | 'draw'        // player drew card(s)
  | 'skip'        // a player was skipped
  | 'reverse'     // direction changed
  | 'wildColor'   // a wild color was chosen
  | 'uno'         // "Last card!" called
  | 'caught'      // caught without calling last card
  | 'penalty'     // accumulated draw penalty taken
  | 'challenge'   // wild-draw-four challenge resolved
  | 'reshuffle'   // discard reshuffled into the draw pile
  | 'deal'        // round start, hands dealt
  | 'roundOver'   // round won
  | 'matchOver'   // match won (target score reached)
  | 'info'        // narration only, no FX

export interface GameEvent {
  id: number
  text: string
  kind: EventKind
  /** acting/affected player: who played, who draws, who won */
  playerId?: number
  /** card played, so the UI can animate that exact card */
  cardId?: number
  /** number of cards drawn */
  count?: number
  /** chosen wild color */
  color?: Color
}
```

- [ ] **Step 4: Update `addEvent` and every call site in `src/engine/game.ts`**

Add `TARGET_SCORE` and `GameEvent` to the type imports:

```ts
import {
  TARGET_SCORE,
  type Card,
  type GameAction,
  type GameConfig,
  type GameEvent,
  type GameState,
  type PlayerState,
} from './types'
```

(Note: `TARGET_SCORE` is a value, not a type — keep it outside `type` qualifiers.)

Replace `addEvent`:

```ts
type EventFx = Partial<Omit<GameEvent, 'id' | 'text'>>

function addEvent(state: GameState, text: string, fx: EventFx = {}) {
  const id = state.events.length ? state.events[state.events.length - 1].id + 1 : 1
  state.events.push({ id, text, kind: 'info', ...fx })
  if (state.events.length > MAX_EVENTS) state.events.shift()
}
```

Update every call site (exact replacements; line numbers from current `main`):

1. **`initGame`** — immediately after the `const state: GameState = { ... }` literal (before the `// The flipped card acts on the first player` block), insert:
   ```ts
   addEvent(state, '', { kind: 'deal' })
   ```
2. First-card Skip (was line 77): `addEvent(state, \`First card is Skip — ${players[0].name} loses a turn\`, { kind: 'skip', playerId: 0 })`
3. First-card Reverse (79–81): `addEvent(state, 'First card is Reverse — play goes right', { kind: 'reverse' })`
4. First-card Draw Two (82–85): `addEvent(state, \`First card is Draw Two — ${players[0].name} draws 2\`, { kind: 'draw', playerId: 0, count: 2 })`
5. First-card Wild (87): unchanged (stays `info`).
6. `drawCards` reshuffle (121): `addEvent(state, 'Draw pile reshuffled', { kind: 'reshuffle' })`
7. `resolveWild4` (149): `addEvent(state, \`${name(state, victim)} draws 4 and is skipped\`, { kind: 'draw', playerId: victim, count: 4 })`
8. `applyEffect` skip (159): `addEvent(state, \`${name(state, skipped)} is skipped\`, { kind: 'skip', playerId: skipped })`
9. `applyEffect` reverse (166): `addEvent(state, 'Direction reversed', { kind: 'reverse' })`
10. `applyEffect` draw2 (182): `addEvent(state, \`${name(state, victim)} draws 2 and is skipped\`, { kind: 'draw', playerId: victim, count: 2 })`
11. `PLAY_CARD` "plays" (225): `addEvent(state, \`${player.name} plays ${label}\`, { kind: 'play', playerId, cardId })`
12. `PLAY_CARD` uno call (228): `addEvent(state, \`${player.name} calls "Last card!"\`, { kind: 'uno', playerId })`
13. `PLAY_CARD` round win (248) — replace the single `addEvent` line with:
    ```ts
    addEvent(state, `${player.name} wins the round and scores ${points} points!`, {
      kind: state.scores[playerId] >= TARGET_SCORE ? 'matchOver' : 'roundOver',
      playerId,
    })
    ```
    (this line already runs after `state.scores[playerId] += points`, so the comparison sees the final score)
14. `PLAY_CARD` chosen color (258): `addEvent(state, \`${player.name} chooses ${chosenColor}\`, { kind: 'wildColor', playerId, color: chosenColor })`
15. `CHOOSE_COLOR` (271): `addEvent(state, \`${name(state, state.currentPlayer)} chooses ${action.color}\`, { kind: 'wildColor', playerId: state.currentPlayer, color: action.color })`
16. `CHALLENGE` success (287–290): pass `{ kind: 'challenge', playerId, count: 4 }`
17. `CHALLENGE` fail (296): pass `{ kind: 'challenge', playerId: targetId, count: 6 }`
18. `DRAW_CARD` (328): `addEvent(state, \`${player.name} draws ${count === 1 ? 'a card' : \`${count} cards\`}\`, { kind: 'draw', playerId: action.playerId, count })`
19. `PASS` (346): unchanged (`info`).
20. `TAKE_PENALTY` (362): `addEvent(state, \`${name(state, action.playerId)} draws ${n} and is skipped\`, { kind: 'penalty', playerId: action.playerId, count: n })`
21. `CALL_UNO` (371): `addEvent(state, \`${player.name} calls "Last card!"\`, { kind: 'uno', playerId: action.playerId })`
22. `CATCH_UNO` (385–388): pass `{ kind: 'caught', playerId: action.targetId, count: 2 }`

The ticker in `GameTable.tsx` shows `lastEvent?.text ?? ''` — the empty-text `deal` event renders as an empty ticker at round start, which matches today's behavior (no events yet). No UI change needed.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS (all engine + ai + net tests; the new describe block passes).

- [ ] **Step 6: Commit**

```bash
git add src/engine/types.ts src/engine/game.ts src/engine/game.test.ts
git commit -m "feat(engine): structured FX event kinds on the game event log"
```

---

### Task 2: FX planner — pure event→cue mapping

**Files:**
- Create: `src/fx/plan.ts`
- Test: `src/fx/plan.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/fx/plan.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { initGame } from '../engine/game'
import { DEFAULT_RULES, type GameEvent, type GameState } from '../engine/types'
import { cueForEvent, initialLastSeen, newEvents } from './plan'

function ev(partial: Partial<GameEvent> & { id: number }): GameEvent {
  return { text: '', kind: 'info', ...partial }
}

function freshState(): GameState {
  return initGame({ playerName: 'You', botCount: 2, rules: DEFAULT_RULES, seed: 5 })
}

describe('newEvents', () => {
  it('returns only events newer than lastSeenId', () => {
    const events = [ev({ id: 1 }), ev({ id: 2 }), ev({ id: 3 })]
    expect(newEvents(events, 2).map((e) => e.id)).toEqual([3])
    expect(newEvents(events, 0)).toHaveLength(3)
    expect(newEvents(events, 3)).toHaveLength(0)
  })
})

describe('initialLastSeen', () => {
  it('replays from zero when the round just started', () => {
    expect(initialLastSeen([ev({ id: 1, kind: 'deal' })])).toBe(0)
    expect(initialLastSeen([ev({ id: 1, kind: 'deal' }), ev({ id: 2, kind: 'skip' })])).toBe(0)
  })
  it('fast-forwards when joining mid-game', () => {
    const events = Array.from({ length: 10 }, (_, i) => ev({ id: i + 20 }))
    expect(initialLastSeen(events)).toBe(29)
  })
  it('handles an empty log', () => {
    expect(initialLastSeen([])).toBe(0)
  })
})

describe('cueForEvent', () => {
  it('maps a play to a swish and a flight to the discard pile', () => {
    const state = freshState()
    const card = state.players[1].hand[0]
    state.discardPile.push(card)
    const cue = cueForEvent(ev({ id: 5, kind: 'play', playerId: 1, cardId: card.id }), state, 0)
    expect(cue.sounds).toContain('play')
    expect(cue.flights).toHaveLength(1)
    expect(cue.flights[0]).toMatchObject({ from: 'seat-1', to: 'discard', flip: true })
    expect(cue.flights[0].card?.id).toBe(card.id)
  })

  it("uses the hand anchor and no flip for the viewer's own play", () => {
    const state = freshState()
    const card = state.players[0].hand[0]
    state.discardPile.push(card)
    const cue = cueForEvent(ev({ id: 5, kind: 'play', playerId: 0, cardId: card.id }), state, 0)
    expect(cue.flights[0]).toMatchObject({ from: 'hand', flip: false })
  })

  it('staggers multi-card draws and uses the thud sound', () => {
    const cue = cueForEvent(ev({ id: 6, kind: 'draw', playerId: 1, count: 4 }), freshState(), 0)
    expect(cue.sounds).toEqual(['thud'])
    expect(cue.flights).toHaveLength(4)
    expect(cue.flights[3].delayMs).toBeGreaterThan(cue.flights[0].delayMs)
    expect(cue.flights.every((f) => f.from === 'draw' && f.to === 'seat-1')).toBe(true)
  })

  it('caps flight count for huge draws', () => {
    const cue = cueForEvent(ev({ id: 6, kind: 'draw', playerId: 1, count: 12 }), freshState(), 0)
    expect(cue.flights).toHaveLength(6)
  })

  it('maps reverse to a spin, wildColor to a flash, wins to confetti', () => {
    const state = freshState()
    expect(cueForEvent(ev({ id: 1, kind: 'reverse' }), state, 0).spin).toBe(true)
    const flash = cueForEvent(ev({ id: 2, kind: 'wildColor', color: 'green' }), state, 0)
    expect(flash.flashColor).toBe('green')
    expect(flash.sounds).toContain('wild')
    expect(cueForEvent(ev({ id: 3, kind: 'roundOver', playerId: 0 }), state, 0)).toMatchObject({
      sounds: ['fanfare'], confetti: true,
    })
    expect(cueForEvent(ev({ id: 4, kind: 'matchOver', playerId: 0 }), state, 0)).toMatchObject({
      sounds: ['bigFanfare'], confetti: true,
    })
  })

  it('deals 7 cards to every seat with stagger', () => {
    const state = freshState() // 3 players
    const cue = cueForEvent(ev({ id: 1, kind: 'deal' }), state, 0)
    expect(cue.flights).toHaveLength(21)
    expect(cue.flights.filter((f) => f.to === 'hand')).toHaveLength(7)
    expect(new Set(cue.flights.map((f) => f.delayMs)).size).toBe(21)
  })

  it('produces no FX for info events', () => {
    const cue = cueForEvent(ev({ id: 1, kind: 'info' }), freshState(), 0)
    expect(cue.sounds).toHaveLength(0)
    expect(cue.flights).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/fx/plan.test.ts`
Expected: FAIL — cannot resolve `./plan`.

- [ ] **Step 3: Implement `src/fx/plan.ts`**

```ts
import type { Card, Color, GameEvent, GameState } from '../engine/types'

export type SoundName =
  | 'play' | 'draw' | 'thud' | 'skip' | 'reverse' | 'wild' | 'uno'
  | 'caught' | 'shuffle' | 'fanfare' | 'bigFanfare'

export interface Flight {
  key: string
  /** anchor keys: 'draw', 'discard', 'hand', or `seat-${playerId}` */
  from: string
  to: string
  /** rendered face-up when set; face-down (card back) otherwise */
  card?: Card
  /** card-back flips to face-up mid-flight (opponent plays) */
  flip?: boolean
  delayMs: number
}

export interface FxCue {
  sounds: SoundName[]
  flights: Flight[]
  spin?: boolean
  flashColor?: Color
  confetti?: boolean
}

export function newEvents(events: GameEvent[], lastSeenId: number): GameEvent[] {
  return events.filter((e) => e.id > lastSeenId)
}

/**
 * Where to start consuming events on mount: replay from the beginning when the
 * round has just started (deal + at most a first-card effect), fast-forward
 * past history when joining mid-game.
 */
export function initialLastSeen(events: GameEvent[]): number {
  const newest = events.length ? events[events.length - 1].id : 0
  return newest <= 3 ? 0 : newest
}

const FLIGHT_STAGGER_MS = 90
const MAX_DRAW_FLIGHTS = 6
const HAND_SIZE = 7

export function cueForEvent(e: GameEvent, state: GameState, viewerId: number): FxCue {
  const cue: FxCue = { sounds: [], flights: [] }
  const seat = (id: number) => (id === viewerId ? 'hand' : `seat-${id}`)
  const drawFlights = (playerId: number, count: number): Flight[] =>
    Array.from({ length: Math.min(count, MAX_DRAW_FLIGHTS) }, (_, i) => ({
      key: `${e.kind}-${e.id}-${i}`,
      from: 'draw',
      to: seat(playerId),
      delayMs: i * FLIGHT_STAGGER_MS,
    }))

  switch (e.kind) {
    case 'play': {
      cue.sounds.push('play')
      const card = state.discardPile.find((c) => c.id === e.cardId)
      if (card && e.playerId !== undefined) {
        cue.flights.push({
          key: `play-${e.id}`,
          from: seat(e.playerId),
          to: 'discard',
          card,
          flip: e.playerId !== viewerId,
          delayMs: 0,
        })
      }
      break
    }
    case 'draw':
    case 'penalty':
    case 'challenge': {
      const count = e.count ?? 1
      cue.sounds.push(count === 1 ? 'draw' : 'thud')
      if (e.kind === 'challenge') cue.sounds.unshift('caught')
      if (e.playerId !== undefined) cue.flights.push(...drawFlights(e.playerId, count))
      break
    }
    case 'caught': {
      cue.sounds.push('caught')
      if (e.playerId !== undefined) cue.flights.push(...drawFlights(e.playerId, e.count ?? 2))
      break
    }
    case 'skip':
      cue.sounds.push('skip')
      break
    case 'reverse':
      cue.sounds.push('reverse')
      cue.spin = true
      break
    case 'wildColor':
      cue.sounds.push('wild')
      cue.flashColor = e.color
      break
    case 'uno':
      cue.sounds.push('uno')
      break
    case 'reshuffle':
      cue.sounds.push('shuffle')
      break
    case 'deal': {
      cue.sounds.push('shuffle')
      state.players.forEach((p, pi) => {
        for (let i = 0; i < HAND_SIZE; i++) {
          cue.flights.push({
            key: `deal-${e.id}-${p.id}-${i}`,
            from: 'draw',
            to: seat(p.id),
            delayMs: (i * state.players.length + pi) * 60,
          })
        }
      })
      break
    }
    case 'roundOver':
      cue.sounds.push('fanfare')
      cue.confetti = true
      break
    case 'matchOver':
      cue.sounds.push('bigFanfare')
      cue.confetti = true
      break
    case 'info':
      break
  }
  return cue
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/fx/plan.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/fx/plan.ts src/fx/plan.test.ts
git commit -m "feat(fx): pure planner mapping game events to sound/animation cues"
```

---

### Task 3: Synthesized sounds

**Files:**
- Create: `src/fx/sounds.ts`

No unit test — Web Audio output is verified in the browser in Task 8. Keep all audio behind feature checks so tests/SSR never crash.

- [ ] **Step 1: Implement `src/fx/sounds.ts`**

```ts
import type { SoundName } from './plan'

let ctx: AudioContext | null = null
let enabled = true

export function setSoundEnabled(on: boolean) {
  enabled = on
}

/** Create/resume the context — call from a user-gesture handler once */
export function unlockAudio() {
  ac()
}

function ac(): AudioContext | null {
  if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return null
  if (!ctx) {
    try {
      ctx = new AudioContext()
    } catch {
      return null
    }
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

interface ToneOpts {
  type?: OscillatorType
  gain?: number
  slideTo?: number
}

function tone(c: AudioContext, at: number, freq: number, dur: number, opts: ToneOpts = {}) {
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = opts.type ?? 'triangle'
  osc.frequency.setValueAtTime(freq, at)
  if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, at + dur)
  g.gain.setValueAtTime(opts.gain ?? 0.15, at)
  g.gain.exponentialRampToValueAtTime(0.001, at + dur)
  osc.connect(g)
  g.connect(c.destination)
  osc.start(at)
  osc.stop(at + dur + 0.02)
}

/** Decaying band-passed noise burst — card swishes and shuffles */
function noise(c: AudioContext, at: number, dur: number, freq: number, gain = 0.2) {
  const len = Math.ceil(c.sampleRate * dur)
  const buf = c.createBuffer(1, len, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len)
  const src = c.createBufferSource()
  src.buffer = buf
  const f = c.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.value = freq
  const g = c.createGain()
  g.gain.value = gain
  src.connect(f)
  f.connect(g)
  g.connect(c.destination)
  src.start(at)
}

export function playSound(name: SoundName) {
  if (!enabled) return
  const c = ac()
  if (!c) return
  const t = c.currentTime + 0.01
  switch (name) {
    case 'play':
      noise(c, t, 0.12, 1800, 0.25)
      break
    case 'draw':
      noise(c, t, 0.08, 900, 0.18)
      break
    case 'thud':
      tone(c, t, 150, 0.15, { type: 'sine', gain: 0.3, slideTo: 60 })
      tone(c, t + 0.12, 130, 0.18, { type: 'sine', gain: 0.3, slideTo: 55 })
      break
    case 'skip':
      tone(c, t, 520, 0.12, { type: 'square', gain: 0.08, slideTo: 260 })
      break
    case 'reverse':
      tone(c, t, 300, 0.14, { slideTo: 600 })
      tone(c, t + 0.12, 600, 0.16, { slideTo: 300 })
      break
    case 'wild':
      ;[440, 554, 659, 880].forEach((f, i) => tone(c, t + i * 0.07, f, 0.18, { gain: 0.12 }))
      break
    case 'uno':
      tone(c, t, 660, 0.12, { type: 'square', gain: 0.1 })
      tone(c, t + 0.13, 990, 0.22, { type: 'square', gain: 0.1 })
      break
    case 'caught':
      tone(c, t, 220, 0.3, { type: 'sawtooth', gain: 0.12, slideTo: 110 })
      break
    case 'shuffle':
      noise(c, t, 0.35, 1200, 0.15)
      noise(c, t + 0.18, 0.35, 1500, 0.12)
      break
    case 'fanfare':
      ;[523, 659, 784, 1047].forEach((f, i) => tone(c, t + i * 0.12, f, 0.3, { gain: 0.14 }))
      break
    case 'bigFanfare':
      ;[523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) =>
        tone(c, t + i * 0.13, f, 0.35, { gain: 0.15 }),
      )
      break
  }
}
```

- [ ] **Step 2: Verify it compiles and nothing broke**

Run: `npm test && npm run lint`
Expected: PASS (no test imports this yet; lint clean).

- [ ] **Step 3: Commit**

```bash
git add src/fx/sounds.ts
git commit -m "feat(fx): Web Audio synthesized sound effects"
```

---

### Task 4: FX preferences in storage

**Files:**
- Modify: `src/storage.ts`

- [ ] **Step 1: Add `FxPrefs` to `src/storage.ts`**

Append:

```ts
export interface FxPrefs {
  sound: boolean
  animations: boolean
}

const FX_KEY = 'uno-fx'

export const DEFAULT_FX: FxPrefs = { sound: true, animations: true }

export function loadFxPrefs(): FxPrefs {
  try {
    const raw = localStorage.getItem(FX_KEY)
    if (!raw) return DEFAULT_FX
    return { ...DEFAULT_FX, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_FX
  }
}

export function saveFxPrefs(prefs: FxPrefs) {
  try {
    localStorage.setItem(FX_KEY, JSON.stringify(prefs))
  } catch {
    // storage unavailable (private mode) — prefs just won't persist
  }
}
```

- [ ] **Step 2: Verify**

Run: `npm test && npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/storage.ts
git commit -m "feat(fx): persisted sound/animation preferences"
```

---

### Task 5: Anchor registry + component wiring

**Files:**
- Create: `src/fx/anchors.ts`
- Modify: `src/components/PilesArea.tsx`, `src/components/OpponentSeat.tsx`, `src/components/Hand.tsx`

- [ ] **Step 1: Create `src/fx/anchors.ts`**

```ts
/**
 * Registry of table landmarks the FX overlay flies cards between.
 * Module-level is fine: only one table is ever mounted.
 */
const anchors = new Map<string, HTMLElement>()

export function anchorRef(key: string) {
  return (el: HTMLElement | null) => {
    if (el) anchors.set(key, el)
    else anchors.delete(key)
  }
}

export function anchorRect(key: string): DOMRect | null {
  return anchors.get(key)?.getBoundingClientRect() ?? null
}
```

- [ ] **Step 2: Register anchors in the table components**

`src/components/PilesArea.tsx` — import `anchorRef` and add refs to the two pile divs:

```ts
import { anchorRef } from '../fx/anchors'
```

```tsx
      <div
        ref={anchorRef('draw')}
        className={clickable ? 'draw-pile draw-pile-active' : 'draw-pile'}
```

```tsx
      <div
        ref={anchorRef('discard')}
        className="discard-pile"
```

`src/components/OpponentSeat.tsx` — root div:

```ts
import { anchorRef } from '../fx/anchors'
```

```tsx
    <div ref={anchorRef(`seat-${player.id}`)} className={isCurrent ? 'seat seat-active' : 'seat'}>
```

`src/components/Hand.tsx` — root div:

```ts
import { anchorRef } from '../fx/anchors'
```

```tsx
    <div ref={anchorRef('hand')} className="hand">
```

- [ ] **Step 3: Verify**

Run: `npm test && npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/fx/anchors.ts src/components/PilesArea.tsx src/components/OpponentSeat.tsx src/components/Hand.tsx
git commit -m "feat(fx): DOM anchor registry for flight start/end points"
```

---

### Task 6: FxOverlay component + styles

**Files:**
- Create: `src/fx/FxOverlay.tsx`
- Create: `src/fx/fx.css`

- [ ] **Step 1: Create `src/fx/fx.css`**

```css
.fx-layer {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 90;
  overflow: hidden;
}

.fx-flight {
  position: absolute;
  top: 0;
  left: 0;
  will-change: transform;
}

.fx-flight .uno-card {
  width: 100%;
  height: 100%;
}

.fx-flip {
  position: relative;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
  animation: fx-flip 380ms both;
}

.fx-face {
  position: absolute;
  inset: 0;
  backface-visibility: hidden;
}

.fx-front {
  transform: rotateY(180deg);
}

@keyframes fx-flip {
  from { transform: rotateY(0deg); }
  to { transform: rotateY(180deg); }
}

.fx-spin {
  position: absolute;
  left: 50%;
  top: 40%;
  color: rgba(255, 255, 255, 0.9);
  animation: fx-spin 700ms ease-out both;
}

@keyframes fx-spin {
  from { transform: translate(-50%, -50%) rotate(0deg) scale(0.4); opacity: 1; }
  to { transform: translate(-50%, -50%) rotate(360deg) scale(1.8); opacity: 0; }
}

.fx-flash {
  position: absolute;
  inset: 0;
  animation: fx-flash 600ms ease-out both;
}

@keyframes fx-flash {
  from { opacity: 0.55; }
  to { opacity: 0; }
}

.fx-confetti {
  position: absolute;
  top: -14px;
  width: 10px;
  height: 14px;
  border-radius: 2px;
  animation-name: fx-fall;
  animation-timing-function: linear;
  animation-fill-mode: both;
  animation-iteration-count: infinite;
}

@keyframes fx-fall {
  to { transform: translateY(105vh) rotate(720deg); }
}
```

- [ ] **Step 2: Create `src/fx/FxOverlay.tsx`**

```tsx
import { useEffect, useMemo, useRef } from 'react'
import { CARD_COLORS, Card } from '../components/Card'
import type { Color } from '../engine/types'
import { anchorRect } from './anchors'
import type { Flight } from './plan'
import './fx.css'

export interface ActiveFx {
  flights: Flight[]
  spinKey: number
  flash: { color: Color; key: number } | null
  confetti: boolean
}

interface FxOverlayProps {
  fx: ActiveFx
  onFlightDone: (key: string) => void
}

export function FxOverlay({ fx, onFlightDone }: FxOverlayProps) {
  return (
    <div className="fx-layer" aria-hidden>
      {fx.flights.map((f) => (
        <FlyingCard key={f.key} flight={f} onDone={() => onFlightDone(f.key)} />
      ))}
      {fx.spinKey > 0 && <SpinBadge key={fx.spinKey} />}
      {fx.flash && <Flash key={fx.flash.key} color={fx.flash.color} />}
      {fx.confetti && <Confetti />}
    </div>
  )
}

const FLIGHT_MS = 380

function FlyingCard({ flight, onDone }: { flight: Flight; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const done = useRef(onDone)
  done.current = onDone

  useEffect(() => {
    const el = ref.current
    const from = anchorRect(flight.from)
    const to = anchorRect(flight.to)
    if (!el || !from || !to || typeof el.animate !== 'function') {
      done.current()
      return
    }
    el.style.width = `${from.width}px`
    el.style.height = `${from.height}px`
    const toX = to.x + (to.width - from.width) / 2
    const toY = to.y + (to.height - from.height) / 2
    const anim = el.animate(
      [
        { transform: `translate(${from.x}px, ${from.y}px)`, opacity: 1 },
        {
          transform: `translate(${toX}px, ${toY}px) scale(${to.width / from.width})`,
          opacity: 1,
        },
      ],
      {
        duration: FLIGHT_MS,
        delay: flight.delayMs,
        easing: 'cubic-bezier(0.25, 0.8, 0.3, 1)',
        fill: 'backwards',
      },
    )
    anim.finished.catch(() => {}).finally(() => done.current())
    return () => anim.cancel()
    // flight is immutable per key — run the animation exactly once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div ref={ref} className="fx-flight" style={{ opacity: 0 }}>
      {flight.card && flight.flip ? (
        <div className="fx-flip" style={{ animationDelay: `${flight.delayMs}ms` }}>
          <div className="fx-face fx-front">
            <Card card={flight.card} size="lg" />
          </div>
          <div className="fx-face">
            <Card faceDown size="lg" />
          </div>
        </div>
      ) : flight.card ? (
        <Card card={flight.card} size="lg" />
      ) : (
        <Card faceDown size="lg" />
      )}
    </div>
  )
}

function SpinBadge() {
  return (
    <div className="fx-spin">
      <svg viewBox="0 0 100 100" width="72" height="72">
        <path
          d="M 50 12 A 38 38 0 1 1 14 38"
          fill="none"
          stroke="currentColor"
          strokeWidth="9"
          strokeLinecap="round"
        />
        <polygon points="2,42 30,32 16,56" fill="currentColor" />
      </svg>
    </div>
  )
}

function Flash({ color }: { color: Color }) {
  return (
    <div
      className="fx-flash"
      style={{ background: `radial-gradient(circle, ${CARD_COLORS[color]}aa, transparent 70%)` }}
    />
  )
}

const CONFETTI_COUNT = 60

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 1.5,
        dur: 2.2 + Math.random() * 1.6,
        color: Object.values(CARD_COLORS)[i % 4],
      })),
    [],
  )
  return (
    <>
      {pieces.map((p, i) => (
        <i
          key={i}
          className="fx-confetti"
          style={{
            left: `${p.left}%`,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.dur}s`,
          }}
        />
      ))}
    </>
  )
}
```

- [ ] **Step 3: Verify**

Run: `npm test && npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/fx/FxOverlay.tsx src/fx/fx.css
git commit -m "feat(fx): overlay with flying cards, reverse spin, wild flash, confetti"
```

---

### Task 7: useGameFx hook + GameTable/GameMenu integration

**Files:**
- Create: `src/fx/useGameFx.ts`
- Modify: `src/components/GameTable.tsx`, `src/components/GameMenu.tsx`, `src/components/table.css`

- [ ] **Step 1: Create `src/fx/useGameFx.ts`**

```ts
import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameState } from '../engine/types'
import type { FxPrefs } from '../storage'
import type { ActiveFx } from './FxOverlay'
import { cueForEvent, initialLastSeen, newEvents, type Flight } from './plan'
import { playSound, setSoundEnabled, unlockAudio } from './sounds'

/**
 * Consumes game events newer than the last seen id and turns them into
 * sounds + overlay animation state. Fast-forwards on mid-game mount (guest
 * join); replays from the start when a round begins (deal animation).
 */
export function useGameFx(state: GameState, viewerId: number, prefs: FxPrefs) {
  const lastSeen = useRef<number | null>(null)
  const [flights, setFlights] = useState<Flight[]>([])
  const [spinKey, setSpinKey] = useState(0)
  const [flash, setFlash] = useState<ActiveFx['flash']>(null)
  const [confetti, setConfetti] = useState(false)

  useEffect(() => {
    setSoundEnabled(prefs.sound)
  }, [prefs.sound])

  // Browsers require a user gesture before audio can start
  useEffect(() => {
    const unlock = () => unlockAudio()
    window.addEventListener('pointerdown', unlock, { once: true })
    return () => window.removeEventListener('pointerdown', unlock)
  }, [])

  useEffect(() => {
    const events = state.events
    const newest = events.length ? events[events.length - 1].id : 0
    if (lastSeen.current === null) lastSeen.current = initialLastSeen(events)
    // event ids went backwards: host restarted the round without a remount
    if (newest < lastSeen.current) lastSeen.current = 0
    const fresh = newEvents(events, lastSeen.current)
    lastSeen.current = newest
    if (!fresh.length) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    for (const e of fresh) {
      const cue = cueForEvent(e, state, viewerId)
      for (const s of cue.sounds) playSound(s)
      if (!prefs.animations || reduced) continue
      if (cue.flights.length) setFlights((f) => [...f, ...cue.flights])
      if (cue.spin) setSpinKey((k) => k + 1)
      if (cue.flashColor) setFlash({ color: cue.flashColor, key: e.id })
      if (cue.confetti) setConfetti(true)
    }
  }, [state, viewerId, prefs.animations])

  // clear win confetti once the next round is underway
  useEffect(() => {
    if (state.phase === 'play') setConfetti(false)
  }, [state.phase])

  const onFlightDone = useCallback((key: string) => {
    setFlights((f) => f.filter((fl) => fl.key !== key))
  }, [])

  const fx: ActiveFx = { flights, spinKey, flash, confetti }
  return { fx, onFlightDone }
}
```

- [ ] **Step 2: Add FX toggles to `src/components/GameMenu.tsx`**

Extend the props and render two checkboxes in the `menu` view. Changes:

```ts
import type { FxPrefs } from '../storage'
```

```ts
interface GameMenuProps {
  rules: HouseRules
  /** present for host/local players — redeals the current round */
  onRestart?: () => void
  onLeave: () => void
  /** changes wording: ending the game vs leaving someone else's table */
  isHostOrLocal: boolean
  fxPrefs: FxPrefs
  onFxPrefs: (prefs: FxPrefs) => void
}
```

```ts
export function GameMenu({ rules, onRestart, onLeave, isHostOrLocal, fxPrefs, onFxPrefs }: GameMenuProps) {
```

Inside the `view === 'menu'` fragment, between the `<h2>Menu</h2>` and `<div className="menu-buttons">`, insert:

```tsx
                <div className="fx-toggles">
                  <label>
                    <input
                      type="checkbox"
                      checked={fxPrefs.sound}
                      onChange={(e) => onFxPrefs({ ...fxPrefs, sound: e.target.checked })}
                    />
                    Sound effects
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={fxPrefs.animations}
                      onChange={(e) => onFxPrefs({ ...fxPrefs, animations: e.target.checked })}
                    />
                    Animations
                  </label>
                </div>
```

- [ ] **Step 3: Integrate into `src/components/GameTable.tsx`**

Add imports:

```ts
import { useState } from 'react'
import { FxOverlay } from '../fx/FxOverlay'
import { useGameFx } from '../fx/useGameFx'
import { loadFxPrefs, saveFxPrefs, type FxPrefs } from '../storage'
```

At the top of the `GameTable` function body (after `const { state, viewerId } = game`):

```ts
const [fxPrefs, setFxPrefs] = useState<FxPrefs>(loadFxPrefs)
const { fx, onFlightDone } = useGameFx(state, viewerId, fxPrefs)
const updateFxPrefs = (prefs: FxPrefs) => {
  setFxPrefs(prefs)
  saveFxPrefs(prefs)
}
```

Pass the prefs to the menu and add a mute fab next to it:

```tsx
      <GameMenu
        rules={state.rules}
        onRestart={onPlayAgain}
        onLeave={onLeave}
        isHostOrLocal={!!onPlayAgain}
        fxPrefs={fxPrefs}
        onFxPrefs={updateFxPrefs}
      />
      <button
        className="menu-fab mute-fab"
        aria-label={fxPrefs.sound ? 'Mute sounds' : 'Unmute sounds'}
        onClick={() => updateFxPrefs({ ...fxPrefs, sound: !fxPrefs.sound })}
      >
        {fxPrefs.sound ? '🔊' : '🔇'}
      </button>
```

At the end of the returned JSX, just before the closing `</div>` of `.table`, add:

```tsx
      <FxOverlay fx={fx} onFlightDone={onFlightDone} />
```

- [ ] **Step 4: Add styles to `src/components/table.css`**

The menu fab is `position: fixed; top: 12px; right: 12px` — place the mute fab beside it and style the toggles. Append:

```css
.mute-fab {
  right: 62px;
  font-size: 17px;
}

.fx-toggles {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 14px;
}

.fx-toggles label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}
```

- [ ] **Step 5: Run everything**

Run: `npm test && npm run lint && npm run build`
Expected: all PASS, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/fx/useGameFx.ts src/components/GameTable.tsx src/components/GameMenu.tsx src/components/table.css
git commit -m "feat(fx): wire sounds and animations into the game table with toggles"
```

---

### Task 8: Browser verification

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server and play a solo round**

Use the preview tools (`preview_start`, then interact). Verify, in a solo game vs 2 bots:

1. Round start: deal animation — card backs fly from the draw pile to each seat and the hand; shuffle sound plays (after first click, due to autoplay policy).
2. Playing a card: it flies from your hand to the discard pile with a swish.
3. Bot plays: a card back flies from the bot's seat and flips face-up onto the pile.
4. Drawing: card back flies from the draw pile to your hand with a tick.
5. Reverse: spin badge appears center-table; sweep sound.
6. Wild: color flash matching the chosen color; arpeggio.
7. Draw Two on a bot: two staggered backs fly to its seat; thud sound.
8. Round win: confetti + fanfare under the win screen.
9. Menu toggles: turning Sound off silences everything; turning Animations off stops flights/confetti while the game stays fully playable; both persist after reload (localStorage `uno-fx`).
10. Mute fab toggles 🔊/🔇.
11. Console: no errors throughout.

- [ ] **Step 2: Check `prefers-reduced-motion`**

Emulate reduced motion (preview_eval: `matchMedia('(prefers-reduced-motion: reduce)').matches` after enabling emulation, or verify the code path by toggling Animations off). Flights/confetti skipped, sounds still play.

- [ ] **Step 3: Two-tab host/guest smoke test**

Host a room in one tab, join from a second. Verify the guest hears/sees FX for the host's moves, and a guest joining produces no replay burst of stale events.

- [ ] **Step 4: Final commit if fixes were needed, then full suite**

Run: `npm test && npm run build`
Expected: PASS. Do **not** deploy (`npm run deploy`) unless the user asks.
