import type { SoundName } from './plan'

let ctx: AudioContext | null = null
let enabled = true

export function setSoundEnabled(on: boolean) {
  enabled = on
}

/** Create/resume the context — call from a user-gesture handler once */
export function unlockAudio() {
  ac()
}

function ac(): AudioContext | null {
  if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return null
  if (!ctx) {
    try {
      ctx = new AudioContext()
    } catch {
      return null
    }
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

interface ToneOpts {
  type?: OscillatorType
  gain?: number
  slideTo?: number
}

function tone(c: AudioContext, at: number, freq: number, dur: number, opts: ToneOpts = {}) {
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = opts.type ?? 'triangle'
  osc.frequency.setValueAtTime(freq, at)
  if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, at + dur)
  g.gain.setValueAtTime(opts.gain ?? 0.15, at)
  g.gain.exponentialRampToValueAtTime(0.001, at + dur)
  osc.connect(g)
  g.connect(c.destination)
  osc.start(at)
  osc.stop(at + dur + 0.02)
}

/** Decaying band-passed noise burst — card swishes and shuffles */
function noise(c: AudioContext, at: number, dur: number, freq: number, gain = 0.2) {
  const len = Math.ceil(c.sampleRate * dur)
  const buf = c.createBuffer(1, len, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len)
  const src = c.createBufferSource()
  src.buffer = buf
  const f = c.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.value = freq
  const g = c.createGain()
  g.gain.value = gain
  src.connect(f)
  f.connect(g)
  g.connect(c.destination)
  src.start(at)
}

export function playSound(name: SoundName) {
  if (!enabled) return
  const c = ac()
  if (!c) return
  const t = c.currentTime + 0.01
  switch (name) {
    case 'play':
      noise(c, t, 0.12, 1800, 0.25)
      break
    case 'draw':
      noise(c, t, 0.08, 900, 0.18)
      break
    case 'thud':
      tone(c, t, 150, 0.15, { type: 'sine', gain: 0.3, slideTo: 60 })
      tone(c, t + 0.12, 130, 0.18, { type: 'sine', gain: 0.3, slideTo: 55 })
      break
    case 'skip':
      tone(c, t, 520, 0.12, { type: 'square', gain: 0.08, slideTo: 260 })
      break
    case 'reverse':
      tone(c, t, 300, 0.14, { slideTo: 600 })
      tone(c, t + 0.12, 600, 0.16, { slideTo: 300 })
      break
    case 'wild': {
      const freqs = [440, 554, 659, 880]
      freqs.forEach((f, i) => tone(c, t + i * 0.07, f, 0.18, { gain: 0.12 }))
      break
    }
    case 'uno':
      tone(c, t, 660, 0.12, { type: 'square', gain: 0.1 })
      tone(c, t + 0.13, 990, 0.22, { type: 'square', gain: 0.1 })
      break
    case 'caught':
      tone(c, t, 220, 0.3, { type: 'sawtooth', gain: 0.12, slideTo: 110 })
      break
    case 'shuffle':
      noise(c, t, 0.35, 1200, 0.15)
      noise(c, t + 0.18, 0.35, 1500, 0.12)
      break
    case 'fanfare': {
      const freqs = [523, 659, 784, 1047]
      freqs.forEach((f, i) => tone(c, t + i * 0.12, f, 0.3, { gain: 0.14 }))
      break
    }
    case 'bigFanfare': {
      const freqs = [523, 659, 784, 1047, 784, 1047, 1319]
      freqs.forEach((f, i) =>
        tone(c, t + i * 0.13, f, 0.35, { gain: 0.15 }),
      )
      break
    }
  }
}
