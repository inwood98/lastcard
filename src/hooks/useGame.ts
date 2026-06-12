import { useEffect, useMemo, useReducer, useRef } from 'react'
import { BotDriver } from '../ai/botDriver'
import { gameReducer, initGame } from '../engine/game'
import { legalCards } from '../engine/rules'
import type { Color, Difficulty, GameAction, GameState, HouseRules } from '../engine/types'

export interface GameSettings {
  playerName: string
  botCount: number
  difficulty: Difficulty
  rules: HouseRules
}

/** Action callbacks shared by local, host, and guest game hooks */
export interface GameApi {
  state: GameState
  viewerId: number
  humanLegal: ReturnType<typeof legalCards>
  playCard: (cardId: number) => void
  chooseColor: (color: Color) => void
  draw: () => void
  pass: () => void
  takePenalty: () => void
  callUno: () => void
  catchPlayer: (targetId: number) => void
  challenge: (accept: boolean) => void
}

export function makeApi(
  state: GameState,
  viewerId: number,
  dispatch: (action: GameAction) => void,
): GameApi {
  return {
    state,
    viewerId,
    humanLegal: legalCards(state, viewerId),
    playCard: (cardId) => dispatch({ type: 'PLAY_CARD', playerId: viewerId, cardId }),
    chooseColor: (color) => dispatch({ type: 'CHOOSE_COLOR', color }),
    draw: () => dispatch({ type: 'DRAW_CARD', playerId: viewerId }),
    pass: () => dispatch({ type: 'PASS', playerId: viewerId }),
    takePenalty: () => dispatch({ type: 'TAKE_PENALTY', playerId: viewerId }),
    callUno: () => dispatch({ type: 'CALL_UNO', playerId: viewerId }),
    catchPlayer: (targetId) => dispatch({ type: 'CATCH_UNO', callerId: viewerId, targetId }),
    challenge: (accept) => dispatch({ type: 'CHALLENGE', accept }),
  }
}

/** Single-player game: local reducer + bot driver, human in seat 0 */
export function useGame(settings: GameSettings): GameApi {
  const [state, dispatch] = useReducer(
    gameReducer,
    settings,
    (s: GameSettings) => initGame({ playerName: s.playerName, botCount: s.botCount, rules: s.rules }),
  )

  const driverRef = useRef<BotDriver | null>(null)
  useEffect(() => {
    driverRef.current = new BotDriver(settings.difficulty, dispatch)
    return () => {
      driverRef.current?.stop()
      driverRef.current = null
    }
  }, [settings.difficulty])

  useEffect(() => {
    driverRef.current?.onState(state)
  }, [state])

  return useMemo(() => makeApi(state, 0, dispatch), [state])
}
