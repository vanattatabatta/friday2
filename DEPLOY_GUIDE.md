# Deploy guide - built-in database (PGlite), live backups in the admin

The site uses the built-in PGlite database (PostgreSQL inside Node.js). There is no database server, no `DATABASE_URL`, no Docker Compose.
Library documents, static pages, users, orders and chats are rows in that database, stored in the data folder (`/data/pglite` on a Railway Volume).

## First deploy
1. On your laptop: `npm install && npm run install-backend`, then **`npm run create-admin`** (stop the local server first). It asks for the admin username and password, creates the admin in your local database and writes `backend/admin-account.json` (username + bcrypt hash, never the password). Remember the password: it is stored nowhere else. The database itself stays on your laptop and is never pushed to GitHub (`backend/data` is in `.gitignore`).
2. Push the code (not the database) to a PRIVATE GitHub repo; `backend/admin-account.json` goes with it, so the same admin works on the live site at every start, after restores and on an empty database. Railway > New project > Deploy from GitHub repo (the `Dockerfile` is used).
3. Railway > service > Settings > Volumes > Add Volume, mount path `/data`.
4. Variables: `JWT_SECRET` (long random text) plus your mail / Groq / Stripe keys (see `.env.example`). One replica only.
5. Open `https://YOUR-APP.up.railway.app/admin/`.

## Updating the website later
Commit and push to GitHub; Railway redeploys. The Volume keeps the database, so data is never lost by a code update.

## Backups
- Admin > Backup: automatic emailed .zip (every table as JSON + website files); download any time. Set `BACKUP_PASSPHRASE` to encrypt.
- Railway > Volume > Backups.
See `README_LOCAL_DB.md` and `KEEP_DATA_ON_RAILWAY.md` for details.

## Keeping your documents and pages on every deploy (no GitHub, no outside database)
The database lives in the data folder of the server (`PGLITE_DIR`). Nothing is sent to any third party.

**1. Put the data on a persistent disk (this is what makes a deploy lose nothing).**
- Render: service > Disks > Add Disk, mount path `/var/data`. Then set `PGLITE_DIR=/var/data/pglite`. (Disks need a paid Render plan.)
- Railway: add a Volume at `/data` (used automatically).
With the disk, the database survives deploys and restarts by itself, and the live backups sit next to it (`/var/data/live-backups`).

**2. Live backup every minute (Admin > Backup > "Live database backup").**
- About one minute after anything changes (documents, pages, users, orders, chats) the whole database is saved as `db-latest.tar.gz`.
  An hourly copy (last 24) and a daily copy (last 7) are kept, and one more snapshot is taken when the server stops.
- **Download latest database backup** gives you the file at any time. Keep copies on your computer: that is your protection if the host ever loses the disk.
- A backup is never replaced by a database that suddenly has less than half the rows (it shows BLOCKED; "Back up now" overrides on purpose).
- Set `BACKUP_PASSPHRASE` to encrypt the files (keep that secret somewhere safe: without it a backup cannot be opened).

**3. After a fresh deploy that came up EMPTY (for example a host without a disk)**
- If the live-backups folder survived (it sits on the disk), the site restores `db-latest` by itself before it opens.
- Otherwise open `/admin/` (create the admin again with `npm run create-admin` if needed) > Backup > **Restore from a backup file**, choose the `db-latest.tar.gz`
  you downloaded, type RESTORE and confirm. The current data is saved first (`db-before-restore-...`), the server restarts once and everything is back.

Limits: the free Render plan has no disk and about 512 MB of memory, so on that plan the only copy that survives a deploy is the one you download
(download after each busy day) and restore as in step 3. Anything uploaded in the last minute before a crash (not a normal stop) can be missing.

Moving the CURRENT live data into this system: on the OLD site use Admin > Backup > "Download live database (all tables)" (a .zip of JSON files) and keep it.
After the first deploy of this version, restore it with `node backend/scripts/restore-backup.js <unzipped-folder>/database` on a computer that has the project, then use "Download latest database backup" to keep the new snapshot.

## Other options
**Persistent Disk (paid Render plan).** Mount a disk at `/var/data` and set `PGLITE_DIR=/var/data/pglite`; then the data survives deploys by itself (the live backups stay next to it).
