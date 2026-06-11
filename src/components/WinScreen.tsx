import type { GameState } from '../engine/types'

interface WinScreenProps {
  state: GameState
  onPlayAgain: () => void
  onChangeSettings: () => void
}

export function WinScreen({ state, onPlayAgain, onChangeSettings }: WinScreenProps) {
  const winner = state.players[state.winner!]
  return (
    <div className="overlay">
      <div className="modal win-modal">
        <h2>{winner.isHuman ? '🎉 You win!' : `${winner.name} wins`}</h2>
        {!winner.isHuman && <p>Better luck next round.</p>}
        <div className="modal-buttons">
          <button className="btn btn-primary" onClick={onPlayAgain}>
            Play again
          </button>
          <button className="btn" onClick={onChangeSettings}>
            Change settings
          </button>
        </div>
      </div>
    </div>
  )
}
