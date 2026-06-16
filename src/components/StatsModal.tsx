import { useState, useEffect } from 'react'
import { fetchPlayerMatches, computeStats, computeAchievements } from '../net/stats'

interface StatsModalProps {
  playerName: string
  onClose: () => void
}

export function StatsModal({ playerName, onClose }: StatsModalProps) {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ wins: 0, games: 0, winRate: 0, currentStreak: 0, bestStreak: 0 })
  const [achievements, setAchievements] = useState(computeAchievements([]))

  useEffect(() => {
    let cancelled = false
    fetchPlayerMatches(playerName).then((matches) => {
      if (cancelled) return
      setStats(computeStats(matches))
      setAchievements(computeAchievements(matches))
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [playerName])

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: '0 0 4px' }}>{playerName}'s Stats</h2>

        {loading ? (
          <p style={{ color: 'rgba(255,255,255,0.6)' }}>Loading…</p>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, margin: '16px 0' }}>
              {[
                { label: 'Wins', value: stats.wins },
                { label: 'Games', value: stats.games },
                { label: 'Win rate', value: `${stats.winRate}%` },
                { label: 'Current streak', value: stats.currentStreak },
                { label: 'Best streak', value: stats.bestStreak },
              ].map(({ label, value }) => (
                <div key={label} style={{ textAlign: 'center', background: 'rgba(255,255,255,0.07)', borderRadius: 10, padding: '10px 6px' }}>
                  <div style={{ fontSize: 22, fontWeight: 900 }}>{value}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>

            <h3 style={{ margin: '16px 0 10px', fontSize: 14, textTransform: 'uppercase', letterSpacing: 1, color: 'rgba(255,255,255,0.5)' }}>Achievements</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {achievements.map((a) => (
                <div
                  key={a.id}
                  title={a.unlocked ? a.name : `${a.name}: ${a.condition}`}
                  style={{
                    textAlign: 'center',
                    padding: '10px 4px',
                    borderRadius: 10,
                    background: a.unlocked ? 'rgba(255,206,0,0.12)' : 'rgba(255,255,255,0.05)',
                    filter: a.unlocked ? 'none' : 'grayscale(1) opacity(0.35)',
                  }}
                >
                  <div style={{ fontSize: 26 }}>{a.emoji}</div>
                  <div style={{ fontSize: 10, marginTop: 4, color: 'rgba(255,255,255,0.7)', lineHeight: 1.3 }}>{a.name}</div>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="modal-buttons" style={{ marginTop: 20 }}>
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
