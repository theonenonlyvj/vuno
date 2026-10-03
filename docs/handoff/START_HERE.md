# VUno maintainer start here

VUno is a dependency-free browser game served by a small Node static server.
Read `README.md` for usage and `docs/rules/classic-uno-principles.md` for the
deliberate rules boundary.

Source map:

- `src/engine.js` — deck, turn, action-card, UNO, scoring, and opponent logic.
- `src/ui-model.js` — player-facing descriptions derived from engine state.
- `src/app.js` — DOM events, rendering, and opponent scheduling.
- `server.mjs` — local static server with port fallback.

Verification gate:

```bash
npm test
```
