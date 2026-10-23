"use strict";
/*
 * How full is the database? (Neon free plan: 1 GB per project; writes fail above that, nothing is deleted.)
 * - logOnce(): one line at start-up, with a warning from 80 %.
 * - report(): used by  GET /api/admin/db-usage  (main admin): total size, share of the limit, biggest tables.
 * Costs one small query when called; nothing runs on a timer, so it never keeps a sleeping database awake.
 */
const { query } = require("../config/database");
const LIMIT_MB = () => Math.max(1, Number(process.env.DB_STORAGE_LIMIT_MB) || 1024);

async function report() {
  const size = Number((await query("SELECT pg_database_size(current_database()) AS b")).rows[0].b);
  const tables = (await query(
    `SELECT c.relname AS name, pg_total_relation_size(c.oid) AS bytes
       FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind='r' ORDER BY 2 DESC LIMIT 12`)).rows
    .map((r) => ({ name: r.name, mb: Math.round(Number(r.bytes) / 1048576 * 10) / 10 }));
  const mb = size / 1048576, limit = LIMIT_MB();
  return { usedMB: Math.round(mb * 10) / 10, limitMB: limit, percent: Math.round(mb / limit * 1000) / 10,
    level: mb / limit >= 0.9 ? "critical" : mb / limit >= 0.8 ? "warning" : "ok", biggestTables: tables,
    external: !!String(process.env.DATABASE_URL || "").trim() };
}

async function logOnce() {
  try {
    const r = await report();
    const msg = `[DB] size ${r.usedMB} MB of ${r.limitMB} MB (${r.percent}%)`;
    if (r.level === "ok") console.log(msg); else console.warn(msg + " - almost full: free space (delete unused documents) or move files to object storage or upgrade.");
  } catch (e) { /* pg_database_size not available: ignore */ }
}

module.exports = { report, logOnce };
