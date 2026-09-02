const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.join(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
// Backups are stashed outside public/ so Vite never copies them into the build.
const stashDir = path.join(rootDir, '.db-stash');

// Anything that is, or belongs to, a SQLite database. `-wal`/`-shm`/`-journal`
// sidecars appear whenever the DB is opened by a tool that doesn't checkpoint on
// close (a `sqlite3` shell session, the companion app itself), and they are just
// as much game data as the `.sqlite` file — they must never reach the bundle.
const DB_FILE_RE = /\.(sqlite|sqlite3|db)(-wal|-shm|-journal)?$|\.bak$/i;

console.log("=== Packaging IP-Free Distributable Application ===\n");

// 1. Temporarily hide every local database file from compilation.
const stashed = [];
if (fs.existsSync(publicDir)) {
  const dbFiles = fs.readdirSync(publicDir).filter(f => DB_FILE_RE.test(f));
  if (dbFiles.length > 0) {
    fs.mkdirSync(stashDir, { recursive: true });
    console.log(`Hiding ${dbFiles.length} local database file(s) to prevent IP leakage...`);
    dbFiles.forEach(f => {
      const from = path.join(publicDir, f);
      const to = path.join(stashDir, f);
      fs.renameSync(from, to);
      stashed.push({ from, to });
    });
  }
}

try {
  // 2. Compile Vite client application
  console.log("Compiling production React assets...");
  execSync('npm run build', { cwd: rootDir, stdio: 'inherit' });

  // 3. Move dist to dist-distributable
  const distPath = path.join(rootDir, 'dist');
  const distDistPath = path.join(rootDir, 'dist-distributable');

  if (fs.existsSync(distDistPath)) {
    console.log("Cleaning old distributable folder...");
    fs.rmSync(distDistPath, { recursive: true, force: true });
  }

  console.log("Creating dedicated distributable build folder...");
  fs.renameSync(distPath, distDistPath);

  // 4. Sweep the output for any database file that still slipped through.
  const distFiles = fs.readdirSync(distDistPath, { recursive: true });
  distFiles.forEach(f => {
    const rel = String(f);
    if (DB_FILE_RE.test(path.basename(rel))) {
      console.log(`Removing compiled data file to prevent IP leakage: ${rel}`);
      fs.unlinkSync(path.join(distDistPath, rel));
    }
  });

  // 5. Re-scan and fail the build if anything matched — the "no game data"
  // guarantee is the whole point of this script, so it must be asserted, not
  // assumed. A stale bundle is far better than a bundle that ships GW IP.
  const leftovers = fs.readdirSync(distDistPath, { recursive: true })
    .map(String)
    .filter(f => DB_FILE_RE.test(path.basename(f)));
  if (leftovers.length > 0) {
    throw new Error(
      `Refusing to publish: database files remain in the bundle:\n  ${leftovers.join('\n  ')}`
    );
  }

  console.log("\n🎉 IP-Free distribution bundle generated successfully!");
  console.log(`  Output directory: ${distDistPath}`);
  console.log(`  Verified: no .sqlite/.db files or -wal/-shm/-journal sidecars present.`);

} catch (err) {
  console.error("Compilation failed:", err);
  process.exitCode = 1;
} finally {
  // 6. Restore the local databases for development, whatever happened above.
  if (stashed.length > 0) {
    console.log(`Restoring ${stashed.length} local database file(s) for development...`);
    stashed.forEach(({ from, to }) => {
      if (fs.existsSync(to)) fs.renameSync(to, from);
    });
    if (fs.existsSync(stashDir) && fs.readdirSync(stashDir).length === 0) {
      fs.rmdirSync(stashDir);
    }
  }
}
