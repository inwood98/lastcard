import { DEFAULT_RULES } from './engine/types'
import type { GameSettings } from './hooks/useGame'

const KEY = 'uno-settings'

export const DEFAULT_SETTINGS: GameSettings = {
  playerName: '',
  botCount: 3,
  difficulty: 'medium',
  rules: DEFAULT_RULES,
}

export function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = JSON.parse(raw)
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      rules: { ...DEFAULT_RULES, ...(parsed.rules ?? {}) },
      scores: undefined,
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(settings: GameSettings) {
  try {
    const { scores: _scores, ...persisted } = settings
    localStorage.setItem(KEY, JSON.stringify(persisted))
  } catch {
    // storage unavailable (private mode) — settings just won't persist
  }
}
