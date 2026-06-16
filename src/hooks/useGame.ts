import { useEffect, useMemo, useReducer, useRef } from 'react'
import { BotDriver } from '../ai/botDriver'
import { gameReducer, initGame } from '../engine/game'
import { legalCards } from '../engine/rules'
import type { Color, Difficulty, GameAction, GameState, HouseRules } from '../engine/types'
import { clearSavedGame, saveGame } from '../save'
import { matchResultFor, submitResult } from '../net/leaderboard'

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
  callLastCard: () => void
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
    callLastCard: () => dispatch({ type: 'CALL_LAST_CARD', playerId: viewerId }),
    catchPlayer: (targetId) => dispatch({ type: 'CATCH_LAST_CARD', callerId: viewerId, targetId }),
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
  const submittedRef = useRef(false)
  const catchCountRef = useRef(0)
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
    const result = matchResultFor(state, settings.playerName)
    if (result) {
      clearSavedGame()
      if (!submittedRef.current) {
        submittedRef.current = true
        void submitResult({ ...result, caughtOpponents: catchCountRef.current })
      }
    } else {
      submittedRef.current = false
      saveGame(state, settings.difficulty)
    }
  }, [state, settings.playerName, settings.difficulty])

  return useMemo(
    () => ({
      ...makeApi(state, 0, dispatch),
      catchPlayer: (targetId: number) => {
        catchCountRef.current++
        dispatch({ type: 'CATCH_LAST_CARD', callerId: 0, targetId })
      },
    }),
    [state],
  )
}
