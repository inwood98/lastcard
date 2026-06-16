import { lazy, Suspense, useEffect, useState } from 'react'
import { GameTable } from './components/GameTable'
import { Lobby } from './components/Lobby'
import { SetupScreen, type SetupResult } from './components/SetupScreen'
import { useGame, type GameSettings } from './hooks/useGame'
import { useGuestGame } from './hooks/useGuestGame'
import { useHostGame } from './hooks/useHostGame'
import { MAX_PLAYERS } from './net/protocol'
import { loadSettings, saveSettings } from './storage'
import type { GameState } from './engine/types'
import { describeSave, loadSavedGame, settingsFromSave } from './save'
import { loadBannedNames } from './net/leaderboard'
import './App.css'

const AdminApp = lazy(() => import('./components/AdminApp'))

type Screen =
  | { kind: 'menu' }
  | { kind: 'single'; settings: GameSettings; initialState?: GameState }
  | { kind: 'host'; settings: GameSettings }
  | { kind: 'guest'; name: string; code: string }

export default function App() {
  const [screen, setScreen] = useState<Screen>({ kind: 'menu' })
  const [lastSettings, setLastSettings] = useState(loadSettings)
  const [savedGame, setSavedGame] = useState(loadSavedGame)
  const [gameKey, setGameKey] = useState(0)
  // arriving via an invite link (…/lastcard/?join=CODE) opens the join screen pre-filled
  const [inviteCode] = useState(() => new URLSearchParams(location.search).get('join'))
  // re-read the save when coming back to the menu (a finished match clears it,
  // quitting mid-game leaves it resumable)
  const toMenu = () => {
    setSavedGame(loadSavedGame())
    setScreen({ kind: 'menu' })
  }

  useEffect(() => {
    if (inviteCode) history.replaceState(null, '', location.pathname)
  }, [inviteCode])

  useEffect(() => {
    void loadBannedNames()
  }, [])

  if (window.location.hash === '#admin') {
    return (
      <Suspense fallback={<div style={{ padding: 32, color: '#fff' }}>Loading admin…</div>}>
        <AdminApp />
      </Suspense>
    )
  }

  const handleStart = (result: SetupResult) => {
    setGameKey((k) => k + 1)
    if (result.mode === 'resume') {
      const save = loadSavedGame()
      if (!save) {
        setSavedGame(null)
        setScreen({ kind: 'menu' })
        return
      }
      setScreen({ kind: 'single', settings: settingsFromSave(save), initialState: save.state })
      return
    }
    if (result.mode === 'join') {
      const updated = { ...lastSettings, playerName: result.name }
      setLastSettings(updated)
      saveSettings(updated)
      setScreen({ kind: 'guest', name: result.name, code: result.code })
      return
    }
    setLastSettings(result.settings)
    saveSettings(result.settings)
    setScreen({ kind: result.mode, settings: result.settings })
  }

  switch (screen.kind) {
    case 'menu':
      return (
        <SetupScreen
          initial={lastSettings}
          initialJoinCode={inviteCode}
          savedSummary={savedGame ? describeSave(savedGame) : null}
          onStart={handleStart}
        />
      )
    case 'single':
      return (
        <LocalGame
          key={gameKey}
          settings={screen.settings}
          initialState={screen.initialState}
          onLeave={toMenu}
        />
      )
    case 'host':
      return <HostScreen key={gameKey} settings={screen.settings} onLeave={toMenu} />
    case 'guest':
      return <GuestScreen key={gameKey} name={screen.name} code={screen.code} onLeave={toMenu} />
  }
}

/** Single-player match: rounds carry scores until someone reaches the target */
function LocalGame({
  settings,
  initialState,
  onLeave,
}: {
  settings: GameSettings
  /** present only when resuming a saved game; applies to the first round only */
  initialState?: GameState
  onLeave: () => void
}) {
  const [round, setRound] = useState(0)
  const [scores, setScores] = useState<number[] | undefined>(undefined)
  const [caughtTotal, setCaughtTotal] = useState(0)
  return (
    <LocalRound
      key={round}
      settings={{ ...settings, scores }}
      initialState={round === 0 ? initialState : undefined}
      initialCatchCount={caughtTotal}
      onNextRound={(s, catches) => {
        setScores(s)
        setCaughtTotal((t) => t + catches)
        setRound((r) => r + 1)
      }}
      onNewMatch={() => {
        setScores(undefined)
        setCaughtTotal(0)
        setRound((r) => r + 1)
      }}
      onLeave={onLeave}
    />
  )
}

function LocalRound({
  settings,
  initialState,
  initialCatchCount,
  onNextRound,
  onNewMatch,
  onLeave,
}: {
  settings: GameSettings
  initialState?: GameState
  initialCatchCount?: number
  onNextRound: (scores: number[], catches: number) => void
  onNewMatch: () => void
  onLeave: () => void
}) {
  const game = useGame(settings, initialState, initialCatchCount)
  return (
    <GameTable
      game={game}
      onPlayAgain={() => onNextRound(game.state.scores, game.catchCount)}
      onNewMatch={onNewMatch}
      onLeave={onLeave}
      solo
    />
  )
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
        showInvite
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
      onNewMatch={() => session.restart(true)}
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
        showInvite
        statusText="Waiting for the host to start the game…"
      />
    )
  }
  return <GameTable game={guest.api} onLeave={onLeave} />
}
