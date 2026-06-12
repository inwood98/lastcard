import { useEffect, useReducer, useRef, useState } from 'react'
import { GuestSession, type GuestStatus } from '../net/client'
import { connectToRoom } from '../net/peer'
import { makeApi, type GameApi } from './useGame'

export interface GuestGame {
  status: GuestStatus | 'error'
  error: string
  session: GuestSession | null
  /** non-null while playing */
  api: GameApi | null
}

function friendlyError(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err)
  if (text.includes('Could not connect to peer')) {
    return 'Room not found — check the code with the host.'
  }
  return text || 'Could not join the room.'
}

export function useGuestGame(name: string, code: string): GuestGame {
  const [, force] = useReducer((x: number) => x + 1, 0)
  const sessionRef = useRef<GuestSession | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    let session: GuestSession | null = null
    connectToRoom(code)
      .then((conn) => {
        if (cancelled) return conn.close()
        session = new GuestSession(name, conn, force)
        sessionRef.current = session
        force()
      })
      .catch((err) => {
        if (!cancelled) setError(friendlyError(err))
      })
    return () => {
      cancelled = true
      session?.leave()
      sessionRef.current = null
    }
    // name/code are fixed for the lifetime of a join attempt
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const session = sessionRef.current
  const api =
    session && session.status === 'playing' && session.view
      ? makeApi(session.view, session.seatId, (a) => session.sendAction(a))
      : null

  return {
    status: error ? 'error' : (session?.status ?? 'connecting'),
    error,
    session,
    api,
  }
}
