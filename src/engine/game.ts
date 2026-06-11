import { buildDeck, shuffle } from './deck'
import { isPlayable, legalCards, wild4WasIllegal } from './rules'
import type {
  Card,
  GameAction,
  GameConfig,
  GameState,
  PlayerState,
} from './types'

const BOT_NAMES = ['Maya', 'Leo', 'Zara', 'Finn', 'Ivy']
const HAND_SIZE = 7
const MAX_EVENTS = 30

export function initGame(config: GameConfig): GameState {
  const playerCount = config.botCount + 1
  let seed = config.seed ?? Math.floor(Math.random() * 2 ** 31)
  const shuffled = shuffle(buildDeck(), seed)
  seed = shuffled.seed
  let drawPile = shuffled.cards

  const players: PlayerState[] = [
    { id: 0, name: config.playerName || 'You', isHuman: true, hand: [], calledUno: false },
    ...Array.from({ length: config.botCount }, (_, i) => ({
      id: i + 1,
      name: BOT_NAMES[i],
      isHuman: false,
      hand: [] as Card[],
      calledUno: false,
    })),
  ]
  for (let i = 0; i < HAND_SIZE; i++) {
    for (const p of players) p.hand.push(drawPile.pop()!)
  }

  // Flip the starting card; a Wild Draw Four must go back into the deck
  let top = drawPile.pop()!
  while (top.value === 'wild4') {
    const reshuffled = shuffle([...drawPile, top], seed)
    seed = reshuffled.seed
    drawPile = reshuffled.cards
    top = drawPile.pop()!
  }

  const state: GameState = {
    players,
    currentPlayer: 0,
    direction: 1,
    drawPile,
    discardPile: [top],
    currentColor: top.color ?? 'red',
    phase: 'play',
    pendingDraw: 0,
    pendingWild4: null,
    drawnCardId: null,
    winner: null,
    rules: config.rules,
    events: [],
    seed,
  }

  // The flipped card acts on the first player
  if (top.value === 'skip') {
    addEvent(state, `First card is Skip — ${players[0].name} loses a turn`)
    state.currentPlayer = nextIndex(state, 0, 1)
  } else if (top.value === 'reverse' && playerCount > 2) {
    addEvent(state, 'First card is Reverse — play goes right')
    state.direction = -1
  } else if (top.value === 'draw2') {
    addEvent(state, `First card is Draw Two — ${players[0].name} draws 2`)
    drawCards(state, 0, 2)
    state.currentPlayer = nextIndex(state, 0, 1)
  } else if (top.value === 'wild') {
    addEvent(state, `First card is Wild — ${players[0].name} picks the color`)
    state.phase = 'chooseColor'
  }
  return state
}

function addEvent(state: GameState, text: string) {
  const id = state.events.length ? state.events[state.events.length - 1].id + 1 : 1
  state.events.push({ id, text })
  if (state.events.length > MAX_EVENTS) state.events.shift()
}

function nextIndex(state: GameState, from: number, steps: number): number {
  const n = state.players.length
  return (((from + state.direction * steps) % n) + n) % n
}

function advanceTurn(state: GameState, steps: number) {
  state.currentPlayer = nextIndex(state, state.currentPlayer, steps)
  state.drawnCardId = null
}

/** Draw n cards for a player, reshuffling the discard pile if needed */
function drawCards(state: GameState, playerId: number, n: number): Card[] {
  const player = state.players[playerId]
  const drawn: Card[] = []
  for (let i = 0; i < n; i++) {
    if (state.drawPile.length === 0) {
      if (state.discardPile.length <= 1) break
      const top = state.discardPile.pop()!
      const reshuffled = shuffle(state.discardPile, state.seed)
      state.seed = reshuffled.seed
      state.drawPile = reshuffled.cards
      state.discardPile = [top]
      addEvent(state, 'Draw pile reshuffled')
    }
    const card = state.drawPile.pop()!
    player.hand.push(card)
    drawn.push(card)
  }
  if (player.hand.length !== 1) player.calledUno = false
  return drawn
}

function name(state: GameState, playerId: number): string {
  return state.players[playerId].name
}

function clone(state: GameState): GameState {
  return structuredClone(state)
}

/** Resolve a Wild Draw Four once its color is chosen and any challenge declined/missed */
function resolveWild4(state: GameState, offenderId: number) {
  state.pendingWild4 = null
  if (state.rules.stacking) {
    state.pendingDraw += 4
    advanceTurn(state, 1)
    return
  }
  const victim = nextIndex(state, offenderId, 1)
  drawCards(state, victim, 4)
  addEvent(state, `${name(state, victim)} draws 4 and is skipped`)
  state.currentPlayer = nextIndex(state, offenderId, 2)
  state.drawnCardId = null
}

/** Apply the effect of a just-played card whose color is already known */
function applyEffect(state: GameState, card: Card, playerId: number) {
  switch (card.value) {
    case 'skip': {
      const skipped = nextIndex(state, playerId, 1)
      addEvent(state, `${name(state, skipped)} is skipped`)
      state.currentPlayer = nextIndex(state, playerId, 2)
      state.drawnCardId = null
      break
    }
    case 'reverse': {
      state.direction = state.direction === 1 ? -1 : 1
      addEvent(state, 'Direction reversed')
      if (state.players.length === 2) {
        // Reverse acts as Skip in a two-player game: same player goes again
        state.drawnCardId = null
      } else {
        advanceTurn(state, 1)
      }
      break
    }
    case 'draw2': {
      if (state.rules.stacking) {
        state.pendingDraw += 2
        advanceTurn(state, 1)
      } else {
        const victim = nextIndex(state, playerId, 1)
        drawCards(state, victim, 2)
        addEvent(state, `${name(state, victim)} draws 2 and is skipped`)
        state.currentPlayer = nextIndex(state, playerId, 2)
        state.drawnCardId = null
      }
      break
    }
    case 'wild4': {
      const targetId = nextIndex(state, playerId, 1)
      if (state.rules.wild4Challenge && state.winner === null) {
        state.phase = 'challenge'
        state.pendingWild4 = { ...state.pendingWild4!, playerId, targetId }
      } else {
        resolveWild4(state, playerId)
      }
      break
    }
    default:
      advanceTurn(state, 1)
  }
}

export function gameReducer(prev: GameState, action: GameAction): GameState {
  const state = clone(prev)

  switch (action.type) {
    case 'PLAY_CARD': {
      const { playerId, cardId, chosenColor } = action
      const legal = legalCards(state, playerId)
      const card = legal.find((c) => c.id === cardId)
      if (!card) return prev

      const player = state.players[playerId]
      player.hand = player.hand.filter((c) => c.id !== cardId)
      state.discardPile.push(card)
      state.drawnCardId = null

      const isWild = card.color === null
      const prevColor = state.currentColor
      if (card.value === 'wild4') {
        state.pendingWild4 = { playerId, targetId: nextIndex(state, playerId, 1), prevColor }
      }

      const label = cardLabel(card)
      addEvent(state, `${player.name} plays ${label}`)

      if (player.hand.length === 1 && player.calledUno) {
        addEvent(state, `${player.name} calls UNO!`)
      }
      if (player.hand.length === 0) {
        // Round ends immediately, but a final Draw card still hits the next player
        state.winner = playerId
        if (card.value === 'draw2') {
          const victim = nextIndex(state, playerId, 1)
          drawCards(state, victim, state.pendingDraw + 2)
        } else if (card.value === 'wild4') {
          const victim = nextIndex(state, playerId, 1)
          drawCards(state, victim, state.pendingDraw + 4)
          state.pendingWild4 = null
        }
        state.pendingDraw = 0
        state.phase = 'roundOver'
        addEvent(state, `${player.name} wins!`)
        return state
      }

      if (isWild && !chosenColor) {
        state.phase = 'chooseColor'
        return state
      }
      if (isWild && chosenColor) {
        state.currentColor = chosenColor
        addEvent(state, `${player.name} chooses ${chosenColor}`)
      } else {
        state.currentColor = card.color!
      }
      applyEffect(state, card, playerId)
      return state
    }

    case 'CHOOSE_COLOR': {
      if (state.phase !== 'chooseColor') return prev
      state.currentColor = action.color
      state.phase = 'play'
      const top = state.discardPile[state.discardPile.length - 1]
      addEvent(state, `${name(state, state.currentPlayer)} chooses ${action.color}`)
      // A wild flipped as the starting card has no further effect
      if (top.value === 'wild' && state.discardPile.length === 1) return state
      applyEffect(state, top, state.currentPlayer)
      return state
    }

    case 'CHALLENGE': {
      if (state.phase !== 'challenge' || !state.pendingWild4) return prev
      const { playerId, targetId, prevColor } = state.pendingWild4
      state.phase = 'play'
      if (!action.accept) {
        resolveWild4(state, playerId)
        return state
      }
      if (wild4WasIllegal(state.players[playerId].hand, prevColor)) {
        addEvent(
          state,
          `Challenge succeeds — ${name(state, playerId)} had a ${prevColor} card and draws 4`,
        )
        drawCards(state, playerId, 4)
        state.pendingWild4 = null
        state.currentPlayer = targetId
        state.drawnCardId = null
      } else {
        addEvent(state, `Challenge fails — ${name(state, targetId)} draws 6 and is skipped`)
        drawCards(state, targetId, 6)
        state.pendingWild4 = null
        state.currentPlayer = nextIndex(state, playerId, 2)
        state.drawnCardId = null
      }
      return state
    }

    case 'DRAW_CARD': {
      if (
        state.phase !== 'play' ||
        state.currentPlayer !== action.playerId ||
        state.pendingDraw > 0 ||
        state.drawnCardId !== null
      ) {
        return prev
      }
      const top = state.discardPile[state.discardPile.length - 1]
      const player = state.players[action.playerId]
      let drawn = drawCards(state, action.playerId, 1)
      let count = drawn.length
      if (state.rules.drawUntilPlayable) {
        while (
          drawn.length &&
          !isPlayable(drawn[drawn.length - 1], top, state.currentColor) &&
          (state.drawPile.length > 0 || state.discardPile.length > 1)
        ) {
          drawn = drawCards(state, action.playerId, 1)
          count += drawn.length
        }
      }
      addEvent(state, `${player.name} draws ${count === 1 ? 'a card' : `${count} cards`}`)
      const last = drawn[drawn.length - 1]
      if (last && isPlayable(last, top, state.currentColor)) {
        state.drawnCardId = last.id
      } else {
        advanceTurn(state, 1)
      }
      return state
    }

    case 'PASS': {
      if (
        state.phase !== 'play' ||
        state.currentPlayer !== action.playerId ||
        state.drawnCardId === null
      ) {
        return prev
      }
      addEvent(state, `${name(state, action.playerId)} keeps the drawn card`)
      advanceTurn(state, 1)
      return state
    }

    case 'TAKE_PENALTY': {
      if (
        state.phase !== 'play' ||
        state.currentPlayer !== action.playerId ||
        state.pendingDraw === 0
      ) {
        return prev
      }
      const n = state.pendingDraw
      state.pendingDraw = 0
      drawCards(state, action.playerId, n)
      addEvent(state, `${name(state, action.playerId)} draws ${n} and is skipped`)
      advanceTurn(state, 1)
      return state
    }

    case 'CALL_UNO': {
      const player = state.players[action.playerId]
      if (player.hand.length > 2 || player.calledUno || state.winner !== null) return prev
      player.calledUno = true
      if (player.hand.length === 1) addEvent(state, `${player.name} calls UNO!`)
      return state
    }

    case 'CATCH_UNO': {
      const target = state.players[action.targetId]
      if (
        state.winner !== null ||
        target.hand.length !== 1 ||
        target.calledUno ||
        action.callerId === action.targetId
      ) {
        return prev
      }
      addEvent(
        state,
        `${name(state, action.callerId)} catches ${target.name} not calling UNO — draw 2!`,
      )
      drawCards(state, action.targetId, 2)
      return state
    }

    default:
      return prev
  }
}

export function cardLabel(card: Card): string {
  const colorPart = card.color ? card.color[0].toUpperCase() + card.color.slice(1) : ''
  switch (card.value) {
    case 'skip':
      return `${colorPart} Skip`
    case 'reverse':
      return `${colorPart} Reverse`
    case 'draw2':
      return `${colorPart} Draw Two`
    case 'wild':
      return 'Wild'
    case 'wild4':
      return 'Wild Draw Four'
    default:
      return `${colorPart} ${card.value}`
  }
}
