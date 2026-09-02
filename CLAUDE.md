# CLAUDE.md

Guidance for Claude Code when working in this repo.

## What this is

Tactical Cognis is a React + Vite web app for analyzing Warhammer 40k army data (Mathhammer damage simulator, points-efficiency matrix, army builder with live roster-legality validation, faction/detachment browser). All game data lives in a SQLite database that's queried **in-browser** via `sql.js` (WASM) — nothing is rendered server-side and no game data ships in the repo or build output.

For which DB tables the app consumes and what's still on the roadmap, see the coverage table in `DB.md` and the integration log in `TODO.md`.

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
npm run db:sanitize            # Copy the DB minus companion-app personal data (rosters, favourites, entitlements) → public/40k-scrubbed.sqlite
npm run refresh                # Mac only: db:find + db:sanitize --force — pull the latest companion DB and re-scrub it
npm run lint                   # eslint .
npm test                       # Run zero-dependency mathhammer unit tests
```

## Commands & Testing

Unit tests are located in [tests/mathhammer.test.ts](https://github.com/georgestephanis/tactical-cognis/blob/trunk/tests/mathhammer.test.ts). Execute them with:

```bash
npm test
```

Prefer this pattern (plain asserts, zero-dependency, run via `tsx`) if you add coverage for other logic.

`npm run dev` / `npm run build` both run `copy-data.js` first (via `predev`/`prebuild`) to stage the `sql.js` WASM runtime into `public/`.

## 11th edition data (version 946+)

`Codex: Orks` is the first 11th-edition book in the dataset and introduced two things worth knowing before touching the data layer or any damage aggregation. Both are documented in full in `DB.md`.

- **`datasheet.isLegends`** — Warhammer Legends datasheets. They carry ordinary faction keywords and real points, so they are indistinguishable from codex units unless you read the flag. Surfaced as `MergedUnit.isLegends`; hidden by default, badged where shown, and flagged by Army Builder validation (not legal in matched play). Mirror the Combat Patrol handling when adding a new consumer.
- **`wargear_item_profile.hunterProfileKeyword`** — a conditional "Hunter" statline usable only against listed target keywords, paired with a `Standard` line. **Anything that sums a weapon's profiles must route through `selectProfilesForTarget()`** — summing a Hunter weapon's profiles roughly doubles its output. Parsed into `WeaponProfile.hunterKeywords` by `parseHunterKeywords()` in `db.ts`.

- **`detachment_force_disposition`** — a detachment's force disposition, crossed with the opponent's, picks the primary mission. Nearly all map to exactly one, but a detachment **may offer a choice** (exactly one detachment does today, added by the 11th-edition codex). Anything that treats disposition as single-valued will be wrong for that case — `MergedDetachment.forceDispositions` is an array, and the Army Builder validates that a choice has been made.

**Schema drift:** uploaded databases come from many companion-app releases. Any column added by a newer release must be probed with the cached `hasColumn(table, column)` helper in `db.ts` and folded into the projection conditionally (`'0 AS isLegends'` etc.) — never selected unguarded, or one missing column fails the whole faction load. Verify changes against both a current DB and a copy with the new columns dropped.

## Architecture

- `src/App.tsx` — top-level router. No react-router; view state is synced to `?view=&faction=&unit=` query params by hand via `history.pushState`/`popstate`.
- `src/utils/db.ts` — the only place that talks to `sql.js`. Loads the WASM runtime, opens the DB (from `/40k.sqlite` fetch or an uploaded buffer), exposes query helpers — including allied-unit helpers (`getAlliedUnitsForFaction`/`getAlliedLimitsForFaction`), saved-roster import helpers (`getSavedDbRosters`/`getDbRosterDetail`, which read the user's own `roster*` tables), and the list-legality/allegiance helpers that feed Army Builder validation (`getConditionalKeywordGrants`, `getExcludedDatasheets`, `getKeywordRestrictionGroups`, `getDetachmentWarlordRules`, `getAllegianceGroups`, `getArmyRules`). Companion-app schema versions vary, so probe version-sensitive tables with `PRAGMA table_info` and degrade gracefully rather than letting one missing column fail a whole load (see the `wargear_limit` handling — every legality helper is `try/catch`-guarded the same way). The database schema is documented in `DB.md` and the data layer details are mapped in [docs/data_architecture.md](./docs/data_architecture.md).
- `src/utils/dataMapper.ts` — maps raw DB rows into the `MergedUnit`/`MergedFaction` shapes the UI consumes.
- `src/utils/mathhammer.ts` — pure combat-math engine (hit/wound/save/damage expectation, devastating wounds, FNP, AP reduction, etc.), no DB or React dependency. Also owns conditional-profile selection (`profileAppliesToTarget`, `selectProfilesForTarget`) — keep that logic here, structural and dependency-free, so it stays unit-testable. The mathematical equations are documented in [docs/mathhammer_engine.md](./docs/mathhammer_engine.md).
- `src/components/` — one component per view (`Dashboard`, `FactionBrowser`, `UnitDetails`, `ArmyBuilder`, `DeepAnalysis`) plus `DatabaseUploadView` for the no-DB fallback and `RulesText`, the shared safe renderer for the DB's inline rules markup (DOMParser → React nodes, no `dangerouslySetInnerHTML`). Detailed view maps are in [views/README.md](./views/README.md).
- This is a browser-only app — no Electron, no desktop shell. `scripts/find-db.cjs` (`npm run db:find`) is a plain Node script for local dev convenience only; it never runs as part of the build.

## Gotchas

- The compiled app can't be opened via `file://` — WASM and the DB are loaded with `fetch()`, which browsers block on the file protocol. Serve `dist-distributable/` with `npx serve` or similar.
- Vite's `base` is `/` — the build assumes it's hosted at a domain root, not a subpath.
