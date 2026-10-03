# VUno

VUno is a local-only classic Uno-style card game for one human against 1-4 simple AI opponents.

It has no accounts, analytics, remote multiplayer, runtime dependencies, or
build step. A small Node server serves the static files for local play.

## Run

```bash
npm run dev
```

Open the URL printed by the server, usually `http://127.0.0.1:5173/`.

## Test

```bash
npm test
```

## Project map

- `src/engine.js` — rules and game state.
- `src/ui-model.js` — player-facing state descriptions.
- `src/app.js` — browser rendering and interaction.
- `server.mjs` — local static server.
- `tests/` — Node test-runner coverage for engine and UI-model behavior.
- `docs/handoff/START_HERE.md` — current maintainer orientation.

## Rule Boundary

VUno intentionally models classic play:

- Original 108-card deck only.
- Seven-card opening hands.
- Match by current color, number, or action symbol.
- One card may be played per turn.
- No stacking, jump-in, 7-0, swap hands, shuffle hands, blank wilds, or partner mode.
- Draw one when choosing not to play or when no legal card is available.
- Drawn playable cards may be played immediately or kept.
- Draw Two and Wild Draw Four make the next player draw and forfeit the turn.
- Reverse changes direction; in two-player rounds it behaves like Skip.
- Wild Draw Four is legal only when the player has no card matching the current color.
- A player who reaches one card without calling UNO draws two.
- Round winner scores the point value of all opponents' remaining cards.
- First player to 500 points wins.

The AI is deliberately simple: it plays the first legal non-Wild-Draw-Four card it sees, chooses the most common color in its remaining hand, and draws when it has no legal card.
