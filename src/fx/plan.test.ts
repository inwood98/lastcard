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

  it('produces an empty cue for events with a missing or unknown kind', () => {
    const legacy = { id: 1, text: 'old host event' } as unknown as GameEvent
    const cue = cueForEvent(legacy, freshState(), 0)
    expect(cue.sounds).toHaveLength(0)
    expect(cue.flights).toHaveLength(0)
    expect(cue.spin).toBeUndefined()
    expect(cue.flashColor).toBeUndefined()
    expect(cue.confetti).toBeUndefined()
  })
})
