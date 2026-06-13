import { useEffect, useMemo, useReducer, useRef } from 'react'
import { BotDriver } from '../ai/botDriver'
import { gameReducer, initGame } from '../engine/game'
import { legalCards } from '../engine/rules'
import type { Color, Difficulty, GameAction, GameState, HouseRules } from '../engine/types'
import { TARGET_SCORE } from '../engine/types'
import { clearSavedGame, saveGame } from '../save'

export interface GameSettings {
  playerName: string
  botCount: number
  difficulty: Difficulty
  rules: HouseRules
  /** match scores carried into this round */
  scores?: number[]
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

/**
 * Single-player game: local reducer + bot driver, human in seat 0.
 * When `initialState` is supplied (resuming a saved game) the reducer starts
 * from it; otherwise a fresh game is dealt. Every state change is auto-saved,
 * except a completed match, which clears the save instead.
 */
export function useGame(settings: GameSettings, initialState?: GameState): GameApi {
  const [state, dispatch] = useReducer(
    gameReducer,
    { settings, initialState },
    ({ settings, initialState }: { settings: GameSettings; initialState?: GameState }) =>
      initialState
        ? structuredClone(initialState)
        : initGame({
            playerName: settings.playerName,
            botCount: settings.botCount,
            rules: settings.rules,
            scores: settings.scores,
          }),
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

  useEffect(() => {
    const matchOver = state.phase === 'roundOver' && state.scores.some((s) => s >= TARGET_SCORE)
    if (matchOver) clearSavedGame()
    else saveGame(state, settings.difficulty)
  }, [state, settings.difficulty])

  return useMemo(() => makeApi(state, 0, dispatch), [state])
}
