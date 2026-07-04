const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

// ponytail: darwin-only scan of the companion app's sandbox, same as manual-db-sqlite.md's manual steps

function findCompanionDb() {
  const containersPath = path.join(os.homedir(), 'Library', 'Containers');
  if (!fs.existsSync(containersPath)) return null;

  const containers = fs.readdirSync(containersPath);

  const candidates = containers
    .map((dir) => path.join(containersPath, dir, 'Data', 'Library', 'Application Support', 'db.sqlite'))
    .filter((dbPath) => fs.existsSync(dbPath));

  // Prefer the one whose sandbox also has the companion app's cache dir
  const confirmed = candidates.find((dbPath) =>
    fs.existsSync(path.join(path.dirname(path.dirname(path.dirname(dbPath))), 'Caches', 'com.gamesworkshop.w40k'))
  );

  return confirmed || candidates[0] || null;
}

const dbPath = findCompanionDb();
if (!dbPath) {
  console.log('No companion app database found under ~/Library/Containers.');
  console.log('Launch the WH40k companion app at least once, or see manual-db-sqlite.md to extract manually.');
  process.exit(0);
}

console.log(`Found companion database: ${dbPath}`);

const destPath = path.join(__dirname, '..', 'public', '40k.sqlite');
fs.mkdirSync(path.dirname(destPath), { recursive: true });

try {
  // Use sqlite3's .backup (not a raw file copy) since the live db is often split across WAL journal files.
  execFileSync('sqlite3', [`file:${dbPath}?mode=ro`, `.backup ${destPath}`]);
  console.log(`Copied to ${destPath}`);
} catch (err) {
  console.error('Failed to back up the database with sqlite3:', err.message);
  process.exit(1);
}
