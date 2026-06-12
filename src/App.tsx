import { useState } from 'react'
import { GameTable } from './components/GameTable'
import { Lobby } from './components/Lobby'
import { SetupScreen, type SetupResult } from './components/SetupScreen'
import { DEFAULT_RULES } from './engine/types'
import { useGame, type GameSettings } from './hooks/useGame'
import { useGuestGame } from './hooks/useGuestGame'
import { useHostGame } from './hooks/useHostGame'
import { MAX_PLAYERS } from './net/protocol'
import './App.css'

const DEFAULT_SETTINGS: GameSettings = {
  playerName: '',
  botCount: 3,
  difficulty: 'medium',
  rules: DEFAULT_RULES,
}

type Screen =
  | { kind: 'menu' }
  | { kind: 'single'; settings: GameSettings }
  | { kind: 'host'; settings: GameSettings }
  | { kind: 'guest'; name: string; code: string }

export default function App() {
  const [screen, setScreen] = useState<Screen>({ kind: 'menu' })
  const [lastSettings, setLastSettings] = useState(DEFAULT_SETTINGS)
  const [gameKey, setGameKey] = useState(0)
  const toMenu = () => setScreen({ kind: 'menu' })

  const handleStart = (result: SetupResult) => {
    if (result.mode === 'join') {
      setScreen({ kind: 'guest', name: result.name, code: result.code })
      return
    }
    setLastSettings(result.settings)
    setGameKey((k) => k + 1)
    setScreen({ kind: result.mode, settings: result.settings })
  }

  switch (screen.kind) {
    case 'menu':
      return <SetupScreen initial={lastSettings} onStart={handleStart} />
    case 'single':
      return (
        <LocalGame
          key={gameKey}
          settings={screen.settings}
          onPlayAgain={() => setGameKey((k) => k + 1)}
          onLeave={toMenu}
        />
      )
    case 'host':
      return <HostScreen key={gameKey} settings={screen.settings} onLeave={toMenu} />
    case 'guest':
      return (
        <GuestScreen key={gameKey} name={screen.name} code={screen.code} onLeave={toMenu} />
      )
  }
}

function LocalGame({
  settings,
  onPlayAgain,
  onLeave,
}: {
  settings: GameSettings
  onPlayAgain: () => void
  onLeave: () => void
}) {
  const game = useGame(settings)
  return <GameTable game={game} onPlayAgain={onPlayAgain} onLeave={onLeave} />
}

function Message({ title, body, onLeave }: { title: string; body?: string; onLeave: () => void }) {
  return (
    <div className="setup-screen">
      <div className="setup-panel">
        <h2>{title}</h2>
        {body && <p className="setup-note">{body}</p>}
        <button className="setup-start" onClick={onLeave}>
          Back to menu
        </button>
      </div>
    </div>
  )
}

function HostScreen({ settings, onLeave }: { settings: GameSettings; onLeave: () => void }) {
  const host = useHostGame({
    hostName: settings.playerName,
    botCount: settings.botCount,
    difficulty: settings.difficulty,
    rules: settings.rules,
  })
  const session = host.session

  if (host.status === 'error') {
    return <Message title="Couldn't open the room" body={host.error} onLeave={onLeave} />
  }

  if (!host.api || !session) {
    return (
      <Lobby
        code={host.code}
        roster={session?.roster() ?? []}
        canStart={host.status === 'ready' && (session?.canStart() ?? false)}
        onStart={() => session?.startGame()}
        botCount={session?.config.botCount ?? settings.botCount}
        maxBots={MAX_PLAYERS - (session?.humanCount() ?? 1)}
        onBotCount={(n) => session?.configure({ botCount: n })}
        onLeave={onLeave}
        statusText={
          host.status === 'opening'
            ? 'Opening the room…'
            : session && session.humanCount() > 1
              ? 'Start whenever you’re ready.'
              : 'Share this code — friends choose “Join game” and type it in.'
        }
      />
    )
  }

  const disconnected = session.disconnectedSeats()
  const banner =
    disconnected.length > 0 ? (
      <div className="net-banner">
        {disconnected.map((seatId) => (
          <span key={seatId}>
            {host.api!.state.players[seatId].name} disconnected.{' '}
            <button className="btn btn-catch" onClick={() => session.replaceWithBot(seatId)}>
              Hand seat to a bot
            </button>
          </span>
        ))}
      </div>
    ) : undefined

  return (
    <GameTable
      game={host.api}
      onPlayAgain={() => session.restart()}
      onLeave={onLeave}
      banner={banner}
    />
  )
}

function GuestScreen({
  name,
  code,
  onLeave,
}: {
  name: string
  code: string
  onLeave: () => void
}) {
  const guest = useGuestGame(name, code)

  if (guest.status === 'error') {
    return <Message title="Couldn't join" body={guest.error} onLeave={onLeave} />
  }
  if (guest.status === 'rejected') {
    const why =
      guest.session?.rejectReason === 'full'
        ? 'That table is full (4 players max).'
        : guest.session?.rejectReason === 'started'
          ? 'That game has already started.'
          : 'The host is running a different version of the game — refresh your browsers.'
    return <Message title="Couldn't join" body={why} onLeave={onLeave} />
  }
  if (guest.status === 'closed') {
    return <Message title="The host left" body="The game has ended." onLeave={onLeave} />
  }
  if (guest.status === 'connecting') {
    return <Message title="Joining room…" body={`Looking for table ${code}.`} onLeave={onLeave} />
  }
  if (guest.status === 'lobby' || !guest.api) {
    return (
      <Lobby
        code={code}
        roster={guest.session?.roster ?? []}
        onLeave={onLeave}
        statusText="Waiting for the host to start the game…"
      />
    )
  }
  return <GameTable game={guest.api} onLeave={onLeave} />
}
