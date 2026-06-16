import Peer, { type DataConnection } from 'peerjs'
import { roomPeerId } from './protocol'
import type { Connection, HostTransport } from './transport'

/** debug handles for diagnosing connectivity (harmless in production) */
declare global {
  interface Window {
    __lastcardPeers?: Peer[]
  }
}

function track(peer: Peer): Peer {
  ;(window.__lastcardPeers ??= []).push(peer)
  return peer
}

/** STUN for normal networks plus a free TURN relay for locked-down ones */
const PEER_OPTIONS = {
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      {
        urls: [
          'turn:openrelay.metered.ca:80',
          'turn:openrelay.metered.ca:443',
          'turn:openrelay.metered.ca:443?transport=tcp',
        ],
        username: 'openrelayproject',
        credential: 'openrelayproject',
      },
    ],
  },
}

function wrap(dc: DataConnection): Connection {
  return {
    send: (data) => dc.send(data),
    onMessage: (cb) => dc.on('data', (d) => cb(d)),
    onClose: (cb) => {
      dc.on('close', cb)
      dc.on('error', cb)
    },
    close: () => dc.close(),
  }
}

/** Open a room: registers `lastcard-game-<code>` with the PeerJS signaling cloud */
export function createHostTransport(code: string): Promise<HostTransport> {
  return new Promise((resolve, reject) => {
    const peer = track(new Peer(roomPeerId(code), PEER_OPTIONS))
    let connectionCb: ((conn: Connection) => void) | null = null
    peer.on('open', () => {
      resolve({
        onConnection(cb) {
          connectionCb = cb
        },
        close() {
          peer.destroy()
        },
      })
    })
    peer.on('connection', (dc) => {
      dc.on('open', () => connectionCb?.(wrap(dc)))
    })
    peer.on('error', (err) => reject(err))
  })
}

/** Join a room by code; resolves once the data channel to the host is open */
export function connectToRoom(code: string): Promise<Connection> {
  return new Promise((resolve, reject) => {
    const peer = track(new Peer(PEER_OPTIONS))
    const timeout = setTimeout(() => {
      peer.destroy()
      reject(new Error('Could not reach the host — check the room code and try again.'))
    }, 15000)
    peer.on('open', () => {
      const dc = peer.connect(roomPeerId(code), { reliable: true })
      dc.on('open', () => {
        clearTimeout(timeout)
        const conn = wrap(dc)
        const origClose = conn.close
        conn.close = () => {
          origClose()
          peer.destroy()
        }
        resolve(conn)
      })
      dc.on('error', (err) => {
        clearTimeout(timeout)
        peer.destroy()
        reject(err)
      })
    })
    peer.on('error', (err) => {
      clearTimeout(timeout)
      peer.destroy()
      reject(err)
    })
  })
}
