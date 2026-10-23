# Backups + your own mail sender 

## 1. Backups (Admin console > Backup, main admin only)
- Contains: every database table (library documents, static pages, users, orders...) as JSON + all website files. `.env` files are never included.
- Buttons: **Back up now & email**, **Download backup**, **Send test email**. Set one or more email addresses and tick **Automatic backups**.
- Automatic: checks every N hours and only sends when something changed (new library documents, pages, orders). Server checks 2 min after start, then every 15 min.
- Extra places: Telegram (`TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`, up to 50 MB), and the Download button.
- Files larger than `BACKUP_MAX_EMAIL_MB` (default 17, because email adds ~33%) are not attached; download them from Admin > Backup.
- `BACKUP_PASSPHRASE=...` encrypts it (`.zip.enc`). Open: `node backend/scripts/backup-tools.js decrypt file.zip.enc`.
- Restore: unzip, then `node backend/scripts/restore-backup.js <folder>/database`; copy `website/` over the project.
- Railway wipes the `backups/` folder on every deploy, so the emailed/Telegram copy is your real backup.

## 2. Sending email with your own relay
Pick ONE in the website's environment variables:

**A. Relay on your own PC/VPS (recommended)**
1. On the PC: `cd backend && npm install`, create `backend/.env` with
   `MAIL_RELAY_TOKEN=<long random>`, `SMTP_USER=you@gmail.com`, `SMTP_PASS=<Google App Password>`, `MAIL_FROM="Expert Help <you@gmail.com>"`
   then `node scripts/mail-relay.js` (listens on 127.0.0.1:8025). With SMTP_USER/PASS it sends through Gmail (port 587, usually open at home).
   Without them it delivers straight to the recipient's mail server (needs open outbound port 25 + DKIM/SPF, see C).
2. Make it reachable over HTTPS: Cloudflare Tunnel or ngrok to `http://127.0.0.1:8025`.
3. On the website host set: `MAIL_PROVIDER=relay`, `MAIL_RELAY_URL=https://your-tunnel-url`, `MAIL_RELAY_TOKEN=<same token>`.
   The PC must be on when emails go out.

**B. Direct from the website** `MAIL_PROVIDER=direct` – only works where outbound port 25 is open (not Railway).

**C. Direct delivery DNS**: `node backend/scripts/make-dkim.js yourdomain.com` prints the DKIM/SPF/DMARC records; set reverse DNS to `MAIL_HELO`. Without these, Gmail will spam-folder it.

Everything (account emails, admin credentials, live chat, backups) uses the same mailer, so switching provider switches all of them.

## Clear steps for the PC mail relay (Gmail mode)
1. Gmail: turn on 2-Step Verification, then Google Account > Security > App passwords > create one (16 letters).
2. On your PC install Node.js (nodejs.org). Open the `support/backend` folder in a terminal and run `npm install`.
3. In `support/backend` create a file named `.env` (relay machine only) containing:
   MAIL_RELAY_TOKEN=any-long-random-text-20+-characters
   SMTP_USER=you@gmail.com
   SMTP_PASS=your16letterapppassword
   MAIL_FROM="Expert Help <you@gmail.com>"
4. Run `node scripts/mail-relay.js`. It should print "Mail relay listening ... mode=smtp". Leave this window open.
5. Second terminal: install cloudflared (or ngrok) and run `cloudflared tunnel --url http://127.0.0.1:8025` (ngrok: `ngrok http 8025`). Copy the https://....trycloudflare.com address it prints. (Quick tunnels change address on restart; a named tunnel keeps a fixed one.)
6. On your website host (Railway > Variables) add: MAIL_PROVIDER=relay, MAIL_RELAY_URL=<the https address>, MAIL_RELAY_TOKEN=<same token as step 3>. Redeploy.
7. Admin > Backup > "Send test email". If it arrives, everything works. If the PC or tunnel is off, emails fail until it is back on.

## Automatic backups
Admin > Backup: tick "Automatic backups", choose 1 hour / 3 / 6 / 12 hours / day / 3 days / week. Untick "Only when something changed" to get one every interval regardless. "Back up now & email" and "Download backup" work any time.
