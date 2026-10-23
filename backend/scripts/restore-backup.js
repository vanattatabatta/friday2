#!/usr/bin/env node
"use strict";
/*
 * Put a backup's database back.  1) unzip the backup (decrypt it first if it ends in .enc)   2) run:
 *     node backend/scripts/restore-backup.js <unzipped-folder>/database
 * Rows that already exist are left alone (ON CONFLICT DO NOTHING), so it is safe to run on a fresh or a live database.
 * Website files are in <unzipped-folder>/website: copy them over your project (your own .env stays untouched).
 */
const path = require("path"), fs = require("fs");
try { require("dotenv").config({ path: path.join(__dirname, "..", ".env") }); } catch { /* optional */ }
const { query } = require("../config/database");
const dir = process.argv[2];
if (!dir || !fs.existsSync(dir)) { console.error("Usage: node backend/scripts/restore-backup.js <folder with the .json files>"); process.exit(1); }
const unb = (v) => (v && typeof v === "object" && v.__b64 != null ? Buffer.from(v.__b64, "base64") : v && typeof v === "object" && !(v instanceof Date) ? JSON.stringify(v) : v);

(async () => {
  let todo = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => ({ table: f.slice(0, -5), rows: JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")), done: 0 }));
  todo = todo.filter((t) => t.table !== "backup_settings");
  for (let pass = 1; pass <= 4 && todo.length; pass++) {           // several passes so tables that reference others find their parents
    const left = [];
    for (const t of todo) {
      let failed = false;
      for (const r of t.rows.slice(t.done)) {
        const cols = Object.keys(r); if (!cols.length) { t.done++; continue; }
        try { await query(`INSERT INTO "${t.table}" (${cols.map((c) => `"${c}"`).join(",")}) VALUES (${cols.map((_, i) => "$" + (i + 1)).join(",")}) ON CONFLICT DO NOTHING`, cols.map((c) => unb(r[c]))); t.done++; }
        catch (e) { failed = true; if (pass === 4) console.warn(`  ${t.table}: ${e.message}`); break; }
      }
      if (failed) left.push(t); else console.log(`  ${t.table}: ${t.rows.length} rows`);
    }
    todo = left;
  }
  console.log(todo.length ? `Finished with problems in: ${todo.map((t) => t.table).join(", ")}` : "Restore finished.");
  process.exit(todo.length ? 2 : 0);
})().catch((e) => { console.error(e.message); process.exit(1); });
