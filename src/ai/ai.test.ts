import { describe, expect, it } from 'vitest'
import { gameReducer, initGame } from '../engine/game'
import { DEFAULT_RULES, type Difficulty, type HouseRules } from '../engine/types'
import { chooseMove } from './index'

function simulate(difficulty: Difficulty, rules: HouseRules, seed: number) {
  let state = initGame({ playerName: 'Sim', botCount: 3, rules, seed })
  for (let turn = 0; turn < 5000; turn++) {
    if (state.winner !== null) return state
    const actorId =
      state.phase === 'challenge' ? state.pendingWild4!.targetId : state.currentPlayer
    const action = chooseMove(state, actorId, difficulty)
    expect(action, `no move for player ${actorId} in phase ${state.phase}`).not.toBeNull()
    const next = gameReducer(state, action!)
    expect(next, `rejected action ${action!.type} for player ${actorId}`).not.toBe(state)
    state = next
  }
  throw new Error('game did not finish in 5000 turns')
}

describe('AI plays full games legally to completion', () => {
  for (const difficulty of ['easy', 'medium', 'hard'] as const) {
    it(`${difficulty}: official rules`, () => {
      for (let seed = 1; seed <= 20; seed++) {
        const final = simulate(difficulty, DEFAULT_RULES, seed)
        expect(final.winner).not.toBeNull()
        expect(final.players[final.winner!].hand).toHaveLength(0)
      }
    })
  }

  it('all house rules enabled', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const final = simulate('hard', { stacking: true, drawUntilPlayable: true, wild4Challenge: true }, seed)
      expect(final.winner).not.toBeNull()
    }
  })
})
