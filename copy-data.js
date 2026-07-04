import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function copyWasm() {
  const dist = path.join(__dirname, "node_modules", "sql.js", "dist");
  const files = ["sql-wasm.wasm", "sql-wasm-debug.wasm", "sql-wasm-debug.js"];

  files.forEach((file) => {
    const src = path.join(dist, file);
    const dest = path.join(__dirname, "public", file);
    if (fs.existsSync(src)) {
      console.log(`Copying ${file} from ${src} to ${dest}...`);
      fs.copyFileSync(src, dest);
    } else {
      console.warn(`Source not found: ${src}`);
    }
  });
}

// Ensure public directory exists
const publicDir = path.join(__dirname, "public");
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

copyWasm();
if (!fs.existsSync(path.join(publicDir, "40k.sqlite"))) {
  // ponytail: no bundled database — see manual-db-sqlite.md to extract your own into public/40k.sqlite
  console.warn("No public/40k.sqlite found. Extract your own (see manual-db-sqlite.md) or use the in-app upload prompt.");
}
console.log("Data link configuration complete.");
