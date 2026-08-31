/**
 * Strip companion-app user state out of a 40k.sqlite extraction so the result
 * can be handed to someone else without carrying personal details along.
 *
 * Removed by default: saved rosters, battle-tracker state, favourites and
 * entitlements (the store/subscription rows) — everything the companion app
 * writes about *you* rather than about the game.
 *
 * Optional --drop-unused additionally removes gameplay tables that
 * src/utils/db.ts never queries, purely to shrink the file. That list is
 * derived from db.ts at runtime, so it stays honest as coverage grows.
 *
 * Uses sql.js (already a dependency) rather than the sqlite3 CLI, so it runs
 * anywhere npm install has run.
 */

const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const rootDir = path.join(__dirname, '..');
const DEFAULT_INPUT = path.join(rootDir, 'public', '40k.sqlite');

/** db.sqlite -> db-scrubbed.sqlite, alongside the source. */
function scrubbedName(inputPath) {
  const dir = path.dirname(inputPath);
  const ext = path.extname(inputPath);
  return path.join(dir, `${path.basename(inputPath, ext)}-scrubbed${ext}`);
}

// Companion-app account/user state. Nothing here is game data.
// NB: `battle_size` is gameplay content (points limits per game size) and is
// deliberately NOT matched by the /^battle/ patterns below.
const PERSONAL_TABLE_PATTERNS = [
  /^roster(_.*)?$/,
  /^battle$/,
  /^battle_player(_.*)?$/,
  /^favourite$/,
  /^entitlement$/,
  /^grdb_migrations$/,
  // Defensive: schema versions vary between companion-app releases, so catch
  // anything obviously account-shaped that a future extraction might add.
  /^(user|account|subscription|purchase|payment|receipt|order|device|session|sync|notification|analytics|telemetry|crash|log)(_.*)?$/,
];

// Never drop these, whatever the heuristics say.
const ALWAYS_KEEP = new Set(['metadata', 'sqlite_sequence']);

function parseArgs(argv) {
  const opts = { dropUnused: false, force: false, positional: [] };
  for (const arg of argv) {
    if (arg === '--drop-unused') opts.dropUnused = true;
    else if (arg === '--force' || arg === '-f') opts.force = true;
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg.startsWith('-')) {
      console.error(`Unknown flag: ${arg}`);
      process.exit(1);
    } else opts.positional.push(arg);
  }
  return opts;
}

function usage() {
  console.log(`Usage: npm run db:sanitize -- [input.sqlite] [output.sqlite] [--drop-unused] [--force]

  input    defaults to public/40k.sqlite
  output   defaults to the input name with a -scrubbed suffix, alongside it
           (db.sqlite -> db-scrubbed.sqlite)

  --drop-unused  also drop gameplay tables src/utils/db.ts never queries (smaller file,
                 but breaks any feature that later wants them)
  --force        overwrite an existing output file`);
}

/** Tables whose names never appear as an identifier in db.ts. Mirrors the comm(1) recipe in DB.md. */
function unusedTables(tables) {
  const dbTs = fs.readFileSync(path.join(rootDir, 'src', 'utils', 'db.ts'), 'utf8');
  const referenced = new Set(dbTs.match(/\b[a-z_][a-z0-9_]*\b/g) || []);
  return tables.filter((t) => !referenced.has(t));
}

function fmtSize(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) return usage();

  const input = path.resolve(opts.positional[0] || DEFAULT_INPUT);
  const output = path.resolve(opts.positional[1] || scrubbedName(input));

  if (!fs.existsSync(input)) {
    console.error(`No database at ${input}\nSee manual-db-sqlite.md, or run: npm run db:find`);
    process.exit(1);
  }
  if (path.resolve(input) === path.resolve(output)) {
    console.error('Refusing to sanitize in place — give a different output path.');
    process.exit(1);
  }
  if (fs.existsSync(output) && !opts.force) {
    console.error(`${output} already exists. Pass --force to overwrite.`);
    process.exit(1);
  }

  // A populated -wal means the file on disk isn't the whole story; sql.js only reads the main db.
  const wal = `${input}-wal`;
  if (fs.existsSync(wal) && fs.statSync(wal).size > 0) {
    console.warn(`Warning: ${path.basename(wal)} is non-empty — close the companion app and let it checkpoint,\n` +
                 `         or the sanitized copy may be missing recent writes.\n`);
  }

  console.log('=== Sanitizing companion-app database ===\n');
  const srcStat = fs.statSync(input);
  console.log(`Source: ${input}`);
  console.log(`        ${fmtSize(srcStat.size)}, modified ${srcStat.mtime.toISOString().replace('T', ' ').slice(0, 16)}`);

  const SQL = await initSqlJs({
    locateFile: (file) => path.join(rootDir, 'node_modules', 'sql.js', 'dist', file),
  });
  const db = new SQL.Database(fs.readFileSync(input));

  try {
    const version = db.exec('SELECT MAX(dataVersion) FROM metadata');
    if (version.length) console.log(`        dataVersion ${version[0].values[0][0]}`);
  } catch {
    // metadata is absent or shaped differently in some extractions; not worth failing over.
  }

  const tables = db
    .exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .flatMap((r) => r.values.map((v) => String(v[0])));

  const rowCount = (t) => {
    const res = db.exec(`SELECT count(*) FROM "${t}"`);
    return res.length ? Number(res[0].values[0][0]) : 0;
  };

  const personal = tables.filter(
    (t) => !ALWAYS_KEEP.has(t) && PERSONAL_TABLE_PATTERNS.some((re) => re.test(t))
  );
  const extra = opts.dropUnused
    ? unusedTables(tables).filter((t) => !ALWAYS_KEEP.has(t) && !personal.includes(t))
    : [];

  const report = (label, list) => {
    if (!list.length) return;
    console.log(`\n${label} (${list.length}):`);
    for (const t of list) {
      const n = rowCount(t);
      console.log(`  - ${t}${n ? `  (${n} row${n === 1 ? '' : 's'} removed)` : ''}`);
    }
  };

  report('Dropping personal / app-state tables', personal);
  report('Dropping tables db.ts never queries (--drop-unused)', extra);

  db.run('PRAGMA foreign_keys = OFF');
  for (const t of [...personal, ...extra]) {
    db.run(`DROP TABLE IF EXISTS "${t}"`);
  }

  // Views and triggers can outlive the tables they reference; clear any that are now dangling.
  const survivors = new Set(tables.filter((t) => !personal.includes(t) && !extra.includes(t)));
  const orphans = db
    .exec("SELECT type, name, tbl_name FROM sqlite_master WHERE type IN ('trigger','view')")
    .flatMap((r) => r.values)
    .filter(([, , tbl]) => !survivors.has(String(tbl)));
  for (const [type, name] of orphans) {
    console.log(`  - dropping dangling ${type}: ${name}`);
    db.run(`DROP ${String(type).toUpperCase()} IF EXISTS "${name}"`);
  }

  const integrity = db.exec('PRAGMA integrity_check');
  const verdict = integrity.length ? String(integrity[0].values[0][0]) : 'unknown';
  if (verdict !== 'ok') {
    console.error(`\nIntegrity check failed: ${verdict}`);
    process.exit(1);
  }

  db.run('VACUUM');
  const buf = Buffer.from(db.export());
  db.close();

  fs.writeFileSync(output, buf);

  // Verify against the file we actually wrote, not in-memory state.
  const check = new SQL.Database(fs.readFileSync(output));
  const leftover = check
    .exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .flatMap((r) => r.values.map((v) => String(v[0])))
    .filter((t) => PERSONAL_TABLE_PATTERNS.some((re) => re.test(t)) && !ALWAYS_KEEP.has(t));
  check.close();

  if (leftover.length) {
    console.error(`\nSanitize failed — personal tables still present: ${leftover.join(', ')}`);
    process.exit(1);
  }

  console.log(`\n✅ Wrote ${output} (${fmtSize(buf.length)})`);
  console.log(`   ${survivors.size} tables kept, ${personal.length + extra.length} dropped.`);
  console.log('\nNote: this removes *your* data. The result still contains Games Workshop');
  console.log('game content — sanitizing does not make it yours to redistribute publicly.');
}

main().catch((err) => {
  console.error('Sanitize failed:', err);
  process.exitCode = 1;
});
