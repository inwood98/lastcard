import { useState } from 'react'
import type { RosterEntry } from '../net/protocol'

interface LobbyProps {
  code: string
  roster: RosterEntry[]
  /** host-only controls */
  canStart?: boolean
  onStart?: () => void
  botCount?: number
  maxBots?: number
  onBotCount?: (n: number) => void
  onLeave: () => void
  showInvite?: boolean
  statusText: string
}

export function Lobby({
  code,
  roster,
  canStart,
  onStart,
  botCount,
  maxBots,
  onBotCount,
  onLeave,
  showInvite,
  statusText,
}: LobbyProps) {
  const [copied, setCopied] = useState(false)
  const inviteUrl = `${location.origin}${location.pathname}?join=${code}`

  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Join my Last Card! game', url: inviteUrl })
        return
      }
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // user dismissed the share sheet — nothing to do
    }
  }
  return (
    <div className="setup-screen">
      <div className="setup-panel lobby-panel">
        <h2 className="lobby-title">Room code</h2>
        <div className="room-code">{code}</div>
        {showInvite && (
          <button className="btn invite-btn" onClick={share}>
            {copied ? '✓ Link copied!' : '🔗 Share invite link'}
          </button>
        )}
        <p className="setup-note">{statusText}</p>

        <div className="setup-field">
          <span>At the table</span>
          <ul className="lobby-roster">
            {roster.map((p, i) => (
              <li key={i} className={p.connected ? '' : 'lobby-offline'}>
                {p.isHuman ? '🙂' : '🤖'} {p.name}
                {!p.connected && ' (offline)'}
              </li>
            ))}
          </ul>
        </div>

        {onBotCount && (
          <div className="setup-field">
            <span>Computer players</span>
            <div className="setup-options">
              {[0, 1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  className={n === botCount ? 'option selected' : 'option'}
                  disabled={maxBots !== undefined && n > maxBots}
                  onClick={() => onBotCount(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="modal-buttons">
          {onStart && (
            <button className="setup-start lobby-start" disabled={!canStart} onClick={onStart}>
              Start game
            </button>
          )}
        </div>
        <button className="btn lobby-leave" onClick={onLeave}>
          Leave
        </button>
      </div>
    </div>
  )
}
