import { describe, expect, it } from 'vitest'
import { buildDeck, shuffle } from './deck'
import { gameReducer, initGame } from './game'
import { isPlayable, legalCards } from './rules'
import { DEFAULT_RULES, type Card, type GameState, type HouseRules } from './types'

let nextId = 1000
function card(color: Card['color'], value: Card['value']): Card {
  return { id: nextId++, color, value }
}

interface StateOptions {
  hands: Card[][]
  top: Card
  currentColor?: GameState['currentColor']
  rules?: Partial<HouseRules>
  currentPlayer?: number
  direction?: 1 | -1
  drawPile?: Card[]
}

function makeState(opts: StateOptions): GameState {
  return {
    players: opts.hands.map((hand, i) => ({
      id: i,
      name: i === 0 ? 'You' : `Bot ${i}`,
      isHuman: i === 0,
      hand,
      calledUno: false,
    })),
    currentPlayer: opts.currentPlayer ?? 0,
    direction: opts.direction ?? 1,
    drawPile: opts.drawPile ?? buildDeck().slice(0, 30),
    discardPile: [opts.top],
    currentColor: opts.currentColor ?? opts.top.color ?? 'red',
    phase: 'play',
    pendingDraw: 0,
    pendingWild4: null,
    drawnCardId: null,
    winner: null,
    rules: { ...DEFAULT_RULES, ...opts.rules },
    events: [],
    scores: opts.hands.map(() => 0),
    seed: 42,
  }
}

describe('deck', () => {
  it('builds a standard 108-card deck', () => {
    const deck = buildDeck()
    expect(deck).toHaveLength(108)
    const count = (pred: (c: Card) => boolean) => deck.filter(pred).length
    expect(count((c) => typeof c.value === 'number')).toBe(76)
    expect(count((c) => c.value === 'skip')).toBe(8)
    expect(count((c) => c.value === 'reverse')).toBe(8)
    expect(count((c) => c.value === 'draw2')).toBe(8)
    expect(count((c) => c.value === 'wild')).toBe(4)
    expect(count((c) => c.value === 'wild4')).toBe(4)
    expect(count((c) => c.color === 'red')).toBe(25)
  })

  it('shuffles deterministically per seed', () => {
    const deck = buildDeck()
    const a = shuffle(deck, 7).cards.map((c) => c.id)
    const b = shuffle(deck, 7).cards.map((c) => c.id)
    const c = shuffle(deck, 8).cards.map((x) => x.id)
    expect(a).toEqual(b)
    expect(a).not.toEqual(c)
  })
})

describe('isPlayable', () => {
  const top = card('red', 5)
  it('matches by color, value, or wild', () => {
    expect(isPlayable(card('red', 9), top, 'red')).toBe(true)
    expect(isPlayable(card('blue', 5), top, 'red')).toBe(true)
    expect(isPlayable(card(null, 'wild'), top, 'red')).toBe(true)
    expect(isPlayable(card('blue', 9), top, 'red')).toBe(false)
  })
  it('uses currentColor, not top card color, after a wild', () => {
    expect(isPlayable(card('green', 2), card(null, 'wild'), 'green')).toBe(true)
    expect(isPlayable(card('red', 2), card(null, 'wild'), 'green')).toBe(false)
  })
})

describe('initGame', () => {
  it('deals 7 cards to everyone and flips a non-wild4 start card', () => {
    const state = initGame({ playerName: 'Gary', botCount: 3, rules: DEFAULT_RULES, seed: 1 })
    expect(state.players).toHaveLength(4)
    for (const p of state.players) expect(p.hand).toHaveLength(7)
    expect(state.discardPile[0].value).not.toBe('wild4')
    expect(state.drawPile.length + state.discardPile.length + 28).toBe(108)
  })

  it('accepts explicit seats mixing humans and bots in turn order', () => {
    const state = initGame({
      seats: [
        { name: 'Gary', isHuman: true },
        { name: 'Maya', isHuman: false },
        { name: 'Amy', isHuman: true },
        { name: 'Leo', isHuman: false },
      ],
      rules: DEFAULT_RULES,
      seed: 2,
    })
    expect(state.players.map((p) => p.name)).toEqual(['Gary', 'Maya', 'Amy', 'Leo'])
    expect(state.players.map((p) => p.isHuman)).toEqual([true, false, true, false])
    for (const p of state.players) expect(p.hand).toHaveLength(7)
  })
})

describe('playing cards', () => {
  it('plays a color match and advances the turn', () => {
    const c = card('red', 3)
    const state = makeState({ hands: [[c, card('blue', 7)], [card('green', 1)]], top: card('red', 5) })
    const next = gameReducer(state, { type: 'PLAY_CARD', playerId: 0, cardId: c.id })
    expect(next.players[0].hand).toHaveLength(1)
    expect(next.discardPile[next.discardPile.length - 1].id).toBe(c.id)
    expect(next.currentColor).toBe('red')
    expect(next.currentPlayer).toBe(1)
  })

  it('rejects an illegal play', () => {
    const c = card('blue', 7)
    const state = makeState({ hands: [[c], [card('green', 1)]], top: card('red', 5) })
    const next = gameReducer(state, { type: 'PLAY_CARD', playerId: 0, cardId: c.id })
    expect(next).toBe(state)
  })

  it('skip jumps over the next player', () => {
    const c = card('red', 'skip')
    const state = makeState({
      hands: [[c, card('blue', 1)], [card('green', 1)], [card('green', 2)]],
      top: card('red', 5),
    })
    const next = gameReducer(state, { type: 'PLAY_CARD', playerId: 0, cardId: c.id })
    expect(next.currentPlayer).toBe(2)
  })

  it('reverse flips direction with 3+ players', () => {
    const c = card('red', 'reverse')
    const state = makeState({
      hands: [[c, card('blue', 1)], [card('green', 1)], [card('green', 2)]],
      top: card('red', 5),
    })
    const next = gameReducer(state, { type: 'PLAY_CARD', playerId: 0, cardId: c.id })
    expect(next.direction).toBe(-1)
    expect(next.currentPlayer).toBe(2)
  })

  it('reverse acts as skip with 2 players', () => {
    const c = card('red', 'reverse')
    const state = makeState({ hands: [[c, card('blue', 1)], [card('green', 1)]], top: card('red', 5) })
    const next = gameReducer(state, { type: 'PLAY_CARD', playerId: 0, cardId: c.id })
    expect(next.currentPlayer).toBe(0)
  })

  it('draw two makes the victim draw 2 and lose their turn', () => {
    const c = card('red', 'draw2')
    const state = makeState({
      hands: [[c, card('blue', 1)], [card('green', 1)], [card('green', 2)]],
      top: card('red', 5),
    })
    const next = gameReducer(state, { type: 'PLAY_CARD', playerId: 0, cardId: c.id })
    expect(next.players[1].hand).toHaveLength(3)
    expect(next.currentPlayer).toBe(2)
  })
})

describe('wild cards', () => {
  it('asks for a color when none is chosen, then applies it', () => {
    const c = card(null, 'wild')
    const state = makeState({ hands: [[c, card('blue', 1)], [card('green', 1)]], top: card('red', 5) })
    const mid = gameReducer(state, { type: 'PLAY_CARD', playerId: 0, cardId: c.id })
    expect(mid.phase).toBe('chooseColor')
    const next = gameReducer(mid, { type: 'CHOOSE_COLOR', color: 'green' })
    expect(next.currentColor).toBe('green')
    expect(next.phase).toBe('play')
    expect(next.currentPlayer).toBe(1)
  })

  it('applies a pre-chosen color directly (bot flow)', () => {
    const c = card(null, 'wild')
    const state = makeState({ hands: [[c, card('blue', 1)], [card('green', 1)]], top: card('red', 5) })
    const next = gameReducer(state, { type: 'PLAY_CARD', playerId: 0, cardId: c.id, chosenColor: 'blue' })
    expect(next.currentColor).toBe('blue')
    expect(next.currentPlayer).toBe(1)
  })

  it('wild draw four: victim draws 4 and is skipped', () => {
    const c = card(null, 'wild4')
    const state = makeState({
      hands: [[c, card('blue', 1)], [card('green', 1)], [card('green', 2)]],
      top: card('red', 5),
    })
    const next = gameReducer(state, { type: 'PLAY_CARD', playerId: 0, cardId: c.id, chosenColor: 'blue' })
    expect(next.players[1].hand).toHaveLength(5)
    expect(next.currentPlayer).toBe(2)
    expect(next.currentColor).toBe('blue')
  })
})

describe('wild draw four challenge', () => {
  function challengeSetup(offenderHand: Card[]) {
    const w4 = card(null, 'wild4')
    const state = makeState({
      hands: [[w4, ...offenderHand], [card('green', 1)], [card('green', 2)]],
      top: card('red', 5),
      rules: { wild4Challenge: true },
    })
    return gameReducer(state, { type: 'PLAY_CARD', playerId: 0, cardId: w4.id, chosenColor: 'blue' })
  }

  it('opens a challenge window', () => {
    const mid = challengeSetup([card('red', 9)])
    expect(mid.phase).toBe('challenge')
    expect(mid.pendingWild4?.targetId).toBe(1)
  })

  it('successful challenge: offender draws 4, victim keeps the turn', () => {
    const mid = challengeSetup([card('red', 9)]) // held a red card — illegal play
    const next = gameReducer(mid, { type: 'CHALLENGE', accept: true })
    expect(next.players[0].hand).toHaveLength(5)
    expect(next.players[1].hand).toHaveLength(1)
    expect(next.currentPlayer).toBe(1)
  })

  it('failed challenge: victim draws 6 and is skipped', () => {
    const mid = challengeSetup([card('blue', 9)]) // no red card — legal play
    const next = gameReducer(mid, { type: 'CHALLENGE', accept: true })
    expect(next.players[1].hand).toHaveLength(7)
    expect(next.currentPlayer).toBe(2)
  })

  it('declined challenge: victim draws 4 and is skipped', () => {
    const mid = challengeSetup([card('red', 9)])
    const next = gameReducer(mid, { type: 'CHALLENGE', accept: false })
    expect(next.players[1].hand).toHaveLength(5)
    expect(next.currentPlayer).toBe(2)
  })
})

describe('stacking house rule', () => {
  it('stacks draw twos and the loser draws the total', () => {
    const d1 = card('red', 'draw2')
    const d2 = card('blue', 'draw2')
    const state = makeState({
      hands: [[d1, card('blue', 1)], [d2, card('green', 1)], [card('green', 2), card('green', 3)]],
      top: card('red', 5),
      rules: { stacking: true },
    })
    let s = gameReducer(state, { type: 'PLAY_CARD', playerId: 0, cardId: d1.id })
    expect(s.pendingDraw).toBe(2)
    expect(s.currentPlayer).toBe(1)
    // victim may only respond with a draw2
    expect(legalCards(s, 1).map((c) => c.id)).toEqual([d2.id])
    s = gameReducer(s, { type: 'PLAY_CARD', playerId: 1, cardId: d2.id })
    expect(s.pendingDraw).toBe(4)
    expect(s.currentPlayer).toBe(2)
    expect(legalCards(s, 2)).toHaveLength(0)
    s = gameReducer(s, { type: 'TAKE_PENALTY', playerId: 2 })
    expect(s.players[2].hand).toHaveLength(6)
    expect(s.pendingDraw).toBe(0)
    expect(s.currentPlayer).toBe(0)
  })
})

describe('drawing', () => {
  it('an unplayable drawn card passes the turn', () => {
    const state = makeState({
      hands: [[card('blue', 7)], [card('green', 1)]],
      top: card('red', 5),
      drawPile: [card('green', 9)], // top of pile, not playable on red 5
    })
    const next = gameReducer(state, { type: 'DRAW_CARD', playerId: 0 })
    expect(next.players[0].hand).toHaveLength(2)
    expect(next.currentPlayer).toBe(1)
  })

  it('a playable drawn card may be played immediately — and only it', () => {
    const drawable = card('red', 9)
    const matchInHand = card('red', 7)
    const state = makeState({
      hands: [[card('blue', 7), matchInHand], [card('green', 1)]],
      top: card('red', 5),
      drawPile: [drawable],
    })
    const mid = gameReducer(state, { type: 'DRAW_CARD', playerId: 0 })
    expect(mid.currentPlayer).toBe(0)
    expect(mid.drawnCardId).toBe(drawable.id)
    // the card already in hand is no longer legal this turn
    expect(legalCards(mid, 0).map((c) => c.id)).toEqual([drawable.id])
    const played = gameReducer(mid, { type: 'PLAY_CARD', playerId: 0, cardId: drawable.id })
    expect(played.currentPlayer).toBe(1)
  })

  it('a playable drawn card may be kept by passing', () => {
    const drawable = card('red', 9)
    const state = makeState({
      hands: [[card('blue', 7)], [card('green', 1)]],
      top: card('red', 5),
      drawPile: [drawable],
    })
    const mid = gameReducer(state, { type: 'DRAW_CARD', playerId: 0 })
    const next = gameReducer(mid, { type: 'PASS', playerId: 0 })
    expect(next.players[0].hand).toHaveLength(2)
    expect(next.currentPlayer).toBe(1)
  })

  it('draw-until-playable keeps drawing to a playable card', () => {
    const state = makeState({
      hands: [[card('blue', 7)], [card('green', 1)]],
      top: card('red', 5),
      rules: { drawUntilPlayable: true },
      drawPile: [card('red', 2), card('green', 9), card('blue', 9)], // pops from the end
    })
    const next = gameReducer(state, { type: 'DRAW_CARD', playerId: 0 })
    expect(next.players[0].hand).toHaveLength(4) // blue9, green9, then red2 playable
    expect(next.drawnCardId).not.toBeNull()
    expect(next.currentPlayer).toBe(0)
  })

  it('reshuffles the discard pile when the draw pile is empty', () => {
    const state = makeState({
      hands: [[card('blue', 7)], [card('green', 1)]],
      top: card('red', 5),
      drawPile: [],
    })
    state.discardPile = [card('green', 2), card('green', 3), state.discardPile[0]]
    const next = gameReducer(state, { type: 'DRAW_CARD', playerId: 0 })
    expect(next.players[0].hand).toHaveLength(2)
    expect(next.discardPile).toHaveLength(1)
  })
})

describe('UNO calls', () => {
  it('catches a player who did not call UNO', () => {
    const state = makeState({ hands: [[card('blue', 7)], [card('green', 1)]], top: card('red', 5) })
    const next = gameReducer(state, { type: 'CATCH_UNO', callerId: 0, targetId: 1 })
    expect(next.players[1].hand).toHaveLength(3)
  })

  it('cannot catch a player who called UNO', () => {
    const state = makeState({ hands: [[card('blue', 7)], [card('green', 1)]], top: card('red', 5) })
    state.currentPlayer = 1
    const called = gameReducer(state, { type: 'CALL_UNO', playerId: 1 })
    expect(called.players[1].calledUno).toBe(true)
    const next = gameReducer(called, { type: 'CATCH_UNO', callerId: 0, targetId: 1 })
    expect(next).toBe(called)
  })

  it('calling UNO before playing the second-to-last card persists', () => {
    const c = card('red', 3)
    const state = makeState({ hands: [[c, card('blue', 7)], [card('green', 1)]], top: card('red', 5) })
    let s = gameReducer(state, { type: 'CALL_UNO', playerId: 0 })
    s = gameReducer(s, { type: 'PLAY_CARD', playerId: 0, cardId: c.id })
    expect(s.players[0].calledUno).toBe(true)
    expect(gameReducer(s, { type: 'CATCH_UNO', callerId: 1, targetId: 0 })).toBe(s)
  })

  it('drawing cards resets the UNO call', () => {
    const state = makeState({ hands: [[card('blue', 7)], [card('green', 1)]], top: card('red', 5) })
    state.players[1].calledUno = true
    state.currentPlayer = 1
    const next = gameReducer(state, { type: 'DRAW_CARD', playerId: 1 })
    expect(next.players[1].calledUno).toBe(false)
  })
})

describe('winning', () => {
  it('playing the last card wins the round', () => {
    const c = card('red', 3)
    const state = makeState({ hands: [[c], [card('green', 1)]], top: card('red', 5) })
    const next = gameReducer(state, { type: 'PLAY_CARD', playerId: 0, cardId: c.id })
    expect(next.winner).toBe(0)
    expect(next.phase).toBe('roundOver')
  })

  it('a final draw two still makes the next player draw', () => {
    const c = card('red', 'draw2')
    const state = makeState({ hands: [[c], [card('green', 1)]], top: card('red', 5) })
    const next = gameReducer(state, { type: 'PLAY_CARD', playerId: 0, cardId: c.id })
    expect(next.winner).toBe(0)
    expect(next.players[1].hand).toHaveLength(3)
  })

  it('the round winner scores the value of opponents\' remaining cards', () => {
    const c = card('red', 3)
    const state = makeState({
      hands: [
        [c],
        [card('green', 9), card('green', 'skip')], // 9 + 20
        [card(null, 'wild'), card('blue', 4)], // 50 + 4
      ],
      top: card('red', 5),
    })
    const next = gameReducer(state, { type: 'PLAY_CARD', playerId: 0, cardId: c.id })
    expect(next.scores).toEqual([83, 0, 0])
  })

  it('scores carry over to the next round via config', () => {
    const state = initGame({
      seats: [
        { name: 'A', isHuman: true },
        { name: 'B', isHuman: true },
      ],
      rules: DEFAULT_RULES,
      scores: [120, 45],
      seed: 9,
    })
    expect(state.scores).toEqual([120, 45])
  })
})
