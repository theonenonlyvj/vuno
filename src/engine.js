export const COLORS = ['red', 'yellow', 'green', 'blue'];
export const TARGET_SCORE = 500;

const ACTION_LABELS = {
  skip: 'Skip',
  reverse: 'Reverse',
  draw2: 'Draw Two',
  wild: 'Wild',
  wildDraw4: 'Wild Draw Four'
};

const MAX_LOG_ENTRIES = 80;

export function createClassicDeck() {
  const deck = [];
  let nextId = 1;

  for (const color of COLORS) {
    deck.push(makeCard(nextId, { color, kind: 'number', value: 0 }));
    nextId += 1;

    for (let value = 1; value <= 9; value += 1) {
      for (let copy = 0; copy < 2; copy += 1) {
        deck.push(makeCard(nextId, { color, kind: 'number', value }));
        nextId += 1;
      }
    }

    for (const action of ['skip', 'reverse', 'draw2']) {
      for (let copy = 0; copy < 2; copy += 1) {
        deck.push(makeCard(nextId, { color, kind: 'action', action }));
        nextId += 1;
      }
    }
  }

  for (let copy = 0; copy < 4; copy += 1) {
    deck.push(makeCard(nextId, { color: null, kind: 'wild', action: 'wild' }));
    nextId += 1;
  }

  for (let copy = 0; copy < 4; copy += 1) {
    deck.push(makeCard(nextId, { color: null, kind: 'wild', action: 'wildDraw4' }));
    nextId += 1;
  }

  return deck;
}

function makeCard(id, card) {
  return {
    id: `c${id}`,
    color: card.color ?? null,
    kind: card.kind,
    value: card.value ?? null,
    action: card.action ?? null
  };
}

export function startGame(options = {}) {
  const aiCount = clampInt(options.aiCount ?? 3, 1, 4);
  const players = [
    { id: 0, name: 'You', isAI: false, hand: [] },
    ...Array.from({ length: aiCount }, (_, index) => ({
      id: index + 1,
      name: `AI ${index + 1}`,
      isAI: true,
      hand: []
    }))
  ];

  return startRound({
    players,
    scores: Array(players.length).fill(0),
    round: 1,
    targetScore: options.targetScore ?? TARGET_SCORE,
    rngSeed: options.rngSeed ?? Date.now()
  });
}

export function startNextRound(state) {
  const players = state.players.map((player) => ({
    id: player.id,
    name: player.name,
    isAI: player.isAI,
    hand: []
  }));

  return startRound({
    players,
    scores: [...state.scores],
    round: state.round + 1,
    targetScore: state.targetScore,
    rngSeed: state.rngSeed + 97 * state.round
  });
}

function startRound({ players, scores, round, targetScore, rngSeed }) {
  const rng = createSeededRng(rngSeed);
  const drawPile = shuffleDeck(createClassicDeck(), rng);
  const nextPlayers = players.map((player) => ({ ...player, hand: [] }));

  for (let cardNumber = 0; cardNumber < 7; cardNumber += 1) {
    for (const player of nextPlayers) {
      player.hand.push(drawPile.shift());
    }
  }

  const dealerIndex = (round - 1 + nextPlayers.length - 1) % nextPlayers.length;
  const firstPlayer = (dealerIndex + 1) % nextPlayers.length;
  const state = {
    players: nextPlayers,
    drawPile,
    discardPile: [],
    currentColor: null,
    currentPlayer: firstPlayer,
    direction: 1,
    dealerIndex,
    scores,
    round,
    targetScore,
    status: 'playing',
    roundWinner: null,
    gameWinner: null,
    pendingColorChoice: null,
    drawnCardId: null,
    message: '',
    log: [],
    rngSeed,
    shuffleCounter: 0
  };

  flipInitialDiscard(state);
  addLog(state, `Round ${round} begins. ${state.players[dealerIndex].name} deals.`);

  return state;
}

function flipInitialDiscard(state) {
  let firstCard = state.drawPile.shift();

  while (firstCard?.action === 'wildDraw4') {
    state.drawPile.push(firstCard);
    state.shuffleCounter += 1;
    state.drawPile = shuffleDeck(state.drawPile, createSeededRng(state.rngSeed + state.shuffleCounter));
    firstCard = state.drawPile.shift();
  }

  state.discardPile.push(firstCard);
  state.currentColor = firstCard.color;

  const firstPlayer = (state.dealerIndex + 1) % state.players.length;

  if (firstCard.kind === 'number') {
    state.currentPlayer = firstPlayer;
    state.message = `${actionPhrase(state.players[firstPlayer], 'start', 'starts')} on ${cardName(firstCard)}.`;
    addLog(state, state.message);
    return;
  }

  if (firstCard.action === 'wild') {
    state.currentPlayer = firstPlayer;
    state.status = 'choosing-color';
    state.pendingColorChoice = { playerIndex: firstPlayer, source: 'initial' };
    state.message = `${actionPhrase(state.players[firstPlayer], 'choose', 'chooses')} the opening color.`;
    addLog(state, `Opening card is ${cardName(firstCard)}.`);
    return;
  }

  if (firstCard.action === 'skip') {
    state.currentPlayer = nextPlayerIndex(state, firstPlayer);
    state.message = `${actionPhrase(state.players[firstPlayer], 'are skipped', 'is skipped')} by the opening card.`;
    addLog(state, state.message);
    return;
  }

  if (firstCard.action === 'draw2') {
    drawCards(state, firstPlayer, 2);
    state.currentPlayer = nextPlayerIndex(state, firstPlayer);
    state.message = `${actionPhrase(state.players[firstPlayer], 'draw', 'draws')} two from the opening card.`;
    addLog(state, state.message);
    return;
  }

  if (firstCard.action === 'reverse') {
    state.direction = -1;
    state.currentPlayer = state.dealerIndex;
    state.message = `Opening Reverse sends play to ${state.players[state.dealerIndex].name}.`;
    addLog(state, state.message);
  }
}

export function canPlayCard(card, state, hand = []) {
  if (!card || state.status === 'round-over' || state.status === 'game-over') {
    return false;
  }

  if (card.action === 'wild') {
    return true;
  }

  if (card.action === 'wildDraw4') {
    return !hand.some((candidate) => candidate.id !== card.id && candidate.color === state.currentColor);
  }

  if (card.color === state.currentColor) {
    return true;
  }

  const topCard = topDiscard(state);
  if (!topCard) {
    return false;
  }

  if (card.kind === 'number' && topCard.kind === 'number') {
    return card.value === topCard.value;
  }

  if (card.kind === 'action' && topCard.kind === 'action') {
    return card.action === topCard.action;
  }

  return false;
}

export function getPlayableCards(state, playerIndex) {
  const hand = state.players[playerIndex]?.hand ?? [];
  return hand.filter((card) => canPlayCard(card, state, hand));
}

export function playCard(state, action) {
  const next = cloneState(state);
  const player = next.players[action.playerIndex];

  assertPlayingTurn(next, action.playerIndex);

  if (next.status === 'drawn-choice' && action.cardId !== next.drawnCardId) {
    throw new Error('Only the drawn card can be played after drawing.');
  }

  const cardIndex = player.hand.findIndex((candidate) => candidate.id === action.cardId);
  if (cardIndex === -1) {
    throw new Error('Card is not in hand.');
  }

  const playedCard = player.hand[cardIndex];
  if (!canPlayCard(playedCard, next, player.hand)) {
    throw new Error(`${cardName(playedCard)} is not legal here.`);
  }

  const chosenColor = normalizeColor(action.chosenColor);
  if (playedCard.kind === 'wild' && !chosenColor) {
    throw new Error('Wild cards require a color choice.');
  }

  player.hand.splice(cardIndex, 1);
  next.discardPile.push(playedCard);
  next.currentColor = playedCard.kind === 'wild' ? chosenColor : playedCard.color;
  next.drawnCardId = null;
  next.pendingColorChoice = null;
  next.status = 'playing';

  addLog(next, `${actionPhrase(player, 'play', 'plays')} ${cardName(playedCard)}${playedCard.kind === 'wild' ? ` as ${chosenColor}` : ''}.`);

  const followingPlayer = applyCardEffect(next, action.playerIndex, playedCard);

  if (player.hand.length === 0) {
    finishRound(next, action.playerIndex);
    return next;
  }

  if (player.hand.length === 1 && !action.calledUno) {
    drawCards(next, action.playerIndex, 2);
    addLog(next, `${player.name} forgot UNO and draws two.`);
  } else if (player.hand.length === 1 && action.calledUno) {
    addLog(next, `${actionPhrase(player, 'call', 'calls')} UNO.`);
  }

  next.currentPlayer = followingPlayer;
  next.message = `${next.players[next.currentPlayer].name}'s turn.`;
  return next;
}

function applyCardEffect(state, playerIndex, playedCard) {
  if (playedCard.action === 'skip') {
    const skipped = nextPlayerIndex(state, playerIndex);
    addLog(state, `${actionPhrase(state.players[skipped], 'are skipped', 'is skipped')}.`);
    return nextPlayerIndex(state, skipped);
  }

  if (playedCard.action === 'reverse') {
    if (state.players.length === 2) {
      const skipped = nextPlayerIndex(state, playerIndex);
      addLog(state, `${actionPhrase(state.players[skipped], 'are skipped', 'is skipped')} by Reverse.`);
      return playerIndex;
    }

    state.direction *= -1;
    addLog(state, 'Direction reverses.');
    return nextPlayerIndex(state, playerIndex);
  }

  if (playedCard.action === 'draw2') {
    const target = nextPlayerIndex(state, playerIndex);
    drawCards(state, target, 2);
    addLog(state, `${actionPhrase(state.players[target], 'draw two and lose', 'draws two and loses')} the turn.`);
    return nextPlayerIndex(state, target);
  }

  if (playedCard.action === 'wildDraw4') {
    const target = nextPlayerIndex(state, playerIndex);
    drawCards(state, target, 4);
    addLog(state, `${actionPhrase(state.players[target], 'draw four and lose', 'draws four and loses')} the turn.`);
    return nextPlayerIndex(state, target);
  }

  return nextPlayerIndex(state, playerIndex);
}

export function drawOneForTurn(state, playerIndex) {
  const next = cloneState(state);
  assertPlayingTurn(next, playerIndex);

  const drawn = drawCards(next, playerIndex, 1)[0];
  if (!drawn) {
    next.message = 'No card was available to draw.';
    next.currentPlayer = nextPlayerIndex(next, playerIndex);
    return next;
  }

  addLog(next, `${actionPhrase(next.players[playerIndex], 'draw', 'draws')} one card.`);

  if (canPlayCard(drawn, next, next.players[playerIndex].hand)) {
    next.status = 'drawn-choice';
    next.drawnCardId = drawn.id;
    next.message = `${next.players[playerIndex].name} may play the drawn card or keep it.`;
    return next;
  }

  next.currentPlayer = nextPlayerIndex(next, playerIndex);
  next.message = `${actionPhrase(next.players[playerIndex], 'keep', 'keeps')} the drawn card.`;
  return next;
}

export function keepDrawnCard(state, playerIndex) {
  const next = cloneState(state);

  if (next.status !== 'drawn-choice' || next.currentPlayer !== playerIndex) {
    throw new Error('There is no drawn card choice for this player.');
  }

  addLog(next, `${actionPhrase(next.players[playerIndex], 'keep', 'keeps')} the drawn card.`);
  next.status = 'playing';
  next.drawnCardId = null;
  next.currentPlayer = nextPlayerIndex(next, playerIndex);
  next.message = `${next.players[next.currentPlayer].name}'s turn.`;
  return next;
}

export function chooseColor(state, playerIndex, color) {
  const chosenColor = normalizeColor(color);
  if (!chosenColor) {
    throw new Error('Choose a valid color.');
  }

  const next = cloneState(state);
  if (next.status !== 'choosing-color' || next.pendingColorChoice?.playerIndex !== playerIndex) {
    throw new Error('No color choice is pending for this player.');
  }

  next.currentColor = chosenColor;
  next.status = 'playing';
  next.pendingColorChoice = null;
  next.message = `${actionPhrase(next.players[playerIndex], 'choose', 'chooses')} ${chosenColor}.`;
  addLog(next, next.message);
  return next;
}

export function chooseBestColor(hand) {
  const counts = Object.fromEntries(COLORS.map((color) => [color, 0]));
  for (const card of hand) {
    if (card.color) {
      counts[card.color] += 1;
    }
  }

  return COLORS.reduce((best, color) => (counts[color] > counts[best] ? color : best), COLORS[0]);
}

export function selectDumbAIPlay(state, playerIndex) {
  const hand = state.players[playerIndex]?.hand ?? [];
  const playable = getPlayableCards(state, playerIndex);
  if (playable.length === 0) {
    return null;
  }

  const nonWildDrawFour = playable.find((card) => card.action !== 'wildDraw4');
  const card = nonWildDrawFour ?? playable[0];
  const remainingHand = hand.filter((candidate) => candidate.id !== card.id);
  return {
    playerIndex,
    cardId: card.id,
    calledUno: hand.length === 2,
    chosenColor: card.kind === 'wild' ? chooseBestColor(remainingHand) : null
  };
}

export function scoreCard(card) {
  if (card.kind === 'number') {
    return card.value;
  }

  if (card.kind === 'action') {
    return 20;
  }

  return 50;
}

export function scoreHand(hand) {
  return hand.reduce((total, card) => total + scoreCard(card), 0);
}

export function topDiscard(state) {
  return state.discardPile[state.discardPile.length - 1] ?? null;
}

export function cardName(card) {
  if (!card) {
    return 'No card';
  }

  if (card.kind === 'number') {
    return `${capitalize(card.color)} ${card.value}`;
  }

  if (card.kind === 'action') {
    return `${capitalize(card.color)} ${ACTION_LABELS[card.action]}`;
  }

  return ACTION_LABELS[card.action];
}

export function colorName(color) {
  return capitalize(color);
}

export function isHumanTurn(state) {
  return state.currentPlayer === 0 && ['playing', 'drawn-choice', 'choosing-color'].includes(state.status);
}

function finishRound(state, winnerIndex) {
  const roundScore = state.players.reduce((total, player, index) => {
    if (index === winnerIndex) {
      return total;
    }
    return total + scoreHand(player.hand);
  }, 0);

  state.scores[winnerIndex] += roundScore;
  state.roundWinner = winnerIndex;
  state.status = state.scores[winnerIndex] >= state.targetScore ? 'game-over' : 'round-over';
  state.gameWinner = state.status === 'game-over' ? winnerIndex : null;
  state.message = `${state.players[winnerIndex].name} wins the round for ${roundScore} points.`;
  addLog(state, state.message);

  if (state.gameWinner !== null) {
    addLog(state, `${state.players[winnerIndex].name} wins the game.`);
  }
}

function drawCards(state, playerIndex, count) {
  const drawn = [];

  for (let index = 0; index < count; index += 1) {
    ensureDrawPile(state);
    const card = state.drawPile.shift();
    if (!card) {
      break;
    }
    state.players[playerIndex].hand.push(card);
    drawn.push(card);
  }

  return drawn;
}

function ensureDrawPile(state) {
  if (state.drawPile.length > 0 || state.discardPile.length <= 1) {
    return;
  }

  const top = state.discardPile.pop();
  const recycled = state.discardPile;
  state.shuffleCounter += 1;
  state.drawPile = shuffleDeck(recycled, createSeededRng(state.rngSeed + state.shuffleCounter * 31));
  state.discardPile = [top];
  addLog(state, 'Discard pile is shuffled into a new draw pile.');
}

function nextPlayerIndex(state, fromIndex, steps = 1) {
  const playerCount = state.players.length;
  let next = fromIndex;

  for (let step = 0; step < steps; step += 1) {
    next = (next + state.direction + playerCount) % playerCount;
  }

  return next;
}

function assertPlayingTurn(state, playerIndex) {
  if (!['playing', 'drawn-choice'].includes(state.status)) {
    throw new Error('The round is not waiting for a card play.');
  }

  if (state.currentPlayer !== playerIndex) {
    throw new Error('It is not this player\'s turn.');
  }
}

function normalizeColor(color) {
  return COLORS.includes(color) ? color : null;
}

function cloneState(state) {
  return {
    ...state,
    players: state.players.map((player) => ({
      ...player,
      hand: player.hand.map((card) => ({ ...card }))
    })),
    drawPile: state.drawPile.map((card) => ({ ...card })),
    discardPile: state.discardPile.map((card) => ({ ...card })),
    scores: [...state.scores],
    pendingColorChoice: state.pendingColorChoice ? { ...state.pendingColorChoice } : null,
    log: [...state.log]
  };
}

function addLog(state, entry) {
  state.log = [entry, ...state.log].slice(0, MAX_LOG_ENTRIES);
}

function actionPhrase(player, youVerb, otherVerb) {
  return `${player.name} ${player.name === 'You' ? youVerb : otherVerb}`;
}

export function shuffleDeck(deck, rng = Math.random) {
  const shuffled = deck.map((card) => ({ ...card }));

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

function createSeededRng(seed) {
  let value = Math.trunc(seed) || 1;
  return () => {
    value += 0x6d2b79f5;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function clampInt(value, min, max) {
  const number = Number.parseInt(value, 10);
  if (Number.isNaN(number)) {
    return min;
  }
  return Math.min(max, Math.max(min, number));
}

function capitalize(value) {
  if (!value) {
    return '';
  }
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
