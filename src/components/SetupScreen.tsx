import { useState } from 'react'
import type { Difficulty } from '../engine/types'
import type { GameSettings } from '../hooks/useGame'
import { Card } from './Card'
import './setup.css'

interface SetupScreenProps {
  initial: GameSettings
  onStart: (settings: GameSettings) => void
}

const DIFFICULTIES: { value: Difficulty; label: string; hint: string }[] = [
  { value: 'easy', label: 'Easy', hint: 'Bots play casually' },
  { value: 'medium', label: 'Medium', hint: 'Bots play smart' },
  { value: 'hard', label: 'Hard', hint: 'Bots play to win' },
]

export function SetupScreen({ initial, onStart }: SetupScreenProps) {
  const [name, setName] = useState(initial.playerName)
  const [botCount, setBotCount] = useState(initial.botCount)
  const [difficulty, setDifficulty] = useState<Difficulty>(initial.difficulty)
  const [rules, setRules] = useState(initial.rules)

  return (
    <div className="setup-screen">
      <div className="setup-logo">
        <Card faceDown size="lg" />
        <h1>UNO</h1>
      </div>

      <div className="setup-panel">
        <label className="setup-field">
          <span>Your name</span>
          <input
            type="text"
            value={name}
            maxLength={16}
            placeholder="You"
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <div className="setup-field">
          <span>How many computer opponents?</span>
          <div className="setup-options">
            {[1, 2, 3, 4, 5].map((n) => (
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
              <strong>Stacking</strong> — answer a Draw Two with your own to pass the growing penalty on
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

        <button
          className="setup-start"
          onClick={() =>
            onStart({ playerName: name.trim() || 'You', botCount, difficulty, rules })
          }
        >
          Deal me in
        </button>
      </div>
    </div>
  )
}
