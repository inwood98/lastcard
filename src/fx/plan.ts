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

  // No `default` case on purpose: events from older peers may arrive with a
  // missing or unknown `kind` at runtime, and must yield an empty cue.
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
