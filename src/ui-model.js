import {
  canPlayCard,
  cardName,
  getPlayableCards,
  topDiscard
} from './engine.js';

const SEAT_CLASS_MAP = {
  1: ['seat-top'],
  2: ['seat-left', 'seat-right'],
  3: ['seat-left', 'seat-top', 'seat-right'],
  4: ['seat-left', 'seat-top-left', 'seat-top-right', 'seat-right']
};

export function getTurnCommand(state, humanIndex = 0) {
  const current = state.players[state.currentPlayer];
  const human = state.players[humanIndex];

  if (state.status === 'game-over') {
    const winner = state.players[state.gameWinner];
    return {
      tone: 'game-over',
      title: `${winner?.name ?? 'Someone'} wins VUno`,
      body: `${winner?.name ?? 'Winner'} reached ${state.targetScore} points.`,
      detail: 'Start a new table when ready.'
    };
  }

  if (state.status === 'round-over') {
    const winner = state.players[state.roundWinner];
    const score = state.scores[state.roundWinner] ?? 0;
    return {
      tone: 'round-over',
      title: `${winner?.name ?? 'Someone'} wins the round`,
      body: `${winner?.name ?? 'Winner'} is ${Math.max(0, state.targetScore - score)} points from ${state.targetScore}.`,
      detail: 'Start the next round when ready.'
    };
  }

  if (state.status === 'choosing-color') {
    return {
      tone: current?.isAI ? 'ai' : 'decision',
      title: `${current?.name ?? 'Player'} chooses color`,
      body: current?.isAI ? 'The table is waiting on an AI color call.' : 'Pick the color the table must match next.',
      detail: 'Wild cards end your turn after the color is chosen.'
    };
  }

  if (state.status === 'drawn-choice') {
    const drawnCard = current?.hand.find((card) => card.id === state.drawnCardId);
    return {
      tone: current?.isAI ? 'ai' : 'decision',
      title: current?.isAI ? `${current.name} decides` : 'Drawn card decision',
      body: current?.isAI
        ? `${current.name} can play the drawn card or keep it.`
        : `Play ${cardName(drawnCard)} now or keep it.`,
      detail: 'Classic rules allow only the drawn card right now.'
    };
  }

  if (state.currentPlayer !== humanIndex) {
    return {
      tone: 'ai',
      title: `${current?.name ?? 'AI'} thinking`,
      body: `${current?.name ?? 'AI'} is choosing a legal play.`,
      detail: `Current color is ${state.currentColor}.`
    };
  }

  const playable = getPlayableCards(state, humanIndex);
  if (playable.length === 0) {
    return {
      tone: 'human',
      title: 'Your turn',
      body: `No legal card. Draw 1 from the deck.`,
      detail: `${human?.hand.length ?? 0} cards in hand.`
    };
  }

  return {
    tone: 'human',
    title: 'Your turn',
    body: `Play ${humanPlaySummary(playable, state)}, or draw 1.`,
    detail: `${playable.length} legal ${playable.length === 1 ? 'card' : 'cards'} in hand.`
  };
}

export function getDealerPrompt(state, humanIndex = 0) {
  const current = state.players[state.currentPlayer];

  if (state.status === 'game-over') {
    const winner = state.players[state.gameWinner];
    return {
      title: 'Table closed',
      call: `${winner?.name ?? 'Winner'} takes the game.`,
      tone: 'game-over'
    };
  }

  if (state.status === 'round-over') {
    const winner = state.players[state.roundWinner];
    return {
      title: 'Round counted',
      call: `${winner?.name ?? 'Winner'} sweeps the points.`,
      tone: 'round-over'
    };
  }

  if (state.status === 'choosing-color') {
    return {
      title: current?.isAI ? `${current.name} calls color` : 'Call the color',
      call: current?.isAI ? 'Wild is waiting on a color.' : 'Choose the color the table must follow.',
      tone: current?.isAI ? 'ai' : 'decision'
    };
  }

  if (state.status === 'drawn-choice') {
    const drawnCard = current?.hand.find((card) => card.id === state.drawnCardId);
    return {
      title: current?.isAI ? `${current.name} checks the draw` : 'Drawn card',
      call: current?.isAI
        ? 'Drawn card can play or tuck away.'
        : `${cardName(drawnCard)} can hit the pile, or tuck it away.`,
      tone: current?.isAI ? 'ai' : 'decision'
    };
  }

  if (state.currentPlayer !== humanIndex) {
    return {
      title: `${current?.name ?? 'AI'} lines up a play`,
      call: `Table is moving around to ${current?.name ?? 'AI'}.`,
      tone: 'ai'
    };
  }

  const playable = getPlayableCards(state, humanIndex);
  if (playable.length === 0) {
    return {
      title: 'Your move',
      call: 'No match in hand. Draw.',
      tone: 'human'
    };
  }

  return {
    title: 'Your move',
    call: `Match ${humanPlaySummary(playable, state)}, or draw.`,
    tone: 'human'
  };
}

export function getCardPlayReason(card, state, hand = []) {
  if (!canPlayCard(card, state, hand)) {
    if (card?.action === 'wildDraw4' && hand.some((candidate) => candidate.id !== card.id && candidate.color === state.currentColor)) {
      return {
        label: '+4 blocked',
        playable: false,
        description: `You still have ${state.currentColor}.`
      };
    }

    return {
      label: 'Locked',
      playable: false,
      description: 'Does not match the current table.'
    };
  }

  if (card.action === 'wildDraw4') {
    return {
      label: '+4',
      playable: true,
      description: 'No matching color in hand.'
    };
  }

  if (card.action === 'wild') {
    return {
      label: 'Wild',
      playable: true,
      description: 'Choose the next color.'
    };
  }

  if (card.color === state.currentColor) {
    return {
      label: 'Color',
      playable: true,
      description: `Matches ${state.currentColor}.`
    };
  }

  const topCard = topDiscard(state);
  if (card.kind === 'number' && topCard?.kind === 'number' && card.value === topCard.value) {
    return {
      label: 'Number',
      playable: true,
      description: `Matches ${card.value}.`
    };
  }

  if (card.kind === 'action' && topCard?.kind === 'action' && card.action === topCard.action) {
    return {
      label: 'Symbol',
      playable: true,
      description: 'Matches the action symbol.'
    };
  }

  return {
    label: 'Legal',
    playable: true,
    description: 'Playable this turn.'
  };
}

export function describeEvent(entry = '') {
  const lower = entry.toLowerCase();
  if (lower.includes('uno')) {
    return { tone: 'uno', label: 'UNO', text: entry };
  }
  if (lower.includes('draws four') || lower.includes('draw four')) {
    return { tone: 'penalty', label: '+4 hit', text: entry };
  }
  if (lower.includes('draws two') || lower.includes('draw two')) {
    return { tone: 'penalty', label: '+2 hit', text: entry };
  }
  if (lower.includes('reverse')) {
    return { tone: 'reverse', label: 'Reverse', text: entry };
  }
  if (lower.includes('skipped') || lower.includes('skip')) {
    return { tone: 'skip', label: 'Skip', text: entry };
  }
  if (lower.includes('wins')) {
    return { tone: 'score', label: 'Score', text: entry };
  }
  if (lower.includes('draw')) {
    return { tone: 'draw', label: 'Draw', text: entry };
  }
  return { tone: 'play', label: 'Table', text: entry };
}

export function getSetupSummary(state) {
  const aiCount = state.players.filter((player) => player.isAI).length;
  return {
    aiCount,
    label: `${aiCount} AI table`,
    resetWarning: `New table resets round ${state.round} and current scores.`
  };
}

export function getTablePresence(state, humanIndex = 0) {
  const event = describeEvent(state.log[0] ?? state.message ?? '');

  if (state.status === 'game-over') {
    return { heat: 'game-over', aura: 'yellow', headline: 'Game point' };
  }

  if (state.status === 'round-over') {
    return { heat: 'score', aura: 'yellow', headline: 'Count up' };
  }

  if (event.tone === 'penalty') {
    return { heat: 'penalty', aura: 'red', headline: 'Penalty lands' };
  }

  if (event.tone === 'uno') {
    return { heat: 'uno', aura: 'yellow', headline: 'UNO pressure' };
  }

  if (state.status === 'drawn-choice' || state.status === 'choosing-color') {
    return { heat: 'decision', aura: state.currentColor ?? 'wild', headline: 'Decision point' };
  }

  if (state.currentPlayer !== humanIndex) {
    return { heat: 'ai', aura: state.currentColor ?? 'wild', headline: 'AI in motion' };
  }

  return { heat: 'human', aura: state.currentColor ?? 'wild', headline: 'Your lane' };
}

export function summarizeOpponents(state) {
  const seatClasses = SEAT_CLASS_MAP[state.players.length - 1] ?? SEAT_CLASS_MAP[4];

  return state.players.slice(1).map((player, offset) => {
    const index = offset + 1;
    return {
      cardCount: player.hand.length,
      id: player.id,
      index,
      isCurrent: state.currentPlayer === index && !['round-over', 'game-over'].includes(state.status),
      isWinner: state.roundWinner === index || state.gameWinner === index,
      name: player.name,
      score: state.scores[index],
      seatClass: seatClasses[offset] ?? 'seat-far',
      uno: player.hand.length === 1
    };
  });
}

export function humanPlaySummary(playableCards, state) {
  const labels = [];

  if (playableCards.some((card) => card.color === state.currentColor && card.kind !== 'wild')) {
    labels.push(state.currentColor);
  }

  const topCard = topDiscard(state);
  if (topCard?.kind === 'number' && playableCards.some((card) => card.kind === 'number' && card.value === topCard.value)) {
    labels.push(String(topCard.value));
  }

  if (topCard?.kind === 'action' && playableCards.some((card) => card.kind === 'action' && card.action === topCard.action)) {
    labels.push(cardName(topCard).replace(/^[A-Z][a-z]+ /, ''));
  }

  if (playableCards.some((card) => card.action === 'wild')) {
    labels.push('Wild');
  }

  if (playableCards.some((card) => card.action === 'wildDraw4')) {
    labels.push('Wild Draw Four');
  }

  return joinSeries(labels.length ? labels : playableCards.map(cardName));
}

function joinSeries(items) {
  return items.join(', ');
}
