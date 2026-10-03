import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COLORS,
  canPlayCard,
  createClassicDeck,
  playCard,
  scoreCard,
  scoreHand
} from '../src/engine.js';

const card = (overrides) => ({
  id: overrides.id ?? `${overrides.color ?? 'wild'}-${overrides.kind}-${overrides.value ?? overrides.action}`,
  color: overrides.color ?? null,
  kind: overrides.kind,
  value: overrides.value ?? null,
  action: overrides.action ?? null,
  ...overrides
});

const makeState = (overrides = {}) => ({
  players: [
    { id: 0, name: 'You', isAI: false, hand: [] },
    { id: 1, name: 'AI 1', isAI: true, hand: [] },
    { id: 2, name: 'AI 2', isAI: true, hand: [] }
  ],
  drawPile: [],
  discardPile: [card({ id: 'top', color: 'red', kind: 'number', value: 5 })],
  currentColor: 'red',
  currentPlayer: 0,
  direction: 1,
  scores: [0, 0, 0],
  round: 1,
  targetScore: 500,
  status: 'playing',
  roundWinner: null,
  gameWinner: null,
  pendingColorChoice: null,
  message: '',
  log: [],
  rngSeed: 1,
  ...overrides
});

test('classic deck has exactly the original 108-card composition', () => {
  const deck = createClassicDeck();

  assert.equal(deck.length, 108);

  for (const color of COLORS) {
    const colorCards = deck.filter((candidate) => candidate.color === color);
    assert.equal(colorCards.length, 25);
    assert.equal(colorCards.filter((candidate) => candidate.kind === 'number' && candidate.value === 0).length, 1);

    for (let value = 1; value <= 9; value += 1) {
      assert.equal(colorCards.filter((candidate) => candidate.kind === 'number' && candidate.value === value).length, 2);
    }

    for (const action of ['skip', 'reverse', 'draw2']) {
      assert.equal(colorCards.filter((candidate) => candidate.kind === 'action' && candidate.action === action).length, 2);
    }
  }

  assert.equal(deck.filter((candidate) => candidate.kind === 'wild' && candidate.action === 'wild').length, 4);
  assert.equal(deck.filter((candidate) => candidate.kind === 'wild' && candidate.action === 'wildDraw4').length, 4);
  assert.equal(deck.filter((candidate) => candidate.action === 'swapHands' || candidate.action === 'shuffleHands').length, 0);
});

test('legal play matching follows color, number, symbol, wild, and wild draw four restrictions', () => {
  const state = makeState({
    discardPile: [card({ id: 'top', color: 'red', kind: 'number', value: 8 })],
    currentColor: 'red'
  });
  const blueEight = card({ id: 'blue-8', color: 'blue', kind: 'number', value: 8 });
  const redThree = card({ id: 'red-3', color: 'red', kind: 'number', value: 3 });
  const greenSkip = card({ id: 'green-skip', color: 'green', kind: 'action', action: 'skip' });
  const wild = card({ id: 'wild', kind: 'wild', action: 'wild' });
  const wildDrawFour = card({ id: 'wild-draw-four', kind: 'wild', action: 'wildDraw4' });

  assert.equal(canPlayCard(blueEight, state, [blueEight]), true);
  assert.equal(canPlayCard(redThree, state, [redThree]), true);
  assert.equal(canPlayCard(greenSkip, state, [greenSkip]), false);
  assert.equal(canPlayCard(wild, state, [redThree, wild]), true);
  assert.equal(canPlayCard(wildDrawFour, state, [redThree, wildDrawFour]), false);
  assert.equal(canPlayCard(wildDrawFour, state, [blueEight, wildDrawFour]), true);
});

test('draw two makes the next player draw two cards and forfeit their turn', () => {
  const drawTwo = card({ id: 'red-draw2', color: 'red', kind: 'action', action: 'draw2' });
  const spare = card({ id: 'blue-3', color: 'blue', kind: 'number', value: 3 });
  const state = makeState({
    players: [
      { id: 0, name: 'You', isAI: false, hand: [drawTwo, spare] },
      { id: 1, name: 'AI 1', isAI: true, hand: [] },
      { id: 2, name: 'AI 2', isAI: true, hand: [] }
    ],
    drawPile: [
      card({ id: 'draw-a', color: 'yellow', kind: 'number', value: 1 }),
      card({ id: 'draw-b', color: 'green', kind: 'number', value: 2 })
    ]
  });

  const next = playCard(state, { playerIndex: 0, cardId: drawTwo.id, calledUno: true });

  assert.deepEqual(next.players[1].hand.map((candidate) => candidate.id), ['draw-a', 'draw-b']);
  assert.equal(next.currentPlayer, 2);
  assert.equal(next.players[0].hand.length, 1);
});

test('reverse acts like skip in a two-player round', () => {
  const reverse = card({ id: 'red-reverse', color: 'red', kind: 'action', action: 'reverse' });
  const spare = card({ id: 'green-9', color: 'green', kind: 'number', value: 9 });
  const state = makeState({
    players: [
      { id: 0, name: 'You', isAI: false, hand: [reverse, spare] },
      { id: 1, name: 'AI 1', isAI: true, hand: [] }
    ],
    scores: [0, 0]
  });

  const next = playCard(state, { playerIndex: 0, cardId: reverse.id, calledUno: true });

  assert.equal(next.currentPlayer, 0);
  assert.equal(next.players[0].hand.length, 1);
});

test('forgetting to call UNO after playing down to one card draws two penalty cards', () => {
  const redSeven = card({ id: 'red-7', color: 'red', kind: 'number', value: 7 });
  const blueNine = card({ id: 'blue-9', color: 'blue', kind: 'number', value: 9 });
  const state = makeState({
    players: [
      { id: 0, name: 'You', isAI: false, hand: [redSeven, blueNine] },
      { id: 1, name: 'AI 1', isAI: true, hand: [] },
      { id: 2, name: 'AI 2', isAI: true, hand: [] }
    ],
    drawPile: [
      card({ id: 'penalty-a', color: 'yellow', kind: 'number', value: 1 }),
      card({ id: 'penalty-b', color: 'green', kind: 'number', value: 2 })
    ]
  });

  const next = playCard(state, { playerIndex: 0, cardId: redSeven.id, calledUno: false });

  assert.equal(next.players[0].hand.length, 3);
  assert.equal(next.players[0].hand.some((candidate) => candidate.id === 'penalty-a'), true);
  assert.equal(next.players[0].hand.some((candidate) => candidate.id === 'penalty-b'), true);
  assert.equal(next.roundWinner, null);
});

test('human-facing action logs use correct second-person grammar', () => {
  const yellowSkip = card({ id: 'yellow-skip', color: 'yellow', kind: 'action', action: 'skip' });
  const state = makeState({
    discardPile: [card({ id: 'top', color: 'yellow', kind: 'number', value: 4 })],
    currentColor: 'yellow',
    players: [
      { id: 0, name: 'AI 1', isAI: true, hand: [yellowSkip] },
      { id: 1, name: 'You', isAI: false, hand: [] },
      { id: 2, name: 'AI 2', isAI: true, hand: [] }
    ]
  });

  const next = playCard(state, { playerIndex: 0, cardId: yellowSkip.id, calledUno: false });

  assert.equal(next.log.some((entry) => entry.includes('You is skipped')), false);
  assert.equal(next.log.includes('You are skipped.'), true);
});

test('card scoring uses classic values', () => {
  assert.equal(scoreCard(card({ color: 'yellow', kind: 'number', value: 9 })), 9);
  assert.equal(scoreCard(card({ color: 'blue', kind: 'action', action: 'skip' })), 20);
  assert.equal(scoreCard(card({ kind: 'wild', action: 'wild' })), 50);
  assert.equal(scoreCard(card({ kind: 'wild', action: 'wildDraw4' })), 50);

  assert.equal(scoreHand([
    card({ color: 'yellow', kind: 'number', value: 9 }),
    card({ color: 'blue', kind: 'action', action: 'reverse' }),
    card({ kind: 'wild', action: 'wild' }),
    card({ kind: 'wild', action: 'wildDraw4' })
  ]), 129);
});
