"use strict";
/* npm run db:check  -> opens the built-in PGlite database, prints version, tables and row counts (stop the server first). */
require("dotenv").config();
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const { query, pool } = require("../config/database");
(async () => {
  const v = await query("SELECT version() AS v, current_database() AS db, NOW() AS now");
  console.log("Connected:", v.rows[0].db, "|", v.rows[0].v.split(",")[0], "|", v.rows[0].now.toISOString());
  const t = await query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY 1");
  if (!t.rows.length) console.log("No tables yet. Start the server once (npm start) and they are created.");
  for (const r of t.rows) {
    const c = await query(`SELECT COUNT(*)::int AS n FROM "${r.table_name}"`);
    console.log(` - ${r.table_name}: ${c.rows[0].n} rows`);
  }
  if (pool.end) await pool.end();
  process.exit(0);
})().catch((e) => { console.error("DB check failed:", e.message); process.exit(1); });
