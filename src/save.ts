import type { Difficulty, GameState } from './engine/types'
import type { GameSettings } from './hooks/useGame'

export interface SavedGame {
  version: number
  savedAt: number
  difficulty: Difficulty
  state: GameState
}

export const SAVE_VERSION = 2
const SAVE_KEY = 'lastcard-save'
const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard']

/** Pure: parse + validate a raw localStorage string. Returns null on any problem. */
export function parseSave(raw: string | null): SavedGame | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    const state = parsed?.state
    if (
      !parsed ||
      parsed.version !== SAVE_VERSION ||
      !DIFFICULTIES.includes(parsed.difficulty) ||
      !state ||
      !Array.isArray(state.players) ||
      !Array.isArray(state.players[0]?.hand) ||
      !Array.isArray(state.discardPile) ||
      !Array.isArray(state.scores) ||
      typeof state.currentPlayer !== 'number' ||
      typeof state.targetScore !== 'number'
    ) {
      return null
    }
    return parsed as SavedGame
  } catch {
    return null
  }
}

/** Pure: rebuild the settings needed to continue a match into later rounds. */
export function settingsFromSave(save: SavedGame): GameSettings {
  const { state } = save
  return {
    playerName: state.players[0]?.name ?? 'You',
    botCount: state.players.length - 1,
    difficulty: save.difficulty,
    rules: state.rules,
    targetScore: state.targetScore,
    scores: state.scores,
  }
}

/** Pure: a one-line summary for the Resume button. */
export function describeSave(save: SavedGame): string {
  const bots = save.state.players.length - 1
  const cards = save.state.players[0]?.hand.length ?? 0
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
  return `${plural(bots, 'bot')}, you have ${plural(cards, 'card')}`
}

export function saveGame(state: GameState, difficulty: Difficulty): void {
  try {
    const save: SavedGame = { version: SAVE_VERSION, savedAt: Date.now(), difficulty, state }
    localStorage.setItem(SAVE_KEY, JSON.stringify(save))
  } catch {
    // storage unavailable (private mode) — the game just won't persist
  }
}

export function loadSavedGame(): SavedGame | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    const parsed = parseSave(raw)
    if (!parsed) {
      clearSavedGame()
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function clearSavedGame(): void {
  try {
    localStorage.removeItem(SAVE_KEY)
  } catch {
    // ignore
  }
}
