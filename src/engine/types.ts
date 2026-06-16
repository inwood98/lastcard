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
  /** true once Last Card has been called for the current 1-card hand */
  calledLastCard: boolean
  /** set on redacted views where hand contents are hidden */
  handCount?: number
}

export type Phase =
  | 'play'
  | 'chooseColor'
  | 'challenge'
  | 'roundOver'

export type EventKind =
  | 'play'        // a card was played
  | 'draw'        // player drew card(s)
  | 'skip'        // a player was skipped
  | 'reverse'     // direction changed
  | 'wildColor'   // a wild color was chosen
  | 'lastcard'    // "Last card!" called
  | 'caught'      // caught without calling last card
  | 'penalty'     // accumulated draw penalty taken
  | 'challenge'   // wild-draw-four challenge resolved
  | 'reshuffle'   // discard reshuffled into the draw pile
  | 'deal'        // round start, hands dealt
  | 'roundOver'   // round won
  | 'matchOver'   // match won (target score reached)
  | 'info'        // narration only, no FX

export interface GameEvent {
  id: number
  text: string
  kind: EventKind
  /** acting/affected player: who played, who draws, who won */
  playerId?: number
  /** card played, so the UI can animate that exact card */
  cardId?: number
  /** number of cards drawn */
  count?: number
  /** chosen wild color */
  color?: Color
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
  /** match points needed to win; carried per game so it can vary by setting */
  targetScore: number
  /** PRNG state for reshuffles */
  seed: number
}

/** First player to reach this many points wins the match */
export const TARGET_SCORE = 500

/** Selectable match targets offered on the setup screen */
export const TARGET_SCORES = [150, 300, 500] as const

export type GameAction =
  | { type: 'PLAY_CARD'; playerId: number; cardId: number; chosenColor?: Color }
  | { type: 'CHOOSE_COLOR'; color: Color }
  | { type: 'DRAW_CARD'; playerId: number }
  | { type: 'PASS'; playerId: number }
  | { type: 'TAKE_PENALTY'; playerId: number }
  | { type: 'CALL_LAST_CARD'; playerId: number }
  | { type: 'CATCH_LAST_CARD'; callerId: number; targetId: number }
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
  /** match points needed to win; defaults to 500 when omitted */
  targetScore?: number
  seed?: number
}
