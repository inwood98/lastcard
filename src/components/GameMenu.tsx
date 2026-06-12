import { useState } from 'react'
import type { HouseRules } from '../engine/types'

interface GameMenuProps {
  rules: HouseRules
  /** present for host/local players — redeals the current round */
  onRestart?: () => void
  onLeave: () => void
  /** changes wording: ending the game vs leaving someone else's table */
  isHostOrLocal: boolean
}

type View = 'closed' | 'menu' | 'rules' | 'confirmLeave' | 'confirmRestart'

const RULE_LINES = [
  ['Skip', 'Next player loses their turn'],
  ['Reverse', 'Direction flips (acts as Skip with 2 players)'],
  ['Draw Two', 'Next player draws 2 and is skipped'],
  ['Wild', 'Play on anything; you choose the color'],
  ['Wild Draw Four', 'Choose color; next player draws 4 and is skipped'],
  ['Last card!', 'Press LAST CARD when you play your second-to-last card — or draw 2 if caught'],
  ['Catch!', 'Spot someone on one card who forgot to call it and penalize them'],
  ['Scoring', 'Round winner collects opponents\' cards: face value, actions 20, wilds 50. First to 500 wins the match'],
] as const

export function GameMenu({ rules, onRestart, onLeave, isHostOrLocal }: GameMenuProps) {
  const [view, setView] = useState<View>('closed')
  const close = () => setView('closed')

  const houseRules = [
    rules.stacking && 'Stacking +2/+4',
    rules.drawUntilPlayable && 'Draw until you can play',
    rules.wild4Challenge && 'Wild Draw Four challenge',
  ].filter(Boolean)

  return (
    <>
      <button className="menu-fab" aria-label="Game menu" onClick={() => setView('menu')}>
        ☰
      </button>

      {view !== 'closed' && (
        <div className="overlay" onClick={close}>
          <div className="modal menu-modal" onClick={(e) => e.stopPropagation()}>
            {view === 'menu' && (
              <>
                <h2>Menu</h2>
                <div className="menu-buttons">
                  <button className="btn" onClick={close}>
                    Resume
                  </button>
                  <button className="btn" onClick={() => setView('rules')}>
                    Rules
                  </button>
                  {onRestart && (
                    <button className="btn" onClick={() => setView('confirmRestart')}>
                      Restart round
                    </button>
                  )}
                  <button className="btn btn-danger" onClick={() => setView('confirmLeave')}>
                    {isHostOrLocal ? 'End game' : 'Leave game'}
                  </button>
                </div>
              </>
            )}

            {view === 'rules' && (
              <>
                <h2>Quick rules</h2>
                <ul className="rules-list">
                  {RULE_LINES.map(([name, text]) => (
                    <li key={name}>
                      <strong>{name}</strong> — {text}
                    </li>
                  ))}
                </ul>
                <p className="setup-note">
                  House rules on: {houseRules.length ? houseRules.join(' · ') : 'none (official rules)'}
                </p>
                <div className="modal-buttons">
                  <button className="btn" onClick={() => setView('menu')}>
                    Back
                  </button>
                </div>
              </>
            )}

            {view === 'confirmRestart' && (
              <>
                <h2>Restart this round?</h2>
                <p>Everyone gets a fresh hand. Match scores are kept.</p>
                <div className="modal-buttons">
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      close()
                      onRestart!()
                    }}
                  >
                    Restart
                  </button>
                  <button className="btn" onClick={() => setView('menu')}>
                    Cancel
                  </button>
                </div>
              </>
            )}

            {view === 'confirmLeave' && (
              <>
                <h2>{isHostOrLocal ? 'End the game?' : 'Leave the game?'}</h2>
                <p>
                  {isHostOrLocal
                    ? 'This ends the match for everyone at the table.'
                    : 'Your seat can be handed to a bot by the host.'}
                </p>
                <div className="modal-buttons">
                  <button
                    className="btn btn-danger"
                    onClick={() => {
                      close()
                      onLeave()
                    }}
                  >
                    {isHostOrLocal ? 'End game' : 'Leave'}
                  </button>
                  <button className="btn" onClick={() => setView('menu')}>
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
