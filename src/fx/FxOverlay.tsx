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
    // The discard pile wraps exactly one large card, so its rect is the size a
    // flying card should be — the hand/seat anchors are whole containers.
    const cardRect = anchorRect('discard')
    if (!el || !from || !to || !cardRect || typeof el.animate !== 'function') {
      done.current()
      return
    }
    const w = cardRect.width
    const h = cardRect.height
    el.style.width = `${w}px`
    el.style.height = `${h}px`
    const fromX = from.x + (from.width - w) / 2
    const fromY = from.y + (from.height - h) / 2
    const toX = to.x + (to.width - w) / 2
    const toY = to.y + (to.height - h) / 2
    const anim = el.animate(
      [
        { transform: `translate(${fromX}px, ${fromY}px)`, opacity: 1 },
        { transform: `translate(${toX}px, ${toY}px)`, opacity: 1 },
      ],
      {
        duration: FLIGHT_MS,
        delay: flight.delayMs,
        easing: 'cubic-bezier(0.25, 0.8, 0.3, 1)',
        fill: 'backwards',
      },
    )
    // Only genuine completion removes the flight; a cancel (e.g. StrictMode's
    // double-invoked effect cleanup) rejects and must be ignored.
    anim.finished.then(
      () => done.current(),
      () => {},
    )
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
