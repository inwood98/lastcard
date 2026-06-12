import type { GameAction } from '../engine/types'
import type { GameView } from './redact'

export const PROTOCOL_VERSION = 1

/** Total seats at a table (humans + bots) and how many can be human */
export const MAX_PLAYERS = 6
export const MAX_HUMANS = 4

export interface RosterEntry {
  name: string
  isHuman: boolean
  /** false while a human seat is disconnected mid-game */
  connected: boolean
}

export type ClientMessage =
  | { type: 'JOIN'; version: number; name: string }
  | { type: 'ACTION'; action: GameAction }

export type HostMessage =
  | { type: 'WELCOME'; roster: RosterEntry[] }
  | { type: 'LOBBY'; roster: RosterEntry[] }
  | { type: 'START'; seatId: number; view: GameView; roster: RosterEntry[] }
  | { type: 'STATE'; view: GameView; roster: RosterEntry[] }
  | { type: 'REJECTED'; reason: 'full' | 'version' | 'started' }

/** Room codes avoid ambiguous characters (0/O, 1/I/L) */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function makeRoomCode(): string {
  return Array.from(
    { length: 5 },
    () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)],
  ).join('')
}

export function roomPeerId(code: string): string {
  return `uno-game-${code.toUpperCase()}`
}
