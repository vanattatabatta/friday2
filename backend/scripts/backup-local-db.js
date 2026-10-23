"use strict";
/* npm run db:backup -> copies backend/data/pglite to backend/data/backups/pglite-<timestamp> (stop the server first). */
const fs = require("fs"), path = require("path");
const src = path.resolve(process.env.PGLITE_DIR || path.join(__dirname, "..", "data", "pglite"));
if (!fs.existsSync(src)) { console.error("No local database found at " + src); process.exit(1); }
const lock = path.join(path.dirname(src), "pglite.lock");
if (fs.existsSync(lock)) { try { process.kill(parseInt(fs.readFileSync(lock, "utf8"), 10), 0); console.error("The server is running. Stop it first (Ctrl+C), then run the backup."); process.exit(1); } catch {} }
const dest = path.join(path.dirname(src), "backups", "pglite-" + new Date().toISOString().replace(/[:.]/g, "-"));
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.cpSync(src, dest, { recursive: true });
console.log("Backup saved: " + dest);
