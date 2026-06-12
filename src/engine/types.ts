export const COLORS = ['red', 'yellow', 'green', 'blue'] as const
export type Color = (typeof COLORS)[number]

export type NumberValue = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
export type ActionValue = 'skip' | 'reverse' | 'draw2'
export type WildValue = 'wild' | 'wild4'
export type CardValue = NumberValue | ActionValue | WildValue

export interface Card {
  id: number
  /** null for wild cards */
  color: Color | null
  value: CardValue
}

export type Difficulty = 'easy' | 'medium' | 'hard'

export interface HouseRules {
  /** Draw Two stacks on Draw Two, Wild Draw Four on Wild Draw Four */
  stacking: boolean
  /** Keep drawing until you get a playable card instead of drawing one */
  drawUntilPlayable: boolean
  /** Wild Draw Four may be challenged if played while holding a color match */
  wild4Challenge: boolean
}

export const DEFAULT_RULES: HouseRules = {
  stacking: false,
  drawUntilPlayable: false,
  wild4Challenge: false,
}

export interface PlayerState {
  id: number
  name: string
  isHuman: boolean
  hand: Card[]
  /** true once UNO has been called for the current 1-card hand */
  calledUno: boolean
  /** set on redacted views where hand contents are hidden */
  handCount?: number
}

export type Phase =
  | 'play'
  | 'chooseColor'
  | 'challenge'
  | 'roundOver'

export interface GameEvent {
  id: number
  text: string
}

export interface GameState {
  players: PlayerState[]
  /** index into players */
  currentPlayer: number
  direction: 1 | -1
  drawPile: Card[]
  /** last element is the top card */
  discardPile: Card[]
  /** active color; follows the top card except after wilds */
  currentColor: Color
  phase: Phase
  /** accumulated draw penalty while stacking is being resolved */
  pendingDraw: number
  /** set while a Wild Draw Four challenge window is open */
  pendingWild4: { playerId: number; targetId: number; prevColor: Color } | null
  /** id of the card drawn this turn (only it may be played), or null */
  drawnCardId: number | null
  winner: number | null
  rules: HouseRules
  events: GameEvent[]
  /** match points per seat, including the just-finished round once won */
  scores: number[]
  /** PRNG state for reshuffles */
  seed: number
}

/** First player to reach this many points wins the match */
export const TARGET_SCORE = 500

export type GameAction =
  | { type: 'PLAY_CARD'; playerId: number; cardId: number; chosenColor?: Color }
  | { type: 'CHOOSE_COLOR'; color: Color }
  | { type: 'DRAW_CARD'; playerId: number }
  | { type: 'PASS'; playerId: number }
  | { type: 'TAKE_PENALTY'; playerId: number }
  | { type: 'CALL_UNO'; playerId: number }
  | { type: 'CATCH_UNO'; callerId: number; targetId: number }
  | { type: 'CHALLENGE'; accept: boolean }

export interface Seat {
  name: string
  isHuman: boolean
}

export interface GameConfig {
  /** explicit seating in turn order; when omitted, built from playerName + botCount */
  seats?: Seat[]
  playerName?: string
  botCount?: number
  rules: HouseRules
  /** carried-over match scores when starting the next round */
  scores?: number[]
  seed?: number
}
