"use strict";
/*
 * Copies ALL data from the built-in PGlite database into an external PostgreSQL (Neon) database.
 * Safe to run again: rows that already exist are skipped (ON CONFLICT DO NOTHING), nothing is deleted.
 *
 *   Source A: your local data folder           npm run db:migrate
 *   Source B: a backup file downloaded from the live site (Admin > Backup > Download latest database backup)
 *                                              npm run db:migrate -- --from-backup path/to/db-latest.tar.gz
 *   Source folder elsewhere:                   npm run db:migrate -- --from-dir path/to/pglite
 *
 * Target: DATABASE_URL (put it in backend/.env or in the shell). Stop the local server first.
 * The tables are created in the target automatically; the script then copies the rows, fixes the id counters and
 * compares the row counts table by table.
 */
const fs = require("fs"), path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const has = (n) => args.includes(n);

const q = (id) => '"' + String(id).replace(/"/g, '""') + '"';

(async () => {
  if (!String(process.env.DATABASE_URL || "").trim() && !has("--allow-local-target")) {
    console.error("DATABASE_URL is not set. Put the Neon connection string in backend/.env as DATABASE_URL=... and run again.");
    process.exit(1);
  }
  /* ---------- source ---------- */
  const { PGlite } = await import("@electric-sql/pglite");
  const same = (v) => v;
  /* keep numbers, dates and times as the exact text Postgres sent, so nothing is rounded or shifted by time zones */
  const parsers = { 20: same, 1700: same, 1082: same, 1083: same, 1114: same, 1184: same, 1266: same };
  let src, label;
  const fromBackup = opt("--from-backup");
  if (fromBackup) {
    const buf = fs.readFileSync(fromBackup);
    const plain = require("../services/liveBackup").toPlain(buf);          /* also decrypts when BACKUP_PASSPHRASE is set */
    src = new PGlite({ loadDataDir: new Blob([plain]), parsers });
    label = "backup file " + fromBackup;
  } else {
    const dir = path.resolve(opt("--from-dir") || process.env.PGLITE_SOURCE_DIR || path.join(__dirname, "..", "data", "pglite"));
    if (!fs.existsSync(dir) || !fs.readdirSync(dir).length) { console.error("No local database found in " + dir + ". Use --from-backup <file> or --from-dir <folder>."); process.exit(1); }
    src = new PGlite(dir, { parsers });
    label = "folder " + dir;
  }
  await src.waitReady;
  const S = async (text, p) => (await src.query(text, p || [])).rows;

  /* ---------- target (also creates every table the app knows about) ---------- */
  const { pool, initDatabase, query: tq } = require("../config/database");
  await initDatabase();
  try { await require("../services/staticPages").ensureTable(); } catch (e) { console.warn("static_pages:", e.message); }
  console.log("Source: " + label);
  console.log("Target: " + (pool.dataDir || "database"));

  const tables = (await S("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY 1")).map((r) => r.table_name);
  const have = new Set((await tq("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")).rows.map((r) => r.table_name));

  /* tables the app only creates later on first use: create them now from the source definition */
  for (const t of tables.filter((x) => !have.has(x))) {
    const cols = await S(`SELECT a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull AS nn, pg_get_expr(d.adbin, d.adrelid) AS def
      FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE a.attrelid=('public.'||quote_ident($1))::regclass AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`, [t]);
    const cons = await S(`SELECT pg_get_constraintdef(c.oid) AS def FROM pg_constraint c WHERE c.conrelid=('public.'||quote_ident($1))::regclass AND c.contype IN ('p','u','c')`, [t]);
    const lines = cols.map((c) => {
      let type = c.type, def = c.def ? " DEFAULT " + c.def : "";
      if (c.def && /^nextval\(/i.test(c.def)) { type = /bigint/i.test(c.type) ? "BIGSERIAL" : "SERIAL"; def = ""; }
      return "  " + q(c.name) + " " + type + (c.nn && !/SERIAL/.test(type) ? " NOT NULL" : "") + def;
    }).concat(cons.map((c) => "  " + c.def));
    await tq(`CREATE TABLE IF NOT EXISTS ${q(t)} (\n${lines.join(",\n")}\n)`);
    console.log("  created missing table " + t);
  }

  /* parents before children (foreign keys) */
  const fks = await S(`SELECT c.conrelid::regclass::text AS child, c.confrelid::regclass::text AS parent FROM pg_constraint c WHERE c.contype='f'`);
  const deps = new Map(tables.map((t) => [t, new Set()]));
  for (const f of fks) { const c = f.child.replace(/^public\./, "").replace(/"/g, ""), p = f.parent.replace(/^public\./, "").replace(/"/g, ""); if (c !== p && deps.has(c) && deps.has(p)) deps.get(c).add(p); }
  const order = [], done = new Set();
  while (order.length < tables.length) {
    const next = tables.filter((t) => !done.has(t) && [...deps.get(t)].every((p) => done.has(p)));
    const pick = next.length ? next : tables.filter((t) => !done.has(t)).slice(0, 1);   /* a cycle: just continue */
    for (const t of pick) { done.add(t); order.push(t); }
  }

  /* ---------- copy ---------- */
  const report = [];
  for (const t of order) {
    const cols = await S("SELECT column_name AS name, udt_name AS udt FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position", [t]);
    const tcols = new Set((await tq("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1", [t])).rows.map((r) => r.column_name));
    const use = cols.filter((c) => tcols.has(c.name));
    const skipped = cols.filter((c) => !tcols.has(c.name)).map((c) => c.name);
    const total = Number((await S(`SELECT COUNT(*) AS n FROM ${q(t)}`))[0].n);
    const heavy = cols.some((c) => c.udt === "bytea" || (c.name === "full"));
    const page = heavy ? 3 : 400;
    const perInsert = Math.max(1, Math.min(page, Math.floor(60000 / Math.max(1, use.length))));
    let copied = 0;
    const list = use.map((c) => q(c.name)).join(",");
    for (let off = 0; off < total; off += page) {
      const rows = await S(`SELECT ${list} FROM ${q(t)} ORDER BY ctid LIMIT ${page} OFFSET ${off}`);
      for (let i = 0; i < rows.length; i += perInsert) {
        const chunk = rows.slice(i, i + perInsert), params = [], values = [];
        for (const r of chunk) {
          values.push("(" + use.map((c) => {
            let v = r[c.name];
            if (v instanceof Uint8Array && !Buffer.isBuffer(v)) v = Buffer.from(v.buffer, v.byteOffset, v.byteLength);
            else if ((c.udt === "json" || c.udt === "jsonb") && v !== null && v !== undefined) v = JSON.stringify(v);
            params.push(v === undefined ? null : v);
            return "$" + params.length;
          }).join(",") + ")");
        }
        await tq(`INSERT INTO ${q(t)} (${list}) VALUES ${values.join(",")} ON CONFLICT DO NOTHING`, params);
      }
      copied += rows.length;
      if (total > page) process.stdout.write(`\r  ${t}: ${copied}/${total}`);
    }
    const now = Number((await tq(`SELECT COUNT(*) AS n FROM ${q(t)}`)).rows[0].n);
    report.push({ table: t, source: total, target: now, skipped });
    process.stdout.write(`\r  ${t.padEnd(24)} ${String(total).padStart(7)} rows copied${skipped.length ? "  (columns not in target, left out: " + skipped.join(",") + ")" : ""}\n`);
  }

  /* ---------- id counters: the next new row must not reuse an old id ---------- */
  const seqs = (await tq("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public' AND column_default LIKE 'nextval(%'")).rows;
  for (const s of seqs) {
    try {
      await tq(`SELECT setval(pg_get_serial_sequence($1, $2), GREATEST(COALESCE((SELECT MAX(${q(s.column_name)}) FROM ${q(s.table_name)}), 0), 1), (SELECT COUNT(*) > 0 FROM ${q(s.table_name)}))`, [q(s.table_name), s.column_name]);
    } catch (e) { console.warn("  counter " + s.table_name + "." + s.column_name + ": " + e.message); }
  }

  /* ---------- check ---------- */
  const bad = report.filter((r) => r.target < r.source);
  console.log("\nTables: " + report.length + ", rows in source: " + report.reduce((a, r) => a + r.source, 0) + ", rows in target: " + report.reduce((a, r) => a + r.target, 0));
  if (bad.length) { console.error("MISMATCH (target has fewer rows than the source): " + bad.map((r) => `${r.table} ${r.target}/${r.source}`).join(", ")); process.exitCode = 2; }
  else console.log("OK: every table has at least as many rows in the target as in the source.");
  try { await src.close(); } catch { /* ignore */ }
  await pool.end();
  process.exit(process.exitCode || 0);
})().catch((e) => { console.error("Migration failed:", e && e.stack || e); process.exit(1); });
