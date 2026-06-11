import { useGame, type GameSettings } from '../hooks/useGame'
import { ColorPicker } from './ColorPicker'
import { Hand } from './Hand'
import { OpponentSeat } from './OpponentSeat'
import { PilesArea } from './PilesArea'
import { UnoControls } from './UnoControls'
import { WinScreen } from './WinScreen'
import './table.css'

interface GameTableProps {
  settings: GameSettings
  onPlayAgain: () => void
  onChangeSettings: () => void
}

export function GameTable({ settings, onPlayAgain, onChangeSettings }: GameTableProps) {
  const game = useGame(settings)
  const { state } = game
  const human = state.players[0]
  const bots = state.players.slice(1)

  const myTurn = state.phase === 'play' && state.currentPlayer === 0 && state.winner === null
  const canTakePenalty = myTurn && state.pendingDraw > 0
  const canDraw = myTurn && state.pendingDraw === 0 && state.drawnCardId === null
  const legalIds = new Set(game.humanLegal.map((c) => c.id))
  const lastEvent = state.events[state.events.length - 1]

  const showColorPicker = state.phase === 'chooseColor' && state.currentPlayer === 0
  const showChallenge = state.phase === 'challenge' && state.pendingWild4?.targetId === 0
  const showUno = human.hand.length <= 2 && !human.calledUno && state.winner === null

  return (
    <div className="table">
      <div className="table-top">
        {bots.map((p) => (
          <OpponentSeat
            key={p.id}
            player={p}
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
            {human.name}
            {human.calledUno && human.hand.length === 1 && <span className="uno-badge">UNO!</span>}
            {myTurn && <span className="turn-tag">Your turn</span>}
          </div>
          <UnoControls
            state={state}
            showUno={showUno}
            onCallUno={game.callUno}
            onCatch={game.catchBot}
            canPass={myTurn && state.drawnCardId !== null}
            onPass={game.pass}
          />
        </div>
        <Hand cards={human.hand} legalIds={legalIds} myTurn={myTurn} onPlay={game.playCard} />
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
        <WinScreen state={state} onPlayAgain={onPlayAgain} onChangeSettings={onChangeSettings} />
      )}
    </div>
  )
}
