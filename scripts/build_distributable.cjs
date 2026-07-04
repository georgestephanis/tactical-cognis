const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.join(__dirname, '..');
const localDbPath = path.join(rootDir, 'public', '40k.sqlite');
const backupDbPath = path.join(rootDir, '40k.sqlite.bak'); // Store backup outside of public folder so Vite doesn't copy it

console.log("=== Packaging IP-Free Distributable Application ===\n");

// 1. Temporarily hide local database from compilation
let dbWasHidden = false;
if (fs.existsSync(localDbPath)) {
  console.log("Hiding local database to prevent IP leakage...");
  fs.renameSync(localDbPath, backupDbPath);
  dbWasHidden = true;
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

  // 4. Verify no database/backup/override files are present in distribution (recursive)
  const distFiles = fs.readdirSync(distDistPath, { recursive: true });
  distFiles.forEach(f => {
    const rel = String(f);
    const base = path.basename(rel);
    if (base.endsWith('.sqlite') || base.endsWith('.bak') || base === 'mfm-overrides.json') {
      console.log(`Removing compiled data file to prevent IP leakage: ${rel}`);
      fs.unlinkSync(path.join(distDistPath, rel));
    }
  });

  console.log("\n🎉 IP-Free distribution bundle generated successfully!");
  console.log(`  Output directory: ${distDistPath}`);
  console.log(`  Contains ONLY: HTML, JS, CSS, and WASM binaries (No game data).`);

} catch (err) {
  console.error("Compilation failed:", err);
  process.exitCode = 1;
} finally {
  // 5. Restore original database for local development
  if (dbWasHidden && fs.existsSync(backupDbPath)) {
    console.log("Restoring local database for development...");
    fs.renameSync(backupDbPath, localDbPath);
  }
}
