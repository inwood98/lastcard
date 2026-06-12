import type { PlayerState } from '../engine/types'
import { handSize } from '../net/redact'
import { Card } from './Card'

interface OpponentSeatProps {
  player: PlayerState
  score: number
  isCurrent: boolean
  disconnected?: boolean
}

export function OpponentSeat({ player, score, isCurrent, disconnected }: OpponentSeatProps) {
  const count = handSize(player)
  const fanned = Math.min(count, 7)
  return (
    <div className={isCurrent ? 'seat seat-active' : 'seat'}>
      <div className="seat-name">
        {player.name}
        {player.calledUno && count === 1 && <span className="uno-badge">UNO!</span>}
        {disconnected && <span className="offline-badge">offline</span>}
      </div>
      <div className="seat-cards">
        {Array.from({ length: fanned }, (_, i) => (
          <div
            key={i}
            className="seat-card"
            style={{ transform: `rotate(${(i - (fanned - 1) / 2) * 7}deg) translateY(${Math.abs(i - (fanned - 1) / 2) * 2}px)` }}
          >
            <Card faceDown size="sm" />
          </div>
        ))}
      </div>
      <div className="seat-count">
        {count === 1 ? '1 card' : `${count} cards`} · {score} pts
      </div>
    </div>
  )
}
