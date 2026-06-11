import type { Card, Color, GameState } from './types'

/** Can `card` legally be played on the current discard state? */
export function isPlayable(card: Card, topCard: Card, currentColor: Color): boolean {
  if (card.color === null) return true
  if (card.color === currentColor) return true
  return card.value === topCard.value
}

/**
 * Legal cards for the player whose turn it is, honoring stacking penalties
 * and the played-after-draw restriction.
 */
export function legalCards(state: GameState, playerId: number): Card[] {
  const player = state.players[playerId]
  if (state.phase !== 'play' || state.currentPlayer !== playerId) return []
  const top = state.discardPile[state.discardPile.length - 1]

  // While a stacked penalty is pending, only a matching draw card continues the stack
  if (state.pendingDraw > 0) {
    if (!state.rules.stacking) return []
    const stackValue = top.value === 'draw2' ? 'draw2' : 'wild4'
    return player.hand.filter((c) => c.value === stackValue)
  }

  let candidates = player.hand
  if (state.drawnCardId !== null) {
    candidates = candidates.filter((c) => c.id === state.drawnCardId)
  }
  return candidates.filter((c) => isPlayable(c, top, state.currentColor))
}

/** Did this Wild Draw Four break the official rule (played while holding a color match)? */
export function wild4WasIllegal(hand: Card[], prevColor: Color): boolean {
  return hand.some((c) => c.color === prevColor)
}
