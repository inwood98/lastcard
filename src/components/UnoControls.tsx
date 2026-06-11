import type { GameState } from '../engine/types'

interface UnoControlsProps {
  state: GameState
  showUno: boolean
  onCallUno: () => void
  onCatch: (targetId: number) => void
  canPass: boolean
  onPass: () => void
}

export function UnoControls({ state, showUno, onCallUno, onCatch, canPass, onPass }: UnoControlsProps) {
  const catchable = state.players.filter(
    (p) => !p.isHuman && p.hand.length === 1 && !p.calledUno && state.winner === null,
  )
  return (
    <div className="uno-controls">
      {showUno && (
        <button className="btn btn-uno" onClick={onCallUno}>
          UNO!
        </button>
      )}
      {catchable.map((p) => (
        <button key={p.id} className="btn btn-catch" onClick={() => onCatch(p.id)}>
          Catch {p.name}!
        </button>
      ))}
      {canPass && (
        <button className="btn" onClick={onPass}>
          Keep card
        </button>
      )}
    </div>
  )
}
