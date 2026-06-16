import { COLORS, type Card, type NumberValue } from './types'

/** mulberry32 PRNG — deterministic given a seed, used for shuffles and reshuffles */
export function nextRandom(seed: number): { value: number; seed: number } {
  let t = (seed + 0x6d2b79f5) | 0
  let x = Math.imul(t ^ (t >>> 15), 1 | t)
  x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
  return { value: ((x ^ (x >>> 14)) >>> 0) / 4294967296, seed: t }
}

/** Standard 108-card Last Card deck */
export function buildDeck(): Card[] {
  const cards: Card[] = []
  let id = 0
  for (const color of COLORS) {
    cards.push({ id: id++, color, value: 0 })
    for (let n = 1 as NumberValue; n <= 9; n++) {
      cards.push({ id: id++, color, value: n as NumberValue })
      cards.push({ id: id++, color, value: n as NumberValue })
    }
    for (const value of ['skip', 'reverse', 'draw2'] as const) {
      cards.push({ id: id++, color, value })
      cards.push({ id: id++, color, value })
    }
  }
  for (let i = 0; i < 4; i++) {
    cards.push({ id: id++, color: null, value: 'wild' })
    cards.push({ id: id++, color: null, value: 'wild4' })
  }
  return cards
}

/** Fisher–Yates shuffle; returns the shuffled copy and advanced seed */
export function shuffle(cards: Card[], seed: number): { cards: Card[]; seed: number } {
  const result = [...cards]
  let s = seed
  for (let i = result.length - 1; i > 0; i--) {
    const r = nextRandom(s)
    s = r.seed
    const j = Math.floor(r.value * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return { cards: result, seed: s }
}
