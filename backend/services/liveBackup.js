"use strict";
/*
 * Live database backup, kept on the server and managed from Admin > Backup. NOTHING is sent to GitHub or any other third party.
 *
 *   - every LIVE_BACKUP_EVERY_SEC seconds (default 60) it checks cheaply whether anything changed (documents, pages, users, orders,
 *     chats ...). When something changed, the whole database is saved as  db-latest.tar.gz  (a gzip snapshot of the PostgreSQL data folder).
 *   - once an hour a copy is kept (last LIVE_KEEP_HOURLY = 24), once a day a copy is kept (last LIVE_KEEP_DAILY = 7), so a bad
 *     change can be undone. A snapshot is also taken when the server stops (deploy / restart).
 *   - Admin > Backup > "Download latest database backup" downloads the newest snapshot at any time (or any kept copy).
 *   - Admin > Backup > "Restore from a backup file" loads a downloaded snapshot back into the site (the server restarts once).
 *   - When the server starts with an EMPTY data folder it restores db-latest automatically (when the backup folder survived the deploy).
 *
 * Where the files live: LIVE_BACKUP_DIR, default  <folder next to the database folder>/live-backups  (so with PGLITE_DIR=/var/data/pglite
 * the backups are in /var/data/live-backups, on the same persistent disk). A host WITHOUT a persistent disk erases both on every deploy:
 * then download the backup from the admin (or restore the downloaded file after the deploy).
 *
 * BACKUP_PASSPHRASE (optional) encrypts the snapshot with AES-256-GCM (the same passphrase is needed to restore it).
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const env = (k, d = "") => String(process.env[k] == null ? d : process.env[k]).trim();
const num = (k, d, min) => Math.max(min, Number(env(k, String(d))) || d);
const PASS = () => env("BACKUP_PASSPHRASE");
const EVERY_MS = () => num("LIVE_BACKUP_EVERY_SEC", 60, 10) * 1000;
const FORCE_MS = () => num("LIVE_BACKUP_FORCE_MIN", 60, 5) * 60000;   /* take a snapshot at least this often even if nothing seems to have changed */
const KEEP_HOURLY = () => num("LIVE_KEEP_HOURLY", 24, 1);
const KEEP_DAILY = () => num("LIVE_KEEP_DAILY", 7, 1);
const SKIP_FP = new Set(["backup_settings", "chat_usage", "tool_free_uses", "sitemap_seen", "seed_import_log"]);   /* noisy tables: never trigger a snapshot alone */

const MAGIC = Buffer.from("AHL1");
const state = { lastRun: null, lastOk: null, lastStatus: "", lastBytes: 0, lastTotal: 0, lastFp: null, busy: false, timer: null, skipFlush: false, snaps: 0 };

/* ---------- folders (no database needed: the database adapter calls these before it opens) ---------- */
function liveDir() {
  if (env("LIVE_BACKUP_DIR")) return path.resolve(env("LIVE_BACKUP_DIR"));
  const { DATA_DIR } = require("../config/pgliteAdapter");
  return path.join(path.dirname(DATA_DIR), "live-backups");
}
const latestFile = (enc) => path.join(liveDir(), "db-latest.tar.gz" + (enc ? ".enc" : ""));
const metaFile = () => path.join(liveDir(), "db-latest.json");
const pendingFile = () => path.join(liveDir(), "restore-pending.bin");

/* ---------- encryption ---------- */
const key = (salt) => crypto.scryptSync(PASS(), salt, 32);
function encrypt(buf) {
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", key(salt), iv);
  const body = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([MAGIC, salt, iv, c.getAuthTag(), body]);
}
function decrypt(buf) {
  if (!PASS()) throw new Error("This backup is encrypted. Set BACKUP_PASSPHRASE (the same one that was used when it was made) and try again.");
  const salt = buf.subarray(4, 20), iv = buf.subarray(20, 32), tag = buf.subarray(32, 48), d = crypto.createDecipheriv("aes-256-gcm", key(salt), iv);
  d.setAuthTag(tag);
  try { return Buffer.concat([d.update(buf.subarray(48)), d.final()]); } catch { throw new Error("The backup could not be decrypted: BACKUP_PASSPHRASE is wrong."); }
}
const isEnc = (buf) => buf.length > 48 && buf.subarray(0, 4).equals(MAGIC);
const isGzip = (buf) => buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b;
/* any backup file (encrypted or plain) -> the plain gzip snapshot; throws a readable error when it is not a database snapshot */
function toPlain(buf) {
  const plain = isEnc(buf) ? decrypt(buf) : buf;
  if (!isGzip(plain)) throw new Error("This file is not a database backup made by this site (expected db-latest.tar.gz).");
  return plain;
}

/* ---------- atomic file write ---------- */
function writeAtomic(file, buf) {
  const tmp = file + ".tmp-" + process.pid;
  fs.writeFileSync(tmp, buf); fs.renameSync(tmp, file);
}

/* ---------- what is in the database (cheap fingerprint + row counts) ---------- */
async function snapshotInfo() {
  const { query } = require("../config/database");
  const tabs = (await query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY 1")).rows.map((r) => r.table_name);
  const cols = (await query("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public' AND column_name IN ('id','updated_at')")).rows;
  const has = (t, c) => cols.some((x) => x.table_name === t && x.column_name === c);
  const counts = {}; let total = 0; const parts = [];
  for (const t of tabs) {
    if (SKIP_FP.has(t)) continue;
    const sel = ["COUNT(*) AS n"]; if (has(t, "id")) sel.push("MAX(id)::text AS mx"); if (has(t, "updated_at")) sel.push("MAX(updated_at)::text AS up");
    let r; try { r = (await query(`SELECT ${sel.join(",")} FROM "${t}"`)).rows[0]; } catch { continue; }
    counts[t] = Number(r.n) || 0; total += counts[t]; parts.push(t + ":" + r.n + ":" + (r.mx || "") + ":" + (r.up || ""));
  }
  return { counts, total, fp: crypto.createHash("sha1").update(parts.join("|")).digest("hex") };
}

/* ---------- take a snapshot ---------- */
const stampOf = (d) => d.toISOString().replace(/[-:]/g, "").slice(0, 13).replace("T", "-");   /* 20261023-0215 */
function prune(prefix, keep) {
  try {
    fs.readdirSync(liveDir()).filter((f) => f.startsWith(prefix)).sort().reverse().slice(keep).forEach((f) => { try { fs.unlinkSync(path.join(liveDir(), f)); } catch { /* ignore */ } });
  } catch { /* ignore */ }
}
function readMeta() { try { return JSON.parse(fs.readFileSync(metaFile(), "utf8")); } catch { return null; } }

async function snapshot({ reason = "auto", force = false } = {}) {
  if (String(process.env.DATABASE_URL || "").trim()) throw new Error("The live file backup is only used with the built-in database. The data is in an external PostgreSQL database (DATABASE_URL): use its own backups or Admin > Backup (emailed .zip).");
  if (state.busy) throw new Error("A backup is already running.");
  state.busy = true; state.lastRun = new Date().toISOString();
  try {
    const { pool } = require("../config/database");
    const info = await snapshotInfo(), prev = readMeta();
    /* never replace a good backup by a database that is suddenly much smaller (e.g. an empty disk after a bad deploy) */
    if (!force && prev && prev.total > 20 && info.total < prev.total * 0.5) {
      state.lastStatus = `BLOCKED: the database has ${info.total} rows but the last backup has ${prev.total}. The backup was NOT replaced. Use "Back up now" in Admin > Backup if the data really shrank on purpose.`;
      throw Object.assign(new Error(state.lastStatus), { blocked: true });
    }
    const raw = await pool.dump();
    const sha256 = crypto.createHash("sha256").update(raw).digest("hex"), encrypted = !!PASS(), buf = encrypted ? encrypt(raw) : raw;
    fs.mkdirSync(liveDir(), { recursive: true });
    const ext = ".tar.gz" + (encrypted ? ".enc" : ""), now = new Date();
    try { fs.unlinkSync(latestFile(!encrypted)); } catch { /* the other flavour (plain vs encrypted) is not kept */ }
    writeAtomic(latestFile(encrypted), buf);
    const meta = { created: now.toISOString(), reason, encrypted, bytes: buf.length, sha256, total: info.total, counts: info.counts, file: path.basename(latestFile(encrypted)) };
    writeAtomic(metaFile(), JSON.stringify(meta, null, 1));
    /* rolling history: one copy per hour and per day */
    const hour = path.join(liveDir(), "db-hourly-" + stampOf(now) + ext), day = path.join(liveDir(), "db-daily-" + stampOf(now).slice(0, 8) + ext);
    if (!fs.existsSync(hour)) { fs.copyFileSync(latestFile(encrypted), hour); prune("db-hourly-", KEEP_HOURLY()); }
    if (!fs.existsSync(day)) { fs.copyFileSync(latestFile(encrypted), day); prune("db-daily-", KEEP_DAILY()); }
    state.lastOk = meta.created; state.lastFp = info.fp; state.lastBytes = buf.length; state.lastTotal = info.total; state.snaps++;
    state.lastStatus = `OK: ${info.total} rows, ${(buf.length / 1048576).toFixed(1)} MB${encrypted ? ", encrypted" : ""} (${reason})`;
    return { ...meta, status: state.lastStatus };
  } catch (e) {
    if (!e.blocked) state.lastStatus = "ERROR: " + e.message;
    console.warn("[LIVE-BACKUP]", e.message);
    throw e;
  } finally { state.busy = false; }
}

/* ---------- scheduler ---------- */
async function tick() {
  if (state.busy) return;
  try {
    const info = await snapshotInfo(), now = Date.now(), last = state.lastOk ? Date.parse(state.lastOk) : 0;
    if (info.fp === state.lastFp && now - last < FORCE_MS()) return;
    await snapshot({ reason: info.fp === state.lastFp ? "hourly" : "changed" });
  } catch { /* the reason is kept in state.lastStatus and shown in Admin > Backup */ }
}
const external = () => !!String(process.env.DATABASE_URL || "").trim();
function start() {
  if (external()) { console.log("[LIVE-BACKUP] off: the data is in an external PostgreSQL database (DATABASE_URL). Use the provider's backups / Admin > Backup (emailed .zip)."); return; }
  clearInterval(state.timer);
  state.timer = setInterval(tick, EVERY_MS()); state.timer.unref();
  setTimeout(tick, 15000).unref();
  console.log(`[LIVE-BACKUP] database snapshot every ${EVERY_MS() / 1000}s when something changed -> ${liveDir()}`);
}
/* last snapshot before the server stops (deploy / restart) */
async function flush() {
  if (state.busy || state.skipFlush || external()) return;
  try { const i = await snapshotInfo(); if (i.fp !== state.lastFp) await snapshot({ reason: "shutdown" }); } catch { /* best effort */ }
}

/* ---------- used by the database adapter BEFORE the database opens ---------- */
/* a restore requested from the admin: returns the plain snapshot buffer (and retires the file), or null */
function takePendingRestore() {
  const f = pendingFile();
  if (!fs.existsSync(f)) return null;
  const buf = fs.readFileSync(f); let plain;
  try { plain = toPlain(buf); } catch (e) { try { fs.renameSync(f, path.join(liveDir(), "restore-failed-" + stampOf(new Date()) + ".bin")); } catch { /* ignore */ } throw e; }
  return { buf: plain, done: (ok) => { try { fs.renameSync(f, path.join(liveDir(), (ok ? "restored-" : "restore-failed-") + stampOf(new Date()) + ".bin")); } catch { /* ignore */ } } };
}
/* newest local snapshot for a fresh/empty data folder, or null */
function latestForEmptyStart() {
  for (const enc of [false, true]) {
    const f = latestFile(enc);
    if (fs.existsSync(f)) { try { return { buf: toPlain(fs.readFileSync(f)), meta: readMeta() }; } catch (e) { console.warn("[LIVE-BACKUP] latest backup could not be used:", e.message); } }
  }
  return null;
}

/* ---------- admin API helpers ---------- */
function listFiles() {
  let names = []; try { names = fs.readdirSync(liveDir()); } catch { return []; }
  return names.filter((f) => /^db-(latest|hourly-|daily-|before-restore-)/.test(f) && /\.tar\.gz(\.enc)?$/.test(f)).map((f) => {
    const st = fs.statSync(path.join(liveDir(), f)); return { name: f, size: st.size, modified: st.mtime.toISOString() };
  }).sort((a, b) => (a.name.startsWith("db-latest") ? -1 : b.name.startsWith("db-latest") ? 1 : b.name.localeCompare(a.name)));
}
const fileFor = (name) => (/^db-(latest|hourly-[0-9-]+|daily-[0-9]+|before-restore-[0-9-]+)\.tar\.gz(\.enc)?$/.test(String(name || "")) ? path.join(liveDir(), name) : null);
async function status() {
  const m = readMeta();
  return { dir: liveDir(), everySec: EVERY_MS() / 1000, encrypted: !!PASS(), busy: state.busy, lastRun: state.lastRun, lastOk: state.lastOk, lastStatus: state.lastStatus, latest: m, files: listFiles(),
    keepHourly: KEEP_HOURLY(), keepDaily: KEEP_DAILY() };
}
/* safety copy of the current database, kept before a restore replaces it (last 5 are kept) */
async function safetyCopy() {
  const r = await snapshot({ reason: "before restore", force: true });
  const ext = ".tar.gz" + (r.encrypted ? ".enc" : "");
  fs.copyFileSync(latestFile(r.encrypted), path.join(liveDir(), "db-before-restore-" + stampOf(new Date()) + ext)); prune("db-before-restore-", 5);
  return r;
}
/* queue a restore: the file is checked now, loaded on the next start (the caller restarts the server) */
function queueRestore(buf) {
  toPlain(buf);                                  /* throws when it is not a valid backup / wrong passphrase */
  fs.mkdirSync(liveDir(), { recursive: true });
  writeAtomic(pendingFile(), buf);
  state.skipFlush = true;                        /* the stopping server must not overwrite db-latest with the old data */
}

module.exports = { start, flush, snapshot, safetyCopy, status, listFiles, fileFor, liveDir, queueRestore, takePendingRestore, latestForEmptyStart, toPlain };
