import type { GameState } from '../engine/types'
import { handSize } from '../net/redact'

interface LastCardControlsProps {
  state: GameState
  viewerId: number
  showLastCard: boolean
  onCallLastCard: () => void
  onCatch: (targetId: number) => void
  canPass: boolean
  onPass: () => void
}

export function LastCardControls({
  state,
  viewerId,
  showLastCard,
  onCallLastCard,
  onCatch,
  canPass,
  onPass,
}: LastCardControlsProps) {
  const catchable = state.players.filter(
    (p) => p.id !== viewerId && handSize(p) === 1 && !p.calledLastCard && state.winner === null,
  )
  return (
    <div className="lastcard-controls">
      {showLastCard && (
        <button className="btn btn-lastcard" onClick={onCallLastCard}>
          LAST CARD!
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
