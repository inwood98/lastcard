import { legalCards } from '../engine/rules'
import { COLORS, type Card, type Color, type Difficulty, type GameAction, type GameState } from '../engine/types'

/** Probability a bot forgets to call Last Card when reaching one card */
export const LAST_CARD_FORGET_CHANCE: Record<Difficulty, number> = {
  easy: 0.35,
  medium: 0.2,
  hard: 0.08,
}

/** Probability per check that a bot notices the human's missed Last Card call */
export const BOT_CATCH_CHANCE: Record<Difficulty, number> = {
  easy: 0.25,
  medium: 0.5,
  hard: 0.8,
}

function dominantColor(hand: Card[]): Color {
  const counts = new Map<Color, number>()
  for (const c of hand) {
    if (c.color) counts.set(c.color, (counts.get(c.color) ?? 0) + 1)
  }
  let best: Color = COLORS[Math.floor(Math.random() * COLORS.length)]
  let bestCount = 0
  for (const color of COLORS) {
    const n = counts.get(color) ?? 0
    if (n > bestCount) {
      best = color
      bestCount = n
    }
  }
  return best
}

export function chooseColor(hand: Card[], difficulty: Difficulty): Color {
  if (difficulty === 'easy') return COLORS[Math.floor(Math.random() * COLORS.length)]
  return dominantColor(hand)
}

/** Should the bot challenge a Wild Draw Four played against it? */
export function decideChallenge(state: GameState, difficulty: Difficulty): boolean {
  if (difficulty === 'easy') return Math.random() < 0.1
  // Heuristic: challenge more readily when the offender has few cards left
  const offender = state.players[state.pendingWild4!.playerId]
  const base = difficulty === 'hard' ? 0.45 : 0.25
  return Math.random() < (offender.hand.length <= 3 ? base + 0.25 : base)
}

function isAction(card: Card): boolean {
  return typeof card.value !== 'number'
}

function pickCard(state: GameState, playerId: number, legal: Card[], difficulty: Difficulty): Card {
  if (difficulty === 'easy') {
    return legal[Math.floor(Math.random() * legal.length)]
  }

  const hand = state.players[playerId].hand
  const nextId = (((playerId + state.direction) % state.players.length) + state.players.length) % state.players.length
  const nextPlayerLow = state.players[nextId].hand.length <= 2
  const dominant = dominantColor(hand)

  const score = (card: Card): number => {
    let s = 0
    // Hold wilds back unless forced or the next player is about to win
    if (card.color === null) s -= nextPlayerLow ? -40 : 30
    // Hit a nearly-finished next player with attack cards
    if (nextPlayerLow && (card.value === 'draw2' || card.value === 'skip' || card.value === 'reverse')) s += 35
    // Dump action cards early so they aren't dead weight (they score high against you in Last Card)
    if (isAction(card) && card.color !== null) s += 10
    // Prefer staying on our dominant color so future turns stay flexible
    if (card.color === dominant) s += 15
    if (difficulty === 'hard') {
      // Prefer shedding from colors we hold most of, and high numbers first
      if (card.color) s += hand.filter((c) => c.color === card.color).length * 4
      if (typeof card.value === 'number') s += card.value
    }
    return s + Math.random() * 2
  }

  return [...legal].sort((a, b) => score(b) - score(a))[0]
}

/** Decide the bot's next move. Returns null when it has nothing to do. */
export function chooseMove(state: GameState, playerId: number, difficulty: Difficulty): GameAction | null {
  if (state.phase === 'challenge' && state.pendingWild4?.targetId === playerId) {
    return { type: 'CHALLENGE', accept: decideChallenge(state, difficulty) }
  }
  if (state.phase === 'chooseColor' && state.currentPlayer === playerId) {
    return { type: 'CHOOSE_COLOR', color: chooseColor(state.players[playerId].hand, difficulty) }
  }
  if (state.phase !== 'play' || state.currentPlayer !== playerId) return null

  const legal = legalCards(state, playerId)
  if (legal.length > 0) {
    const card = pickCard(state, playerId, legal, difficulty)
    const action: GameAction = { type: 'PLAY_CARD', playerId, cardId: card.id }
    if (card.color === null) {
      action.chosenColor = chooseColor(
        state.players[playerId].hand.filter((c) => c.id !== card.id),
        difficulty,
      )
    }
    return action
  }
  if (state.pendingDraw > 0) return { type: 'TAKE_PENALTY', playerId }
  if (state.drawnCardId !== null) return { type: 'PASS', playerId }
  return { type: 'DRAW_CARD', playerId }
}
