import type { GameState } from '../engine/types'

/**
 * What a single player is allowed to see. Structurally a GameState (so the
 * rules helpers and UI work unchanged) with hidden information stripped:
 * foreign hands are emptied (handCount remains), the draw pile is emptied
 * (drawCount remains), the shuffle seed is zeroed, and drawnCardId — whose
 * card id alone identifies the card — is hidden unless it's the viewer's.
 */
export type GameView = GameState & { drawCount: number; viewerId: number }

export function handSize(player: { hand: unknown[]; handCount?: number }): number {
  return player.handCount ?? player.hand.length
}

export function redactState(state: GameState, viewerId: number): GameView {
  return {
    ...state,
    viewerId,
    drawCount: state.drawPile.length,
    drawPile: [],
    seed: 0,
    drawnCardId: state.currentPlayer === viewerId ? state.drawnCardId : null,
    players: state.players.map((p) => ({
      ...p,
      handCount: p.hand.length,
      hand: p.id === viewerId ? p.hand : [],
    })),
  }
}
