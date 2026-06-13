import { useEffect, useState } from 'react'
import { fetchLeaderboard, isConfigured, type LeaderboardRow } from '../net/leaderboard'

interface LeaderboardProps {
  /** highlight this player's row */
  currentName?: string
  onClose: () => void
}

type Status = 'loading' | 'ready' | 'error' | 'disabled'

export function Leaderboard({ currentName, onClose }: LeaderboardProps) {
  const [rows, setRows] = useState<LeaderboardRow[]>([])
  const [status, setStatus] = useState<Status>(() =>
    isConfigured() ? 'loading' : 'disabled',
  )

  useEffect(() => {
    if (status === 'disabled') return
    let live = true
    fetchLeaderboard()
      .then((data) => {
        if (!live) return
        const sorted = [...data].sort((a, b) => b.wins - a.wins || a.games - b.games)
        setRows(sorted)
        setStatus('ready')
      })
      .catch(() => {
        if (live) setStatus('error')
      })
    return () => {
      live = false
    }
  }, [status])

  return (
    <div className="overlay">
      <div className="modal">
        <h2>🏆 Leaderboard</h2>

        {status === 'loading' && <p className="setup-note">Loading…</p>}
        {status === 'disabled' && <p className="setup-note">The leaderboard isn't configured.</p>}
        {status === 'error' && <p className="setup-note">Couldn't reach the leaderboard.</p>}
        {status === 'ready' && rows.length === 0 && (
          <p className="setup-note">No games recorded yet — be the first!</p>
        )}

        {status === 'ready' && rows.length > 0 && (
          <table className="scoreboard">
            <thead>
              <tr>
                <td>#</td>
                <td>Player</td>
                <td>Wins</td>
                <td>Games</td>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={r.player_name}
                  className={r.player_name === currentName ? 'score-winner' : ''}
                >
                  <td>{i + 1}</td>
                  <td>{r.player_name}</td>
                  <td>{r.wins}</td>
                  <td>{r.games}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="modal-buttons">
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
