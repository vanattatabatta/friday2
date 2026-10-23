# Built-in database (PGlite)

PGlite is real PostgreSQL running inside Node.js. Your SQL is unchanged. Data lives in `backend/data/pglite`
(inside the project folder). No setup or environment variable is needed.

## One-time setup (Windows PowerShell, project root = the folder with package.json)
```powershell
node -v                                   # needs Node 18 or newer
npm install                               # site dependencies (includes @electric-sql/pglite)
npm run install-backend                   # backend dependencies
npm run db:setup                          # writes backend\.env, creates the database and all tables
npm run create-admin                      # asks for the admin username + password
npm start                                 # open http://localhost:3000
```

## Daily use
```powershell
npm start                                 # start the site (database starts with it)
npm run db:check                           # tables + row counts  (stop the server first)
npm run db:backup                          # copies the data folder to backend\data\backups (stop the server first)
npm run db:reset -- --yes                  # DELETES all local data
```
Only ONE program may open the data folder at a time. If you see "already open in another program", press Ctrl+C in the
window running `npm start` and retry. Close the server with Ctrl+C (not by closing the window) so data is saved cleanly.

## Admin accounts (main admin, admins, managers)
- The FIRST admin you create (`npm run create-admin`) is the **main admin**.
- Sign in at `/admin/`, open **Admins**: create admins or managers (username + email + password or auto-generated),
  email them their sign-in details, reset passwords, disable, edit or **delete** them.
  Admin = every tool except managing accounts. Manager = orders, live chat and visitors only.
- Everyone can change their own password under **Admins > Change my password**. New and reset accounts must change the
  emailed password at first sign-in. Emails need `MAIL_PROVIDER=relay` + `MAIL_RELAY_URL` + `MAIL_RELAY_TOKEN` + `MAIL_FROM` (or SMTP_*); without it the password is shown
  on screen so you can share it yourself.

## Deploy on Railway with the file database (no Neon, no admin password in variables)
1. On your PC: `npm run db:reset -- --yes`, `npm run db:setup`, `npm run create-admin` (clean database + your main admin),
   then start the server. The database is never put in GitHub.
2. Railway > service > **Settings > Volumes > Add Volume**, mount path `/data`.
3. Variables: `JWT_SECRET` (long random value). One replica only.
4. Deploy. After the first start, restore your data in Admin > Backup > Restore from a backup file (data lives in `/data/pglite`).
5. Log in at `https://YOUR-APP.up.railway.app/admin/` with the admin you created on your PC, and create the others from **Admins**.
If a Volume already holds an empty database from an earlier deploy, add `PGLITE_FORCE_SEED=1` for ONE deploy (it replaces the
data folder with the seed), then remove it. Backups: Volume > Backups in Railway.

## Limits
PGlite is one connection: ideal for a single-owner site on one server/replica. Do not run two copies of the site on the same data folder.
