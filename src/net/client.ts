import type { GameAction } from '../engine/types'
import { PROTOCOL_VERSION, type HostMessage, type RosterEntry } from './protocol'
import type { GameView } from './redact'
import type { Connection } from './transport'

export type GuestStatus = 'connecting' | 'lobby' | 'playing' | 'rejected' | 'closed'

/** A guest player's end of the wire: joins a room, sends actions, holds the latest view */
export class GuestSession {
  status: GuestStatus = 'connecting'
  roster: RosterEntry[] = []
  seatId = -1
  view: GameView | null = null
  rejectReason: 'full' | 'version' | 'started' | null = null

  private conn: Connection
  private onChange: () => void

  constructor(name: string, conn: Connection, onChange: () => void) {
    this.conn = conn
    this.onChange = onChange
    conn.onMessage((data) => this.handle(data as HostMessage))
    conn.onClose(() => {
      if (this.status !== 'rejected') this.status = 'closed'
      this.onChange()
    })
    conn.send({ type: 'JOIN', version: PROTOCOL_VERSION, name })
  }

  sendAction(action: GameAction) {
    this.conn.send({ type: 'ACTION', action })
  }

  leave() {
    this.conn.close()
  }

  private handle(msg: HostMessage) {
    if (!msg || typeof msg !== 'object') return
    switch (msg.type) {
      case 'WELCOME':
        this.status = 'lobby'
        this.roster = msg.roster
        break
      case 'LOBBY':
        this.roster = msg.roster
        break
      case 'START':
        this.status = 'playing'
        this.seatId = msg.seatId
        this.view = msg.view
        this.roster = msg.roster
        break
      case 'STATE':
        this.view = msg.view
        this.roster = msg.roster
        break
      case 'REJECTED':
        this.status = 'rejected'
        this.rejectReason = msg.reason
        break
    }
    this.onChange()
  }
}
