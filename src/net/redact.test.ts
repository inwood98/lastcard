import { describe, expect, it } from 'vitest'
import { gameReducer, initGame } from '../engine/game'
import { legalCards } from '../engine/rules'
import { DEFAULT_RULES } from '../engine/types'
import { handSize, redactState } from './redact'

const SEATS = [
  { name: 'Gary', isHuman: true },
  { name: 'Amy', isHuman: true },
  { name: 'Maya', isHuman: false },
]

describe('redactState', () => {
  const state = initGame({ seats: SEATS, rules: DEFAULT_RULES, seed: 5 })

  it('keeps only the viewer hand; others become counts', () => {
    const view = redactState(state, 1)
    expect(view.players[1].hand).toHaveLength(7)
    expect(view.players[0].hand).toHaveLength(0)
    expect(view.players[2].hand).toHaveLength(0)
    for (const p of view.players) expect(handSize(p)).toBe(7)
  })

  it('hides the draw pile and seed but keeps the count', () => {
    const view = redactState(state, 1)
    expect(view.drawPile).toHaveLength(0)
    expect(view.drawCount).toBe(state.drawPile.length)
    expect(view.seed).toBe(0)
  })

  it('hides another player\'s drawn card id (card ids identify cards)', () => {
    // make seat 0 draw a playable card so drawnCardId is set
    let s = state
    for (let i = 0; i < 50 && s.drawnCardId === null; i++) {
      s = initGame({ seats: SEATS, rules: DEFAULT_RULES, seed: 100 + i })
      if (s.phase !== 'play' || s.currentPlayer !== 0) continue
      s = gameReducer(s, { type: 'DRAW_CARD', playerId: 0 })
    }
    expect(s.drawnCardId).not.toBeNull()
    expect(redactState(s, 0).drawnCardId).toBe(s.drawnCardId)
    expect(redactState(s, 1).drawnCardId).toBeNull()
  })

  it('never leaks any foreign card through serialization', () => {
    const view = redactState(state, 0)
    const foreignIds = new Set(
      state.players
        .filter((p) => p.id !== 0)
        .flatMap((p) => p.hand.map((c) => c.id))
        .concat(state.drawPile.map((c) => c.id)),
    )
    // walk the view collecting every card-shaped object
    const visibleCardIds: number[] = []
    const walk = (node: unknown) => {
      if (Array.isArray(node)) return node.forEach(walk)
      if (node && typeof node === 'object') {
        const o = node as Record<string, unknown>
        if ('id' in o && 'value' in o && 'color' in o) visibleCardIds.push(o.id as number)
        Object.values(o).forEach(walk)
      }
    }
    walk(view)
    for (const id of visibleCardIds) expect(foreignIds.has(id)).toBe(false)
  })

  it('legalCards still works against a view for the viewer', () => {
    const viewer = state.currentPlayer
    const view = redactState(state, viewer)
    expect(legalCards(view, viewer).map((c) => c.id)).toEqual(
      legalCards(state, viewer).map((c) => c.id),
    )
  })
})
