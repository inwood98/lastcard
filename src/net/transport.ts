/**
 * Minimal message-channel abstraction so HostSession/GuestSession don't know
 * about PeerJS. Production uses WebRTC data connections (see peer.ts); tests
 * use in-memory loopback pairs.
 */
export interface Connection {
  send(data: unknown): void
  onMessage(cb: (data: unknown) => void): void
  onClose(cb: () => void): void
  close(): void
}

export interface HostTransport {
  /** fires for each new incoming guest connection */
  onConnection(cb: (conn: Connection) => void): void
  close(): void
}

/** Two connected endpoints with async (microtask) delivery, for tests */
export function loopbackPair(): [Connection, Connection] {
  const make = () => ({
    messageCbs: [] as ((data: unknown) => void)[],
    closeCbs: [] as (() => void)[],
    closed: false,
  })
  const a = make()
  const b = make()
  const endpoint = (self: typeof a, other: typeof b): Connection => ({
    send(data) {
      if (self.closed || other.closed) return
      const copy = JSON.parse(JSON.stringify(data))
      queueMicrotask(() => {
        if (!other.closed) other.messageCbs.forEach((cb) => cb(copy))
      })
    },
    onMessage(cb) {
      self.messageCbs.push(cb)
    },
    onClose(cb) {
      self.closeCbs.push(cb)
    },
    close() {
      if (self.closed) return
      self.closed = true
      queueMicrotask(() => {
        if (!other.closed) {
          other.closed = true
          other.closeCbs.forEach((cb) => cb())
        }
      })
    },
  })
  return [endpoint(a, b), endpoint(b, a)]
}
