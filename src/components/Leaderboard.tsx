import { useEffect, useRef, useState } from 'react'
import {
  changedPlayers,
  fetchLeaderboard,
  isConfigured,
  subscribeToResults,
  type LeaderboardRow,
} from '../net/leaderboard'

interface LeaderboardProps {
  /** highlight this player's row */
  currentName?: string
  onClose: () => void
}

type Status = 'loading' | 'ready' | 'error' | 'disabled'

function sortRows(data: LeaderboardRow[]): LeaderboardRow[] {
  return [...data].sort((a, b) => b.wins - a.wins || a.games - b.games)
}

export function Leaderboard({ currentName, onClose }: LeaderboardProps) {
  const [rows, setRows] = useState<LeaderboardRow[]>([])
  const [status, setStatus] = useState<Status>(() =>
    isConfigured() ? 'loading' : 'disabled',
  )
  const [live, setLive] = useState(false)
  const [flashing, setFlashing] = useState<Set<string>>(new Set())
  const rowsRef = useRef<LeaderboardRow[]>([])
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    rowsRef.current = rows
  }, [rows])

  useEffect(() => {
    if (!isConfigured()) return
    let active = true

    const flash = (names: string[]) => {
      setFlashing(new Set(names))
      if (flashTimer.current) clearTimeout(flashTimer.current)
      flashTimer.current = setTimeout(() => {
        if (active) setFlashing(new Set())
      }, 1000)
    }

    const refresh = (isInitial: boolean) => {
      fetchLeaderboard()
        .then((data) => {
          if (!active) return
          const sorted = sortRows(data)
          // ignore a transient empty refetch when a populated board is already shown
          if (!isInitial && sorted.length === 0 && rowsRef.current.length > 0) return
          if (!isInitial) {
            const changed = changedPlayers(rowsRef.current, sorted)
            if (changed.length > 0) flash(changed)
          }
          setRows(sorted)
          setStatus('ready')
        })
        .catch(() => {
          if (active && isInitial) setStatus('error')
        })
    }

    refresh(true)
    const unsubscribe = subscribeToResults(
      () => refresh(false),
      (connected) => {
        if (active) setLive(connected)
      },
    )

    return () => {
      active = false
      if (flashTimer.current) clearTimeout(flashTimer.current)
      unsubscribe()
    }
  }, [])

  return (
    <div className="overlay">
      <div className="modal">
        <h2>
          🏆 Leaderboard
          {live && <span className="live-badge">● Live</span>}
        </h2>

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
                <th scope="col">#</th>
                <th scope="col">Player</th>
                <th scope="col">Wins</th>
                <th scope="col">Games</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={r.player_name}
                  className={[
                    r.player_name === currentName ? 'score-winner' : '',
                    flashing.has(r.player_name) ? 'row-flash' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
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
