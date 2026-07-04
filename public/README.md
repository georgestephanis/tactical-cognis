# ⚙️ Tactical Cognis — Running This Build

This folder is a self-contained production build (HTML/JS/CSS, the `40k.sqlite` database, and the `sql.js` WASM runtime).

## You must serve it over HTTP

It will **not** work by opening `index.html` directly (`file://`) — the browser blocks ES modules, `fetch()`, and WebAssembly on the file system. Run a static web server from *inside this folder*:

```bash
npx http-server -c-1 -p 1337
```

Then open <http://localhost:1337>.

- `-c-1` disables caching; `-p 1337` sets the port — change it to whatever you like.
- No CORS flag is needed: everything is served same-origin from this one server.
- Any static server works equally well, e.g. `npx serve .` or `python3 -m http.server 1337`.

> First load fetches the ~33 MB `40k.sqlite` database into the browser, after which all queries run locally in-page.
