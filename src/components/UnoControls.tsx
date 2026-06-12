import type { GameState } from '../engine/types'
import { handSize } from '../net/redact'

interface UnoControlsProps {
  state: GameState
  viewerId: number
  showUno: boolean
  onCallUno: () => void
  onCatch: (targetId: number) => void
  canPass: boolean
  onPass: () => void
}

export function UnoControls({
  state,
  viewerId,
  showUno,
  onCallUno,
  onCatch,
  canPass,
  onPass,
}: UnoControlsProps) {
  const catchable = state.players.filter(
    (p) => p.id !== viewerId && handSize(p) === 1 && !p.calledUno && state.winner === null,
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
