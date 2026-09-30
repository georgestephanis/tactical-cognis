# Manually extracting the WH 40K app's SQLite database

These steps pull a copy of the live game-data database out of the **Warhammer
40,000** companion app (running on a Mac via "iPad apps on Mac"), using only
built-in command-line tools — no extra scripts needed.

`npm run db:find` automates exactly this (steps 1 and 2) and drops the result
at `public/40k.sqlite`. Read on if you want to do it by hand or it can't find
your container automatically.

## Requirements

- A Mac with the WH 40K app installed and launched **at least once**
  (bundle id `com.gamesworkshop.w40k`)
- Terminal access

## Steps

### 1. Find the app's database file

The app stores its data in a sandboxed container with a random ID, so first
locate it:

```bash
find ~/Library/Containers -iname db.sqlite -path '*Application Support*' 2>/dev/null
```

This should print a path like:

```
/Users/you/Library/Containers/ABCD1234-XXXX-XXXX-XXXX-XXXXXXXXXXXX/Data/Library/Application Support/db.sqlite
```

If it prints more than one result, confirm which one belongs to WH 40K by
checking for a matching Caches folder next to it:

```bash
ls "/Users/you/Library/Containers/<the-uuid-from-above>/Data/Library/Caches/com.gamesworkshop.w40k/"
```

Only the correct container will have that folder.

### 2. Copy the database out safely

**Do not** just copy the `db.sqlite` file directly (e.g. with `cp`). The
database uses "WAL mode," which means recent data can be sitting in extra
`db.sqlite-wal` / `db.sqlite-shm` files next to it — a plain file copy can
give you a stale or broken snapshot.

Instead, use SQLite's own backup command, which merges everything into one
clean file and opens the source **read-only** (so it's impossible to
accidentally modify the app's real data):

```bash
sqlite3 "file:/Users/you/Library/Containers/<uuid>/Data/Library/Application Support/db.sqlite?mode=ro" \
  ".backup '/Users/you/Desktop/db.sqlite'"
```

Replace `<uuid>` with the container ID found in step 1, and adjust the
destination path (`/Users/you/Desktop/db.sqlite`) to wherever you want the
copy saved.

### 3. Verify it worked

```bash
sqlite3 /Users/you/Desktop/db.sqlite "SELECT DISTINCT dataVersion FROM metadata;"
sqlite3 /Users/you/Desktop/db.sqlite ".tables"
```

The first command should print a version number; the second should list a
long set of table names (`datasheet`, `miniature`, `wargear_item`, etc.). If
both work, you have a complete, self-contained copy of the app's database.

## Notes

- This is a personal, offline extraction of data already shipped to your own
  device, for interoperability/reference purposes.
- The output is a fully independent `.sqlite` file — it does not affect or
  sync with the live app in any way.
