"use strict";
/*
 * Website backups: a .zip with (1) every database table as JSON (documents, static pages, users, orders, ...) and
 * (2) the website files (code, css, js, img, "static pages"). Secrets are never included: .env files are skipped.
 *
 *  - Admin console > Backup: set the email address(es), turn automatic backups on, back up now, download.
 *  - Automatic: every BACKUP_EVERY_HOURS (default 24) the site checks whether anything changed (new library
 *    documents, edited pages, new orders...) and only then makes + emails a backup.
 *  - Delivered by email (through whatever mailer is configured, including your own relay) and, optionally, Telegram.
 *    Files above BACKUP_MAX_EMAIL_MB (default 20) are not attached: the email says so and the file stays in
 *    Admin > Backup (and in BACKUP_DIR) for download.
 *  - BACKUP_PASSPHRASE=...  encrypts the file (.zip.enc); open it with: node backend/scripts/backup-tools.js decrypt <file>
 *  - BACKUP_DIR (default backend/backups) keeps the last BACKUP_KEEP (default 5). Hosts like Railway wipe this folder
 *    on every deploy, so rely on the email / Telegram copy, not on this folder.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { query } = require("../config/database");
const mailer = require("./mailer");
const { createZip } = require("./zipWriter");

const ROOT = path.resolve(__dirname, "..", "..");
const env = (k, d = "") => String(process.env[k] == null ? d : process.env[k]).trim();
const DIR = () => path.resolve(env("BACKUP_DIR") || path.join(ROOT, "backend", "backups"));
const KEEP = () => Math.max(1, Number(env("BACKUP_KEEP", "5")) || 5);
const MAX_MAIL = () => (Number(env("BACKUP_MAX_EMAIL_MB", "17")) || 17) * 1048576;
const SKIP_TABLES = () => env("BACKUP_SKIP_TABLES").split(",").map((s) => s.trim()).filter(Boolean);
const SITE = () => env("SITE_NAME", "Expert Help");
const EXTERNAL = () => !!env("DATABASE_URL");
/* LEAN backup (default when DATABASE_URL is set): the automatic backup leaves out the big binary data (library document files and page images).
   Reading them every day would use up the free network transfer (Neon: 5 GB/month) and the server memory; Neon itself keeps that data. BACKUP_LEAN=0 turns it off. */
const LEAN = (opts) => !(opts && opts.full) && (env("BACKUP_LEAN") ? env("BACKUP_LEAN") !== "0" : EXTERNAL());
const LEAN_SKIP_TABLES = () => (env("BACKUP_LEAN_SKIP_TABLES") || "doc_files").split(",").map((s) => s.trim()).filter(Boolean);
const LEAN_STRIP_TABLES = () => (env("BACKUP_LEAN_STRIP_TABLES") || "doc_pages").split(",").map((s) => s.trim()).filter(Boolean);

let ready = null, running = false, timer = null, nextCheck = 0;   // nextCheck: do not query the database again before this time
function ensure() {
  return ready || (ready = query("CREATE TABLE IF NOT EXISTS backup_settings (key VARCHAR(40) PRIMARY KEY, value TEXT NOT NULL DEFAULT '')").catch((e) => { ready = null; throw e; }));
}
async function getSettings() {
  await ensure();
  const v = Object.fromEntries((await query("SELECT key,value FROM backup_settings")).rows.map((r) => [r.key, r.value]));
  return {
    emails: v.emails != null ? v.emails : env("EMAIL_TO"),
    enabled: v.enabled == null ? true : v.enabled === "1",
    hours: Math.max(1, Number(v.hours) || Number(env("BACKUP_EVERY_HOURS", EXTERNAL() ? "168" : "24")) || 24),
    onlyChanged: v.onlyChanged !== "0",
    includeCode: v.includeCode !== "0",
    lastRun: v.lastRun || null, lastStatus: v.lastStatus || "", lastFingerprint: v.lastFingerprint || ""
  };
}
async function put(k, val) { await ensure(); await query("INSERT INTO backup_settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value", [k, String(val)]); }
async function saveSettings(b) {
  const emails = String(b.emails || "").split(/[,;\s]+/).filter(Boolean);
  if (emails.some((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e))) throw Object.assign(new Error("One of the email addresses is not valid."), { status: 400 });
  await put("emails", emails.join(", ")); await put("enabled", b.enabled ? "1" : "0");
  await put("hours", Math.min(24 * 30, Math.max(1, Number(b.hours) || 24))); await put("onlyChanged", b.onlyChanged ? "1" : "0"); await put("includeCode", b.includeCode ? "1" : "0");
  nextCheck = 0;
  return getSettings();
}

/* ---------- what is in the database ---------- */
async function tableList() {
  const skip = new Set([...SKIP_TABLES(), "_failover_meta"]);
  return (await query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name")).rows.map((r) => r.table_name).filter((t) => !skip.has(t));
}
/* cheap "did anything change" check: row counts + newest created/updated time of every table */
async function fingerprint() {
  const cols = (await query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND column_name IN ('updated_at','created_at')")).rows;
  const stamp = {}; cols.forEach((c) => { (stamp[c.table_name] = stamp[c.table_name] || []).push(c.column_name); });
  const h = crypto.createHash("sha256");
  for (const t of (await tableList()).filter((x) => x !== "backup_settings")) {
    try {
      const q = `SELECT COUNT(*)::text AS c${(stamp[t] || []).map((c, i) => `, MAX("${c}")::text AS m${i}`).join("")} FROM "${t}"`;
      h.update(t + JSON.stringify((await query(q)).rows[0]));
    } catch { /* table vanished: ignore */ }
  }
  return h.digest("hex");
}
const ser = (rows) => JSON.stringify(rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Buffer.isBuffer(v) ? { __b64: v.toString("base64") } : v]))));

/* ---------- website files ---------- */
const SKIP_DIR = new Set(["node_modules", ".git", "backups", ".cache"]);
function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".env") || /\.(gz|br|pem|key)$/i.test(e.name)) continue;   // secrets and rebuildable copies
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIR.has(e.name)) walk(p, out); } else if (e.isFile()) out.push(p);
  }
  return out;
}

async function buildBackup(opts = {}) {
  const s = opts.settings || (await getSettings()), zip = createZip(), stamp = new Date().toISOString();
  const tables = {}, errors = [];
  const lean = LEAN(opts), leanSkipped = [];
  for (const t of await tableList()) {
    try {
      let cols = "*";
      if (lean && LEAN_SKIP_TABLES().includes(t)) { leanSkipped.push(t); continue; }
      if (lean && LEAN_STRIP_TABLES().includes(t)) {   /* every column except the binary ones */
        const c = (await query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND udt_name<>'bytea' ORDER BY ordinal_position", [t])).rows;
        if (c.length) { cols = c.map((x) => `"${x.column_name}"`).join(","); leanSkipped.push(t + " (images)"); }
      }
      const rows = (await query(`SELECT ${cols} FROM "${t}"`)).rows; zip.add(`database/${t}.json`, ser(rows)); tables[t] = rows.length;
    }
    catch (e) { errors.push(`${t}: ${e.message}`); }
  }
  let files = 0;
  if (s.includeCode) for (const f of walk(ROOT, [])) { try { zip.add("website/" + path.relative(ROOT, f), fs.readFileSync(f)); files++; } catch { /* unreadable: skip */ } }
  const database = null;
  zip.add("MANIFEST.json", JSON.stringify({ site: SITE(), created: stamp, database, tables, websiteFiles: files, errors, lean: lean ? { note: "Binary data (document files / page images) is NOT in this backup; it is kept in the database itself.", left_out: leanSkipped } : false, note: "Restore database/*.json with backend/scripts/restore-backup.js. .env files are never included." }, null, 2));
  let buf = zip.finish(), name = `backup-${stamp.replace(/[:.]/g, "-").slice(0, 19)}.zip`;
  if (env("BACKUP_PASSPHRASE")) { buf = encrypt(buf, env("BACKUP_PASSPHRASE")); name += ".enc"; }
  return { buf, name, tables, files, errors };
}

function encrypt(buf, pass) {
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12), key = crypto.scryptSync(pass, salt, 32);
  const c = crypto.createCipheriv("aes-256-gcm", key, iv), body = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([Buffer.from("AHBK1"), salt, iv, c.getAuthTag(), body]);
}
function decrypt(buf, pass) {
  if (buf.subarray(0, 5).toString() !== "AHBK1") throw new Error("Not an encrypted backup file.");
  const salt = buf.subarray(5, 21), iv = buf.subarray(21, 33), tag = buf.subarray(33, 49), key = crypto.scryptSync(pass, salt, 32);
  const d = crypto.createDecipheriv("aes-256-gcm", key, iv); d.setAuthTag(tag);
  return Buffer.concat([d.update(buf.subarray(49)), d.final()]);
}

/* ---------- local copies ---------- */
function saveLocal(name, buf) {
  try {
    fs.mkdirSync(DIR(), { recursive: true }); fs.writeFileSync(path.join(DIR(), name), buf);
    fs.readdirSync(DIR()).filter((f) => /^backup-.*\.zip(\.enc)?$/.test(f)).sort().reverse().slice(KEEP()).forEach((f) => { try { fs.unlinkSync(path.join(DIR(), f)); } catch { /* ignore */ } });
    return true;
  } catch (e) { console.warn("[BACKUP] could not save a local copy:", e.message); return false; }
}
function listLocal() {
  try { return fs.readdirSync(DIR()).filter((f) => /^backup-.*\.zip(\.enc)?$/.test(f)).sort().reverse().map((f) => ({ name: f, size: fs.statSync(path.join(DIR(), f)).size })); } catch { return []; }
}
function localPath(name) { return /^backup-[0-9T-]+\.zip(\.enc)?$/.test(name) ? path.join(DIR(), name) : null; }

/* ---------- delivery ---------- */
async function sendTelegram(name, buf, caption) {
  const tok = env("TELEGRAM_BOT_TOKEN"), chat = env("TELEGRAM_CHAT_ID");
  if (!tok || !chat) return null;
  try {
    const big = buf.length > 49 * 1048576, fd = new FormData();
    fd.append("chat_id", chat);
    if (big) { fd.append("text", caption + "\n(File is over Telegram's 50 MB limit: download it in Admin > Backup.)"); }
    else { fd.append("caption", caption); fd.append("document", new Blob([buf]), name); }
    const r = await fetch(`https://api.telegram.org/bot${tok}/${big ? "sendMessage" : "sendDocument"}`, { method: "POST", body: fd, signal: AbortSignal.timeout(180000) });
    return r.ok ? (big ? "message only" : "sent") : "failed (" + r.status + ")";
  } catch (e) { return "failed (" + e.message + ")"; }
}
const mb = (n) => (n / 1048576).toFixed(1) + " MB";

async function runBackup({ reason = "manual", force = true } = {}) {
  if (running) throw Object.assign(new Error("A backup is already running."), { status: 409 });
  running = true;
  try {
    const s = await getSettings(), fp = await fingerprint();
    if (!force && s.onlyChanged && fp === s.lastFingerprint) return { skipped: true, message: "Nothing changed since the last backup." };
    const b = await buildBackup({ settings: s });
    saveLocal(b.name, b.buf);
    const to = s.emails.split(/[,;\s]+/).filter(Boolean), out = { name: b.name, size: b.buf.length, tables: Object.keys(b.tables).length, files: b.files, errors: b.errors, email: "not sent", telegram: null };
    const when = new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }), attach = b.buf.length <= MAX_MAIL();
    if (to.length && mailer.isConfigured()) {
      try {
        const rowsTotal = Object.values(b.tables).reduce((a, n) => a + n, 0);
        await mailer.send({
          to: to.join(","), subject: `[${SITE()}] Website backup ${when}${attach ? "" : " (download from admin)"}`,
          html: `<div style="font-family:Arial,sans-serif;max-width:520px;color:#1e1b4b"><h2 style="color:#5b21b6;margin:0 0 10px">${SITE()} backup</h2><p>Created ${when} (${reason}).</p>
            <p>${Object.keys(b.tables).length} database tables (${rowsTotal} rows) and ${b.files} website files, ${mb(b.buf.length)}.</p>
            <p>${attach ? "The backup is attached." : "The file is larger than the email limit, so it is not attached. Download it from <b>Admin &gt; Backup</b>."}</p>
            ${env("BACKUP_PASSPHRASE") ? "<p>It is encrypted with your BACKUP_PASSPHRASE.</p>" : "<p style='color:#b45309'>It is not encrypted and contains user data. Keep it private, or set BACKUP_PASSPHRASE.</p>"}
            ${b.errors.length ? `<p style="color:#b91c1c">Some tables could not be read: ${b.errors.join("; ")}</p>` : ""}</div>`,
          text: `${SITE()} backup ${when} (${reason}). ${Object.keys(b.tables).length} tables, ${b.files} files, ${mb(b.buf.length)}. ${attach ? "Attached." : "Too large to attach: download it from Admin > Backup."}`,
          attachments: attach ? [{ filename: b.name, content: b.buf.toString("base64") }] : []
        });
        out.email = attach ? "sent to " + to.join(", ") : "sent without attachment (too large)";
      } catch (e) { out.email = "failed: " + e.message; }
    } else if (!to.length) out.email = "no email address set";
    else out.email = "email is not configured on the server";
    out.telegram = await sendTelegram(b.name, b.buf, `${SITE()} backup ${when} (${mb(b.buf.length)})`);
    const ok = !/^failed/.test(out.email) || (out.telegram && !/^failed/.test(out.telegram));
    await put("lastFingerprint", fp); await put("lastRun", new Date().toISOString());
    await put("lastStatus", `${ok ? "OK" : "PROBLEM"}: ${b.name} (${mb(b.buf.length)}); email: ${out.email}${out.telegram ? "; telegram: " + out.telegram : ""}`);
    return out;
  } finally { running = false; }
}

async function tick() {
  try {
    if (running || Date.now() < nextCheck) return;   // not due yet: no database query
    const s = await getSettings();
    if (!s.enabled) { nextCheck = Date.now() + 6 * 3600 * 1000; return; }   // saving the settings resets this
    if (s.lastRun && Date.now() - new Date(s.lastRun).getTime() < s.hours * 3600 * 1000) { nextCheck = new Date(s.lastRun).getTime() + s.hours * 3600 * 1000; return; }
    const r = await runBackup({ reason: "automatic", force: false });
    nextCheck = 0;   // re-read lastRun on the next tick
    if (r.skipped) console.log("[BACKUP] skipped:", r.message); else console.log("[BACKUP] done:", r.name, r.email);
  } catch (e) { console.error("[BACKUP] automatic backup failed:", e.message); }
}
function start() { if (timer) return; timer = setInterval(tick, 15 * 60 * 1000); setTimeout(tick, 2 * 60 * 1000); }

async function status() {
  const s = await getSettings(), next = s.enabled && s.lastRun ? new Date(new Date(s.lastRun).getTime() + s.hours * 3600 * 1000).toISOString() : null;
  return { settings: s, next, running, mail: { provider: mailer.provider(), configured: mailer.isConfigured() }, telegram: !!(env("TELEGRAM_BOT_TOKEN") && env("TELEGRAM_CHAT_ID")), encrypted: !!env("BACKUP_PASSPHRASE"), maxEmailMB: MAX_MAIL() / 1048576, files: listLocal() };
}
module.exports = { start, status, getSettings, saveSettings, runBackup, buildBackup, listLocal, localPath, decrypt };
