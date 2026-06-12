import type { ReactNode } from 'react'
import { handSize } from '../net/redact'
import type { GameApi } from '../hooks/useGame'
import { ColorPicker } from './ColorPicker'
import { GameMenu } from './GameMenu'
import { Hand } from './Hand'
import { OpponentSeat } from './OpponentSeat'
import { PilesArea } from './PilesArea'
import { UnoControls } from './UnoControls'
import { WinScreen } from './WinScreen'
import './table.css'

interface GameTableProps {
  game: GameApi
  /** undefined = this player can't restart (guest) — win screen says to ask the host */
  onPlayAgain?: () => void
  /** start a fresh match with scores reset (host/local only) */
  onNewMatch?: () => void
  onLeave: () => void
  /** extra host-only UI such as disconnect banners */
  banner?: ReactNode
}

export function GameTable({ game, onPlayAgain, onNewMatch, onLeave, banner }: GameTableProps) {
  const { state, viewerId } = game
  const viewer = state.players[viewerId]
  const others = [
    ...state.players.slice(viewerId + 1),
    ...state.players.slice(0, viewerId),
  ]

  const myTurn = state.phase === 'play' && state.currentPlayer === viewerId && state.winner === null
  const canTakePenalty = myTurn && state.pendingDraw > 0
  const canDraw = myTurn && state.pendingDraw === 0 && state.drawnCardId === null
  const legalIds = new Set(game.humanLegal.map((c) => c.id))
  const lastEvent = state.events[state.events.length - 1]

  const showColorPicker = state.phase === 'chooseColor' && state.currentPlayer === viewerId
  const showChallenge = state.phase === 'challenge' && state.pendingWild4?.targetId === viewerId
  const showUno = handSize(viewer) <= 2 && !viewer.calledUno && state.winner === null

  return (
    <div className="table">
      {banner}
      <GameMenu
        rules={state.rules}
        onRestart={onPlayAgain}
        onLeave={onLeave}
        isHostOrLocal={!!onPlayAgain}
      />
      <div className="table-top">
        {others.map((p) => (
          <OpponentSeat
            key={p.id}
            player={p}
            score={state.scores[p.id]}
            isCurrent={state.currentPlayer === p.id && state.phase !== 'roundOver'}
          />
        ))}
      </div>

      <div className="table-center">
        <PilesArea
          state={state}
          canDraw={canDraw}
          canTakePenalty={canTakePenalty}
          onDraw={canTakePenalty ? game.takePenalty : game.draw}
        />
        <div className="ticker" key={lastEvent?.id ?? 0}>
          {lastEvent?.text ?? ''}
        </div>
      </div>

      <div className={myTurn ? 'table-bottom my-turn' : 'table-bottom'}>
        <div className="bottom-bar">
          <div className="player-name">
            {viewer.name}
            <span className="score-chip">{state.scores[viewerId]} pts</span>
            {viewer.calledUno && handSize(viewer) === 1 && (
              <span className="uno-badge">LAST CARD!</span>
            )}
            {myTurn && <span className="turn-tag">Your turn</span>}
          </div>
          <UnoControls
            state={state}
            viewerId={viewerId}
            showUno={showUno}
            onCallUno={game.callUno}
            onCatch={game.catchPlayer}
            canPass={myTurn && state.drawnCardId !== null}
            onPass={game.pass}
          />
        </div>
        <Hand cards={viewer.hand} legalIds={legalIds} myTurn={myTurn} onPlay={game.playCard} />
      </div>

      {showColorPicker && <ColorPicker onPick={game.chooseColor} />}

      {showChallenge && (
        <div className="overlay">
          <div className="modal">
            <h2>Wild Draw Four played on you</h2>
            <p>
              Think {state.players[state.pendingWild4!.playerId].name} had a matching color card? If
              you're right they draw 4 — if not, you draw 6 instead of 4.
            </p>
            <div className="modal-buttons">
              <button className="btn btn-primary" onClick={() => game.challenge(true)}>
                Challenge!
              </button>
              <button className="btn" onClick={() => game.challenge(false)}>
                Take the 4
              </button>
            </div>
          </div>
        </div>
      )}

      {state.phase === 'roundOver' && (
        <WinScreen
          state={state}
          viewerId={viewerId}
          onPlayAgain={onPlayAgain}
          onNewMatch={onNewMatch}
          onLeave={onLeave}
        />
      )}
    </div>
  )
}
