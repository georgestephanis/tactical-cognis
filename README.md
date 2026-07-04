# ⚙️ Tactical Cognis

A high-fidelity analytical web app for Warhammer 40k: Mathhammer simulator, points-efficiency matrix, army builder, and detachment/stratagem browser. Everything renders from a SQLite database queried in-browser via [`sql.js`](https://sql.js.org/) — **no game data is bundled in this repo.**

This repo contains only the app and its build tooling. It does not include any datamining/scraping pipeline or Games Workshop content — you supply your own extracted database locally (see below), which stays untracked by git.

## Quick Start

```bash
npm install
npm run dev        # http://localhost:5174
```

`npm run dev` / `npm run build` run [copy-data.js](./copy-data.js) first to stage the `sql.js` WASM runtime into `public/`. If `public/40k.sqlite` doesn't exist yet, the app falls back to the in-browser upload prompt.

## Getting a database

The app reads a `40k.sqlite` file with the companion-app schema (`datasheet`, `miniature`, `wargear_item`, etc.). You have three options:

1. **Auto-find (Mac)** — `npm run db:find` scans `~/Library/Containers` for the companion app's sandboxed database and copies it to `public/40k.sqlite`.
2. **Manual extraction** — see [manual-db-sqlite.md](./manual-db-sqlite.md) for pulling `db.sqlite` straight out of the official WH40k companion app by hand.
3. **In-browser upload** — run the app with no database present and it'll prompt you to upload one.

## Building

```bash
npm run build                 # production web build → dist/ (may include your local public/40k.sqlite)
npm run build:distributable   # IP-free static site → dist-distributable/ — host this one
```

`build:distributable` ([scripts/build_distributable.cjs](./scripts/build_distributable.cjs)) temporarily hides any local `public/40k.sqlite`, compiles, and recursively strips `.sqlite`/`.bak` files from the output — so `dist-distributable/` ships with zero game data, just HTML/JS/CSS/WASM. Visitors with no database land on the in-browser upload prompt and supply their own. This is the folder to host publicly.

### Serving the production build

You cannot open `index.html` via `file://` — the app fetches WASM and the DB over `fetch()`, which browsers block on the file protocol. Serve it instead:

```bash
npx serve dist-distributable
# or: python3 -m http.server --directory dist-distributable 8080
```
