import { useEffect, useMemo, useReducer, useRef } from 'react'
import { BOT_CATCH_CHANCE, UNO_FORGET_CHANCE, chooseMove } from '../ai'
import { gameReducer, initGame } from '../engine/game'
import { legalCards } from '../engine/rules'
import type { Color, Difficulty, GameState, HouseRules } from '../engine/types'

export interface GameSettings {
  playerName: string
  botCount: number
  difficulty: Difficulty
  rules: HouseRules
}

const HUMAN = 0
const UNO_GRACE_MS = 3000

function randomDelay(min: number, max: number) {
  return min + Math.random() * (max - min)
}

export function useGame(settings: GameSettings) {
  const [state, dispatch] = useReducer(
    gameReducer,
    settings,
    (s: GameSettings) => initGame({ playerName: s.playerName, botCount: s.botCount, rules: s.rules }),
  )

  const stateRef = useRef(state)
  stateRef.current = state

  // Bots that decided to "forget" UNO for their current 1-card hand
  const forgetfulBots = useRef(new Set<number>())

  // Drive the next bot decision. Each accepted action produces a new state,
  // which re-runs this effect, so multi-step bot sequences pace themselves.
  useEffect(() => {
    if (state.winner !== null) return

    const actorId = state.phase === 'challenge' ? state.pendingWild4!.targetId : state.currentPlayer
    if (state.players[actorId].isHuman) return

    const timer = setTimeout(() => {
      const bot = state.players[actorId]
      // Call UNO before playing the second-to-last card (unless this bot forgets)
      if (
        state.phase === 'play' &&
        bot.hand.length === 2 &&
        !bot.calledUno &&
        !forgetfulBots.current.has(actorId) &&
        legalCards(state, actorId).length > 0
      ) {
        if (Math.random() < UNO_FORGET_CHANCE[settings.difficulty]) {
          forgetfulBots.current.add(actorId)
        } else {
          dispatch({ type: 'CALL_UNO', playerId: actorId })
          return
        }
      }
      const action = chooseMove(state, actorId, settings.difficulty)
      if (action) dispatch(action)
    }, randomDelay(900, 1500))
    return () => clearTimeout(timer)
  }, [state, settings.difficulty])

  // Bots at one card who haven't called UNO yet (stable key so timers aren't
  // reset by unrelated state changes — they must run their full course)
  const uncalledBotsKey = state.players
    .filter((p) => !p.isHuman && p.hand.length === 1 && !p.calledUno)
    .map((p) => p.id)
    .join(',')

  // A forgetful bot eventually remembers (so it can be caught in the meantime)
  useEffect(() => {
    if (!uncalledBotsKey) return
    const timers = uncalledBotsKey.split(',').map((idStr) => {
      const id = Number(idStr)
      return setTimeout(() => {
        forgetfulBots.current.delete(id)
        dispatch({ type: 'CALL_UNO', playerId: id })
      }, randomDelay(3500, 6000))
    })
    return () => timers.forEach(clearTimeout)
  }, [uncalledBotsKey])

  const humanAtUno =
    state.players[HUMAN].hand.length === 1 && !state.players[HUMAN].calledUno && state.winner === null

  // Bots try to catch the human's missed UNO call
  useEffect(() => {
    if (!humanAtUno) return
    const timer = setTimeout(() => {
      if (Math.random() < BOT_CATCH_CHANCE[settings.difficulty]) {
        const current = stateRef.current
        const catcher = current.players.find((p) => !p.isHuman)!
        dispatch({ type: 'CATCH_UNO', callerId: catcher.id, targetId: HUMAN })
      }
    }, randomDelay(UNO_GRACE_MS * 0.6, UNO_GRACE_MS * 1.3))
    return () => clearTimeout(timer)
  }, [humanAtUno, settings.difficulty])

  const humanLegal = useMemo(() => legalCards(state, HUMAN), [state])

  return {
    state,
    humanLegal,
    humanAtUno,
    playCard: (cardId: number) => dispatch({ type: 'PLAY_CARD', playerId: HUMAN, cardId }),
    chooseColor: (color: Color) => dispatch({ type: 'CHOOSE_COLOR', color }),
    draw: () => dispatch({ type: 'DRAW_CARD', playerId: HUMAN }),
    pass: () => dispatch({ type: 'PASS', playerId: HUMAN }),
    takePenalty: () => dispatch({ type: 'TAKE_PENALTY', playerId: HUMAN }),
    callUno: () => dispatch({ type: 'CALL_UNO', playerId: HUMAN }),
    catchBot: (targetId: number) => dispatch({ type: 'CATCH_UNO', callerId: HUMAN, targetId }),
    challenge: (accept: boolean) => dispatch({ type: 'CHALLENGE', accept }),
  }
}

export type GameApi = ReturnType<typeof useGame>
export type { GameState }
