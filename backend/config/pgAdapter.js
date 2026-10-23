"use strict";
/*
 * External PostgreSQL (Neon, Supabase, any Postgres) - used when DATABASE_URL is set.
 * The data then lives OUTSIDE the web server, so a deploy / restart / sleep never touches it.
 *
 * It exposes the same small API as pgliteAdapter.js:
 *   pool.query(text, params) -> { rows, rowCount, fields }
 *   pool.connect()           -> { query, release }   (BEGIN / COMMIT blocks)
 *   pool.on(...), pool.end()
 * so every existing  query("SELECT ... $1", [x])  call works unchanged.
 *
 * Settings (all optional except DATABASE_URL):
 *   DATABASE_URL        postgresql://user:pass@ep-xxxx-pooler.region.aws.neon.tech/dbname?sslmode=require
 *   PG_POOL_MAX         max connections (default 5; keep small on free plans)
 *   PG_IDLE_MS          close idle connections after this many ms (default 20000, lets Neon suspend its compute when idle)
 */
const { Pool } = require("pg");

const num = (k, d) => { const v = Number(process.env[k]); return Number.isFinite(v) && v > 0 ? v : d; };
const isLocal = (u) => /@(localhost|127\.0\.0\.1|\[::1\])([:/]|$)/i.test(u);

/* errors that mean "could not reach / lost the database", worth one retry for read-only statements (Neon wakes up from sleep in ~1-3 s) */
const RETRY_CODES = new Set(["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EPIPE", "57P01", "57P03", "08006", "08001", "08003"]);
const isRead = (t) => /^\s*(select|with)\b/i.test(String(t));
const retryable = (e) => e && (RETRY_CODES.has(e.code) || /Connection terminated|timeout exceeded when trying to connect/i.test(e.message || ""));

function createPool() {
  const url = String(process.env.DATABASE_URL || "").trim();
  if (!url) throw new Error("DATABASE_URL is empty.");
  const cfg = {
    connectionString: url,
    max: num("PG_POOL_MAX", 5),
    idleTimeoutMillis: num("PG_IDLE_MS", 20000),
    connectionTimeoutMillis: num("PG_CONNECT_TIMEOUT_MS", 30000),   /* a sleeping Neon database needs a moment to start */
    keepAlive: true
  };
  /* Neon / hosted databases need TLS. If the URL does not say so, turn it on for every non-local host. */
  if (!/sslmode=/i.test(url) && !isLocal(url) && process.env.PG_SSL !== "0") cfg.ssl = true;

  const pool = new Pool(cfg);
  pool.on("error", (e) => console.warn("[DB] idle connection dropped:", e.message));   /* the pool opens a fresh one on the next query */

  let host = "?";
  try { host = new URL(url).host; } catch { /* ignore */ }
  console.log("[DB] external PostgreSQL: " + host + " (data is kept outside the web server)");

  async function query(text, params) {
    let res;
    try { res = await pool.query(text, params && params.length ? params : undefined); }
    catch (e) {
      if (!(isRead(text) && retryable(e))) throw e;
      await new Promise((r) => setTimeout(r, 1500));
      res = await pool.query(text, params && params.length ? params : undefined);
    }
    /* several statements in one string return an array of results: keep the last, like the PGlite adapter */
    if (Array.isArray(res)) res = res[res.length - 1] || { rows: [], rowCount: 0, fields: [] };
    return { rows: res.rows || [], rowCount: res.rowCount == null ? (res.rows || []).length : res.rowCount, fields: res.fields || [] };
  }

  return {
    isPglite: false,
    external: true,
    dataDir: "external PostgreSQL (" + host + ")",
    on() { return this; },
    query,
    async connect() {
      const c = await pool.connect();
      return { query: (text, params) => c.query(text, params), release: (err) => c.release(err) };
    },
    end: () => pool.end()
  };
}

module.exports = { createPool };
