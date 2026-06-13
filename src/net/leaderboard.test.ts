import { afterEach, describe, expect, it, vi } from 'vitest'
import { isConfigured, submitResult, fetchLeaderboard, matchResultFor } from './leaderboard'
import { initGame } from '../engine/game'
import { DEFAULT_RULES } from '../engine/types'
import type { GameState } from '../engine/types'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('isConfigured', () => {
  it('is false when env vars are missing', () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    expect(isConfigured()).toBe(false)
  })

  it('is true when both env vars are set', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
    expect(isConfigured()).toBe(true)
  })
})

describe('submitResult', () => {
  it('POSTs the result to PostgREST with auth headers', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    await submitResult({ playerName: 'Ada', won: true, points: 510 })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('https://x.supabase.co/rest/v1/match_results')
    expect(opts.method).toBe('POST')
    expect(opts.headers.apikey).toBe('anon-key')
    expect(opts.headers.Authorization).toBe('Bearer anon-key')
    expect(JSON.parse(opts.body)).toEqual({
      player_name: 'Ada',
      won: true,
      points: 510,
      mode: 'solo',
    })
  })

  it('no-ops when unconfigured', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await submitResult({ playerName: 'Ada', won: true, points: 1 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('swallows network errors', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await expect(submitResult({ playerName: 'Ada', won: true, points: 1 })).resolves.toBeUndefined()
  })
})

describe('fetchLeaderboard', () => {
  it('GETs the leaderboard view and returns rows', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
    const rows = [{ player_name: 'Ada', wins: 3, games: 5 }]
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(rows) })
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchLeaderboard()

    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('https://x.supabase.co/rest/v1/leaderboard?select=*')
    expect(opts.headers.apikey).toBe('anon-key')
    expect(result).toEqual(rows)
  })

  it('returns [] when unconfigured', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    expect(await fetchLeaderboard()).toEqual([])
  })

  it('returns [] on network error', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    expect(await fetchLeaderboard()).toEqual([])
  })
})

function midGame(): GameState {
  return initGame({ playerName: 'Ada', botCount: 2, rules: DEFAULT_RULES, seed: 1 })
}

describe('matchResultFor', () => {
  it('returns null mid-game', () => {
    expect(matchResultFor(midGame(), 'Ada')).toBeNull()
  })

  it('returns a win for the human when seat 0 reaches the target', () => {
    const state: GameState = { ...midGame(), phase: 'roundOver', scores: [510, 120, 90] }
    expect(matchResultFor(state, 'Ada')).toEqual({ playerName: 'Ada', won: true, points: 510 })
  })

  it('returns a loss for the human when a bot reaches the target', () => {
    const state: GameState = { ...midGame(), phase: 'roundOver', scores: [200, 505, 90] }
    expect(matchResultFor(state, 'Ada')).toEqual({ playerName: 'Ada', won: false, points: 200 })
  })
})
