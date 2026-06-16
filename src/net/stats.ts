import { supabaseEnv } from './env'

export interface PlayerMatch {
  id: string
  won: boolean
  points: number
  caught_opponents: number
  created_at: string
}

export interface PlayerStats {
  wins: number
  games: number
  winRate: number
  currentStreak: number
  bestStreak: number
}

export interface Achievement {
  id: string
  emoji: string
  name: string
  condition: string
  unlocked: boolean
}

export function computeStats(matches: PlayerMatch[]): PlayerStats {
  const games = matches.length
  const wins = matches.filter((m) => m.won).length
  const winRate = games > 0 ? Math.round((wins / games) * 100) : 0

  const sorted = [...matches].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )

  let currentStreak = 0
  for (const m of sorted) {
    if (m.won) currentStreak++
    else break
  }

  let bestStreak = 0
  let streak = 0
  for (const m of [...sorted].reverse()) {
    if (m.won) {
      streak++
      if (streak > bestStreak) bestStreak = streak
    } else {
      streak = 0
    }
  }

  return { wins, games, winRate, currentStreak, bestStreak }
}

export function computeAchievements(matches: PlayerMatch[]): Achievement[] {
  const stats = computeStats(matches)
  const hasCaught = matches.some((m) => m.caught_opponents > 0)
  return [
    { id: 'first-win', emoji: '🏆', name: 'First Win', condition: '1 win', unlocked: stats.wins >= 1 },
    { id: 'champion', emoji: '🏅', name: 'Champion', condition: '10 wins', unlocked: stats.wins >= 10 },
    { id: 'legend', emoji: '👑', name: 'Legend', condition: '50 wins', unlocked: stats.wins >= 50 },
    { id: 'on-a-roll', emoji: '🔥', name: 'On a Roll', condition: '3 wins in a row', unlocked: stats.bestStreak >= 3 },
    { id: 'hot-streak', emoji: '⚡', name: 'Hot Streak', condition: '5 wins in a row', unlocked: stats.bestStreak >= 5 },
    { id: 'veteran', emoji: '🎖️', name: 'Veteran', condition: '25 games played', unlocked: stats.games >= 25 },
    { id: 'century', emoji: '💯', name: 'Century', condition: '100 games played', unlocked: stats.games >= 100 },
    { id: 'snitch', emoji: '👀', name: 'Snitch', condition: 'Catch an opponent', unlocked: hasCaught },
  ]
}

export async function fetchPlayerMatches(playerName: string): Promise<PlayerMatch[]> {
  const { url, anon } = supabaseEnv()
  if (!url || !anon) return []
  try {
    const encoded = encodeURIComponent(playerName)
    const res = await fetch(
      `${url}/rest/v1/match_results?player_name=eq.${encoded}&select=id,won,points,caught_opponents,created_at&order=created_at.desc`,
      { headers: { apikey: anon, Authorization: `Bearer ${anon}` } },
    )
    if (!res.ok) return []
    return (await res.json()) as PlayerMatch[]
  } catch {
    return []
  }
}
