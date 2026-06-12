import { describe, expect, it } from 'vitest'
import { chooseMove } from '../ai'
import { DEFAULT_RULES } from '../engine/types'
import { GuestSession } from './client'
import { HostSession, type HostConfig } from './host'
import { handSize } from './redact'
import { loopbackPair, type Connection, type HostTransport } from './transport'

const tick = () => new Promise((r) => setTimeout(r, 0))

function makeHub() {
  let accept: ((conn: Connection) => void) | null = null
  const transport: HostTransport = {
    onConnection(cb) {
      accept = cb
    },
    close() {},
  }
  return {
    transport,
    connectGuest(): Connection {
      const [guestEnd, hostEnd] = loopbackPair()
      accept!(hostEnd)
      return guestEnd
    },
  }
}

const CONFIG: HostConfig = {
  hostName: 'Gary',
  botCount: 0,
  difficulty: 'medium',
  rules: DEFAULT_RULES,
}

async function setupTable(guestNames: string[], config: Partial<HostConfig> = {}) {
  const host = new HostSession({ ...CONFIG, ...config }, () => {})
  const hub = makeHub()
  host.attach(hub.transport)
  const guests = guestNames.map((name) => new GuestSession(name, hub.connectGuest(), () => {}))
  await tick()
  await tick()
  return { host, guests }
}

describe('lobby', () => {
  it('guests join and everyone sees the roster', async () => {
    const { host, guests } = await setupTable(['Amy', 'Ben'], { botCount: 1 })
    expect(host.humanCount()).toBe(3)
    expect(guests[0].status).toBe('lobby')
    expect(guests[1].roster.map((r) => r.name)).toEqual(['Gary', 'Amy', 'Ben', 'Maya'])
  })

  it('rejects a guest when the table already has 4 humans', async () => {
    const { guests } = await setupTable(['Amy', 'Ben', 'Cat', 'Dan'])
    expect(guests[3].status).toBe('rejected')
    expect(guests[3].rejectReason).toBe('full')
  })

  it('rejects joins after the game starts', async () => {
    const { host, guests } = await setupTable(['Amy'])
    host.startGame()
    await tick()
    expect(guests[0].status).toBe('playing')
    // a latecomer through a fresh connection
    const late = new GuestSession('Eve', makeLateConn(host), () => {})
    await tick()
    await tick()
    expect(late.status).toBe('rejected')
    expect(late.rejectReason).toBe('started')
  })
})

// helper for the late-join test: opens a fresh connection into an existing host
function makeLateConn(host: HostSession): Connection {
  const [guestEnd, hostEnd] = loopbackPair()
  ;(host as unknown as { handleConnection(c: Connection): void }).handleConnection(hostEnd)
  return guestEnd
}

describe('starting a game', () => {
  it('assigns seats and sends each guest only their own cards', async () => {
    const { host, guests } = await setupTable(['Amy', 'Ben'], { botCount: 1 })
    host.startGame()
    await tick()
    expect(host.state!.players.map((p) => p.name)).toEqual(['Gary', 'Amy', 'Ben', 'Maya'])
    for (const [i, guest] of guests.entries()) {
      expect(guest.status).toBe('playing')
      expect(guest.seatId).toBe(i + 1)
      const view = guest.view!
      expect(view.players[guest.seatId].hand).toHaveLength(7)
      for (const p of view.players) {
        if (p.id !== guest.seatId) expect(p.hand).toHaveLength(0)
        expect(handSize(p)).toBe(7)
      }
      expect(view.drawPile).toHaveLength(0)
      expect(view.seed).toBe(0)
    }
  })

  it('ignores actions a guest sends on someone else\'s behalf', async () => {
    const { host, guests } = await setupTable(['Amy'])
    host.startGame()
    await tick()
    const before = host.state!
    guests[0].sendAction({ type: 'DRAW_CARD', playerId: 0 }) // impersonating the host
    await tick()
    await tick()
    expect(host.state).toBe(before)
  })
})

describe('full online game', () => {
  it('three humans play to completion through the wire', async () => {
    const { host, guests } = await setupTable(['Amy', 'Ben'])
    host.startGame()
    await tick()

    for (let turn = 0; turn < 3000; turn++) {
      const state = host.state!
      if (state.winner !== null) break
      const actorId =
        state.phase === 'challenge' ? state.pendingWild4!.targetId : state.currentPlayer
      const action = chooseMove(state, actorId, 'medium')
      expect(action).not.toBeNull()
      if (actorId === 0) {
        host.dispatch(action!)
      } else {
        guests[actorId - 1].sendAction(action!)
      }
      await tick()
      await tick()
    }

    expect(host.state!.winner).not.toBeNull()
    await tick()
    // final views agree with the authoritative state
    for (const guest of guests) {
      expect(guest.view!.winner).toBe(host.state!.winner)
      for (const p of host.state!.players) {
        expect(handSize(guest.view!.players[p.id])).toBe(p.hand.length)
      }
    }
  })
})

describe('mid-game management', () => {
  it('replaces a guest seat with a bot', async () => {
    const { host, guests } = await setupTable(['Amy', 'Ben'])
    host.startGame()
    await tick()
    host.replaceWithBot(2)
    await tick()
    expect(host.state!.players[2].isHuman).toBe(false)
    expect(guests[0].view!.players[2].isHuman).toBe(false)
  })

  it('restart deals fresh hands to the same table', async () => {
    const { host, guests } = await setupTable(['Amy'])
    host.startGame()
    await tick()
    const firstHand = guests[0].view!.players[1].hand.map((c) => c.id)
    host.restart()
    await tick()
    expect(guests[0].status).toBe('playing')
    expect(guests[0].view!.players[1].hand).toHaveLength(7)
    expect(guests[0].view!.players[1].hand.map((c) => c.id)).not.toEqual(firstHand)
  })
})
