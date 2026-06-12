import { BotDriver } from '../ai/botDriver'
import { BOT_NAMES, gameReducer, initGame } from '../engine/game'
import type { Difficulty, GameAction, GameState, HouseRules, Seat } from '../engine/types'
import {
  MAX_HUMANS,
  MAX_PLAYERS,
  PROTOCOL_VERSION,
  type ClientMessage,
  type HostMessage,
  type RosterEntry,
} from './protocol'
import { redactState, type GameView } from './redact'
import type { Connection, HostTransport } from './transport'

export interface HostConfig {
  hostName: string
  botCount: number
  difficulty: Difficulty
  rules: HouseRules
}

interface Guest {
  conn: Connection
  name: string
  seatId: number | null
  connected: boolean
}

/**
 * The authoritative game. Lives in the host player's browser: accepts guest
 * connections, owns the full GameState, validates every action through the
 * reducer, drives the bots, and sends each guest their redacted view.
 */
export class HostSession {
  phase: 'lobby' | 'playing' = 'lobby'
  state: GameState | null = null
  config: HostConfig
  private guests: Guest[] = []
  private driver: BotDriver | null = null
  private transport: HostTransport | null = null

  private onChange: () => void

  constructor(config: HostConfig, onChange: () => void) {
    this.config = { ...config }
    this.onChange = onChange
  }

  attach(transport: HostTransport) {
    this.transport = transport
    transport.onConnection((conn) => this.handleConnection(conn))
  }

  /** Lobby-time settings tweaks (bot count clamped to table capacity) */
  configure(partial: Partial<Omit<HostConfig, 'hostName'>>) {
    this.config = { ...this.config, ...partial }
    this.config.botCount = Math.min(this.config.botCount, MAX_PLAYERS - this.humanCount())
    if (this.phase === 'lobby') this.broadcastLobby()
    this.onChange()
  }

  humanCount(): number {
    return 1 + this.guests.filter((g) => g.connected).length
  }

  roster(): RosterEntry[] {
    if (this.phase === 'playing' && this.state) {
      return this.state.players.map((p) => ({
        name: p.name,
        isHuman: p.isHuman,
        connected: p.isHuman ? this.seatConnected(p.id) : true,
      }))
    }
    return [
      { name: this.config.hostName, isHuman: true, connected: true },
      ...this.guests
        .filter((g) => g.connected)
        .map((g) => ({ name: g.name, isHuman: true, connected: true })),
      ...Array.from({ length: this.config.botCount }, (_, i) => ({
        name: BOT_NAMES[i],
        isHuman: false,
        connected: true,
      })),
    ]
  }

  private seatConnected(seatId: number): boolean {
    if (seatId === 0) return true
    const guest = this.guests.find((g) => g.seatId === seatId)
    return guest ? guest.connected : true
  }

  canStart(): boolean {
    return this.humanCount() >= 2 && this.roster().length >= 2
  }

  startGame() {
    if (!this.canStart()) return
    const joined = this.guests.filter((g) => g.connected)
    const seats: Seat[] = [
      { name: this.config.hostName, isHuman: true },
      ...joined.map((g) => ({ name: g.name, isHuman: true })),
      ...Array.from(
        { length: Math.min(this.config.botCount, MAX_PLAYERS - 1 - joined.length) },
        (_, i) => ({ name: BOT_NAMES[i], isHuman: false }),
      ),
    ]
    joined.forEach((g, i) => (g.seatId = i + 1))
    this.state = initGame({ seats, rules: this.config.rules })
    this.phase = 'playing'
    this.driver?.stop()
    this.driver = new BotDriver(this.config.difficulty, (a) => this.dispatch(a))
    const roster = this.roster()
    for (const g of joined) {
      this.send(g.conn, {
        type: 'START',
        seatId: g.seatId!,
        view: this.viewFor(g.seatId!),
        roster,
      })
    }
    this.driver.onState(this.state)
    this.onChange()
  }

  /** "Play again" — same table, fresh deal */
  restart() {
    if (this.phase !== 'playing' || !this.state) return
    const seats: Seat[] = this.state.players.map((p) => ({ name: p.name, isHuman: p.isHuman }))
    this.state = initGame({ seats, rules: this.config.rules })
    this.driver?.stop()
    this.driver = new BotDriver(this.config.difficulty, (a) => this.dispatch(a))
    const roster = this.roster()
    for (const g of this.guests) {
      if (g.connected && g.seatId !== null) {
        this.send(g.conn, { type: 'START', seatId: g.seatId, view: this.viewFor(g.seatId), roster })
      }
    }
    this.driver.onState(this.state)
    this.onChange()
  }

  /** Apply an action from any source (host UI, guest, bot) through the reducer */
  dispatch(action: GameAction) {
    if (!this.state) return
    const next = gameReducer(this.state, action)
    if (next === this.state) return
    this.state = next
    this.broadcastState()
    this.driver?.onState(next)
    this.onChange()
  }

  viewFor(seatId: number): GameView {
    return redactState(this.state!, seatId)
  }

  hostView(): GameView | null {
    return this.state ? redactState(this.state, 0) : null
  }

  /** Hand a disconnected (or any) guest seat over to a bot */
  replaceWithBot(seatId: number) {
    if (!this.state || seatId === 0) return
    this.state = {
      ...this.state,
      players: this.state.players.map((p) => (p.id === seatId ? { ...p, isHuman: false } : p)),
    }
    const guest = this.guests.find((g) => g.seatId === seatId)
    if (guest) {
      guest.seatId = null
      guest.conn.close()
    }
    this.broadcastState()
    this.driver?.onState(this.state)
    this.onChange()
  }

  /** Seats of humans who dropped mid-game (candidates for replaceWithBot) */
  disconnectedSeats(): number[] {
    if (this.phase !== 'playing') return []
    return this.guests.filter((g) => !g.connected && g.seatId !== null).map((g) => g.seatId!)
  }

  destroy() {
    this.driver?.stop()
    for (const g of this.guests) g.conn.close()
    this.transport?.close()
  }

  private handleConnection(conn: Connection) {
    conn.onMessage((data) => this.handleMessage(conn, data as ClientMessage))
    conn.onClose(() => {
      const guest = this.guests.find((g) => g.conn === conn)
      if (!guest) return
      guest.connected = false
      if (this.phase === 'lobby') {
        this.guests = this.guests.filter((g) => g !== guest)
        this.broadcastLobby()
      } else {
        this.broadcastState()
      }
      this.onChange()
    })
  }

  private handleMessage(conn: Connection, msg: ClientMessage) {
    if (!msg || typeof msg !== 'object') return
    if (msg.type === 'JOIN') {
      if (msg.version !== PROTOCOL_VERSION) {
        return this.send(conn, { type: 'REJECTED', reason: 'version' })
      }
      if (this.phase !== 'lobby') {
        return this.send(conn, { type: 'REJECTED', reason: 'started' })
      }
      if (this.humanCount() >= MAX_HUMANS) {
        return this.send(conn, { type: 'REJECTED', reason: 'full' })
      }
      const name = this.uniqueName(String(msg.name || 'Guest').slice(0, 16))
      this.guests.push({ conn, name, seatId: null, connected: true })
      this.configure({}) // re-clamp bot count to remaining capacity
      this.send(conn, { type: 'WELCOME', roster: this.roster() })
      this.broadcastLobby()
      this.onChange()
      return
    }
    if (msg.type === 'ACTION') {
      const guest = this.guests.find((g) => g.conn === conn)
      if (!guest || guest.seatId === null || !this.state) return
      if (this.actionAllowed(msg.action, guest.seatId)) this.dispatch(msg.action)
    }
  }

  /** Guests may only act as themselves; the reducer enforces the rest */
  private actionAllowed(action: GameAction, seatId: number): boolean {
    if (!action || typeof action !== 'object') return false
    switch (action.type) {
      case 'PLAY_CARD':
      case 'DRAW_CARD':
      case 'PASS':
      case 'TAKE_PENALTY':
      case 'CALL_UNO':
        return action.playerId === seatId
      case 'CATCH_UNO':
        return action.callerId === seatId
      case 'CHOOSE_COLOR':
        return this.state!.phase === 'chooseColor' && this.state!.currentPlayer === seatId
      case 'CHALLENGE':
        return this.state!.phase === 'challenge' && this.state!.pendingWild4?.targetId === seatId
      default:
        return false
    }
  }

  private uniqueName(name: string): string {
    const taken = new Set([this.config.hostName, ...this.guests.map((g) => g.name)])
    if (!taken.has(name)) return name
    for (let i = 2; ; i++) {
      if (!taken.has(`${name} ${i}`)) return `${name} ${i}`
    }
  }

  private broadcastLobby() {
    const roster = this.roster()
    for (const g of this.guests) {
      if (g.connected) this.send(g.conn, { type: 'LOBBY', roster })
    }
  }

  private broadcastState() {
    const roster = this.roster()
    for (const g of this.guests) {
      if (g.connected && g.seatId !== null) {
        this.send(g.conn, { type: 'STATE', view: this.viewFor(g.seatId), roster })
      }
    }
  }

  private send(conn: Connection, msg: HostMessage) {
    conn.send(msg)
  }
}
