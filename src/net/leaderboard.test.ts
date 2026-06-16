import { afterEach, describe, expect, it, vi } from 'vitest'
import { isConfigured, submitResult, fetchLeaderboard, matchResultFor, loadBannedNames, changedPlayers, subscribeToResults } from './leaderboard'
import { supabase } from './supabase'
import { initGame } from '../engine/game'
import { DEFAULT_RULES } from '../engine/types'
import type { GameState } from '../engine/types'
import type { LeaderboardRow } from './leaderboard'

vi.mock('./supabase', () => ({ supabase: vi.fn() }))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
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

    await submitResult({ playerName: 'Ada', won: true, points: 510, caughtOpponents: 0 })

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
      caught_opponents: 0,
      mode: 'solo',
    })
  })

  it('no-ops when unconfigured', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await submitResult({ playerName: 'Ada', won: true, points: 1, caughtOpponents: 0 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('swallows network errors', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await expect(submitResult({ playerName: 'Ada', won: true, points: 1, caughtOpponents: 0 })).resolves.toBeUndefined()
  })
})

describe('loadBannedNames', () => {
  it('loadBannedNames populates the ban set and silently ignores errors', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')

    // No-op when fetch fails
    vi.stubGlobal('fetch', async () => { throw new Error('network error') })
    await expect(loadBannedNames()).resolves.toBeUndefined()

    // Populates set when fetch succeeds
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      json: async () => [{ name: 'Spammer' }, { name: 'CHEATER' }],
    } as Response))
    await loadBannedNames()
    // Verify by checking submitResult skips fetch for banned name
    let called = false
    vi.stubGlobal('fetch', async () => { called = true; return { ok: true, json: async () => [] } as Response })
    await submitResult({ playerName: 'spammer', won: false, points: 0, caughtOpponents: 0 })
    expect(called).toBe(false)  // lowercase 'spammer' should be banned (case-insensitive)
  })
})

describe('submitResult ban enforcement', () => {
  it('skips fetch when player is banned', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')

    let fetchCallCount = 0
    vi.stubGlobal('fetch', async (url: string) => {
      fetchCallCount++
      if (String(url).includes('banned_names')) {
        return { ok: true, json: async () => [{ name: 'BadPlayer' }] } as Response
      }
      return { ok: true, json: async () => [] } as Response
    })

    // Load banned names (seeds the module-level Set)
    await loadBannedNames()
    fetchCallCount = 0  // reset after loadBannedNames call

    // Now submitResult with a banned name should skip fetch
    await submitResult({ playerName: 'BadPlayer', won: true, points: 100, caughtOpponents: 0 })
    expect(fetchCallCount).toBe(0)

    // But a non-banned player should still submit
    await submitResult({ playerName: 'GoodPlayer', won: true, points: 100, caughtOpponents: 0 })
    expect(fetchCallCount).toBe(1)
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

describe('changedPlayers', () => {
  const base: LeaderboardRow[] = [
    { player_name: 'Ada', wins: 2, games: 3 },
    { player_name: 'Bob', wins: 1, games: 4 },
  ]

  it('returns nothing when prev and next match', () => {
    expect(changedPlayers(base, base)).toEqual([])
  })

  it('detects a brand-new player', () => {
    const next = [...base, { player_name: 'Cy', wins: 1, games: 1 }]
    expect(changedPlayers(base, next)).toEqual(['Cy'])
  })

  it('detects an increased win count', () => {
    const next = [{ player_name: 'Ada', wins: 3, games: 4 }, base[1]]
    expect(changedPlayers(base, next)).toEqual(['Ada'])
  })

  it('detects an increased games count with same wins', () => {
    const next = [base[0], { player_name: 'Bob', wins: 1, games: 5 }]
    expect(changedPlayers(base, next)).toEqual(['Bob'])
  })
})

describe('subscribeToResults', () => {
  it('returns a callable no-op when unconfigured and never touches the SDK', () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    const unsub = subscribeToResults(() => {})
    expect(typeof unsub).toBe('function')
    expect(() => unsub()).not.toThrow()
    expect(supabase).not.toHaveBeenCalled()
  })

  it('subscribes to match_results inserts and unsubscribes via removeChannel', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')

    const channel = {
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    }
    const removeChannel = vi.fn()
    const client = { channel: vi.fn().mockReturnValue(channel), removeChannel }
    vi.mocked(supabase).mockReturnValue(client as never)

    const onInsert = vi.fn()
    const onStatus = vi.fn()
    const unsub = subscribeToResults(onInsert, onStatus)

    expect(client.channel).toHaveBeenCalledWith('leaderboard-results')
    expect(channel.on).toHaveBeenCalledWith(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'match_results' },
      expect.any(Function),
    )

    const insertHandler = channel.on.mock.calls[0][2] as () => void
    insertHandler()
    expect(onInsert).toHaveBeenCalledTimes(1)

    const statusCb = channel.subscribe.mock.calls[0][0] as (s: string) => void
    statusCb('SUBSCRIBED')
    expect(onStatus).toHaveBeenCalledWith(true)
    statusCb('CHANNEL_ERROR')
    expect(onStatus).toHaveBeenCalledWith(false)

    unsub()
    expect(removeChannel).toHaveBeenCalledWith(channel)
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
    expect(matchResultFor(state, 'Ada')).toEqual({ playerName: 'Ada', won: true, points: 510, caughtOpponents: 0 })
  })

  it('returns a loss for the human when a bot reaches the target', () => {
    const state: GameState = { ...midGame(), phase: 'roundOver', scores: [200, 505, 90] }
    expect(matchResultFor(state, 'Ada')).toEqual({ playerName: 'Ada', won: false, points: 200, caughtOpponents: 0 })
  })
})
