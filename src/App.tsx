import { useState } from 'react'
import { GameTable } from './components/GameTable'
import { SetupScreen } from './components/SetupScreen'
import { DEFAULT_RULES } from './engine/types'
import type { GameSettings } from './hooks/useGame'
import './App.css'

const DEFAULT_SETTINGS: GameSettings = {
  playerName: '',
  botCount: 3,
  difficulty: 'medium',
  rules: DEFAULT_RULES,
}

export default function App() {
  const [settings, setSettings] = useState<GameSettings | null>(null)
  const [lastSettings, setLastSettings] = useState(DEFAULT_SETTINGS)
  const [gameKey, setGameKey] = useState(0)

  if (!settings) {
    return (
      <SetupScreen
        initial={lastSettings}
        onStart={(s) => {
          setLastSettings(s)
          setSettings(s)
          setGameKey((k) => k + 1)
        }}
      />
    )
  }

  return (
    <GameTable
      key={gameKey}
      settings={settings}
      onPlayAgain={() => setGameKey((k) => k + 1)}
      onChangeSettings={() => setSettings(null)}
    />
  )
}
