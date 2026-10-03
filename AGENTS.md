# Repository guidance

Treat this repository as public.

- Start with `README.md` and `docs/handoff/START_HERE.md`.
- Keep personal information, secrets, machine-specific paths, private
  infrastructure, and material from unrelated workspaces out of the repo.
- Do not add remotes, push, publish, or deploy without explicit authorization.
- Preserve the classic-rule boundary in `docs/rules/classic-uno-principles.md`.
- Protect changes to `src/engine.js` and `src/ui-model.js` with focused Node
  tests before editing implementation behavior.
- Run `npm test` after code changes. There is no compile/build step.
