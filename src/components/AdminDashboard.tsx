import { useState, useEffect, useCallback } from 'react'
import {
  fetchAllPlayers, fetchMatchHistory, fetchAdminBannedNames,
  deletePlayerResults, deleteMatchResult, banName, unbanName,
  type AdminPlayer, type AdminMatch, type BannedName,
} from '../net/admin'

type Tab = 'players' | 'history' | 'bans'

const th: React.CSSProperties = { padding: '8px 12px', textAlign: 'left', color: 'rgba(255,255,255,0.5)', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.1)' }
const td: React.CSSProperties = { padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 14 }

export function AdminDashboard({ onSignOut }: { onSignOut: () => void }) {
  const [tab, setTab] = useState<Tab>('players')
  const [players, setPlayers] = useState<AdminPlayer[]>([])
  const [history, setHistory] = useState<AdminMatch[]>([])
  const [bans, setBans] = useState<BannedName[]>([])
  const [historyFilter, setHistoryFilter] = useState('')
  const [newBan, setNewBan] = useState('')
  const [loading, setLoading] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    const [p, h, b] = await Promise.all([fetchAllPlayers(), fetchMatchHistory(), fetchAdminBannedNames()])
    setPlayers(p)
    setHistory(h)
    setBans(b)
    setLoading(false)
  }, [])

  useEffect(() => { void reload() }, [reload])

  const handleDeletePlayer = async (name: string) => {
    if (!confirm(`Delete ALL results for "${name}"?`)) return
    await deletePlayerResults(name)
    await reload()
  }

  const handleBanPlayer = async (name: string) => {
    if (!confirm(`Ban "${name}"? Their results will be hidden and future submissions blocked.`)) return
    await banName(name)
    await reload()
  }

  const handleDeleteMatch = async (id: string) => {
    if (!confirm('Delete this match result?')) return
    await deleteMatchResult(id)
    await reload()
  }

  const handleUnban = async (name: string) => {
    await unbanName(name)
    await reload()
  }

  const handleAddBan = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newBan.trim()) return
    await banName(newBan.trim())
    setNewBan('')
    await reload()
  }

  const filteredHistory = historyFilter.trim()
    ? history.filter((m) => m.player_name.toLowerCase().includes(historyFilter.toLowerCase()))
    : history

  const tabBtn = (t: Tab, label: string) => (
    <button
      key={t}
      className={tab === t ? 'option selected' : 'option'}
      onClick={() => setTab(t)}
      style={{ minWidth: 120 }}
    >
      {label}
    </button>
  )

  return (
    <div style={{ minHeight: '100dvh', background: '#16161d', color: '#fff', padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontStyle: 'italic', fontSize: 22 }}>LAST CARD! Admin</h1>
        <button className="btn" onClick={onSignOut}>Sign out</button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {tabBtn('players', '👥 Players')}
        {tabBtn('history', '📋 Match History')}
        {tabBtn('bans', '🚫 Banned Names')}
      </div>

      {loading && <p style={{ color: 'rgba(255,255,255,0.4)' }}>Loading…</p>}

      {!loading && tab === 'players' && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Name</th>
              <th style={th}>Wins</th>
              <th style={th}>Games</th>
              <th style={th}>Win %</th>
              <th style={th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.player_name}>
                <td style={td}>{p.player_name}</td>
                <td style={td}>{p.wins}</td>
                <td style={td}>{p.games}</td>
                <td style={td}>{p.winRate}%</td>
                <td style={{ ...td, display: 'flex', gap: 8 }}>
                  <button className="btn btn-danger" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => handleDeletePlayer(p.player_name)}>Delete all</button>
                  <button className="btn btn-danger" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => handleBanPlayer(p.player_name)}>Ban</button>
                </td>
              </tr>
            ))}
            {players.length === 0 && <tr><td style={td} colSpan={5}>No players yet.</td></tr>}
          </tbody>
        </table>
      )}

      {!loading && tab === 'history' && (
        <>
          <input
            style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.07)', color: '#fff', fontSize: 14, width: 240 }}
            placeholder="Filter by name…"
            value={historyFilter}
            onChange={(e) => setHistoryFilter(e.target.value)}
          />
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Date</th>
                <th style={th}>Player</th>
                <th style={th}>Result</th>
                <th style={th}>Points</th>
                <th style={th}>Catches</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {filteredHistory.map((m) => (
                <tr key={m.id}>
                  <td style={td}>{new Date(m.created_at).toLocaleDateString()}</td>
                  <td style={td}>{m.player_name}</td>
                  <td style={{ ...td, color: m.won ? '#3bab23' : '#eb1c24' }}>{m.won ? 'Won' : 'Lost'}</td>
                  <td style={td}>{m.points}</td>
                  <td style={td}>{m.caught_opponents}</td>
                  <td style={td}>
                    <button className="btn btn-danger" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => handleDeleteMatch(m.id)}>Delete</button>
                  </td>
                </tr>
              ))}
              {filteredHistory.length === 0 && <tr><td style={td} colSpan={6}>No matches found.</td></tr>}
            </tbody>
          </table>
        </>
      )}

      {!loading && tab === 'bans' && (
        <>
          <form onSubmit={handleAddBan} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.07)', color: '#fff', fontSize: 14, width: 220 }}
              placeholder="Name to ban…"
              value={newBan}
              onChange={(e) => setNewBan(e.target.value)}
            />
            <button className="btn btn-danger" type="submit">Ban</button>
          </form>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Name</th>
                <th style={th}>Banned at</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {bans.map((b) => (
                <tr key={b.name}>
                  <td style={td}>{b.name}</td>
                  <td style={td}>{new Date(b.banned_at).toLocaleDateString()}</td>
                  <td style={td}>
                    <button className="btn" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => handleUnban(b.name)}>Unban</button>
                  </td>
                </tr>
              ))}
              {bans.length === 0 && <tr><td style={td} colSpan={3}>No banned names.</td></tr>}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}
