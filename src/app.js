import {
  COLORS,
  canPlayCard,
  cardName,
  chooseBestColor,
  chooseColor,
  colorName,
  drawOneForTurn,
  getPlayableCards,
  isHumanTurn,
  keepDrawnCard,
  playCard,
  selectDumbAIPlay,
  startGame,
  startNextRound,
  topDiscard
} from './engine.js';
import {
  describeEvent,
  getCardPlayReason,
  getDealerPrompt,
  getSetupSummary,
  getTablePresence,
  summarizeOpponents
} from './ui-model.js';

const STORAGE_KEY = 'vuno-state-v1';
const app = document.querySelector('#app');

let storageIssue = '';
let state = loadState() ?? startGame({ aiCount: 3 });
let pendingWildCardId = null;
let unoArmed = false;
let errorMessage = '';
let aiTimer = null;
let pendingFocusKey = null;
let setupOpen = false;
let handScrollLeft = 0;

app.addEventListener('click', handleClick);
document.addEventListener('keydown', handleKeyDown);

render();
scheduleAI();

function handleClick(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) {
    return;
  }

  runAction(button.dataset.action, button.dataset);
}

function runAction(action, data = {}) {
  try {
    if (action === 'new-game') {
      const aiCount = Number.parseInt(data.aiCount, 10);
      pendingWildCardId = null;
      unoArmed = false;
      setupOpen = false;
      setState(startGame({ aiCount }), { focusKey: 'setup-toggle' });
      return;
    }

    if (action === 'toggle-setup') {
      setupOpen = !setupOpen;
      errorMessage = '';
      pendingFocusKey = 'setup-toggle';
      render();
      return;
    }

    if (action === 'next-round') {
      pendingWildCardId = null;
      unoArmed = false;
      setupOpen = false;
      setState(startNextRound(state), { focusKey: 'draw-pile' });
      return;
    }

    if (action === 'call-uno') {
      unoArmed = true;
      errorMessage = '';
      pendingFocusKey = 'call-uno';
      render();
      return;
    }

    if (action === 'draw') {
      pendingWildCardId = null;
      unoArmed = false;
      setState(drawOneForTurn(state, 0), { focusKey: 'keep-drawn' });
      return;
    }

    if (action === 'keep-drawn') {
      pendingWildCardId = null;
      unoArmed = false;
      setState(keepDrawnCard(state, 0), { focusKey: 'draw-pile' });
      return;
    }

    if (action === 'play-card') {
      const cardId = data.cardId;
      const card = state.players[0].hand.find((candidate) => candidate.id === cardId);
      if (card?.kind === 'wild') {
        pendingWildCardId = cardId;
        errorMessage = '';
        pendingFocusKey = 'color-red';
        render();
        return;
      }

      playHumanCard(cardId, null);
      return;
    }

    if (action === 'choose-color') {
      const color = data.color;

      if (state.status === 'choosing-color') {
        unoArmed = false;
        pendingWildCardId = null;
        setState(chooseColor(state, 0, color), { focusKey: 'draw-pile' });
        return;
      }

      playHumanCard(pendingWildCardId, color);
      return;
    }

    if (action === 'cancel-color') {
      const cardFocusKey = pendingWildCardId ? `card-${pendingWildCardId}` : 'draw-pile';
      pendingWildCardId = null;
      pendingFocusKey = cardFocusKey;
      render();
    }
  } catch (error) {
    errorMessage = friendlyError(error);
    pendingFocusKey = data.focusKey ?? null;
    render();
  }
}

function playHumanCard(cardId, chosenColor) {
  const calledUno = unoArmed;
  pendingWildCardId = null;
  unoArmed = false;
  setState(playCard(state, {
    playerIndex: 0,
    cardId,
    chosenColor,
    calledUno
  }), { focusKey: 'draw-pile' });
}

function setState(nextState, options = {}) {
  state = nextState;
  errorMessage = '';
  pendingFocusKey = options.focusKey ?? null;
  saveState(state);
  render();
  scheduleAI();
}

function scheduleAI() {
  window.clearTimeout(aiTimer);

  const current = state.players[state.currentPlayer];
  if (!current?.isAI || ['round-over', 'game-over'].includes(state.status)) {
    return;
  }

  const delay = state.status === 'drawn-choice' ? 780 : 560;
  aiTimer = window.setTimeout(() => {
    try {
      runAI();
    } catch (error) {
      errorMessage = friendlyError(error);
      render();
    }
  }, delay);
}

function runAI() {
  const playerIndex = state.currentPlayer;
  const player = state.players[playerIndex];

  if (state.status === 'choosing-color') {
    setState(chooseColor(state, playerIndex, chooseBestColor(player.hand)));
    return;
  }

  if (state.status === 'drawn-choice') {
    const drawnCard = player.hand.find((card) => card.id === state.drawnCardId);
    if (drawnCard && canPlayCard(drawnCard, state, player.hand)) {
      const remainingHand = player.hand.filter((card) => card.id !== drawnCard.id);
      setState(playCard(state, {
        playerIndex,
        cardId: drawnCard.id,
        chosenColor: drawnCard.kind === 'wild' ? chooseBestColor(remainingHand) : null,
        calledUno: player.hand.length === 2
      }));
      return;
    }

    setState(keepDrawnCard(state, playerIndex));
    return;
  }

  const aiPlay = selectDumbAIPlay(state, playerIndex);
  if (aiPlay) {
    setState(playCard(state, aiPlay));
    return;
  }

  setState(drawOneForTurn(state, playerIndex));
}

function handleKeyDown(event) {
  if (event.metaKey || event.ctrlKey || event.altKey) {
    return;
  }

  const modal = document.querySelector('.color-modal');
  if (modal) {
    handleModalKeyDown(event, modal);
    return;
  }

  if (!isHumanTurn(state)) {
    return;
  }

  const key = event.key.toLowerCase();
  if (key === 'u' && canCallUno()) {
    event.preventDefault();
    runAction('call-uno', { focusKey: 'call-uno' });
    return;
  }

  if (key === 'd' && state.status === 'playing') {
    event.preventDefault();
    runAction('draw', { focusKey: 'draw-pile' });
    return;
  }

  if (key === 'k' && state.status === 'drawn-choice') {
    event.preventDefault();
    runAction('keep-drawn', { focusKey: 'keep-drawn' });
    return;
  }

  if (/^[1-9]$/.test(key) && ['playing', 'drawn-choice'].includes(state.status)) {
    const playable = humanPlayableCards();
    const card = playable[Number.parseInt(key, 10) - 1];
    if (card) {
      event.preventDefault();
      runAction('play-card', { cardId: card.id, focusKey: `card-${card.id}` });
    }
  }
}

function handleModalKeyDown(event, modal) {
  if (event.key === 'Escape' && pendingWildCardId) {
    event.preventDefault();
    runAction('cancel-color');
    return;
  }

  if (event.key !== 'Tab') {
    return;
  }

  const focusable = [...modal.querySelectorAll('button:not(:disabled)')];
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!first || !last) {
    return;
  }

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function render() {
  const previousFocusKey = pendingFocusKey ?? document.activeElement?.dataset?.focusKey ?? null;
  const previousHandFan = app.querySelector('.hand-fan');
  if (previousHandFan) {
    handScrollLeft = previousHandFan.scrollLeft;
  }

  const current = state.players[state.currentPlayer];
  const human = state.players[0];
  const topCard = topDiscard(state);
  const humanTurn = isHumanTurn(state) && state.currentPlayer === 0;
  const playableIds = new Set(humanPlayableCards().map((card) => card.id));
  const activeDrawnChoice = state.status === 'drawn-choice' && state.currentPlayer === 0;
  const canDraw = humanTurn && state.status === 'playing';
  const setup = getSetupSummary(state);
  const dealer = getDealerPrompt(state, 0);
  const presence = getTablePresence(state, 0);
  const latest = describeEvent(state.log[0] ?? state.message ?? 'Table is ready.');
  const historyEntries = state.log.length ? state.log.slice(0, 12) : [state.message || 'Table is ready.'];
  const flow = state.direction === 1 ? 'Clockwise' : 'Counter';

  app.innerHTML = `
    <div class="game-shell">
      <header class="game-header">
        <div class="brand-lockup">
          <div class="brand-mark" aria-hidden="true">V</div>
          <div>
            <p class="eyebrow">After-hours classic</p>
            <h1>VUno</h1>
          </div>
        </div>
        <div class="header-controls">
          <div class="target-chip" aria-label="Target score">
            <span>Race to</span>
            <strong>${state.targetScore}</strong>
          </div>
          <button
            class="setup-trigger"
            data-action="toggle-setup"
            data-focus-key="setup-toggle"
            aria-controls="setup-drawer"
            aria-expanded="${setupOpen}"
          >
            <span>${escapeHtml(setup.label)}</span>
            <strong>Reseat</strong>
          </button>
        </div>
      </header>

      ${setupOpen ? `
        <section class="setup-drawer" id="setup-drawer" aria-label="New table setup">
          <div>
            <p class="eyebrow">Table setup</p>
            <h2>${escapeHtml(setup.label)}</h2>
            <p>${escapeHtml(setup.resetWarning)}</p>
          </div>
          <div class="segment" role="group" aria-label="Start a new table with AI opponents">
            ${[1, 2, 3, 4].map((count) => `
              <button
                data-action="new-game"
                data-ai-count="${count}"
                data-focus-key="new-game-${count}"
                aria-pressed="${count === setup.aiCount}"
                class="${count === setup.aiCount ? 'active' : ''}"
              >
                ${count} AI
              </button>
            `).join('')}
          </div>
        </section>
      ` : ''}

      ${storageIssue ? `<div class="notice" role="status">${escapeHtml(storageIssue)}</div>` : ''}

      <main class="play-layout">
        <section class="table-arena" aria-label="VUno table">
          <div
            class="felt-table color-aura-${state.currentColor ?? 'wild'} presence-${presence.heat} aura-${presence.aura} ${humanTurn ? 'human-turn' : 'ai-turn'}"
            data-status="${escapeHtml(state.status)}"
            data-current-color="${escapeHtml(state.currentColor ?? 'wild')}"
            style="--hand-count: ${human.hand.length}; --opponent-count: ${setup.aiCount};"
          >
            <div class="table-atmosphere" aria-hidden="true">
              <span></span>
              <span></span>
              <span></span>
              <span></span>
            </div>
            <div class="table-rail" aria-label="Round state">
              <span><b>Round</b>${state.round}</span>
              <span><b>Turn</b>${escapeHtml(current?.name ?? 'Nobody')}</span>
              <span><b>Flow</b>${flow}</span>
              <span><b>Color</b>${state.currentColor ? colorName(state.currentColor) : 'Wild'}</span>
            </div>

            <div class="presence-strip" aria-hidden="true">
              <span>${escapeHtml(presence.headline)}</span>
            </div>

            <div class="opponent-rail" aria-label="AI seats">
              ${summarizeOpponents(state).map(renderSeat).join('')}
            </div>

            <section class="dealer-prompt dealer-${dealer.tone}" role="status" aria-live="polite" aria-atomic="true">
              <span class="dealer-kicker">The call</span>
              <h2>${escapeHtml(dealer.title)}</h2>
              <p>${escapeHtml(dealer.call)}</p>
            </section>

            <div class="table-core">
              <div class="pile-zone">
                <button
                  class="draw-pile"
                  data-action="draw"
                  data-focus-key="draw-pile"
                  ${canDraw ? '' : 'disabled'}
                  aria-label="${canDraw ? 'Draw one card' : 'Draw pile unavailable'}"
                >
                  <span>Draw</span>
                  <strong>${state.drawPile.length}</strong>
                </button>
                <div class="discard-wrap">
                  ${renderDiscardStack(topCard)}
                  <div class="current-color color-${state.currentColor ?? 'wild'}" aria-label="Current color ${state.currentColor ?? 'not chosen'}">
                    ${state.currentColor ? colorName(state.currentColor) : 'Choose'}
                  </div>
                </div>
              </div>

              <div class="event-chip event-${latest.tone}" aria-live="polite">
                <span>${escapeHtml(latest.label)}</span>
                <strong>${escapeHtml(latest.text || 'Table is ready.')}</strong>
              </div>
            </div>

            ${renderDecisionTray(activeDrawnChoice)}

            ${renderRoundSummary()}
            ${errorMessage ? `<div class="error-banner" role="alert">${escapeHtml(errorMessage)}</div>` : ''}

            <section class="hand-dock" aria-label="Your hand">
              <div class="hand-header">
                <div>
                  <p class="eyebrow">Your fan</p>
                  <h2>${human.hand.length} cards</h2>
                </div>
                <div class="hand-hints">
                  <span>${canCallUno() ? 'Call UNO before the final play' : `${playableIds.size} playable now`}</span>
                </div>
                <div class="hand-actions">
                  <button
                    data-action="call-uno"
                    data-focus-key="call-uno"
                    ${canCallUno() ? '' : 'disabled'}
                    class="uno-button ${unoArmed ? 'armed' : ''}"
                    aria-pressed="${unoArmed}"
                  >
                    ${unoArmed ? 'UNO armed' : 'UNO'}
                  </button>
                  ${state.status === 'round-over' ? '<button class="primary-action" data-action="next-round" data-focus-key="next-round">Next round</button>' : ''}
                  ${state.status === 'game-over' ? `<button class="primary-action" data-action="new-game" data-ai-count="${setup.aiCount}" data-focus-key="new-game-${setup.aiCount}">New game</button>` : ''}
                </div>
              </div>
              <div class="hand-fan">
                ${human.hand.map((card, index) => {
                  const mustUseDrawn = activeDrawnChoice && card.id !== state.drawnCardId;
                  const legal = humanTurn && playableIds.has(card.id) && !mustUseDrawn && ['playing', 'drawn-choice'].includes(state.status);
                  const reason = getCardPlayReason(card, state, human.hand);
                  return renderCard(card, {
                    asButton: true,
                    playable: legal,
                    disabled: !legal,
                    isDrawn: card.id === state.drawnCardId,
                    reason,
                    index
                  });
                }).join('')}
              </div>
            </section>
          </div>
        </section>

        <details class="history-rail" aria-label="Game log">
          <summary>
            <span>Receipts</span>
            <strong>${state.log.length}</strong>
          </summary>
          <ol>
            ${historyEntries.map((entry) => `<li>${escapeHtml(entry)}</li>`).join('')}
          </ol>
        </details>
      </main>
    </div>
    ${renderColorChooser()}
  `;

  restoreFocus(previousFocusKey);
  restoreHandScroll();
}

function renderSeat(seat) {
  const stateLabel = [
    seat.isCurrent ? 'current player' : null,
    seat.uno ? 'UNO' : null,
    seat.isWinner ? 'round winner' : null
  ].filter(Boolean).join(', ');
  const stackCount = Math.max(1, Math.min(3, seat.cardCount || 1));
  const stackCards = Array.from({ length: stackCount }, () => '<i></i>').join('');

  return `
    <article
      class="seat ${seat.seatClass} ${seat.isCurrent ? 'current' : ''} ${seat.isWinner ? 'winner' : ''}"
      aria-current="${seat.isCurrent ? 'true' : 'false'}"
      aria-label="${escapeHtml(`${seat.name}, ${seat.cardCount} cards, ${seat.score} points${stateLabel ? `, ${stateLabel}` : ''}`)}"
    >
      <div class="seat-stack" aria-hidden="true">${stackCards}</div>
      <div class="seat-copy">
        <strong>${escapeHtml(seat.name)}</strong>
        <span>${seat.cardCount} ${seat.cardCount === 1 ? 'card' : 'cards'}</span>
      </div>
      <div class="seat-score">
        <span>Score</span>
        <b>${seat.score}</b>
      </div>
      ${seat.uno ? '<em>UNO</em>' : ''}
    </article>
  `;
}

function renderDecisionTray(activeDrawnChoice) {
  if (!activeDrawnChoice) {
    return '';
  }

  const drawnCard = state.players[0].hand.find((card) => card.id === state.drawnCardId);
  if (!drawnCard) {
    return '';
  }

  return `
    <section class="decision-tray" aria-label="Drawn card decision">
      <div>
        <span>Fresh from deck</span>
        <strong>${escapeHtml(cardName(drawnCard))}</strong>
      </div>
      <button class="primary-action" data-action="play-card" data-card-id="${escapeHtml(drawnCard.id)}" data-focus-key="card-${escapeHtml(drawnCard.id)}">
        Slam it
      </button>
      <button data-action="keep-drawn" data-focus-key="keep-drawn">Pocket it</button>
    </section>
  `;
}

function renderRoundSummary() {
  if (!['round-over', 'game-over'].includes(state.status)) {
    return '';
  }

  const rows = state.players
    .map((player, index) => ({
      index,
      name: player.name,
      score: state.scores[index],
      remaining: player.hand.length
    }))
    .sort((left, right) => right.score - left.score);
  const winnerIndex = state.gameWinner ?? state.roundWinner;
  const winner = state.players[winnerIndex];
  const result = state.status === 'game-over' ? 'takes the game' : 'takes the round';

  return `
    <section class="round-summary" aria-label="Round summary">
      <header>
        <span>Count up</span>
        <strong>${escapeHtml(winner?.name ?? 'Winner')} ${result}</strong>
      </header>
      ${rows.map((row) => `
        <div class="${row.index === winnerIndex ? 'winner-row' : ''}">
          <span>${escapeHtml(row.name)}</span>
          <strong>${row.score}</strong>
          <small>${row.remaining} left</small>
        </div>
      `).join('')}
    </section>
  `;
}

function renderDiscardStack(card) {
  return `
    <div class="discard-stack" aria-label="Discard pile">
      <i aria-hidden="true"></i>
      <i aria-hidden="true"></i>
      ${renderCard(card, { asButton: false, size: 'large', labelPrefix: 'Top discard' })}
    </div>
  `;
}

function renderCard(card, options = {}) {
  if (!card) {
    return '<div class="card card-empty" role="img" aria-label="No discard card">No card</div>';
  }

  const color = card.color ?? 'wild';
  const label = card.kind === 'number' ? String(card.value) : actionShortName(card.action);
  const symbol = cardSymbol(card);
  const fullName = cardName(card);
  const reason = options.reason;
  const classes = [
    'card',
    `card-${color}`,
    options.size === 'large' ? 'card-large' : '',
    options.playable ? 'playable' : '',
    options.disabled ? 'recessed' : '',
    options.isDrawn ? 'drawn' : '',
    reason && !reason.playable ? 'blocked' : ''
  ].filter(Boolean).join(' ');

  const style = cardStyle(options);
  const reasonText = reason ? `${reason.label}: ${reason.description}` : '';
  const accessibleName = `${options.labelPrefix ? `${options.labelPrefix}: ` : ''}${fullName}${reasonText ? `. ${reasonText}` : ''}`;
  const body = `
    <span class="card-corner card-corner-top">${escapeHtml(label)}</span>
    <span class="card-oval">
      <span class="card-symbol" aria-hidden="true">${escapeHtml(symbol)}</span>
      <span class="card-value">${escapeHtml(label)}</span>
    </span>
    <span class="card-corner card-corner-bottom">${escapeHtml(label)}</span>
    ${reason ? `<span class="play-badge">${escapeHtml(reason.label)}</span>` : ''}
  `;

  if (!options.asButton) {
    return `<div class="${classes}"${cardAttributes(card)}${style} role="img" aria-label="${escapeHtml(accessibleName)}">${body}</div>`;
  }

  return `
    <button
      class="${classes}"
      ${cardAttributes(card)}
      data-action="play-card"
      data-card-id="${escapeHtml(card.id)}"
      data-focus-key="card-${escapeHtml(card.id)}"
      ${style}
      ${options.disabled ? 'disabled' : ''}
      aria-label="Play ${escapeHtml(accessibleName)}"
    >
      ${body}
    </button>
  `;
}

function renderColorChooser() {
  const needsInitialColor = state.status === 'choosing-color' && state.currentPlayer === 0;
  if (!pendingWildCardId && !needsInitialColor) {
    return '';
  }

  return `
    <div class="modal-backdrop">
      <div class="color-modal" role="dialog" aria-modal="true" aria-labelledby="color-modal-title">
        <h2 id="color-modal-title">Call the room</h2>
        <div class="color-buttons">
          ${COLORS.map((color) => `
            <button
              class="color-choice color-${color}"
              data-action="choose-color"
              data-color="${color}"
              data-focus-key="color-${color}"
            >
              ${colorName(color)}
            </button>
          `).join('')}
        </div>
        ${pendingWildCardId ? '<button class="secondary" data-action="cancel-color" data-focus-key="cancel-color">Cancel</button>' : ''}
      </div>
    </div>
  `;
}

function restoreFocus(previousFocusKey) {
  const focusKey = pendingFocusKey ?? previousFocusKey;
  const modalFirst = document.querySelector('.color-modal button[data-focus-key="color-red"]');

  window.requestAnimationFrame(() => {
    if (modalFirst) {
      modalFirst.focus({ preventScroll: true });
      pendingFocusKey = null;
      return;
    }

    if (focusKey) {
      const target = document.querySelector(`[data-focus-key="${cssEscape(focusKey)}"]:not(:disabled)`);
      if (target) {
        target.focus({ preventScroll: true });
      }
    }
    pendingFocusKey = null;
  });
}

function restoreHandScroll() {
  window.requestAnimationFrame(() => {
    const handFan = document.querySelector('.hand-fan');
    if (handFan) {
      handFan.scrollLeft = handScrollLeft;
    }
  });
}

function humanPlayableCards() {
  const playable = getPlayableCards(state, 0);
  if (state.status !== 'drawn-choice') {
    return playable;
  }
  return playable.filter((card) => card.id === state.drawnCardId);
}

function canCallUno() {
  return isHumanTurn(state) && state.currentPlayer === 0 && state.players[0].hand.length === 2 && !unoArmed;
}

function actionShortName(action) {
  if (action === 'draw2') {
    return '+2';
  }

  if (action === 'wildDraw4') {
    return '+4';
  }

  if (action === 'reverse') {
    return 'Rev';
  }

  if (action === 'skip') {
    return 'Skip';
  }

  return 'Wild';
}

function cardStyle(options) {
  if (!Number.isInteger(options.index)) {
    return '';
  }

  const tilt = Math.max(-7, Math.min(7, (options.index - 3) * 1.35));
  const lift = Math.max(-8, Math.min(0, -Math.abs(options.index - 3)));
  return ` style="--card-index: ${options.index}; --fan-tilt: ${tilt.toFixed(2)}deg; --fan-lift: ${lift}px"`;
}

function cardAttributes(card) {
  return ` data-kind="${escapeHtml(card.kind)}" data-card-color="${escapeHtml(card.color ?? 'wild')}" data-action-name="${escapeHtml(card.action ?? '')}"`;
}

function cardSymbol(card) {
  if (card.kind === 'number') {
    return String(card.value);
  }

  if (card.action === 'draw2') {
    return '+2';
  }

  if (card.action === 'wildDraw4') {
    return '+4';
  }

  if (card.action === 'reverse') {
    return 'REV';
  }

  if (card.action === 'skip') {
    return 'NO';
  }

  return 'WILD';
}

function loadState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.players) || !Array.isArray(parsed.drawPile)) {
      return null;
    }

    return parsed;
  } catch {
    storageIssue = 'Saved table could not be loaded, so a fresh table was started.';
    return null;
  }
}

function saveState(nextState) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
    storageIssue = '';
  } catch {
    storageIssue = 'This table is playable, but the browser could not save it locally.';
  }
}

function friendlyError(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('Wild cards require')) {
    return 'Choose a color before playing that Wild.';
  }
  if (message.includes('not legal')) {
    return 'That card does not match the table right now.';
  }
  if (message.includes('not this player')) {
    return 'Wait for your turn.';
  }
  return message;
}

function cssEscape(value) {
  if (window.CSS?.escape) {
    return window.CSS.escape(value);
  }
  return String(value).replaceAll('"', '\\"');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
