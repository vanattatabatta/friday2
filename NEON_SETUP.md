# Keep your data on every deploy (Neon database)

The live site normally stores everything in a folder on the web server. On Render's free plan that folder is
erased on every deploy / restart. With `DATABASE_URL` set, the site stores everything in a Neon PostgreSQL
database instead. Neon is a separate service, so deploying the website never touches it.

| `DATABASE_URL` | Database used |
|---|---|
| empty (your laptop) | built-in PGlite folder `backend/data/pglite` |
| set (live site) | Neon PostgreSQL |

## 1. Create the Neon database (once)
1. neon.com > sign up > create a project (pick the region closest to your Render region).
2. Open the project > **Connect** > turn ON "Connection pooling" and copy the connection string. It looks like
   `postgresql://user:password@ep-xxxx-pooler.region.aws.neon.tech/neondb?sslmode=require`

## 2. Copy your existing data into Neon (once)
Do this BEFORE the first deploy with Neon. Stop the local server first (Ctrl+C).
```
npm install                       # installs the new "pg" driver and updates package-lock.json
npm install --prefix backend
```
Put the connection string in `backend/.env` as `DATABASE_URL=...` (this file is never deployed), then run ONE of:
```
npm run db:migrate                                         # from your local data folder (backend/data/pglite)
npm run db:migrate -- --from-backup C:\path\db-latest.tar.gz   # from a backup downloaded in Admin > Backup
```
It creates every table in Neon, copies all rows (documents, pages, users, orders, chats...), fixes the id counters and
compares row counts table by table. It prints `OK` at the end. It is safe to run again: existing rows are skipped.
If the backup is encrypted, set BACKUP_PASSPHRASE first.

## 3. Point the live site at Neon
In Render > your service > **Environment**:
- Add `DATABASE_URL` = the Neon connection string.
- DELETE `PGLITE_DIR` (not used any more) and make sure `PGLITE_FORCE_SEED` is not set.
- Keep `JWT_SECRET` the same as before, plus your other keys.
Then push the code to GitHub (commit the new/changed files, NOT backend/.env) and deploy. The log must show:
`[DB] external PostgreSQL: ep-xxxx-pooler... (data is kept outside the web server)`

From now on every upload is saved in Neon and every deploy keeps it.

## Good to know
- Admin > Backup (emailed .zip) keeps working. The "live file backup" and "Restore from a backup file" are only for the
  built-in database and are switched off when `DATABASE_URL` is set. Neon keeps its own history (Neon console > Branches / Restore).
- Free Neon: 1 GB of storage per project. Uploaded documents and page images are stored in the database and are the big part.
  Check the size any time at /api/admin/db-usage (signed in as main admin); the server log also prints it at start.
  Moving files to object storage (e.g. Cloudflare R2) is the next step if it fills up.
- Free Neon puts the database to sleep when idle; the first request after a pause takes a few seconds. The site retries
  read queries once automatically. `PG_IDLE_MS` (default 20000) controls how fast idle connections are closed.
- Render free also sleeps and has 512 MB RAM. Upload one document at a time.
- Never put real keys in files you share or commit. `.env` and `backend/.env` are for your computer only.

## Free plan limits (Neon, checked Oct 2026) and the settings that protect them
Neon Free: 100 compute-hours per month, 1 GB storage, 5 GB network transfer per month, compute sleeps after 5 minutes without queries
(cannot be changed). Reaching a limit never deletes data: compute-hours or transfer used up = the database is unavailable until the
next monthly period; storage full = new writes fail.

Compute-hours are used only while the database is awake, so the goal is to let it sleep. Set these in Render > Environment:
| Variable | Value | Why |
|---|---|---|
| `SITEMAP_SWEEP_MINUTES` | `720` | background sitemap check wakes the database this often (default is now 720) |
| `CITATION_PUBLISH_CHECK_MINUTES` | `720` | same, for citation publishing (default is now 360 with Neon) |
| `BACKUP_EVERY_HOURS` | `168` | automatic backup weekly (default is now 168 with Neon); a backup reads the whole database |
| `BACKUP_LEAN` | leave unset | with Neon the automatic backup leaves out library files and page images (saves transfer and RAM). `0` = full |
| `IMG_CACHE_MAX` | `300` | page previews kept in memory; every miss reads the page image from Neon again |
| `PG_POOL_MAX` | `5` | few connections are enough |
| `DB_STORAGE_LIMIT_MB` | `1024` | used for the size warning |
Already efficient in the code: the live-chat sweep and the backup timer do not query the database when there is nothing to do.
Put Cloudflare in front of the site (see CLOUDFLARE_CDN_SETUP.md) so public pages and images are served from its cache, not from Neon.

## Downloading the latest data from Neon
- Admin > Backup > "Download database" gives every table as JSON in a .zip (complete, with files). It is built in the server's
  memory, so use it while the data is small (roughly under 150 MB on a 512 MB server).
- Any size: `pg_dump "postgresql://USER:PASSWORD@ep-xxxx.REGION.aws.neon.tech/neondb?sslmode=require" -Fc -f neon-backup.dump`
  (use the DIRECT host: the connection string without `-pooler`; the pg_dump version must be at least Neon's Postgres version).
  Restore with `pg_restore --no-owner -d "<connection string>" neon-backup.dump`.
  Each download reads the whole database and counts toward the 5 GB monthly transfer, so do it weekly, not daily.
- Neon also keeps a short history you can restore from (Neon console > Backup & Restore); check the window on your plan.
