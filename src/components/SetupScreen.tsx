import { useState } from 'react'
import type { Difficulty, HouseRules } from '../engine/types'
import type { GameSettings } from '../hooks/useGame'
import { Card } from './Card'
import { Leaderboard } from './Leaderboard'
import { StatsModal } from './StatsModal'
import { isConfigured } from '../net/leaderboard'
import './setup.css'

export type SetupResult =
  | { mode: 'single'; settings: GameSettings }
  | { mode: 'host'; settings: GameSettings }
  | { mode: 'join'; name: string; code: string }
  | { mode: 'resume' }

interface SetupScreenProps {
  initial: GameSettings
  /** room code from an invite link — opens straight onto the join form */
  initialJoinCode?: string | null
  /** one-line summary of an unfinished solo game, or null if there is none */
  savedSummary?: string | null
  onStart: (result: SetupResult) => void
}

const DIFFICULTIES: { value: Difficulty; label: string; hint: string }[] = [
  { value: 'easy', label: 'Easy', hint: 'Bots play casually' },
  { value: 'medium', label: 'Medium', hint: 'Bots play smart' },
  { value: 'hard', label: 'Hard', hint: 'Bots play to win' },
]

const MODES = [
  { value: 'single', label: 'Single player' },
  { value: 'host', label: 'Host online' },
  { value: 'join', label: 'Join game' },
] as const

type Mode = (typeof MODES)[number]['value']

export function SetupScreen({ initial, initialJoinCode, savedSummary, onStart }: SetupScreenProps) {
  const [mode, setMode] = useState<Mode>(initialJoinCode ? 'join' : 'single')
  const [confirmNew, setConfirmNew] = useState(false)
  const [showBoard, setShowBoard] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const [name, setName] = useState(initial.playerName)
  const [code, setCode] = useState(initialJoinCode?.toUpperCase() ?? '')
  const [botCount, setBotCount] = useState(initial.botCount)
  const [difficulty, setDifficulty] = useState<Difficulty>(initial.difficulty)
  const [rules, setRules] = useState<HouseRules>(initial.rules)

  const settings: GameSettings = {
    playerName: name.trim() || 'You',
    botCount,
    difficulty,
    rules,
    targetScore: initial.targetScore,
  }

  const submit = () => {
    if (mode === 'join') {
      if (code.trim().length >= 4) {
        onStart({ mode: 'join', name: name.trim() || 'Guest', code: code.trim().toUpperCase() })
      }
      return
    }
    if (mode === 'single' && savedSummary && !confirmNew) {
      setConfirmNew(true)
      return
    }
    onStart({ mode, settings })
  }

  return (
    <div className="setup-screen">
      <div className="setup-logo">
        <Card faceDown size="lg" />
        <h1>LAST CARD!</h1>
      </div>

      <div className="setup-panel">
        {savedSummary && (
          <button className="setup-resume" onClick={() => onStart({ mode: 'resume' })}>
            <span className="setup-resume-title">Resume game</span>
            <span className="setup-resume-sub">{savedSummary}</span>
          </button>
        )}
        <div className="setup-field">
          <div className="setup-options">
            {MODES.map((m) => (
              <button
                key={m.value}
                className={m.value === mode ? 'option selected' : 'option'}
                onClick={() => {
                  setMode(m.value)
                  setConfirmNew(false)
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <label className="setup-field">
          <span>Your name</span>
          <input
            type="text"
            value={name}
            maxLength={16}
            placeholder={mode === 'join' ? 'Guest' : 'You'}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        {mode === 'join' && (
          <label className="setup-field">
            <span>Room code</span>
            <input
              type="text"
              className="code-input"
              value={code}
              maxLength={5}
              placeholder="ABCDE"
              autoCapitalize="characters"
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </label>
        )}

        {mode !== 'join' && (
          <>
            <div className="setup-field">
              <span>
                {mode === 'host' ? 'Computer players at the table' : 'How many computer opponents?'}
              </span>
              <div className="setup-options">
                {(mode === 'host' ? [0, 1, 2, 3, 4] : [1, 2, 3, 4, 5]).map((n) => (
                  <button
                    key={n}
                    className={n === botCount ? 'option selected' : 'option'}
                    onClick={() => setBotCount(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div className="setup-field">
              <span>Difficulty</span>
              <div className="setup-options">
                {DIFFICULTIES.map((d) => (
                  <button
                    key={d.value}
                    className={d.value === difficulty ? 'option selected' : 'option'}
                    title={d.hint}
                    onClick={() => setDifficulty(d.value)}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="setup-field">
              <span>House rules (off = official rules)</span>
              <label className="setup-toggle">
                <input
                  type="checkbox"
                  checked={rules.stacking}
                  onChange={(e) => setRules({ ...rules, stacking: e.target.checked })}
                />
                <span>
                  <strong>Stacking</strong> — answer a Draw Two with your own to pass the growing
                  penalty on
                </span>
              </label>
              <label className="setup-toggle">
                <input
                  type="checkbox"
                  checked={rules.drawUntilPlayable}
                  onChange={(e) => setRules({ ...rules, drawUntilPlayable: e.target.checked })}
                />
                <span>
                  <strong>Draw to match</strong> — keep drawing until you get a playable card
                </span>
              </label>
              <label className="setup-toggle">
                <input
                  type="checkbox"
                  checked={rules.wild4Challenge}
                  onChange={(e) => setRules({ ...rules, wild4Challenge: e.target.checked })}
                />
                <span>
                  <strong>Wild Draw Four challenge</strong> — call a bluff; loser takes extra cards
                </span>
              </label>
            </div>
          </>
        )}

        {mode === 'host' && (
          <p className="setup-note">
            You'll get a room code to share — friends pick “Join game” and enter it. 2–4 people
            plus the bots you choose.
          </p>
        )}

        {confirmNew ? (
          <div className="setup-confirm">
            <p>Abandon your game in progress?</p>
            <div className="setup-confirm-buttons">
              <button
                className="setup-start"
                onClick={() => {
                  setConfirmNew(false)
                  if (mode !== 'join') onStart({ mode, settings })
                }}
              >
                Abandon &amp; deal
              </button>
              <button className="option" onClick={() => setConfirmNew(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button className="setup-start" onClick={submit}>
            {mode === 'single' ? 'Deal me in' : mode === 'host' ? 'Open the room' : 'Join game'}
          </button>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="option setup-board-btn" onClick={() => setShowBoard(true)}>
            🏆 Leaderboard
          </button>
          {isConfigured() && (
            <button className="option setup-board-btn" onClick={() => setShowStats(true)}>
              📊 My Stats
            </button>
          )}
        </div>
      </div>
      {showBoard && (
        <Leaderboard currentName={name.trim() || undefined} onClose={() => setShowBoard(false)} />
      )}
      {showStats && (
        <StatsModal playerName={name.trim() || 'You'} onClose={() => setShowStats(false)} />
      )}
    </div>
  )
}
