import type { Card as CardType } from '../engine/types'
import { Card } from './Card'
import { anchorRef } from '../fx/anchors'

interface HandProps {
  cards: CardType[]
  legalIds: Set<number>
  myTurn: boolean
  onPlay: (cardId: number) => void
}

const COLOR_ORDER = { red: 0, yellow: 1, green: 2, blue: 3 }

function sortKey(c: CardType): string {
  const color = c.color ? COLOR_ORDER[c.color] : 4
  const value = typeof c.value === 'number' ? String(c.value) : { skip: 'a', reverse: 'b', draw2: 'c', wild: 'd', wild4: 'e' }[c.value]
  return `${color}-${value}`
}

export function Hand({ cards, legalIds, myTurn, onPlay }: HandProps) {
  const sorted = [...cards].sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
  return (
    <div ref={anchorRef('hand')} className="hand">
      {sorted.map((card) => {
        const playable = myTurn && legalIds.has(card.id)
        return (
          <Card
            key={card.id}
            card={card}
            size="lg"
            playable={playable}
            onClick={playable ? () => onPlay(card.id) : undefined}
          />
        )
      })}
    </div>
  )
}
