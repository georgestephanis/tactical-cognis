# ⚙️ Tactical Cognis

A high-fidelity analytical web app for Warhammer 40k: Mathhammer simulator, points-efficiency matrix, army builder with live roster-legality validation (points/battle-size, paid wargear, Rule of 3, allied caps, excluded units, 0-1 keyword caps, mandatory Warlords, Warhammer Legends flagging, and sub-faction/allegiance choices), and detachment/stratagem browser. Everything renders from a SQLite database queried in-browser via [`sql.js`](https://sql.js.org/) — **no game data is bundled in this repo.**

This repo contains only the app and its build tooling. It does not include any datamining/scraping pipeline or Games Workshop content — you supply your own extracted database locally (see below), which stays untracked by git.

## Quick Start

```bash
npm install
npm run dev        # http://localhost:5174
```

`npm run dev` / `npm run build` run [copy-data.js](./copy-data.js) first to stage the `sql.js` WASM runtime into `public/`. If `public/40k.sqlite` doesn't exist yet, the app falls back to the in-browser upload prompt.

## Getting a database

The app reads a `40k.sqlite` file with the companion-app schema (`datasheet`, `miniature`, `wargear_item`, etc. — see [DB.md](./DB.md) for the full schema reference). You have three options:

1. **Auto-find (Mac)** — `npm run db:find` scans `~/Library/Containers` for the companion app's sandboxed database and copies it to `public/40k.sqlite`.
2. **Manual extraction** — see [manual-db-sqlite.md](./manual-db-sqlite.md) for pulling `db.sqlite` straight out of the official WH40k companion app by hand.
3. **In-browser upload** — run the app with no database present and it'll prompt you to upload one.

If the database contains your own saved army lists from the companion app (the `roster*` tables), the Army Builder's Import modal lists them and can pull them in directly — exact units, model counts, wargear, enhancements, declared allegiance, and leader attachments included.

## Building

```bash
npm run build                 # production web build → dist/ (may include your local public/40k.sqlite)
npm run build:distributable   # IP-free static site → dist-distributable/ — host this one
```

`build:distributable` ([scripts/build_distributable.cjs](./scripts/build_distributable.cjs)) temporarily stashes **every** database file in `public/` — `.sqlite`/`.sqlite3`/`.db` plus any `-wal`/`-shm`/`-journal` sidecars (the companion app's databases are in WAL mode, so sidecars reappear whenever anything opens them) — compiles, recursively strips the same set from the output, then **re-scans and fails the build** if anything remains. So `dist-distributable/` ships with zero game data, just HTML/JS/CSS/WASM. Visitors with no database land on the in-browser upload prompt and supply their own. This is the folder to host publicly.

### Serving the production build

You cannot open `index.html` via `file://` — the app fetches WASM and the DB over `fetch()`, which browsers block on the file protocol. Serve it instead:

```bash
npx serve dist-distributable
# or: python3 -m http.server --directory dist-distributable 8080
```

---

## 📖 Documentation Index

For details on the project structure, views, and core engines, see:
- **[UI Storyboard Registry](./views/README.md):** An interactive view map describing each main page layout, CSS selectors, and sub-routing parameters.
- **[Mathhammer Simulation Engine](./docs/mathhammer_engine.md):** The math formulas, special rule combinations, and dice parsing logic.
- **[Data & Mapping Architecture](./docs/data_architecture.md):** Relational queries, caching layers, and TypeScript structures.
- **[Database Schema Reference](./DB.md):** Comprehensive schema map of the Warhammer companion app SQLite db, including the coverage table of which tables the app queries.
- **[Integrations Roadmap & Log](./TODO.md):** What DB-backed features are built and what's still on the roadmap.
- **[Manual SQLite Setup](./manual-db-sqlite.md):** Detailed guide to extracting the database from your device.

### 11th edition support

The dataset's first 11th-edition book (`Codex: Orks`) introduced two mechanics the app now handles explicitly — both documented in [DB.md](./DB.md):

- **Warhammer Legends datasheets** (`datasheet.isLegends`) — playable in open/narrative games but not matched play. Hidden by default behind *Include Legends* toggles in the Faction Browser and Army Builder, badged where shown, and raised as a roster validation error.
- **Conditional "Hunter" weapon profiles** (`wargear_item_profile.hunterProfileKeyword`) — a statline usable only against particular target keywords, paired with a `Standard` line for everything else. Damage aggregation picks the applicable line rather than summing both.
- **Paid wargear** (`wargear_option.points`) — 11th edition reintroduced points-costed wargear. A unit costs its composition points plus every item it carries, defaults included; tier prices fold in the default loadout and the Army Builder charges only the difference for changes.
- **Force dispositions** (`detachment_force_disposition`) — a detachment's disposition, crossed with the opponent's, selects the primary mission. Shown per detachment, used by the print export to list the matchup missions and how likely each deployment map is, and where a detachment offers a *choice* of dispositions the Army Builder renders a selector, persists the pick, and validates that one has been made.

Companion-app databases vary by release, so columns added by newer versions are probed with `hasColumn()` before use; an older database degrades gracefully rather than failing to load.
