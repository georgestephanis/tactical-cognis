# ⚙️ Tactical Cognis — Running This Build

This folder is a self-contained production build (HTML/JS/CSS and the `sql.js` WASM runtime). If it was built with a local database, `40k.sqlite` is included too; otherwise the app shows an upload prompt where you supply your own.

## You must serve it over HTTP

It will **not** work by opening `index.html` directly (`file://`) — the browser blocks ES modules, `fetch()`, and WebAssembly on the file system. Run a static web server from *inside this folder*:

```bash
npx http-server -c-1 -p 1337
```

Then open <http://localhost:1337>.

- `-c-1` disables caching; `-p 1337` sets the port — change it to whatever you like.
- No CORS flag is needed: everything is served same-origin from this one server.
- Any static server works equally well, e.g. `npx serve .` or `python3 -m http.server 1337`.

> If `40k.sqlite` is present, first load fetches the multi-megabyte database into the browser, after which all queries run locally in-page. If not, you'll land on the upload screen — extract your own copy from the companion app (see `manual-db-sqlite.md` in the repo).
