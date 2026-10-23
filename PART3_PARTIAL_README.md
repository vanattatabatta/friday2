# Support app - updated complete project

On top of your support.7z:
- Upload list inside one box; all files are sent at the same time (server converts `UPLOAD_CONCURRENCY`=4 at once, rest wait their turn).
- GitHub backup deleted. Database-in-repo commands removed: `npm run db:seed`, make-seed.js, seedImport.js, seed-data/, "Download deploy seed" button, /api/admin/db-seed. Guides and .env examples cleaned.
- Live backup (Admin > Backup): saved about a minute after anything changes, hourly (24) and daily (7) copies, download any copy any time, back up now, restore from a file.
- NEW: admin created on your laptop. `npm run create-admin` writes backend/admin-account.json (username + bcrypt hash, no password) that deploys with the site; the server re-creates that admin at every start (deploy, restore, empty DB). Nothing to set on the host. Keep the repo private.
- Fallback: one-time first-admin setup for hosts with no shell. Set `ADMIN_SETUP_TOKEN` (12+ chars) on the host, open /admin/, fill the "First-time setup" form, then DELETE the variable. Works only while no admin exists.
- That admin file wins: a password changed inside the panel is reverted at the next start; re-run create-admin and deploy again instead.
- Not in this zip: `.env`, `node_modules`, `backend/data` (your database), `.git`. Keep your own.

Tested on a real server with a real database:
- backup endpoints need login (401 without); status, back up now, download (gzip) work; wrong confirmation refused; seed route gone (404)
- restore of a downloaded file replaced the data (an admin created later disappeared); the old data is kept as pglite.before-restore-...
- wiping the data folder and starting again restored the newest live backup automatically
- first-admin setup: wrong token, short password, success, second attempt refused (404), login works

NOT tested: a real multi-file upload in the browser (sharp / LibreOffice are not installed in my sandbox). Please try 4+ files after deploy.
Without a persistent disk the host erases data on every deploy: download the backup from Admin > Backup regularly.
