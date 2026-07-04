# CLAUDE.md

Guidance for Claude Code when working in this repo.

## What this is

Tactical Cognis is a React + Vite web app for analyzing Warhammer 40k army data (Mathhammer damage simulator, points-efficiency matrix, army builder, faction/detachment browser). All game data lives in a SQLite database that's queried **in-browser** via `sql.js` (WASM) — nothing is rendered server-side and no game data ships in the repo or build output.

## Hard rule: no Games Workshop IP in this repo

This repo must never contain datasheets, points values, wargear text, or any other GW content — scraped, hardcoded, or as a committed fixture file. See [[project-no-gw-ip]] in memory for the full rationale.

- `public/40k.sqlite` is gitignored and only ever exists locally (see `manual-db-sqlite.md`) or is supplied by a user at runtime via the upload screen (`src/components/DatabaseUploadView.tsx`).
- `npm run build:distributable` (`scripts/build_distributable.cjs`) is the build to trust for anything that leaves your machine: it hides any local `public/40k.sqlite` before compiling and deletes stray `.sqlite`/`.bak` files from the output. `dist-distributable/` is the folder to host — HTML/JS/CSS/WASM only.
- If a database isn't present at runtime, the app falls back to `DatabaseUploadView` instead of failing — don't "fix" that by bundling a sample DB.
- Never add fixture `.sqlite` files or hardcoded unit/datasheet JSON for tests or demos. Use obviously-fake placeholder data if a test needs a shape to assert against.

## Commands

```bash
npm run dev                   # Vite dev server, http://localhost:5174
npm run build                 # tsc -b && vite build → dist/ (may include local 40k.sqlite — don't host this one)
npm run build:distributable   # IP-free static build → dist-distributable/ — this is the one to host/deploy
npm run db:find                # Mac only: scan ~/Library/Containers for the companion app's db, copy to public/40k.sqlite
npm run lint                   # eslint .
```

There is no wired-up test command. `src/utils/mathhammer.test.ts` exports `runMathhammerTests()`, a zero-dependency assert-based check of the damage math — it isn't run automatically by any script. Prefer this pattern (plain asserts, no framework) if you add coverage for other non-trivial logic in `src/utils/`.

`npm run dev` / `npm run build` both run `copy-data.js` first (via `predev`/`prebuild`) to stage the `sql.js` WASM runtime into `public/`.

## Architecture

- `src/App.tsx` — top-level router. No react-router; view state is synced to `?view=&faction=&unit=` query params by hand via `history.pushState`/`popstate`.
- `src/utils/db.ts` — the only place that talks to `sql.js`. Loads the WASM runtime, opens the DB (from `/40k.sqlite` fetch or an uploaded buffer), exposes query helpers. The database schema is documented in `DB.md` (structure only — never add actual row contents to that file).
- `src/utils/dataMapper.ts` — maps raw DB rows into the `MergedUnit`/`MergedFaction` shapes the UI consumes.
- `src/utils/mathhammer.ts` — pure combat-math engine (hit/wound/save/damage expectation, devastating wounds, FNP, AP reduction, etc.), no DB or React dependency.
- `src/components/` — one component per view (`Dashboard`, `FactionBrowser`, `UnitDetails`, `ArmyBuilder`, `DeepAnalysis`) plus `DatabaseUploadView` for the no-DB fallback.
- This is a browser-only app — no Electron, no desktop shell. `scripts/find-db.cjs` (`npm run db:find`) is a plain Node script for local dev convenience only; it never runs as part of the build.

## Gotchas

- The compiled app can't be opened via `file://` — WASM and the DB are loaded with `fetch()`, which browsers block on the file protocol. Serve `dist-distributable/` with `npx serve` or similar.
- Vite's `base` is `/` — the build assumes it's hosted at a domain root, not a subpath.
