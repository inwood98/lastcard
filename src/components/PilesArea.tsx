import type { GameState } from '../engine/types'
import { CARD_COLORS, Card } from './Card'
import { anchorRef } from '../fx/anchors'

interface PilesAreaProps {
  state: GameState
  canDraw: boolean
  canTakePenalty: boolean
  onDraw: () => void
}

export function PilesArea({ state, canDraw, canTakePenalty, onDraw }: PilesAreaProps) {
  const top = state.discardPile[state.discardPile.length - 1]
  const clickable = canDraw || canTakePenalty
  return (
    <div className="piles">
      <div
        ref={anchorRef('draw')}
        className={clickable ? 'draw-pile draw-pile-active' : 'draw-pile'}
        onClick={clickable ? onDraw : undefined}
        role="button"
        aria-label="Draw pile"
      >
        <Card faceDown size="lg" />
        {canTakePenalty && <div className="pile-label">Draw {state.pendingDraw}</div>}
        {canDraw && !canTakePenalty && <div className="pile-label">Draw</div>}
      </div>

      <div className="direction" data-dir={state.direction}>
        <svg viewBox="0 0 100 100" width="56" height="56">
          <path
            d="M 50 12 A 38 38 0 1 1 14 38"
            fill="none"
            stroke="rgba(255,255,255,0.65)"
            strokeWidth="9"
            strokeLinecap="round"
          />
          <polygon points="2,42 30,32 16,56" fill="rgba(255,255,255,0.65)" />
        </svg>
      </div>

      <div
        ref={anchorRef('discard')}
        className="discard-pile"
        style={{ boxShadow: `0 0 26px 6px ${CARD_COLORS[state.currentColor]}66` }}
      >
        <Card key={top.id} card={top} size="lg" activeColor={state.currentColor} />
      </div>
    </div>
  )
}
