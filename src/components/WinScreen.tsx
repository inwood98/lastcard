import type { GameState } from '../engine/types'

interface WinScreenProps {
  state: GameState
  viewerId: number
  /** absent for online guests — only the host can re-deal */
  onPlayAgain?: () => void
  onLeave: () => void
}

export function WinScreen({ state, viewerId, onPlayAgain, onLeave }: WinScreenProps) {
  const winner = state.players[state.winner!]
  const viewerWon = viewerId === winner.id
  return (
    <div className="overlay">
      <div className="modal win-modal">
        <h2>{viewerWon ? '🎉 You win!' : `${winner.name} wins`}</h2>
        {!onPlayAgain && <p>Waiting for the host to start the next round…</p>}
        <div className="modal-buttons">
          {onPlayAgain && (
            <button className="btn btn-primary" onClick={onPlayAgain}>
              Play again
            </button>
          )}
          <button className="btn" onClick={onLeave}>
            Leave table
          </button>
        </div>
      </div>
    </div>
  )
}
