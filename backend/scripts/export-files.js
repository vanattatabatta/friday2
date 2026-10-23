#!/usr/bin/env node
"use strict";
/*
 * Export every uploaded file in its ORIGINAL format to a normal folder on your computer.
 *
 *   A) straight from the database named in backend/.env:
 *        npm run export-files
 *        npm run export-files -- --out D:\my-files
 *
 *   B) from a backup zip you downloaded in Admin > Backup (unzip it first; decrypt a .enc file with backup-tools.js):
 *        npm run export-files -- --from-backup <unzipped folder>/database --out D:\my-files
 *
 * Output folders:
 *   orders/<order id>/       files customers attached to their orders
 *   library/                 original files of the Doc Library (named "<id> - <title>.<ext>")
 *   citations/               files uploaded in the citation tool
 *   _index.csv               list of everything exported (source, id, original name, saved path, size)
 * Website pages / static pages are plain text, not binary files: they are in the backup's website/ folder
 * (tick "include code" in Admin > Backup) or in the database tables.
 */
const fs = require("fs"), path = require("path");
try { require("dotenv").config({ path: path.join(__dirname, "..", ".env") }); } catch { /* optional */ }

const args = process.argv.slice(2);
let fromBackup = null, out = path.resolve("exported-files");
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--from-backup") fromBackup = args[++i];
  else if (args[i] === "--out") out = path.resolve(args[++i]);
}

const EXT = { "application/pdf": ".pdf", "application/msword": ".doc", "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.ms-excel": ".xls", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx", "application/vnd.ms-powerpoint": ".ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx", "text/plain": ".txt", "text/csv": ".csv", "text/html": ".html",
  "image/png": ".png", "image/jpeg": ".jpg", "image/gif": ".gif", "image/webp": ".webp", "application/zip": ".zip" };
const safe = (s, max = 120) => String(s == null ? "" : s).replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/\s+/g, " ").trim().slice(0, max) || "file";
function withExt(name, mime) {
  if (path.extname(name)) return name;
  return name + (EXT[String(mime || "").toLowerCase()] || "");
}
function uniquePath(dir, name) {
  fs.mkdirSync(dir, { recursive: true });
  let p = path.join(dir, name), n = 1;
  const ext = path.extname(name), base = path.basename(name, ext);
  while (fs.existsSync(p)) p = path.join(dir, `${base} (${++n})${ext}`);
  return p;
}
function toBuffer(v) {
  if (!v) return Buffer.alloc(0);
  if (Buffer.isBuffer(v)) return v;
  if (v instanceof Uint8Array) return Buffer.from(v);
  if (typeof v === "object" && v.__b64 != null) return Buffer.from(v.__b64, "base64");
  if (typeof v === "object") return Buffer.from(Object.values(v));      // a byte array that was saved as {"0":..,"1":..}
  return Buffer.from(String(v));
}

const index = [["source", "id", "original_name", "saved_as", "bytes"]];
let count = 0, skipped = 0;
function save(source, id, dir, name, data) {
  const buf = toBuffer(data);
  if (!buf.length) { skipped++; return; }
  const p = uniquePath(dir, name);
  fs.writeFileSync(p, buf);
  index.push([source, id, name, path.relative(out, p), buf.length]);
  count++;
}

/* ---------- source A: the live database ---------- */
async function fromDatabase() {
  const { query } = require("../config/database");
  const tryRun = async (label, fn) => { try { await fn(); } catch (e) { console.warn(`  ${label}: skipped (${e.message})`); } };

  await tryRun("orders", async () => {
    const r = await query("SELECT f.id, f.original_file_name AS name, f.mime_type AS mime, COALESCE(s.order_id, 'order-' || f.submission_id::text) AS oid FROM submission_files f LEFT JOIN submissions s ON s.id = f.submission_id ORDER BY f.id");
    for (const row of r.rows) {
      const d = (await query("SELECT data FROM submission_files WHERE id=$1", [row.id])).rows[0];
      save("order", row.id, path.join(out, "orders", safe(row.oid, 40)), safe(withExt(row.name, row.mime), 150), d && d.data);
    }
  });
  await tryRun("library", async () => {
    const r = await query("SELECT d.id, d.title, d.filename, d.mime FROM docs d JOIN doc_files f ON f.doc_id = d.id ORDER BY d.id");
    for (const row of r.rows) {
      const d = (await query("SELECT data FROM doc_files WHERE doc_id=$1", [row.id])).rows[0];
      const base = row.filename ? row.filename : row.title;
      save("library", row.id, path.join(out, "library"), safe(`${row.id} - ${withExt(base, row.mime)}`, 160), d && d.data);
    }
  });
  await tryRun("citations", async () => {
    const r = await query("SELECT id, filename FROM citation_uploads ORDER BY id");
    for (const row of r.rows) {
      const d = (await query("SELECT data FROM citation_uploads WHERE id=$1", [row.id])).rows[0];
      save("citation", row.id, path.join(out, "citations"), safe(`${row.id} - ${row.filename || "file"}`, 160), d && d.data);
    }
  });
}

/* ---------- source B: an unzipped backup (database/*.json) ---------- */
function fromBackupFolder(dir) {
  const load = (t) => { const f = path.join(dir, t + ".json"); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : []; };
  const subs = new Map(load("submissions").map((s) => [String(s.id), s]));
  for (const row of load("submission_files")) {
    const s = subs.get(String(row.submission_id));
    save("order", row.id, path.join(out, "orders", safe((s && s.order_id) || "order-" + row.submission_id, 40)), safe(withExt(row.original_file_name, row.mime_type), 150), row.data);
  }
  const docs = new Map(load("docs").map((d) => [String(d.id), d]));
  for (const row of load("doc_files")) {
    const d = docs.get(String(row.doc_id)) || {};
    save("library", row.doc_id, path.join(out, "library"), safe(`${row.doc_id} - ${withExt(d.filename || d.title || "document", d.mime)}`, 160), row.data);
  }
  for (const row of load("citation_uploads")) {
    save("citation", row.id, path.join(out, "citations"), safe(`${row.id} - ${row.filename || "file"}`, 160), row.data);
  }
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  if (fromBackup) {
    if (!fs.existsSync(fromBackup)) { console.error("Backup folder not found: " + fromBackup); process.exit(1); }
    console.log("Reading the backup in " + fromBackup);
    fromBackupFolder(fromBackup);
  } else {
    console.log("Reading files from the database in backend/.env ...");
    await fromDatabase();
  }
  const csv = index.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  fs.writeFileSync(path.join(out, "_index.csv"), csv);
  console.log(`Done: ${count} files saved to ${out}` + (skipped ? ` (${skipped} empty entries skipped)` : ""));
  process.exit(0);
})().catch((e) => { console.error("Export failed:", e.message); process.exit(1); });
