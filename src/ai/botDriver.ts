import { BOT_CATCH_CHANCE, LAST_CARD_FORGET_CHANCE, chooseMove } from './index'
import { legalCards } from '../engine/rules'
import type { Difficulty, GameAction, GameState } from '../engine/types'

const LAST_CARD_GRACE_MS = 3000

function randomDelay(min: number, max: number) {
  return min + Math.random() * (max - min)
}

/**
 * Drives every bot seat in a game: turn pacing, Last Card calls (with a chance to
 * forget), remembering a forgotten call a few seconds later, and trying to
 * catch humans who miss theirs. Framework-free so the local React hook and the
 * online HostSession share the exact same behavior.
 *
 * Call `onState` after every state change; call `stop` when the game unmounts.
 */
export class BotDriver {
  private turnTimer: ReturnType<typeof setTimeout> | null = null
  private rememberTimers = new Map<number, ReturnType<typeof setTimeout>>()
  private catchTimers = new Map<number, ReturnType<typeof setTimeout>>()
  /** humans whose current Last Card window already had its one catch attempt */
  private catchAttempted = new Set<number>()
  private forgetfulBots = new Set<number>()
  private stopped = false

  private difficulty: Difficulty
  private dispatch: (action: GameAction) => void

  constructor(difficulty: Difficulty, dispatch: (action: GameAction) => void) {
    this.difficulty = difficulty
    this.dispatch = dispatch
  }

  onState(state: GameState) {
    if (this.stopped) return
    this.scheduleTurn(state)
    this.scheduleRemembers(state)
    this.scheduleCatches(state)
  }

  stop() {
    this.stopped = true
    if (this.turnTimer) clearTimeout(this.turnTimer)
    for (const t of this.rememberTimers.values()) clearTimeout(t)
    for (const t of this.catchTimers.values()) clearTimeout(t)
    this.rememberTimers.clear()
    this.catchTimers.clear()
  }

  /** One pending bot decision at a time, re-derived from each new state */
  private scheduleTurn(state: GameState) {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer)
      this.turnTimer = null
    }
    if (state.winner !== null) return
    const actorId = state.phase === 'challenge' ? state.pendingWild4!.targetId : state.currentPlayer
    if (state.players[actorId].isHuman) return

    this.turnTimer = setTimeout(() => {
      this.turnTimer = null
      const bot = state.players[actorId]
      // Call Last Card before playing the second-to-last card (unless this bot forgets)
      if (
        state.phase === 'play' &&
        bot.hand.length === 2 &&
        !bot.calledLastCard &&
        !this.forgetfulBots.has(actorId) &&
        legalCards(state, actorId).length > 0
      ) {
        if (Math.random() < LAST_CARD_FORGET_CHANCE[this.difficulty]) {
          this.forgetfulBots.add(actorId)
        } else {
          this.dispatch({ type: 'CALL_LAST_CARD', playerId: actorId })
          return
        }
      }
      const action = chooseMove(state, actorId, this.difficulty)
      if (action) this.dispatch(action)
    }, randomDelay(1800, 2800))
  }

  /** A bot that forgot Last Card eventually remembers (catchable in the meantime) */
  private scheduleRemembers(state: GameState) {
    for (const p of state.players) {
      const due = !p.isHuman && p.hand.length === 1 && !p.calledLastCard && state.winner === null
      const timer = this.rememberTimers.get(p.id)
      if (due && !timer) {
        this.rememberTimers.set(
          p.id,
          setTimeout(() => {
            this.rememberTimers.delete(p.id)
            this.forgetfulBots.delete(p.id)
            this.dispatch({ type: 'CALL_LAST_CARD', playerId: p.id })
          }, randomDelay(3500, 6000)),
        )
      } else if (!due && timer) {
        clearTimeout(timer)
        this.rememberTimers.delete(p.id)
      }
      if (p.hand.length !== 1) this.forgetfulBots.delete(p.id)
    }
  }

  /** Bots race to catch any human sitting on one card without calling Last Card */
  private scheduleCatches(state: GameState) {
    const firstBot = state.players.find((p) => !p.isHuman)
    for (const p of state.players) {
      const inWindow = p.isHuman && p.hand.length === 1 && !p.calledLastCard && state.winner === null
      const due = inWindow && firstBot !== undefined && !this.catchAttempted.has(p.id)
      const timer = this.catchTimers.get(p.id)
      if (due && !timer) {
        this.catchTimers.set(
          p.id,
          setTimeout(() => {
            this.catchTimers.delete(p.id)
            this.catchAttempted.add(p.id)
            if (Math.random() < BOT_CATCH_CHANCE[this.difficulty]) {
              this.dispatch({ type: 'CATCH_LAST_CARD', callerId: firstBot!.id, targetId: p.id })
            }
          }, randomDelay(LAST_CARD_GRACE_MS * 0.6, LAST_CARD_GRACE_MS * 1.3)),
        )
      } else if (!due && timer) {
        clearTimeout(timer)
        this.catchTimers.delete(p.id)
      }
      if (!inWindow) this.catchAttempted.delete(p.id)
    }
  }
}
