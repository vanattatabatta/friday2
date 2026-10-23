"use strict";
/*
 * Local database with NO server and NO Docker: PGlite = real PostgreSQL running inside Node.js.
 * Data is stored in a normal folder (default backend/data/pglite), so it travels with the project.
 *
 * It exposes the small part of the `pg` Pool API this app uses:
 *   pool.query(text, params) -> { rows, rowCount }
 *   pool.connect()           -> { query, release }   (used for BEGIN / COMMIT)
 *   pool.on(...), pool.end()
 * so every existing  query("SELECT ... $1", [x])  call works unchanged.
 *
 * PGlite is a single connection, so statements run one at a time; pool.connect() holds the
 * connection exclusively until release() so a transaction can never be mixed with other requests.
 */
const fs = require("fs");
const path = require("path");

/* Data folder: PGLITE_DIR, else a Railway Volume (Railway sets RAILWAY_VOLUME_MOUNT_PATH itself), else backend/data/pglite. */
const VOLUME = process.env.RAILWAY_VOLUME_MOUNT_PATH || "";
const DATA_DIR = path.resolve(process.env.PGLITE_DIR || (VOLUME ? path.join(VOLUME, "pglite") : path.join(__dirname, "..", "data", "pglite")));
const ON_RAILWAY = !!(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID);
/* A lock file only protects against two local commands at once; on a host it can go stale (process ids repeat in new containers). */
const USE_LOCK = !ON_RAILWAY && process.env.PGLITE_NO_LOCK !== "1";
const LOCK_FILE = path.join(path.dirname(DATA_DIR), "pglite.lock");

/* Only one Node process may open the folder at a time (a second one could corrupt it). */
function takeLock() {
  if (!USE_LOCK) return;
  fs.mkdirSync(path.dirname(DATA_DIR), { recursive: true });
  let pid = 0;
  try { pid = parseInt(fs.readFileSync(LOCK_FILE, "utf8"), 10) || 0; } catch { /* no lock file */ }
  if (pid && pid !== process.pid) {
    let alive = true;
    try { process.kill(pid, 0); } catch (e) { alive = e.code === "EPERM"; }   // ESRCH = that process is gone (stale lock)
    if (alive) {
      throw new Error(
        "The local database (" + DATA_DIR + ") is already open in another program (process " + pid + "). " +
        "Stop the running server (Ctrl+C) before running this command, then try again."
      );
    }
  }
  fs.writeFileSync(LOCK_FILE, String(process.pid));
}
function dropLock() { try { if (parseInt(fs.readFileSync(LOCK_FILE, "utf8"), 10) === process.pid) fs.unlinkSync(LOCK_FILE); } catch {} }

/* JS array -> Postgres array literal, e.g. ["a","b"] -> {"a","b"}  (pg did this automatically). */
function pgArray(a) {
  return "{" + a.map((v) => v === null || v === undefined ? "NULL"
    : Array.isArray(v) ? pgArray(v)
    : '"' + String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"').join(",") + "}";
}
function cleanParams(p) {
  return (p || []).map((v) =>
    v === undefined ? null
    : Array.isArray(v) ? pgArray(v)
    : (v && typeof v === "object" && !(v instanceof Date) && !(v instanceof Uint8Array)) ? JSON.stringify(v)
    : v);
}
/* pg returns bytea as Buffer; PGlite returns Uint8Array. */
function fixRows(rows) {
  for (const r of rows) for (const k in r) { const v = r[k]; if (v instanceof Uint8Array && !Buffer.isBuffer(v)) r[k] = Buffer.from(v.buffer, v.byteOffset, v.byteLength); }
  return rows;
}

function createPool() {
  let ready = null;
  let closing = null;

  function open() {
    if (!ready) {
      ready = (async () => {
        takeLock();
        if (ON_RAILWAY && !VOLUME && !process.env.PGLITE_DIR) {
          console.warn("[DB] WARNING: running on Railway WITHOUT a Volume. The database is erased on every deploy/restart. " +
            "Add a Volume (service > Settings > Volumes > mount path /data) and redeploy.");
        }
        let PGlite;
        try { ({ PGlite } = await import("@electric-sql/pglite")); }
        catch (e) { dropLock(); throw new Error("PGlite is not installed. Run:  npm install --prefix backend   (" + e.message + ")"); }
        /* Same value types as the pg driver: BIGINT / COUNT(*) / NUMERIC come back as strings. */
        const same = (v) => v;
        const opts = { parsers: { 20: same, 1700: same } };
        const live = require("../services/liveBackup");
        /* 1) a restore requested from Admin > Backup: the current data folder is set aside (not deleted) and the uploaded snapshot is loaded */
        let pending = null, aside = null;
        try { pending = live.takePendingRestore(); } catch (e) { console.warn("[DB] restore file ignored:", e.message); }
        if (pending && fs.existsSync(DATA_DIR)) { aside = DATA_DIR + ".before-restore-" + Date.now(); fs.renameSync(DATA_DIR, aside); }
        if (pending) { opts.loadDataDir = new Blob([pending.buf]); console.warn("[DB] restoring the database from the backup file uploaded in Admin > Backup."); }
        const empty = !pending && (!fs.existsSync(DATA_DIR) || fs.readdirSync(DATA_DIR).length === 0);
        /* 2) empty data folder (fresh deploy): the newest local live backup is loaded, else an empty database */
        let fromBackup = false;
        if (empty) {
          const lb = live.latestForEmptyStart();
          if (lb) { opts.loadDataDir = new Blob([lb.buf]); fromBackup = true; console.log("[DB] empty data folder: restored from the live backup of " + (lb.meta && lb.meta.created || "?")); }
        }
        fs.mkdirSync(DATA_DIR, { recursive: true });
        let db;
        try {
          db = new PGlite(DATA_DIR, opts);
          await db.waitReady;
          if (pending) {
            pending.done(true);
            /* only the newest "set aside" copy of the old database is kept */
            try { const base = path.basename(DATA_DIR) + ".before-restore-", par = path.dirname(DATA_DIR);
              fs.readdirSync(par).filter((n) => n.startsWith(base) && path.join(par, n) !== aside).forEach((n) => fs.rmSync(path.join(par, n), { recursive: true, force: true })); } catch { /* ignore */ }
          }
        } catch (e) {
          if (pending) {   /* the uploaded file could not be loaded: put the previous database back */
            console.warn("[DB] the restore file could not be loaded (" + e.message + "). The previous database is kept.");
            pending.done(false);
            fs.rmSync(DATA_DIR, { recursive: true, force: true });
            if (aside) fs.renameSync(aside, DATA_DIR);
            delete opts.loadDataDir; db = new PGlite(DATA_DIR, opts);
          } else throw e;
        }
        await db.waitReady;
        return db;
      })();
      ready.catch(() => {});
    }
    return ready;
  }

  async function run(text, params) {
    const db = await open();
    const p = cleanParams(params);
    let res;
    if (!p.length && /;\s*\S/.test(text)) {          // several statements in one string (pg allowed this)
      const all = await db.exec(text);
      res = all[all.length - 1] || { rows: [] };
    } else {
      res = await db.query(text, p);
    }
    const rows = fixRows(res.rows || []);
    return { rows, rowCount: res.affectedRows ? res.affectedRows : rows.length, fields: res.fields || [] };
  }

  /* simple FIFO lock: one holder at a time */
  let tail = Promise.resolve();
  function acquire() {
    const prev = tail;
    let rel;
    const held = new Promise((r) => { rel = r; });
    tail = prev.then(() => held);
    return prev.then(() => { let done = false; return () => { if (!done) { done = true; rel(); } }; });
  }

  async function close() {
    if (closing) return closing;
    closing = (async () => {
      if (!ready) return;
      try { const release = await acquire(); const db = await ready; await db.close(); release(); } catch {}
      dropLock();
    })();
    return closing;
  }
  /* on stop (deploy / restart): one last local backup (max 20 s), then close the database cleanly */
  for (const sig of ["SIGINT", "SIGTERM"]) process.once(sig, () => {
    Promise.race([require("../services/liveBackup").flush(), new Promise((r) => setTimeout(r, 20000))]).catch(() => {}).then(close).finally(() => process.exit(0));
  });
  process.once("exit", dropLock);

  return {
    isPglite: true,
    dataDir: DATA_DIR,
    on() { return this; },
    async query(text, params) {
      const release = await acquire();
      try { return await run(text, params); } finally { release(); }
    },
    async connect() {
      const release = await acquire();
      return { query: (text, params) => run(text, params), release };
    },
    /* gzip tarball of the whole database (portable between Windows and Linux). Used by the live backup. */
    async dump() { const release = await acquire(); try { const db = await open(); const f = await db.dumpDataDir("gzip"); return Buffer.from(await f.arrayBuffer()); } finally { release(); } },
    end: close
  };
}

module.exports = { createPool, DATA_DIR };
