import { describe, it, expect } from 'vitest'
import { computeStats, computeAchievements } from './stats'
import type { PlayerMatch } from './stats'

function match(
  won: boolean,
  opts: { caught_opponents?: number; created_at?: string } = {},
): PlayerMatch {
  return {
    id: Math.random().toString(),
    won,
    points: 0,
    caught_opponents: opts.caught_opponents ?? 0,
    created_at: opts.created_at ?? new Date().toISOString(),
  }
}

describe('computeStats', () => {
  it('returns zeros for empty match list', () => {
    expect(computeStats([])).toEqual({
      wins: 0, games: 0, winRate: 0, currentStreak: 0, bestStreak: 0,
    })
  })

  it('counts wins and games', () => {
    const stats = computeStats([match(true), match(false), match(true)])
    expect(stats.wins).toBe(2)
    expect(stats.games).toBe(3)
    expect(stats.winRate).toBe(67)
  })

  it('computes current streak from most recent games descending', () => {
    const matches = [
      match(true, { created_at: '2026-06-03T00:00:00Z' }),
      match(true, { created_at: '2026-06-02T00:00:00Z' }),
      match(false, { created_at: '2026-06-01T00:00:00Z' }),
    ]
    expect(computeStats(matches).currentStreak).toBe(2)
  })

  it('currentStreak is 0 when most recent game was a loss', () => {
    const matches = [
      match(false, { created_at: '2026-06-03T00:00:00Z' }),
      match(true, { created_at: '2026-06-02T00:00:00Z' }),
    ]
    expect(computeStats(matches).currentStreak).toBe(0)
  })

  it('computes best streak across all history', () => {
    const matches = [
      match(true, { created_at: '2026-06-06T00:00:00Z' }),
      match(false, { created_at: '2026-06-05T00:00:00Z' }),
      match(true, { created_at: '2026-06-04T00:00:00Z' }),
      match(true, { created_at: '2026-06-03T00:00:00Z' }),
      match(true, { created_at: '2026-06-02T00:00:00Z' }),
      match(false, { created_at: '2026-06-01T00:00:00Z' }),
    ]
    expect(computeStats(matches).bestStreak).toBe(3)
  })
})

describe('computeAchievements', () => {
  it('unlocks First Win after 1 win', () => {
    const achievements = computeAchievements([match(true)])
    expect(achievements.find((a) => a.id === 'first-win')?.unlocked).toBe(true)
  })

  it('locks Champion with fewer than 10 wins', () => {
    const achievements = computeAchievements([match(true)])
    expect(achievements.find((a) => a.id === 'champion')?.unlocked).toBe(false)
  })

  it('unlocks On a Roll with a 3-win streak', () => {
    const matches = [
      match(true, { created_at: '2026-06-03T00:00:00Z' }),
      match(true, { created_at: '2026-06-02T00:00:00Z' }),
      match(true, { created_at: '2026-06-01T00:00:00Z' }),
    ]
    expect(computeAchievements(matches).find((a) => a.id === 'on-a-roll')?.unlocked).toBe(true)
  })

  it('unlocks Snitch when any match has caught_opponents > 0', () => {
    const achievements = computeAchievements([match(false, { caught_opponents: 1 })])
    expect(achievements.find((a) => a.id === 'snitch')?.unlocked).toBe(true)
  })

  it('returns 8 achievements', () => {
    expect(computeAchievements([])).toHaveLength(8)
  })
})
