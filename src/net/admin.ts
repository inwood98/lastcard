import { supabase } from './supabase'

export interface AdminPlayer {
  player_name: string
  wins: number
  games: number
  winRate: number
}

export interface AdminMatch {
  id: string
  player_name: string
  won: boolean
  points: number
  caught_opponents: number
  created_at: string
}

export interface BannedName {
  name: string
  banned_at: string
}

export async function fetchAllPlayers(): Promise<AdminPlayer[]> {
  const { data } = await supabase()
    .from('match_results')
    .select('player_name, won')
  if (!data) return []
  const map = new Map<string, { wins: number; games: number }>()
  for (const row of data as { player_name: string; won: boolean }[]) {
    const entry = map.get(row.player_name) ?? { wins: 0, games: 0 }
    entry.games++
    if (row.won) entry.wins++
    map.set(row.player_name, entry)
  }
  return Array.from(map.entries())
    .map(([player_name, { wins, games }]) => ({
      player_name,
      wins,
      games,
      winRate: games > 0 ? Math.round((wins / games) * 100) : 0,
    }))
    .sort((a, b) => b.wins - a.wins)
}

export async function fetchMatchHistory(): Promise<AdminMatch[]> {
  const { data } = await supabase()
    .from('match_results')
    .select('id, player_name, won, points, caught_opponents, created_at')
    .order('created_at', { ascending: false })
  return (data ?? []) as AdminMatch[]
}

export async function fetchAdminBannedNames(): Promise<BannedName[]> {
  const { data } = await supabase()
    .from('banned_names')
    .select('name, banned_at')
    .order('banned_at', { ascending: false })
  return (data ?? []) as BannedName[]
}

export async function deletePlayerResults(playerName: string): Promise<void> {
  const { error } = await supabase().from('match_results').delete().eq('player_name', playerName)
  if (error) throw error
}

export async function deleteMatchResult(id: string): Promise<void> {
  const { error } = await supabase().from('match_results').delete().eq('id', id)
  if (error) throw error
}

export async function banName(name: string): Promise<void> {
  const { error } = await supabase().from('banned_names').upsert({ name })
  if (error) throw error
}

export async function unbanName(name: string): Promise<void> {
  const { error } = await supabase().from('banned_names').delete().eq('name', name)
  if (error) throw error
}
