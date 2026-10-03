import test from 'node:test';
import assert from 'node:assert/strict';
import {
  describeEvent,
  getCardPlayReason,
  getDealerPrompt,
  getTablePresence,
  getSetupSummary,
  getTurnCommand,
  summarizeOpponents
} from '../src/ui-model.js';

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
  discardPile: [card({ id: 'top', color: 'red', kind: 'number', value: 7 })],
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
  drawnCardId: null,
  message: '',
  log: [],
  ...overrides
});

test('turn command tells the human exactly what can be matched', () => {
  const state = makeState({
    players: [
      {
        id: 0,
        name: 'You',
        isAI: false,
        hand: [
          card({ id: 'red-2', color: 'red', kind: 'number', value: 2 }),
          card({ id: 'blue-7', color: 'blue', kind: 'number', value: 7 }),
          card({ id: 'wild', kind: 'wild', action: 'wild' })
        ]
      },
      { id: 1, name: 'AI 1', isAI: true, hand: [] }
    ]
  });

  assert.deepEqual(getTurnCommand(state, 0), {
    tone: 'human',
    title: 'Your turn',
    body: 'Play red, 7, Wild, or draw 1.',
    detail: '3 legal cards in hand.'
  });
});

test('dealer prompt compresses the next action into table copy', () => {
  const state = makeState({
    players: [
      {
        id: 0,
        name: 'You',
        isAI: false,
        hand: [
          card({ id: 'red-2', color: 'red', kind: 'number', value: 2 }),
          card({ id: 'blue-7', color: 'blue', kind: 'number', value: 7 }),
          card({ id: 'wild', kind: 'wild', action: 'wild' })
        ]
      },
      { id: 1, name: 'AI 1', isAI: true, hand: [] }
    ]
  });

  assert.deepEqual(getDealerPrompt(state, 0), {
    title: 'Your move',
    call: 'Match red, 7, Wild, or draw.',
    tone: 'human'
  });
});

test('turn command foregrounds drawn-card decisions', () => {
  const drawn = card({ id: 'drawn', color: 'red', kind: 'action', action: 'skip' });
  const state = makeState({
    status: 'drawn-choice',
    drawnCardId: drawn.id,
    players: [
      { id: 0, name: 'You', isAI: false, hand: [drawn] },
      { id: 1, name: 'AI 1', isAI: true, hand: [] }
    ]
  });

  assert.deepEqual(getTurnCommand(state, 0), {
    tone: 'decision',
    title: 'Drawn card decision',
    body: 'Play Red Skip now or keep it.',
    detail: 'Classic rules allow only the drawn card right now.'
  });
});

test('dealer prompt sounds like a dealer during AI and drawn-card turns', () => {
  const drawn = card({ id: 'drawn', color: 'red', kind: 'action', action: 'skip' });
  const drawnState = makeState({
    status: 'drawn-choice',
    drawnCardId: drawn.id,
    players: [
      { id: 0, name: 'You', isAI: false, hand: [drawn] },
      { id: 1, name: 'AI 1', isAI: true, hand: [] }
    ]
  });
  assert.deepEqual(getDealerPrompt(drawnState, 0), {
    title: 'Drawn card',
    call: 'Red Skip can hit the pile, or tuck it away.',
    tone: 'decision'
  });

  const aiState = makeState({ currentPlayer: 1 });
  assert.deepEqual(getDealerPrompt(aiState, 0), {
    title: 'AI 1 lines up a play',
    call: 'Table is moving around to AI 1.',
    tone: 'ai'
  });
});

test('turn command distinguishes AI turns and round-over summaries', () => {
  const aiState = makeState({ currentPlayer: 1 });
  assert.equal(getTurnCommand(aiState, 0).title, 'AI 1 thinking');
  assert.equal(getTurnCommand(aiState, 0).tone, 'ai');

  const roundOver = makeState({
    status: 'round-over',
    roundWinner: 2,
    scores: [35, 80, 160]
  });

  assert.deepEqual(getTurnCommand(roundOver, 0), {
    tone: 'round-over',
    title: 'AI 2 wins the round',
    body: 'AI 2 is 340 points from 500.',
    detail: 'Start the next round when ready.'
  });
});

test('card play reasons explain matches and blocked wild draw fours', () => {
  const state = makeState({
    discardPile: [card({ id: 'top', color: 'red', kind: 'action', action: 'reverse' })],
    currentColor: 'red'
  });
  const hand = [
    card({ id: 'red-3', color: 'red', kind: 'number', value: 3 }),
    card({ id: 'blue-rev', color: 'blue', kind: 'action', action: 'reverse' }),
    card({ id: 'wild', kind: 'wild', action: 'wild' }),
    card({ id: 'plus4', kind: 'wild', action: 'wildDraw4' })
  ];

  assert.equal(getCardPlayReason(hand[0], state, hand).label, 'Color');
  assert.equal(getCardPlayReason(hand[1], state, hand).label, 'Symbol');
  assert.equal(getCardPlayReason(hand[2], state, hand).label, 'Wild');
  assert.deepEqual(getCardPlayReason(hand[3], state, hand), {
    label: '+4 blocked',
    playable: false,
    description: 'You still have red.'
  });
});

test('event descriptions turn log entries into table choreography cues', () => {
  assert.deepEqual(describeEvent('AI 2 draws four and loses the turn.'), {
    tone: 'penalty',
    label: '+4 hit',
    text: 'AI 2 draws four and loses the turn.'
  });
  assert.deepEqual(describeEvent('Direction reverses.'), {
    tone: 'reverse',
    label: 'Reverse',
    text: 'Direction reverses.'
  });
  assert.deepEqual(describeEvent('You call UNO.'), {
    tone: 'uno',
    label: 'UNO',
    text: 'You call UNO.'
  });
});

test('setup summary treats opponent count as a new-table action', () => {
  const state = makeState({
    round: 3,
    scores: [40, 125, 80],
    players: [
      { id: 0, name: 'You', isAI: false, hand: [] },
      { id: 1, name: 'AI 1', isAI: true, hand: [] },
      { id: 2, name: 'AI 2', isAI: true, hand: [] }
    ]
  });

  assert.deepEqual(getSetupSummary(state), {
    aiCount: 2,
    label: '2 AI table',
    resetWarning: 'New table resets round 3 and current scores.'
  });
});

test('table presence gives the visual layer stronger state cues', () => {
  assert.deepEqual(getTablePresence(makeState({
    log: ['AI 2 draws four and loses the turn.']
  }), 0), {
    heat: 'penalty',
    aura: 'red',
    headline: 'Penalty lands'
  });

  assert.deepEqual(getTablePresence(makeState({
    log: ['You call UNO.']
  }), 0), {
    heat: 'uno',
    aura: 'yellow',
    headline: 'UNO pressure'
  });

  assert.deepEqual(getTablePresence(makeState({
    currentPlayer: 1,
    log: ['AI 1 plays Blue 4.']
  }), 0), {
    heat: 'ai',
    aura: 'red',
    headline: 'AI in motion'
  });
});

test('opponent summary creates stable table-seat metadata', () => {
  const state = makeState({
    currentPlayer: 2,
    scores: [10, 20, 30],
    players: [
      { id: 0, name: 'You', isAI: false, hand: [] },
      { id: 1, name: 'AI 1', isAI: true, hand: [card({ color: 'red', kind: 'number', value: 1 })] },
      { id: 2, name: 'AI 2', isAI: true, hand: [card({ color: 'blue', kind: 'number', value: 1 }), card({ color: 'blue', kind: 'number', value: 2 })] }
    ]
  });

  assert.deepEqual(summarizeOpponents(state), [
    {
      cardCount: 1,
      id: 1,
      index: 1,
      isCurrent: false,
      isWinner: false,
      name: 'AI 1',
      score: 20,
      seatClass: 'seat-left',
      uno: true
    },
    {
      cardCount: 2,
      id: 2,
      index: 2,
      isCurrent: true,
      isWinner: false,
      name: 'AI 2',
      score: 30,
      seatClass: 'seat-right',
      uno: false
    }
  ]);
});
