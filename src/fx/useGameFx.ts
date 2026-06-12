import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameState } from '../engine/types'
import type { FxPrefs } from '../storage'
import type { ActiveFx } from './FxOverlay'
import { cueForEvent, initialLastSeen, newEvents, type Flight } from './plan'
import { playSound, setSoundEnabled, unlockAudio } from './sounds'

/**
 * Consumes game events newer than the last seen id and turns them into
 * sounds + overlay animation state. Fast-forwards on mid-game mount (guest
 * join); replays from the start when a round begins (deal animation).
 */
export function useGameFx(state: GameState, viewerId: number, prefs: FxPrefs) {
  const lastSeen = useRef<number | null>(null)
  const [flights, setFlights] = useState<Flight[]>([])
  const [spinKey, setSpinKey] = useState(0)
  const [flash, setFlash] = useState<ActiveFx['flash']>(null)
  const [confetti, setConfetti] = useState(false)

  useEffect(() => {
    setSoundEnabled(prefs.sound)
  }, [prefs.sound])

  // Browsers require a user gesture before audio can start
  useEffect(() => {
    const unlock = () => unlockAudio()
    window.addEventListener('pointerdown', unlock, { once: true })
    return () => window.removeEventListener('pointerdown', unlock)
  }, [])

  useEffect(() => {
    const events = state.events
    const newest = events.length ? events[events.length - 1].id : 0
    if (lastSeen.current === null) lastSeen.current = initialLastSeen(events)
    // event ids went backwards: host restarted the round without a remount
    if (newest < lastSeen.current) lastSeen.current = 0
    const fresh = newEvents(events, lastSeen.current)
    lastSeen.current = newest
    if (!fresh.length) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    for (const e of fresh) {
      const cue = cueForEvent(e, state, viewerId)
      for (const s of cue.sounds) playSound(s)
      if (!prefs.animations || reduced) continue
      if (cue.flights.length) setFlights((f) => [...f, ...cue.flights])
      if (cue.spin) setSpinKey((k) => k + 1)
      if (cue.flashColor) setFlash({ color: cue.flashColor, key: e.id })
      if (cue.confetti) setConfetti(true)
    }
  }, [state, viewerId, prefs.animations])

  // clear win confetti once the next round is underway
  useEffect(() => {
    // one-shot reaction to an external phase change, not a derived-state cascade
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (state.phase === 'play') setConfetti(false)
  }, [state.phase])

  const onFlightDone = useCallback((key: string) => {
    setFlights((f) => f.filter((fl) => fl.key !== key))
  }, [])

  const fx: ActiveFx = { flights, spinKey, flash, confetti }
  return { fx, onFlightDone }
}
