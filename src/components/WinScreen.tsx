import { cardPoints } from '../engine/game'
import { TARGET_SCORE, type GameState } from '../engine/types'

interface WinScreenProps {
  state: GameState
  viewerId: number
  /** next round with carried scores — host/local only */
  onPlayAgain?: () => void
  /** fresh match with zeroed scores — host/local only */
  onNewMatch?: () => void
  onLeave: () => void
  /** open the global leaderboard — solo only */
  onLeaderboard?: () => void
}

export function WinScreen({ state, viewerId, onPlayAgain, onNewMatch, onLeave, onLeaderboard }: WinScreenProps) {
  const winner = state.players[state.winner!]
  const viewerWon = viewerId === winner.id
  const matchOver = state.scores[winner.id] >= TARGET_SCORE
  const roundPoints = state.players.reduce(
    (sum, p) => sum + p.hand.reduce((s, c) => s + cardPoints(c), 0),
    0,
  )
  const standings = [...state.players].sort((a, b) => state.scores[b.id] - state.scores[a.id])

  return (
    <div className="overlay">
      <div className="modal win-modal">
        <h2>
          {matchOver
            ? viewerWon
              ? '🏆 You win the match!'
              : `🏆 ${winner.name} wins the match`
            : viewerWon
              ? '🎉 You win the round!'
              : `${winner.name} wins the round`}
        </h2>
        <p>
          {winner.name} scores {roundPoints} points{matchOver ? '' : ` — first to ${TARGET_SCORE} wins`}
        </p>

        <table className="scoreboard">
          <tbody>
            {standings.map((p) => (
              <tr key={p.id} className={p.id === winner.id ? 'score-winner' : ''}>
                <td>{p.name}</td>
                <td>{state.scores[p.id]}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {!onPlayAgain && !matchOver && (
          <p className="setup-note">Waiting for the host to start the next round…</p>
        )}
        {!onNewMatch && matchOver && (
          <p className="setup-note">Waiting for the host…</p>
        )}

        <div className="modal-buttons">
          {!matchOver && onPlayAgain && (
            <button className="btn btn-primary" onClick={onPlayAgain}>
              Next round
            </button>
          )}
          {matchOver && onNewMatch && (
            <button className="btn btn-primary" onClick={onNewMatch}>
              New match
            </button>
          )}
          <button className="btn" onClick={onLeave}>
            Leave table
          </button>
          {onLeaderboard && (
            <button className="btn" onClick={onLeaderboard}>
              🏆 Leaderboard
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
