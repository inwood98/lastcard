import { useId } from 'react'
import type { Card as CardType, CardValue, Color } from '../engine/types'
import './card.css'

export const CARD_COLORS: Record<Color, string> = {
  red: '#eb1c24',
  yellow: '#ffce00',
  green: '#3bab23',
  blue: '#0f66c9',
}

interface CardProps {
  card?: CardType
  faceDown?: boolean
  size?: 'sm' | 'md' | 'lg'
  playable?: boolean
  onClick?: () => void
  /** color chosen for a wild sitting on the discard pile */
  activeColor?: Color
}

function CornerGlyph({ value, x, y, flip }: { value: CardValue; x: number; y: number; flip?: boolean }) {
  const transform = `translate(${x} ${y})${flip ? ' rotate(180)' : ''}`
  return (
    <g transform={transform} fill="#fff" stroke="#000" strokeWidth={1.5}>
      <Glyph value={value} fill="#fff" scale={0.32} corner />
    </g>
  )
}

function SkipShape({ fill, scale }: { fill: string; scale: number }) {
  return (
    <g transform={`scale(${scale})`}>
      <circle r={52} fill="none" stroke={fill} strokeWidth={16} />
      <line x1={-37} y1={37} x2={37} y2={-37} stroke={fill} strokeWidth={16} />
    </g>
  )
}

function ReverseShape({ fill, scale }: { fill: string; scale: number }) {
  const arrow = 'M -8 -18 L -8 -42 L 30 -18 L -8 6 L -8 -18 Z M -34 -18 L -8 -18 L -8 6 L -34 6 Z'
  return (
    <g transform={`scale(${scale})`}>
      <g transform="rotate(45)">
        <path d={arrow} fill={fill} transform="translate(8 -10)" />
        <path d={arrow} fill={fill} transform="rotate(180) translate(8 -10)" />
      </g>
    </g>
  )
}

function MiniCards({ colors, scale, label }: { colors: string[]; scale: number; label?: never }) {
  void label
  const offsets =
    colors.length === 2
      ? [
          [-16, -12],
          [4, 0],
        ]
      : [
          [-24, -20],
          [-8, -8],
          [8, 4],
          [24, 16],
        ]
  return (
    <g transform={`scale(${scale})`}>
      {colors.map((c, i) => (
        <rect
          key={i}
          x={offsets[i][0] - 14}
          y={offsets[i][1] - 22}
          width={32}
          height={48}
          rx={6}
          fill={c}
          stroke="#fff"
          strokeWidth={3}
          transform={`rotate(12 ${offsets[i][0]} ${offsets[i][1]})`}
        />
      ))}
    </g>
  )
}

function WildOval({ scale }: { scale: number }) {
  const clipId = useId()
  return (
    <g transform={`scale(${scale})`}>
      <clipPath id={clipId}>
        <ellipse rx={62} ry={94} transform="rotate(32)" />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        <rect x={-70} y={-100} width={70} height={100} fill={CARD_COLORS.red} />
        <rect x={0} y={-100} width={70} height={100} fill={CARD_COLORS.blue} />
        <rect x={-70} y={0} width={70} height={100} fill={CARD_COLORS.yellow} />
        <rect x={0} y={0} width={70} height={100} fill={CARD_COLORS.green} />
      </g>
      <ellipse rx={62} ry={94} transform="rotate(32)" fill="none" stroke="#fff" strokeWidth={6} />
    </g>
  )
}

function Glyph({
  value,
  fill,
  scale,
  corner,
}: {
  value: CardValue
  fill: string
  scale: number
  corner?: boolean
}) {
  if (typeof value === 'number') {
    return (
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={140 * scale * 1.45}
        fontStyle="italic"
        fontWeight={900}
        fontFamily="'Arial Black', Arial, sans-serif"
        fill={fill}
        stroke="#000"
        strokeWidth={corner ? 1.5 : 4 * scale}
        paintOrder="stroke"
      >
        {value}
      </text>
    )
  }
  switch (value) {
    case 'skip':
      return <SkipShape fill={fill} scale={scale} />
    case 'reverse':
      return <ReverseShape fill={fill} scale={scale * 1.7} />
    case 'draw2':
      if (corner) return <CornerText text="+2" fill={fill} />
      return <MiniCards colors={[fill, fill]} scale={scale * 2.2} />
    case 'wild':
      if (corner) return <WildOval scale={scale * 0.55} />
      return <WildOval scale={scale * 2.2} />
    case 'wild4':
      if (corner) return <CornerText text="+4" fill={fill} />
      return (
        <MiniCards
          colors={[CARD_COLORS.red, CARD_COLORS.blue, CARD_COLORS.yellow, CARD_COLORS.green]}
          scale={scale * 1.9}
        />
      )
  }
}

function CornerText({ text, fill }: { text: string; fill: string }) {
  return (
    <text
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={56}
      fontStyle="italic"
      fontWeight={900}
      fontFamily="'Arial Black', Arial, sans-serif"
      fill={fill}
      stroke="#000"
      strokeWidth={2}
      paintOrder="stroke"
    >
      {text}
    </text>
  )
}

function CardBack() {
  return (
    <svg viewBox="0 0 200 300" className="uno-card-svg">
      <rect x={0} y={0} width={200} height={300} rx={18} fill="#fff" />
      <rect x={8} y={8} width={184} height={284} rx={14} fill="#16161d" />
      <ellipse cx={100} cy={150} rx={88} ry={132} transform="rotate(32 100 150)" fill={CARD_COLORS.red} />
      <text
        x={100}
        y={150}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={64}
        fontStyle="italic"
        fontWeight={900}
        fontFamily="'Arial Black', Arial, sans-serif"
        fill="#ffce00"
        stroke="#16161d"
        strokeWidth={3}
        paintOrder="stroke"
        transform="rotate(-12 100 150)"
      >
        UNO
      </text>
    </svg>
  )
}

export function Card({ card, faceDown, size = 'md', playable, onClick, activeColor }: CardProps) {
  const classes = ['uno-card', `uno-card-${size}`]
  if (playable) classes.push('uno-card-playable')
  if (onClick) classes.push('uno-card-clickable')

  if (faceDown || !card) {
    return (
      <div className={classes.join(' ')}>
        <CardBack />
      </div>
    )
  }

  const isWild = card.color === null
  const bg = isWild ? '#16161d' : CARD_COLORS[card.color!]
  const centerFill = isWild ? '#fff' : bg

  return (
    <div
      className={classes.join(' ')}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      aria-label={ariaLabel(card)}
      style={isWild && activeColor ? { boxShadow: `0 0 14px 4px ${CARD_COLORS[activeColor]}` } : undefined}
    >
      <svg viewBox="0 0 200 300" className="uno-card-svg">
        <rect x={0} y={0} width={200} height={300} rx={18} fill="#fff" />
        <rect x={8} y={8} width={184} height={284} rx={14} fill={bg} />
        {!isWild && (
          <ellipse
            cx={100}
            cy={150}
            rx={70}
            ry={108}
            transform="rotate(32 100 150)"
            fill="#fff"
          />
        )}
        <g transform="translate(100 150)">
          <Glyph value={card.value} fill={centerFill} scale={1} />
        </g>
        <CornerGlyph value={card.value} x={32} y={42} />
        <CornerGlyph value={card.value} x={168} y={258} flip />
      </svg>
    </div>
  )
}

function ariaLabel(card: CardType): string {
  const v =
    typeof card.value === 'number'
      ? String(card.value)
      : { skip: 'Skip', reverse: 'Reverse', draw2: 'Draw Two', wild: 'Wild', wild4: 'Wild Draw Four' }[card.value]
  return card.color ? `${card.color} ${v}` : v
}
