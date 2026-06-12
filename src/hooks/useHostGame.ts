import { useEffect, useReducer, useRef, useState } from 'react'
import { HostSession, type HostConfig } from '../net/host'
import { createHostTransport } from '../net/peer'
import { makeRoomCode } from '../net/protocol'
import { makeApi, type GameApi } from './useGame'

export interface HostGame {
  code: string
  /** transport status; gameplay state lives on the session */
  status: 'opening' | 'ready' | 'error'
  error: string
  session: HostSession | null
  /** non-null once the game has started */
  api: GameApi | null
}

export function useHostGame(config: HostConfig): HostGame {
  const [, force] = useReducer((x: number) => x + 1, 0)
  const sessionRef = useRef<HostSession | null>(null)
  const [code] = useState(makeRoomCode)
  const [status, setStatus] = useState<HostGame['status']>('opening')
  const [error, setError] = useState('')

  useEffect(() => {
    const session = new HostSession(config, force)
    sessionRef.current = session
    let cancelled = false
    createHostTransport(code)
      .then((transport) => {
        if (cancelled) return transport.close()
        session.attach(transport)
        setStatus('ready')
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Could not open the room.')
        setStatus('error')
      })
    return () => {
      cancelled = true
      session.destroy()
      sessionRef.current = null
    }
    // config is captured at mount; the lobby mutates it via session.configure
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  const session = sessionRef.current
  const api =
    session && session.phase === 'playing' && session.state
      ? makeApi(session.hostView()!, 0, (a) => session.dispatch(a))
      : null

  return { code, status, error, session, api }
}
