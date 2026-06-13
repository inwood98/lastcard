import { describe, expect, it } from 'vitest'
import { initGame } from './engine/game'
import { DEFAULT_RULES } from './engine/types'
import { SAVE_VERSION, describeSave, parseSave, settingsFromSave, type SavedGame } from './save'

function sampleSave(): SavedGame {
  const state = initGame({ playerName: 'Ada', botCount: 2, rules: DEFAULT_RULES, seed: 3 })
  return { version: SAVE_VERSION, savedAt: 123, difficulty: 'hard', state }
}

describe('parseSave', () => {
  it('round-trips a valid save', () => {
    const parsed = parseSave(JSON.stringify(sampleSave()))
    expect(parsed).not.toBeNull()
    expect(parsed!.difficulty).toBe('hard')
    expect(parsed!.state.players).toHaveLength(3)
  })
  it('returns null on null or empty input', () => {
    expect(parseSave(null)).toBeNull()
    expect(parseSave('')).toBeNull()
  })
  it('returns null on malformed JSON', () => {
    expect(parseSave('{not json')).toBeNull()
  })
  it('returns null on a version mismatch', () => {
    const save = { ...sampleSave(), version: SAVE_VERSION + 1 }
    expect(parseSave(JSON.stringify(save))).toBeNull()
  })
  it('returns null when the state shape is wrong', () => {
    const bad = { version: SAVE_VERSION, savedAt: 1, difficulty: 'easy', state: { players: 'nope' } }
    expect(parseSave(JSON.stringify(bad))).toBeNull()
  })
})

describe('settingsFromSave', () => {
  it('reconstructs settings from the saved state', () => {
    const s = settingsFromSave(sampleSave())
    expect(s).toMatchObject({ playerName: 'Ada', botCount: 2, difficulty: 'hard' })
    expect(s.rules).toEqual(DEFAULT_RULES)
    expect(s.scores).toEqual([0, 0, 0])
  })
})

describe('describeSave', () => {
  it('summarises bots and the player hand', () => {
    const save = sampleSave()
    save.state.players[0].hand = save.state.players[0].hand.slice(0, 5)
    expect(describeSave(save)).toBe('2 bots, you have 5 cards')
  })
  it('uses singular forms for one bot and one card', () => {
    const state = initGame({ playerName: 'You', botCount: 1, rules: DEFAULT_RULES, seed: 1 })
    state.players[0].hand = state.players[0].hand.slice(0, 1)
    const save: SavedGame = { version: SAVE_VERSION, savedAt: 1, difficulty: 'easy', state }
    expect(describeSave(save)).toBe('1 bot, you have 1 card')
  })
})
