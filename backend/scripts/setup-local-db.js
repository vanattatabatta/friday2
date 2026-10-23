"use strict";
/* npm run db:setup -> creates backend/.env for the local database (if missing), creates every table, prints a summary. */
const fs = require("fs"), path = require("path");
const envPath = path.join(__dirname, "..", ".env");
if (!fs.existsSync(envPath)) {
  fs.copyFileSync(path.join(__dirname, "..", ".env.pglite.example"), envPath);
  const crypto = require("crypto");
  fs.writeFileSync(envPath, fs.readFileSync(envPath, "utf8").replace("change-me-local-only", crypto.randomBytes(32).toString("hex")));
  console.log("Created backend/.env (local database, random JWT_SECRET).");
}
require("dotenv").config({ path: envPath });
const { query, initDatabase, pool } = require("../config/database");
(async () => {
  await initDatabase();
  try { await require("../services/staticPages").ensureTable(); } catch (e) { console.warn("static_pages:", e.message); }
  const t = await query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY 1");
  console.log("Local database ready: " + pool.dataDir);
  console.log(t.rows.length + " tables: " + t.rows.map((r) => r.table_name).join(", "));
  await pool.end();
  process.exit(0);
})().catch((e) => { console.error("Setup failed:", e.message); process.exit(1); });
