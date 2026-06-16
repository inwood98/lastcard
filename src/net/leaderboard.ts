import { TARGET_SCORE, type GameState } from '../engine/types'
import { supabaseEnv } from './env'
import { supabase } from './supabase'

let bannedNames = new Set<string>()

export interface LeaderboardRow {
  player_name: string
  wins: number
  games: number
}

export interface MatchResult {
  playerName: string
  won: boolean
  points: number
  caughtOpponents: number
}

export function isConfigured(): boolean {
  const { url, anon } = supabaseEnv()
  return Boolean(url && anon)
}

export async function submitResult(result: MatchResult): Promise<void> {
  const { url, anon } = supabaseEnv()
  if (!url || !anon) return
  if (bannedNames.has(result.playerName.toLowerCase())) return  // banned player
  try {
    const res = await fetch(`${url}/rest/v1/match_results`, {
      method: 'POST',
      headers: {
        apikey: anon,
        Authorization: `Bearer ${anon}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        player_name: result.playerName,
        won: result.won,
        points: result.points,
        caught_opponents: result.caughtOpponents,
        mode: 'solo',
      }),
    })
    if (!res.ok) console.warn('leaderboard: submit failed', res.status)
  } catch (err) {
    console.warn('leaderboard: submit failed', err)
  }
}

export async function fetchLeaderboard(): Promise<LeaderboardRow[]> {
  const { url, anon } = supabaseEnv()
  if (!url || !anon) return []
  try {
    const res = await fetch(`${url}/rest/v1/leaderboard?select=*`, {
      headers: { apikey: anon, Authorization: `Bearer ${anon}` },
    })
    if (!res.ok) return []
    return (await res.json()) as LeaderboardRow[]
  } catch (err) {
    console.warn('leaderboard: fetch failed', err)
    return []
  }
}

export async function loadBannedNames(): Promise<void> {
  const { url, anon } = supabaseEnv()
  if (!url || !anon) return
  try {
    const res = await fetch(`${url}/rest/v1/banned_names?select=name`, {
      headers: { apikey: anon, Authorization: `Bearer ${anon}` },
    })
    if (!res.ok) return
    const rows = (await res.json()) as { name: string }[]
    bannedNames = new Set(rows.map((r) => r.name.toLowerCase()))
  } catch {
    // ignore — ban enforcement is best-effort
  }
}

/** The human (seat 0) result for a completed solo match, or null if the match isn't over. */
export function matchResultFor(state: GameState, playerName: string): MatchResult | null {
  const matchOver = state.phase === 'roundOver' && state.scores.some((s) => s >= TARGET_SCORE)
  if (!matchOver) return null
  return {
    playerName,
    won: state.scores[0] >= TARGET_SCORE,
    points: state.scores[0],
    caughtOpponents: 0,  // caller (useGame) overrides this with the real count
  }
}

/** player_names in `next` that are new or whose wins/games differ from `prev`. */
export function changedPlayers(prev: LeaderboardRow[], next: LeaderboardRow[]): string[] {
  const before = new Map(prev.map((r) => [r.player_name, r]))
  const changed: string[] = []
  for (const row of next) {
    const old = before.get(row.player_name)
    if (!old || old.wins !== row.wins || old.games !== row.games) {
      changed.push(row.player_name)
    }
  }
  return changed
}

/**
 * Live-subscribe to new match results. Calls `onInsert` on every inserted row and
 * `onStatus(connected)` as the channel connects/disconnects. Returns an unsubscribe
 * function. No-op (returns a callable that does nothing) when Supabase isn't configured.
 */
export function subscribeToResults(
  onInsert: () => void,
  onStatus?: (connected: boolean) => void,
): () => void {
  if (!isConfigured()) return () => {}
  const client = supabase()
  const channel = client
    .channel('leaderboard-results')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'match_results' },
      () => onInsert(),
    )
    .subscribe((status) => onStatus?.(status === 'SUBSCRIBED'))
  return () => {
    client.removeChannel(channel)
  }
}
