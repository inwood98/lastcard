import { useEffect, useMemo, useRef } from 'react'
import { CARD_COLORS, Card } from '../components/Card'
import type { Color } from '../engine/types'
import { anchorRect } from './anchors'
import type { Flight } from './plan'
import './fx.css'

export interface ActiveFx {
  flights: Flight[]
  spinKey: number
  flash: { color: Color; key: number } | null
  confetti: boolean
}

interface FxOverlayProps {
  fx: ActiveFx
  onFlightDone: (key: string) => void
}

export function FxOverlay({ fx, onFlightDone }: FxOverlayProps) {
  return (
    <div className="fx-layer" aria-hidden>
      {fx.flights.map((f) => (
        <FlyingCard key={f.key} flight={f} onDone={() => onFlightDone(f.key)} />
      ))}
      {fx.spinKey > 0 && <SpinBadge key={fx.spinKey} />}
      {fx.flash && <Flash key={fx.flash.key} color={fx.flash.color} />}
      {fx.confetti && <Confetti />}
    </div>
  )
}

const FLIGHT_MS = 380

function FlyingCard({ flight, onDone }: { flight: Flight; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const done = useRef(onDone)

  useEffect(() => {
    done.current = onDone
  }, [onDone])

  useEffect(() => {
    const el = ref.current
    const from = anchorRect(flight.from)
    const to = anchorRect(flight.to)
    if (!el || !from || !to || typeof el.animate !== 'function') {
      done.current()
      return
    }
    el.style.width = `${from.width}px`
    el.style.height = `${from.height}px`
    const toX = to.x + (to.width - from.width) / 2
    const toY = to.y + (to.height - from.height) / 2
    const anim = el.animate(
      [
        { transform: `translate(${from.x}px, ${from.y}px)`, opacity: 1 },
        {
          transform: `translate(${toX}px, ${toY}px) scale(${to.width / from.width})`,
          opacity: 1,
        },
      ],
      {
        duration: FLIGHT_MS,
        delay: flight.delayMs,
        easing: 'cubic-bezier(0.25, 0.8, 0.3, 1)',
        fill: 'backwards',
      },
    )
    anim.finished.catch(() => {}).finally(() => done.current())
    return () => anim.cancel()
    // flight is immutable per key — run the animation exactly once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div ref={ref} className="fx-flight" style={{ opacity: 0 }}>
      {flight.card && flight.flip ? (
        <div className="fx-flip" style={{ animationDelay: `${flight.delayMs}ms` }}>
          <div className="fx-face fx-front">
            <Card card={flight.card} size="lg" />
          </div>
          <div className="fx-face">
            <Card faceDown size="lg" />
          </div>
        </div>
      ) : flight.card ? (
        <Card card={flight.card} size="lg" />
      ) : (
        <Card faceDown size="lg" />
      )}
    </div>
  )
}

function SpinBadge() {
  return (
    <div className="fx-spin">
      <svg viewBox="0 0 100 100" width="72" height="72">
        <path
          d="M 50 12 A 38 38 0 1 1 14 38"
          fill="none"
          stroke="currentColor"
          strokeWidth="9"
          strokeLinecap="round"
        />
        <polygon points="2,42 30,32 16,56" fill="currentColor" />
      </svg>
    </div>
  )
}

function Flash({ color }: { color: Color }) {
  return (
    <div
      className="fx-flash"
      style={{ background: `radial-gradient(circle, ${CARD_COLORS[color]}aa, transparent 70%)` }}
    />
  )
}

const CONFETTI_COUNT = 60

function Confetti() {
  const pieces = useMemo(() => {
    return Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
      // eslint-disable-next-line react-hooks/purity
      left: Math.random() * 100,
      // eslint-disable-next-line react-hooks/purity
      delay: Math.random() * 1.5,
      // eslint-disable-next-line react-hooks/purity
      dur: 2.2 + Math.random() * 1.6,
      color: Object.values(CARD_COLORS)[i % 4],
    }))
  }, [])
  return (
    <>
      {pieces.map((p, i) => (
        <i
          key={i}
          className="fx-confetti"
          style={{
            left: `${p.left}%`,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.dur}s`,
          }}
        />
      ))}
    </>
  )
}
