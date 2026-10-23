"use strict";
/*
 * Document library: upload -> live instantly.
 * INDEXABLE documents (no personal-data patterns found, see piiReasons): 100% of the text is in the page HTML for EVERYONE
 *   (people and crawlers get the identical page - no cloaking). ~20% is shown clearly, the other ~80% sits in <div class="bl">
 *   which CSS blurs, and the JSON-LD marks that selector as paywalled (isAccessibleForFree:false) so Google/Bing index all of it.
 * OTHER documents (ID numbers, bank / tax / medical records, scans not yet OCR'd): noindex, not in the sitemap, and NOTHING readable
 *   is sent - the whole page is scrambled / blurred on the SERVER.
 * Env: STRIPE_SECRET_KEY, DOC_PRICE_CENTS (500 = $5 per document), DOC_PLAN_PRICE_CENTS (3000), DOC_PLAN_FILES (20),
 *      fixed 0.8 = 80% of every page is blurred, the top 20% is readable
 */
const crypto = require("crypto");
const { execFile } = require("child_process");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
let sharp = null; try { sharp = require("sharp"); } catch { console.warn("[DOCS] 'sharp' not installed: PDF/image pages cannot be blurred."); }
const { query } = require("../config/database");

const STRIPE_KEY = () => String(process.env.STRIPE_SECRET_KEY || "").trim();
const PAGE_CENTS = () => Number(process.env.DOC_PRICE_CENTS || process.env.DOC_PRICE_PER_PAGE_CENTS || 500);   /* flat price PER DOCUMENT */
const PLAN_CENTS = () => Number(process.env.DOC_PLAN_PRICE_CENTS || 3000);
const PLAN_FILES = () => Number(process.env.DOC_PLAN_FILES || 20);
/* Every UPLOADS_PER_FREE documents a member uploads earns one free document unlock. */
/* at least 5 qualifying uploads are always needed for a batch of unlocks (the env value can raise it, never lower it) */
const UPLOADS_PER_FREE = () => Math.max(5, Number(process.env.DOC_UPLOADS_FOR_FREE || 5));
const PACK_CENTS = () => Number(process.env.DOC_PACK_PRICE_CENTS || 3000);      /* $30 */
const PACK_UNLOCKS = () => Math.max(1, Number(process.env.DOC_PACK_UNLOCKS || 30));
const PACK_DAYS = () => Math.max(1, Number(process.env.DOC_PACK_DAYS || 30));
const MAX_OCR = () => Number(process.env.DOC_MAX_OCR_PAGES || 60);
/* Readable share of every page: the first 30% of the CONTENT is clear, the other 70% is blurred (change with DOC_CLEAR_RATIO, 0.30 default).
   The share follows the content length: a page whose text only fills the top half of the A4 sheet shows 30% of that text, not 30% of the empty sheet.
   When a visitor searched for something, the clear window moves to the matching lines (see searchWindow). */
const CLEAR_RATIO = () => { const v = Number(process.env.DOC_CLEAR_RATIO); return v > 0 && v <= 1 ? v : 0.30; };
const BLUR_RATIO = () => 1 - CLEAR_RATIO();
/* Fraction of the page HEIGHT that stays clear. With the page layout (lay) it is 30% of where the text really ends (min 10% of the page);
   without a layout it is 30% of the page. */
const visibleRatio = (n, count, lay) => {
  const base = CLEAR_RATIO();
  if (base >= 1 || !lay || !lay.h || !lay.t || lay.t.length < 3) return base;
  let end = 0; for (const r of lay.t) end = Math.max(end, (Number(r[1]) || 0) + (Number(r[3]) || 0));
  const ext = Math.min(1, Math.max(0, end / lay.h));
  return Math.min(1, Math.max(0.1, base * ext));
};
const RATIO = () => 1 - BLUR_RATIO();

async function initTables() {
  await query(`CREATE TABLE IF NOT EXISTS docs (
    id BIGSERIAL PRIMARY KEY, owner_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    title VARCHAR(300) NOT NULL, school VARCHAR(150), course VARCHAR(100), filename VARCHAR(300),
    mime VARCHAR(120), kind VARCHAR(12) NOT NULL, page_count INT NOT NULL DEFAULT 1,
    views INT NOT NULL DEFAULT 0, removed BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await query(`CREATE TABLE IF NOT EXISTS doc_pages (doc_id BIGINT REFERENCES docs(id) ON DELETE CASCADE,
    page_no INT NOT NULL, body TEXT NOT NULL DEFAULT '', PRIMARY KEY (doc_id, page_no))`);
  await query(`CREATE TABLE IF NOT EXISTS doc_files (doc_id BIGINT PRIMARY KEY REFERENCES docs(id) ON DELETE CASCADE, data BYTEA NOT NULL)`);
  await query(`CREATE TABLE IF NOT EXISTS doc_unlocks (id BIGSERIAL PRIMARY KEY, doc_id BIGINT REFERENCES docs(id) ON DELETE CASCADE,
    user_id BIGINT REFERENCES users(id) ON DELETE CASCADE, source VARCHAR(10) NOT NULL, stripe_ref VARCHAR(120) UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE (doc_id, user_id))`);
  await query(`CREATE TABLE IF NOT EXISTS doc_plans (user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    stripe_sub_id VARCHAR(80) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await query(`CREATE TABLE IF NOT EXISTS doc_courses (id BIGSERIAL PRIMARY KEY, owner_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL, school VARCHAR(150) NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  /* Upload record kept for copyright / takedown cases. No foreign key on purpose: it survives deleting the document or the account. */
  await query(`CREATE TABLE IF NOT EXISTS doc_upload_log (id BIGSERIAL PRIMARY KEY, doc_id BIGINT, user_id BIGINT, user_name VARCHAR(150), user_email VARCHAR(255), user_phone VARCHAR(50),
    ip VARCHAR(64), forwarded_for TEXT, user_agent TEXT, title VARCHAR(300), original_filename VARCHAR(300), mime VARCHAR(120), size_bytes BIGINT, sha256 VARCHAR(64), uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await query("CREATE INDEX IF NOT EXISTS idx_upload_log_doc ON doc_upload_log(doc_id)");
  await query("CREATE INDEX IF NOT EXISTS idx_upload_log_ip ON doc_upload_log(ip)");
  await query("CREATE INDEX IF NOT EXISTS idx_upload_log_sha ON doc_upload_log(sha256)");
  await query("ALTER TABLE docs ADD COLUMN IF NOT EXISTS course_id BIGINT");
  await query("ALTER TABLE docs ADD COLUMN IF NOT EXISTS guest_id VARCHAR(40)");   /* uploads made without an account; claimed when the visitor signs up / logs in */
  await query("CREATE INDEX IF NOT EXISTS idx_docs_guest ON docs(guest_id) WHERE guest_id IS NOT NULL");
  await query("ALTER TABLE docs ADD COLUMN IF NOT EXISTS slug VARCHAR(220)");
  await query("ALTER TABLE docs ADD COLUMN IF NOT EXISTS img BOOLEAN NOT NULL DEFAULT FALSE");
  await query("ALTER TABLE doc_pages ADD COLUMN IF NOT EXISTS preview BYTEA");
  await query("ALTER TABLE doc_pages ADD COLUMN IF NOT EXISTS \"full\" BYTEA");
  await query("ALTER TABLE doc_pages ADD COLUMN IF NOT EXISTS lay JSONB");      /* positioned text of the ORIGINAL page (font, size, colour, x/y) so it is drawn as real HTML */
  await query("ALTER TABLE doc_pages ADD COLUMN IF NOT EXISTS bgimg BYTEA");    /* the ORIGINAL page WITHOUT its text (logo, banners, table lines, shapes) = the CSS background */
  await query("ALTER TABLE doc_pages ADD COLUMN IF NOT EXISTS bg VARCHAR(9)");   /* background colour of the ORIGINAL page, so the HTML page keeps it */
  await query(`CREATE TABLE IF NOT EXISTS doc_votes (doc_id BIGINT NOT NULL REFERENCES docs(id) ON DELETE CASCADE, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vote SMALLINT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (doc_id, user_id))`);   /* 1 = helpful (thumbs up), -1 = not helpful */
  /* $30 pack: PACK_UNLOCKS (30) unlocks, valid PACK_DAYS (30) days from purchase. One row per Stripe payment. */
  await query(`CREATE TABLE IF NOT EXISTS doc_packs (id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, stripe_ref VARCHAR(120) UNIQUE,
    unlocks INT NOT NULL, used INT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), expires_at TIMESTAMPTZ NOT NULL)`);
  await query("CREATE INDEX IF NOT EXISTS idx_doc_packs_user ON doc_packs(user_id, expires_at)");
  /* Which unlocked document was downloaded, by whom, and when (shown in the member's account). */
  await query(`CREATE TABLE IF NOT EXISTS doc_downloads (id BIGSERIAL PRIMARY KEY, doc_id BIGINT NOT NULL REFERENCES docs(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await query("CREATE INDEX IF NOT EXISTS idx_doc_dl_user ON doc_downloads(user_id, doc_id)");
  /* One-time: page background colours are detected again with the more exact method (they are refilled lazily when a document is opened). */
  try {
    await query("CREATE TABLE IF NOT EXISTS doc_flags (k VARCHAR(40) PRIMARY KEY)");
    if (!(await query("SELECT 1 FROM doc_flags WHERE k='bg_v2'")).rowCount) { await query("UPDATE doc_pages SET bg=NULL WHERE preview IS NOT NULL"); await query("INSERT INTO doc_flags(k) VALUES('bg_v2')"); }
  } catch (e) { console.warn("[DOCS] bg migration:", e.message); }
  await query("ALTER TABLE docs ADD COLUMN IF NOT EXISTS sig TEXT");      /* MinHash fingerprint of the text, used to refuse near-duplicate uploads */
  await query("ALTER TABLE docs ADD COLUMN IF NOT EXISTS nsh INT");       /* number of word shingles in the text */
  await query("CREATE INDEX IF NOT EXISTS doc_upload_log_sha ON doc_upload_log(sha256)").catch(() => {});
  await query("ALTER TABLE docs ADD COLUMN IF NOT EXISTS idx SMALLINT");            /* NULL = not checked yet, 1 = may be indexed, 0 = personal data found */
  await query("ALTER TABLE docs ADD COLUMN IF NOT EXISTS idx_note TEXT");           /* why idx = 0 */
  await query("ALTER TABLE docs ADD COLUMN IF NOT EXISTS noindex BOOLEAN NOT NULL DEFAULT FALSE");   /* admin kill-switch: UPDATE docs SET noindex=true WHERE id=.. */
  await query(`CREATE INDEX IF NOT EXISTS idx_docs_fts ON docs USING GIN (to_tsvector('english', title || ' ' || coalesce(course,'')))`);
  /* Slugs are the public URL (/doc/<slug>) so they must be unique. Fix old rows first, then enforce it. Never blocks startup. */
  try { await fixSlugs(); await query("CREATE UNIQUE INDEX IF NOT EXISTS idx_docs_slug ON docs(slug) WHERE slug IS NOT NULL"); }
  catch (e) { console.warn("[DOCS] slug migration:", e.message); }
  try { /* titles / course / school saved before link stripping existed */
    const { rows } = await query("SELECT id,title,school,course FROM docs WHERE title ~* '(https?://|www\\.|\\.(com|net|org|info|biz|io|xyz|online|site|shop)\\M)' OR school ~* '(https?://|www\\.)' OR course ~* '(https?://|www\\.)'");
    for (const r of rows) await query("UPDATE docs SET title=$2, school=$3, course=$4 WHERE id=$1", [r.id, stripLinks(r.title).slice(0, 300) || "Document", stripLinks(r.school), stripLinks(r.course)]);
  } catch (e) { console.warn("[DOCS] link cleanup:", e.message); }
  renderStatus().then((r) => console.log(r.sharp && r.pdftoppm ? "[DOCS] page rendering ready (sharp + poppler)" : `[DOCS] WARNING page rendering NOT available: sharp=${r.sharp} pdftoppm=${r.pdftoppm}. PDFs/scans cannot be blurred until poppler-utils is installed (see Dockerfile).`)).catch(() => {});
  setTimeout(() => classifyBackfill().catch((e) => console.warn("[DOCS] classify backfill:", e.message)), 2000);
  setTimeout(() => backfill().catch((e) => console.warn("[DOCS] backfill:", e.message)).then(() => ocrBackfill()).catch((e) => console.warn("[DOCS] OCR backfill:", e.message)), 4000);
}

/* URL slug = the title the user typed, spaces -> "-", nothing else changed (all lower-case). */
function slugify(t) {
  return String(t || "").normalize("NFC").trim().replace(/[^\p{L}\p{N}\s_-]+/gu, "").trim().replace(/\s+/g, "-").replace(/-{2,}/g, "-").slice(0, 200).replace(/^-+|-+$/g, "").toLowerCase() || "document";
}
/* Visitor-supplied text (titles, course, school) may never carry links: nobody can use the library for link building.
   Removes http(s):// links, www. links and bare domains such as "example.com/page". */
const TLD = "com|net|org|info|biz|io|co|uk|us|in|edu|gov|xyz|online|site|shop|app|dev|me|ly|top|club|store|link|click|pro|ai|tv|cc|ws|to";
const LINK_RE = new RegExp("[^\\s@]+@[^\\s@]+\\.[^\\s@]+|(?:https?:\\/\\/|ftp:\\/\\/|www\\.)\\S+|\\b(?:[a-z0-9-]+\\.)+(?:" + TLD + ")\\b(?:\\/\\S*)?", "gi");
const stripLinks = (t) => String(t == null ? "" : t).replace(LINK_RE, " ").replace(/\s{2,}/g, " ").trim();
const urlFor = (r) => "/doc/" + encodeURIComponent(String(r.slug || slugify(r.title)).toLowerCase());

/* First free slug: "account-statement", then "account-statement-1", "-2", ... */
async function uniqueSlug(base) {
  base = String(base || "document").slice(0, 200).replace(/-+$/, "") || "document";
  const like = base.replace(/[\\%_]/g, "\\$&") + "-%";
  const { rows } = await query("SELECT slug FROM docs WHERE slug=$1 OR slug LIKE $2", [base, like]);
  const used = new Set(rows.map((r) => r.slug));
  if (!used.has(base)) return base;
  for (let n = 1; ; n++) if (!used.has(base + "-" + n)) return base + "-" + n;
}

/* One-off repair for rows created before slugs were unique: keep the oldest claimant, suffix the rest, free deleted ones. */
async function fixSlugs() {
  const { rows } = await query("SELECT id,title,slug,removed FROM docs ORDER BY id");
  const used = new Set(), todo = [];
  for (const r of rows) {
    if (r.removed) { if (r.slug) await query("UPDATE docs SET slug=NULL WHERE id=$1", [r.id]); continue; }
    const cur = r.slug && String(r.slug).toLowerCase();
    if (cur && !used.has(cur)) { used.add(cur); if (cur !== r.slug) await query("UPDATE docs SET slug=$2 WHERE id=$1", [r.id, cur]); } else todo.push(r);
  }
  for (const r of todo) {
    const base = slugify(r.title); let s = base;
    for (let n = 1; used.has(s); n++) s = base + "-" + n;
    used.add(s); await query("UPDATE docs SET slug=$2 WHERE id=$1", [r.id, s]);
  }
}
async function slugById(id) {
  const r = (await query("SELECT title,slug FROM docs WHERE id=$1 AND removed=false", [id])).rows[0];
  return r ? String(r.slug || slugify(r.title)).toLowerCase() : null;
}

/* ---------- page images (PDF + images): ~10% of each page sharp, the rest pixelated + blurred ON THE SERVER ---------- */
const MAXP = () => Number(process.env.DOC_MAX_RENDER_PAGES || 100);
const run = (cmd, args) => new Promise((res, rej) => execFile(cmd, args, { timeout: 120000, maxBuffer: 1 << 24 }, (e, out) => (e ? rej(e) : res(out))));

async function pdfToJpegs(buffer) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "doc-"));
  try {
    await fs.writeFile(path.join(dir, "in.pdf"), buffer);
    await run("pdftoppm", ["-jpeg", "-jpegopt", "quality=80", "-r", "100", "-l", String(MAXP()), path.join(dir, "in.pdf"), path.join(dir, "p")]);
    const files = (await fs.readdir(dir)).filter((f) => /^p-\d+\.jpg$/.test(f)).sort((a, b) => parseInt(a.slice(2), 10) - parseInt(b.slice(2), 10));
    return await Promise.all(files.map((f) => fs.readFile(path.join(dir, f))));
  } finally { fs.rm(dir, { recursive: true, force: true }).catch(() => {}); }
}

/* The hidden part is shrunk to ~30px wide before it is blurred, so the original pixels cannot be recovered. */
async function makePreview(jpeg, ratio = RATIO()) {
  if (ratio >= 1) return jpeg;   /* page fully visible */
  const { width: w, height: h } = await sharp(jpeg).metadata();
  const keep = ratio > 0 ? Math.min(h - 1, Math.max(1, Math.round(h * ratio))) : 0;   /* ratio 0 = the whole page is blurred */
  const tiny = await sharp(jpeg).extract({ left: 0, top: keep, width: w, height: h - keep }).resize({ width: Math.max(16, Math.round(w / (ratio > 0 ? 5 : 30))) }).toBuffer();
  const rest = await sharp(tiny).resize(w, h - keep, { fit: "fill" }).blur(ratio > 0 ? 2.5 : 8).jpeg({ quality: 60 }).toBuffer();
  if (!keep) return rest;
  const clear = await sharp(jpeg).extract({ left: 0, top: 0, width: w, height: keep }).jpeg({ quality: 80 }).toBuffer();
  return sharp({ create: { width: w, height: h, channels: 3, background: "#ffffff" } })
    .composite([{ input: clear, top: 0, left: 0 }, { input: rest, top: keep, left: 0 }]).jpeg({ quality: 75 }).toBuffer();
}
/* Page image for people who have not unlocked it, built from the stored full page with the CURRENT ratio. Documents that may not be
   indexed (or are not checked yet) get a fully blurred page. Small in-memory cache. */
const imgCache = new Map();
const IMG_CACHE_MAX = Math.max(50, Number(process.env.IMG_CACHE_MAX) || 300);   /* each entry ~50-150 KB; a miss re-reads the page from the database */
/* Icon of a document: for documents that may be indexed, page 1 is fully visible (small image / real text). Everything else stays blurred. */
async function thumbImage(doc, n) {
  if (n !== 1 || !isIndexable(doc) || !sharp) return previewImage(doc, n);
  const key = doc.id + ":thumb";
  if (imgCache.has(key)) return imgCache.get(key);
  const row = (await query('SELECT "full" AS img FROM doc_pages WHERE doc_id=$1 AND page_no=1', [doc.id])).rows[0];
  if (!row || !row.img) return null;
  const out = await sharp(row.img).resize({ width: 480 }).jpeg({ quality: 72 }).toBuffer();
  imgCache.set(key, out); if (imgCache.size > IMG_CACHE_MAX) imgCache.delete(imgCache.keys().next().value);
  return out;
}
const thumbText = (doc, body) => isIndexable(doc) ? maskSensitive(tidy(body)).slice(0, 1500) : preview(String(body || "").slice(0, 400), 0);
async function previewImage(doc, n) {
  const ratio = isIndexable(doc) ? visibleRatio(n, doc.page_count) : 0, key = doc.id + ":" + n + ":" + ratio;
  if (imgCache.has(key)) return imgCache.get(key);
  const row = (await query('SELECT "full" AS img FROM doc_pages WHERE doc_id=$1 AND page_no=$2', [doc.id, n])).rows[0];
  if (!row || !row.img || !sharp) return null;
  const out = await makePreview(row.img, ratio);
  imgCache.set(key, out); if (imgCache.size > IMG_CACHE_MAX) imgCache.delete(imgCache.keys().next().value);
  return out;
}

/* Background colour of the original page: the most common colour along the page edges of the rendered image (white paper stays white,
   a coloured / dark / tinted page keeps its colour). Stored once per page in doc_pages.bg and applied to the HTML text page. */
async function pageBg(jpeg) {
  if (!sharp || !jpeg) return null;
  try {
    /* v2: sample the real page edges at a higher resolution and return the colour that is actually there (median of the dominant colour group),
       so the HTML page uses the same background as the original document. Off-white / cream / tinted / dark pages keep their exact colour. */
    const { data, info } = await sharp(jpeg).resize({ width: 240, height: 340, fit: "inside" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const W = info.width, H = info.height, ring = Math.max(2, Math.round(Math.min(W, H) * 0.025)), buckets = new Map();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (x >= ring && x < W - ring && y >= ring && y < H - ring) continue;
      const i = (y * W + x) * 3, r = data[i], g = data[i + 1], b = data[i + 2], k = (r >> 3) << 10 | (g >> 3) << 5 | (b >> 3);
      let e = buckets.get(k); if (!e) { e = { n: 0, r: [], g: [], b: [] }; buckets.set(k, e); }
      e.n++; e.r.push(r); e.g.push(g); e.b.push(b);
    }
    let best = null; for (const e of buckets.values()) if (!best || e.n > best.n) best = e;
    if (!best) return null;
    const med = (a) => { a.sort((p, q) => p - q); return a[a.length >> 1]; };
    const c = [med(best.r), med(best.g), med(best.b)];
    if (c.every((v) => v >= 252)) return "#ffffff";   /* JPEG noise on a white page */
    return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
  } catch (e) { return null; }
}
const bgDone = new Set();
/* Fills doc_pages.bg for documents that were stored before this existed (once per document per server run). */
async function ensureBg(docId) {
  if (bgDone.has(String(docId))) return;
  bgDone.add(String(docId));
  try {
    const rows = (await query("SELECT page_no FROM doc_pages WHERE doc_id=$1 AND preview IS NOT NULL AND bg IS NULL", [docId])).rows;
    for (const r of rows) {
      const f = (await query('SELECT "full" AS img FROM doc_pages WHERE doc_id=$1 AND page_no=$2', [docId, r.page_no])).rows[0];
      await query("UPDATE doc_pages SET bg=$3 WHERE doc_id=$1 AND page_no=$2", [docId, r.page_no, (await pageBg(f && f.img)) || "#ffffff"]);
    }
  } catch (e) { bgDone.delete(String(docId)); console.warn("[DOCS] page background:", e.message); }
}

/* ---------- Uploader / date / rating shown under the title ---------- */
const shortName = (n) => { const w = String(n || "").trim().split(/\s+/).filter(Boolean); return !w.length ? "Member" : w.length === 1 ? w[0] : w[0] + " " + w[w.length - 1][0].toUpperCase() + "."; };
/* -> { by, date, filename, up, total, pct, mine } ; pct is the share of thumbs-up among all votes, null when nobody has voted yet. */
async function docMeta(doc, userId) {
  const u = doc.owner_id ? (await query("SELECT name FROM users WHERE id=$1", [doc.owner_id])).rows[0] : null;
  const v = (await query("SELECT COUNT(*) FILTER (WHERE vote=1)::int up, COUNT(*)::int total FROM doc_votes WHERE doc_id=$1", [doc.id])).rows[0];
  const mine = userId ? ((await query("SELECT vote FROM doc_votes WHERE doc_id=$1 AND user_id=$2", [doc.id, userId])).rows[0] || {}).vote || 0 : 0;
  return { by: shortName(u && u.name), date: doc.created_at, filename: doc.filename || "", up: v.up, total: v.total, pct: v.total ? Math.round((v.up / v.total) * 100) : null, mine };
}
async function castVote(doc, userId, vote) {
  vote = Number(vote) === 1 ? 1 : Number(vote) === -1 ? -1 : 0;
  const cur = ((await query("SELECT vote FROM doc_votes WHERE doc_id=$1 AND user_id=$2", [doc.id, userId])).rows[0] || {}).vote || 0;
  if (!vote || vote === cur) await query("DELETE FROM doc_votes WHERE doc_id=$1 AND user_id=$2", [doc.id, userId]);   /* same button again = take the vote back */
  else await query("INSERT INTO doc_votes(doc_id,user_id,vote) VALUES($1,$2,$3) ON CONFLICT (doc_id,user_id) DO UPDATE SET vote=EXCLUDED.vote, created_at=NOW()", [doc.id, userId, vote]);
  return docMeta(doc, userId);
}

/* Reports whether page rendering can work on this server (shown in the admin Documents window and the start-up log). */
async function renderStatus() {
  let pdftoppm = false;
  try { await run("pdftoppm", ["-v"]); pdftoppm = true; } catch (e) { pdftoppm = e && e.code !== "ENOENT"; }
  let tesseract = false;
  try { await run("tesseract", ["--version"]); tesseract = true; } catch (e) { tesseract = e && e.code !== "ENOENT"; }
  return { sharp: !!sharp, pdftoppm, tesseract };
}

/* ---------- Word / Excel / text files: LibreOffice turns them into a PDF so they are shown exactly as uploaded (same layout, same grid) ---------- */
const OFFICE_EXT = { docx: "docx", doc: "doc", rtf: "rtf", odt: "odt", txt: "txt", md: "txt", csv: "csv", xlsx: "xlsx", xls: "xls", ods: "ods" };
let officeQueue = Promise.resolve(), officeMissing = false;
async function officeToPdf(buffer, filename) {
  if (officeMissing) return null;
  const ext = OFFICE_EXT[(String(filename || "").toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1]];
  if (!ext) return null;
  const job = officeQueue.then(async () => {   /* one conversion at a time: LibreOffice is heavy */
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "office-"));
    try {
      await fs.writeFile(path.join(dir, "in." + ext), buffer);
      const args = ["--headless", "--norestore", "--nologo", "--nolockcheck", "-env:UserInstallation=file://" + path.join(dir, "profile"), "--convert-to", "pdf", "--outdir", dir, path.join(dir, "in." + ext)];
      await new Promise((res, rej) => execFile(process.env.SOFFICE_BIN || "soffice", args, { timeout: 150000, maxBuffer: 1 << 24 }, (e) => (e ? rej(e) : res())));
      return await fs.readFile(path.join(dir, "in.pdf"));
    } catch (e) {
      if (e && e.code === "ENOENT") { officeMissing = true; console.warn("[DOCS] LibreOffice (soffice) not installed: Word/Excel files will be shown as text (see Dockerfile)"); }
      else console.warn("[DOCS] office conversion failed:", e && e.message);
      return null;
    } finally { fs.rm(dir, { recursive: true, force: true }).catch(() => {}); }
  });
  officeQueue = job.catch(() => {});
  return job;
}
/* -> { imgs, pages } (page images + the text of each rendered page) or null when conversion is not possible. */
async function officeRender(file, kind) {
  if (!sharp || !["doc", "text", "sheet"].includes(kind)) return null;
  const pdf = await officeToPdf(file.buffer, file.originalname || file.filename);
  if (!pdf) return null;
  const imgs = await renderPages({ buffer: pdf }, "pdf");
  if (!imgs) return null;
  let pages = [];
  try { pages = (await extract({ buffer: pdf, originalname: "x.pdf", mimetype: "application/pdf" })).pages.map(tidy); } catch (e) { /* text is optional */ }
  return { imgs, pages };
}

/* -> [{ full, preview }] per page, or null when sharp / poppler-utils are missing (callers then fall back to text). */
async function renderPages(file, kind) {
  if (!sharp) return null;
  let jpegs;
  try {
    if (kind === "pdf") jpegs = await pdfToJpegs(file.buffer);
    else if (kind === "image") jpegs = [await sharp(file.buffer).rotate().resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer()];
    else return null;
  } catch (e) { console.warn("[DOCS] page rendering failed (is poppler-utils installed?):", e.message); return null; }
  if (!jpegs.length) return null;
  const out = [];
  for (const full of jpegs) out.push({ full, preview: await makePreview(full, 0) });   /* stored copy is fully blurred; previewImage() builds the real one */
  if (kind === "pdf") {   /* real HTML layout + text-free background of every page (falls back to the page image when poppler cannot do it) */
    try { const L = await pdfLayouts(file.buffer); out.forEach((o, i) => { if (L[i]) { o.lay = L[i].lay; o.bgimg = L[i].bgimg; } }); }
    catch (e) { console.warn("[DOCS] page layout:", e.message); }
  }
  return out;
}

/* ---------- HTML layout of PDF pages (Course Hero style): text-free background image + every text line placed by CSS ---------- */
const decEnt = (s) => String(s).replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(+d))
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const escH = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fontStack = (name) => {
  const n = String(name || "").replace(/^[A-Z]{6}\+/, "").toLowerCase();
  if (/courier|mono|consolas/.test(n)) return "'Courier New',Courier,monospace";
  if (/times|georgia|cambria|garamond|serif|book|palatino|minion|roman/.test(n) && !/sans/.test(n)) return "'Times New Roman',Times,'Liberation Serif',serif";
  if (/calibri|carlito/.test(n)) return "Calibri,Carlito,'Segoe UI',Arial,sans-serif";
  return "Arial,Helvetica,'Liberation Sans',sans-serif";
};
/* pdftohtml -c writes each page WITHOUT its text as a picture; pdftohtml -xml gives every text line with position, font size, colour, bold / italic. */
async function pdfLayouts(buffer) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "lay-"));
  try {
    const pdf = path.join(dir, "in.pdf"), last = String(MAXP());
    await fs.writeFile(pdf, buffer);
    await run("pdftohtml", ["-c", "-s", "-nodrm", "-zoom", "1.5", "-fmt", "jpg", "-l", last, pdf, path.join(dir, "bg")]);
    await run("pdftohtml", ["-xml", "-i", "-nodrm", "-zoom", "1.5", "-l", last, pdf, path.join(dir, "tx")]);
    const imgs = {}; for (const f of await fs.readdir(dir)) { const m = f.match(/^bg-?0*(\d+)\.jpg$/); if (m) imgs[+m[1]] = path.join(dir, f); }
    const xml = await fs.readFile(path.join(dir, "tx.xml"), "utf8"), out = [], gfont = {};
    /* poppler declares each font only once (on the first page that uses it), so the font table is read for the whole document */
    for (const fm of xml.matchAll(/<fontspec id="(\d+)" size="(\d+)" family="([^"]*)" color="([^"]*)"\/>/g)) gfont[fm[1]] = [+fm[2], fontStack(decEnt(fm[3])), /^#[0-9a-f]{6}$/i.test(fm[4]) ? fm[4] : "#000000"];
    for (const pm of xml.matchAll(/<page number="(\d+)"[^>]*?height="(\d+)" width="(\d+)">([\s\S]*?)<\/page>/g)) {
      const no = +pm[1], h = +pm[2], w = +pm[3], fonts = [], fid = {};
      const useF = (id) => { if (!gfont[id]) return null; if (fid[id] == null) { fid[id] = fonts.length; fonts.push(gfont[id]); } return fid[id]; };
      const t = []; let chars = 0;
      for (const tm of pm[4].matchAll(/<text top="(-?\d+)" left="(-?\d+)" width="(\d+)" height="(\d+)" font="(\d+)">([\s\S]*?)<\/text>/g)) {
        const raw = tm[6]; const fi = useF(tm[5]); if (!decEnt(raw.replace(/<[^>]*>/g, "")).trim() || fi == null) continue;
        let html = ""; for (const m of raw.matchAll(/<(\/?)(b|i|a)\b([^>]*)>|([^<]+)/g)) {   /* only <b> <i> and http(s) links survive */
          if (m[4] !== undefined) html += escH(decEnt(m[4]));
          else if (m[2] === "a") { if (m[1]) html += "</a>"; else { const u = decEnt((m[3].match(/href="([^"]*)"/) || [])[1] || ""); html += /^https?:\/\//i.test(u) ? `<a href="${escH(u)}" target="_blank" rel="nofollow ugc noopener noreferrer">` : "<a>"; } }
          else html += `<${m[1]}${m[2]}>`;
        }
        chars += decEnt(raw.replace(/<[^>]*>/g, "")).trim().length;
        t.push([+tm[2], +tm[1], +tm[3], +tm[4], fi, html]);
      }
      let bgimg = null; if (imgs[no]) bgimg = await sharp(imgs[no]).resize({ width: 1000, withoutEnlargement: true }).jpeg({ quality: 78 }).toBuffer();
      /* a page with (almost) no text is a scan / picture: it stays a page image (blurred on the server) */
      out[no - 1] = { lay: chars >= 20 && t.length >= 3 && bgimg ? { w, h, f: fonts, t } : { w, h, f: [], t: [] }, bgimg: chars >= 20 && t.length >= 3 ? bgimg : null };
    }
    return out;
  } finally { fs.rm(dir, { recursive: true, force: true }).catch(() => {}); }
}
/* Plain text of a page in reading order, built from the positioned lines (words keep their spaces; lines of one row are joined left to right). */
function layText(lay) {
  if (!lay || !lay.t || !lay.t.length) return "";
  const plain = (h) => h.replace(/<[^>]*>/g, "").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  const rows = [...lay.t].sort((a, b) => a[1] - b[1] || a[0] - b[0]), lines = [];
  for (const r of rows) { const L = lines[lines.length - 1]; if (L && Math.abs(r[1] - L.top) <= Math.max(3, r[3] * 0.5)) L.items.push(r); else lines.push({ top: r[1], h: r[3], items: [r] }); }
  let out = "", prev = null;
  for (const L of lines) {
    const s = L.items.sort((a, b) => a[0] - b[0]).map((r) => plain(r[5])).join(" ").replace(/\s+/g, " ").trim();
    if (!s) continue;
    out += (prev !== null && L.top - prev > L.h * 1.8 ? "\n\n" : out ? "\n" : "") + s; prev = L.top;
  }
  return out;
}
/* ---- Search-driven window ---- */
const plainHtml = (h) => String(h).replace(/<[^>]*>/g, "").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
/* Words of a visitor's search (own search box, ?q=, or the query a search engine passes in the referrer). */
function queryTerms(q) {
  const all = [...new Set(String(q || "").toLowerCase().replace(/[^\p{L}\p{N}$%.\s-]/gu, " ").split(/\s+/).map((w) => w.replace(/^[.-]+|[.-]+$/g, "")).filter((w) => w.length >= 2))].slice(0, 10);
  const key = all.filter((w) => !STOP.has(w));
  return key.length ? key : all;
}
/* Bing / Yahoo / DuckDuckGo / Ecosia / Yandex / Baidu may pass the query in the Referer. Google does not (it sends the origin only). */
function refQuery(ref) {
  try { const u = new URL(String(ref || "")); return u.searchParams.get("q") || u.searchParams.get("p") || u.searchParams.get("query") || u.searchParams.get("text") || u.searchParams.get("wd") || ""; } catch (e) { return ""; }
}
/* Where the clear window of a page starts/ends (in layout units). Default: the top `ratio` of the page. With search terms: the same height, moved so it holds the
   lines that match the most distinct terms (first best match wins), with the match a little below the top edge. */
function searchWindow(lay, ratio, terms) {
  const H = lay.h, win = H * ratio, def = { start: 0, end: win };
  if (ratio >= 1 || !terms || !terms.length || !lay.t || !lay.t.length) return def;
  const rows = lay.t.map((r) => ({ top: r[1], s: plainHtml(r[5]).toLowerCase() })).sort((a, b) => a.top - b.top);
  let best = -1, bs = 0;
  for (let i = 0; i < rows.length; i++) {
    const lo = rows[i].top - win * 0.2, hi = lo + win, hit = new Set();
    for (const r of rows) if (r.top >= lo && r.top < hi) for (const t of terms) if (r.s.includes(t)) hit.add(t);
    if (hit.size > bs) { bs = hit.size; best = i; }
  }
  if (best < 0) return def;
  const lo = rows[best].top - win * 0.2, first = rows.find((r) => r.top >= lo && terms.some((t) => r.s.includes(t)));   /* first matching line of the best window */
  const start = Math.max(0, Math.min(H - win, first.top - win * 0.1));
  return { start, end: start + win };
}
/* Whole sentences: lines of one paragraph are joined with spaces, so a sentence is one unbroken piece of text in the HTML. */
const layParas = (lay) => layText(lay).split(/\n{2,}/).map((x) => x.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean);
/* Text of the part that is clear (inside the window), cut at the end of a sentence. */
function sentenceCut(t, soft, hard) {
  t = String(t || "").replace(/\s+/g, " ").trim();
  if (t.length <= soft) return { text: t, cut: false };
  const m = t.slice(soft, hard).search(/[.!?](\s|$)/);
  if (m >= 0) { const e = soft + m + 1; return { text: t.slice(0, e), cut: e < t.length }; }
  const sp = t.slice(0, soft).lastIndexOf(" ");
  return { text: t.slice(0, sp > 0 ? sp : soft), cut: true };
}
function layVisibleText(p, terms) {
  const L = p.lay, cl = p.clear == null ? 1 : p.clear, w = searchWindow(L, cl, terms);
  return layText({ ...L, t: L.t.filter((r) => cl >= 1 || (r[1] >= w.start && r[1] < w.end)) });
}
/* The HTML of one laid-out page (same markup the browser builds): text-free background + every line placed by CSS; lines outside the clear window carry .bl
   (blurred by CSS, declared paywalled in the JSON-LD). `.sr` holds the WHOLE page text as normal paragraphs (nothing cut, no "…"), so crawlers and View Source
   see complete sentences; the positioned line spans repeat it for the eye and are aria-hidden so screen readers do not read it twice. */
function layPageHtml(p, docId, terms) {
  const L = p.lay, cl = p.clear == null ? 1 : p.clear, pc = (v) => (v * 100).toFixed(3), w = searchWindow(L, cl, terms);
  const noSnip = process.env.DOC_NOSNIPPET === "1" ? " data-nosnippet" : "";   /* off by default: Google may quote the matching text in its results */
  const sp = L.t.map((r) => { const f = L.f[r[4]] || [16, "Arial,sans-serif", "#000000"], b = cl < 1 && (r[1] < w.start || r[1] >= w.end);
    return `<span${b ? ' class="bl"' + noSnip : ""} aria-hidden="true" style="left:${pc(r[0] / L.w)}%;top:${pc(r[1] / L.h)}%;font:${pc(f[0] / L.w)}cqw/${pc(r[3] / L.w)}cqw ${f[1]};color:${f[2]}">${r[5]}</span>`; }).join("");
  const bg = /^#[0-9a-f]{6}$/i.test(p.bg) ? p.bg : "#ffffff";
  const full = layParas(L).map((x) => `<p>${escH(x)}</p>`).join("");
  return `<section class="pg ly" id="page-${p.n}" style="background:${bg}!important;background-image:url(/api/docs/${docId}/bg/${p.n})!important;background-size:100% 100%!important;background-repeat:no-repeat!important;aspect-ratio:${L.w}/${L.h}!important"><h2 class="sr">Page ${p.n}</h2><div class="sr" id="text-${p.n}">${full}</div><div class="tl">${sp}</div>${cl < 1 && w.start > 0 ? `<div class="vt" style="height:${pc(w.start / L.h)}%"></div>` : ""}${cl < 1 && w.end < L.h ? `<div class="vl" style="top:${pc(w.end / L.h)}%"></div>` : ""}</section>`;
}
const layDone = new Set();
/* Documents stored before this existed get their layout the first time they are opened (once per document per server run). */
async function ensureLayout(doc) {
  if (!doc || !doc.img || !sharp || layDone.has(String(doc.id))) return;
  layDone.add(String(doc.id));
  try {
    if (!(await query("SELECT 1 FROM doc_pages WHERE doc_id=$1 AND preview IS NOT NULL AND lay IS NULL LIMIT 1", [doc.id])).rowCount) return;
    const f = (await query("SELECT data FROM doc_files WHERE doc_id=$1", [doc.id])).rows[0]; if (!f || !f.data) return;
    const pdf = f.data.slice(0, 4).toString() === "%PDF" ? f.data : await officeToPdf(f.data, doc.filename);
    if (!pdf) return;
    const L = await pdfLayouts(pdf);
    for (let i = 0; i < L.length; i++) if (L[i]) {
      const txt = L[i].lay.t.length >= 3 ? layText(L[i].lay) : "";   /* the stored text is replaced by the layout text: the PDF text extractor had dropped the spaces between words */
      await query("UPDATE doc_pages SET lay=$3, bgimg=$4, body=CASE WHEN $5::text <> '' THEN $5::text ELSE body END WHERE doc_id=$1 AND page_no=$2", [doc.id, i + 1, JSON.stringify(L[i].lay), L[i].bgimg, txt]);
    }
  } catch (e) { layDone.delete(String(doc.id)); console.warn("[DOCS] layout:", e.message); }
}
/* What a viewer may receive of a page layout: everything for readers and for crawlers of an indexable document; otherwise only the lines inside the readable top part. */
function layFor(lay, ratio, all, full) {
  if (!lay || !lay.t || lay.t.length < 3) return null;
  const keep = all ? lay.t : lay.t.filter((r) => r[1] < lay.h * ratio);
  const t = full ? keep : keep.map((r) => [r[0], r[1], r[2], r[3], r[4], r[5].replace(/(^|>)([^<>]+)/g, (m, g, s) => g + maskSensitive(s))]);
  return { w: lay.w, h: lay.h, f: lay.f, t };
}

/* ---------- OCR: scanned pages become real text so Google can read them ---------- */
let tessMissing = false; const ocrBusy = new Set();
async function ocrImage(jpeg) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ocr-"));
  try {
    await fs.writeFile(path.join(dir, "p.png"), await sharp(jpeg).resize({ width: 2000 }).grayscale().normalize().png().toBuffer());
    return String(await run("tesseract", [path.join(dir, "p.png"), "stdout", "-l", "eng", "--psm", "3"])).replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  } finally { fs.rm(dir, { recursive: true, force: true }).catch(() => {}); }
}
/* Fills in the text of pages that only exist as an image. Runs in the background; never blocks an upload. */
async function ocrDoc(id) {
  if (!sharp || tessMissing || ocrBusy.has(id)) return;
  ocrBusy.add(id);
  try {
    const { rows } = await query('SELECT page_no, "full" AS img FROM doc_pages WHERE doc_id=$1 AND body=\'\' AND "full" IS NOT NULL ORDER BY page_no LIMIT $2', [id, MAX_OCR()]);
    for (const r of rows) {
      let t = "";
      try { t = await ocrImage(r.img); }
      catch (e) { if (e.code === "ENOENT") { tessMissing = true; console.warn("[DOCS] tesseract not installed: OCR skipped (see Dockerfile)"); return; } console.warn("[DOCS] OCR failed on doc", id, "page", r.page_no, e.message); }
      await query("UPDATE doc_pages SET body=$3 WHERE doc_id=$1 AND page_no=$2", [id, r.page_no, t || " "]);
    }
    if (rows.length) console.log("[DOCS] OCR finished for document", id);
    await classify(id).catch((e) => console.warn("[DOCS] classify:", e.message));
  } finally { ocrBusy.delete(id); }
}
async function ocrBackfill() {
  if (!sharp) return;
  const { rows } = await query('SELECT DISTINCT doc_id FROM doc_pages WHERE body=\'\' AND "full" IS NOT NULL ORDER BY doc_id LIMIT 15');
  for (const r of rows) await ocrDoc(r.doc_id);
}

/* ---------- Crawlable text: the real HTML text shown to everyone (and Google) ---------- */
/* Long digit runs (account / card / phone numbers) and e-mail addresses are masked before text is published. */
const maskSensitive = (t) => String(t).replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "•••").replace(/\b[A-Z]{5}\d{4}[A-Z]\b/g, "•••").replace(/\b[A-Z]{4}0[A-Z0-9]{6}\b/g, "•••").replace(/\d[\d\s-]{7,}\d/g, (m) => (m.replace(/\D/g, "").length >= 9 ? "•••" : m));
function excerpt(bodies, ratio) {
  const text = bodies.map((b) => String(b || "").trim()).filter(Boolean).join("\n\n").slice(0, 200000);
  if (!text) return "";
  let out = text;
  if (ratio < 1) {
    out = text.slice(0, Math.floor(text.length * ratio));
    const sp = out.search(/\s\S*$/); if (sp > 0) out = out.slice(0, sp);
    out = out.trim() + " …";
  }
  return maskSensitive(out);
}
/* Splits one page of text for display. Locked viewers of an indexable doc get: a = ~35% readable, b = the other ~65% as real text that CSS
   blurs (so search engines read all of it). Locked viewers of any other doc get c only: every word replaced by blocks on the SERVER.
   Full readers get everything in a. */
/* Blank-line runs from PDF extraction made pages start with a big empty gap. */
const tidy = (t) => String(t || "").replace(/\r/g, "").replace(/[ \t\f\v\u00a0]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
function pageParts(body, full, crawl, ratio) {
  const text = tidy(body);
  if (full) return { a: text, b: "", c: "" };
  const toks = maskSensitive(text).split(/(\s+)/);
  const N = toks.filter((w) => w.trim()).length;
  /* crawl (indexable doc): ~30% clear + the REST AS REAL TEXT (blurred by CSS, readable by crawlers). Otherwise nothing is readable. */
  const clear = crawl ? Math.min(N, Math.ceil(N * (ratio == null ? RATIO() : ratio))) : 0, real = crawl ? N : 0;
  let a = "", b = "", c = "", k = 0;
  for (const w of toks) {
    if (!w.trim()) { if (k < clear) a += w; else if (k < real) b += w; else c += w; continue; }
    if (k < clear) a += w; else if (k < real) b += w; else c += w.replace(/[^\s]/g, "\u2592");
    k++;
  }
  return { a, b, c };
}
/* Title rule: the title the user typed, else the file name, else the first heading inside the document. */
const GENERIC_NAME = /^(img|image|scan|scanned|doc|document|file|untitled|screenshot|whatsapp|photo|pic|download|new)?[\s_-]*[\d\s_()-]*$/i;
const cleanName = (n) => stripLinks(String(n || "").replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ")).slice(0, 200);
function headingOf(text) {
  for (const raw of String(text || "").split(/\n+/).slice(0, 40)) {
    const l = stripLinks(raw).replace(/\s+/g, " ").trim();
    if (l.length >= 4 && l.length <= 120 && (l.match(/[A-Za-z]/g) || []).length >= 4 && (l.match(/\d/g) || []).length < l.length / 2) return l;
  }
  return "";
}
/* First letter of every word is upper case (the rest of the word is left as typed). */
const titleCase = (t) => String(t || "").replace(/(^|[\s(\[\-\/"'])(\p{Ll})/gu, (m, a, b) => a + b.toUpperCase());
function pickTitle(typed, filename, pages) {
  const t = stripLinks(typed).slice(0, 200); if (t) return titleCase(t);
  const f = cleanName(filename); if (f && !GENERIC_NAME.test(f)) return titleCase(f);
  return titleCase(headingOf((pages || []).join("\n")).slice(0, 200) || f || "Document");
}
function keywordsOf(...parts) {
  const seen = new Set(), out = [];
  for (const w of parts.join(" ").toLowerCase().match(/[a-z0-9][a-z0-9+&'-]{2,}/g) || []) if (!STOP.has(w) && !seen.has(w)) { seen.add(w); out.push(w); }
  return out.slice(0, 12);
}

async function seoData(slug) {
  const doc = (await query("SELECT * FROM docs WHERE slug=$1 AND removed=false", [slug])).rows[0];
  if (!doc) return null;
  if (!isIndexable(doc)) return { doc, indexable: false, pages: [], text: "" };
  await ensureBg(doc.id);
  await ensureLayout(doc);
  const rows = (await query("SELECT page_no, body, bg, lay FROM doc_pages WHERE doc_id=$1 ORDER BY page_no", [doc.id])).rows;
  const pages = rows.map((r) => { const vr = visibleRatio(r.page_no, doc.page_count, r.lay), p = pageParts(r.body, false, true, vr); return { n: r.page_no, bg: r.bg || "#ffffff", a: p.a.trim(), b: p.b.trim(), clear: vr, lay: layFor(r.lay, vr, true, false) }; }).filter((p) => p.a || p.b);   /* same clear/blurred split people see */
  return { doc, indexable: pages.length > 0, pages, heading: headingOf(rows.map((r) => r.body).join("\n")), text: pages.map((p) => p.a + " " + p.b).join("\n\n") };
}

/* ---------- Which documents may be indexed ---------- */
/* A document is only published to search engines when NONE of these personal-data patterns is found in its title or text.
   Scans wait (unindexed) until OCR has produced text. A false positive only means "not indexed"; there is deliberately no override to force it. */
const PII = [
  ["PAN number", /\b[A-Z]{5}\d{4}[A-Z]\b/],
  ["Aadhaar number", /\b\d{4}\s\d{4}\s\d{4}\b|\b[xX*]{4}\s?[xX*]{4}\s?\d{4}\b/i],
  ["SSN", /\b\d{3}-\d{2}-\d{4}\b/],
  ["ID document", /\b[Pp]assport\s*(?:[Nn]o\.?|[Nn]umber)?\s*[:#-]?\s*[A-Z]\d{7}\b|\b[A-Z]{2}\d{2}[\s-]?\d{11}\b|\b[A-Z]{3}\d{7}\b/],
  ["bank details", /\b(?:account|a\/c)\s*(?:no\.?|number)?\s*[:#-]?\s*\d{9,18}\b|\b(?:\d{4}[\s-]){3}\d{4}\b|\bcvv\s*[:#-]?\s*\d{3,4}\b|\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/i],
  ["bank details", /\b[A-Z]{4}0[A-Z0-9]{6}\b/],
  ["tax / payroll record", /\backnowledg(?:e)?ment\s*(?:no\.?|number)\s*[:#-]?\s*\d{10,15}\b/i],
  ["date of birth", /\b(?:date\s*of\s*birth|D\.?O\.?B\.?)\s*[:\-]?\s*\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}\b/i],
  ["medical record", /\bpatient\s*id\s*[:#-]?\s*[A-Z0-9-]{5,}\b/i],
];
const piiReasons = (text) => [...new Set(PII.filter(([, re]) => re.test(text)).map(([n]) => n))];
const isIndexable = (doc) => !!doc && doc.idx === 1 && !doc.noindex;
const clearRatio = () => RATIO();
/* Library categories (Study Resources menu): keyword filters shared by the API, the crawler HTML and the sitemap. */
const LIB_CATS = { guides: "study guide|guide|notes|summary|review|cheat sheet|revision|lecture", solutions: "solution|textbook|answer key|answers|chapter|exercise|problem set|homework", literature: "literature|novel|poem|poetry|shakespeare|book|story|character|theme|essay|analysis", school: "school|university|college|course|class|syllabus|exam|assignment|semester|campus" };

/* ---------- SEO / link-promotion documents are not wanted: they are refused at upload and removed if found later ---------- */
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"')\]]+/gi;
const PROMO_RE = /\b(?:buy(?:ing)?\s+backlinks?|backlinks?|link[\s-]?building|guest[\s-]?post(?:s|ing)?|sponsored\s+posts?|dofollow|do-follow|pbn|private\s+blog\s+network|seo\s+(?:services?|agency|company|packages?|expert|ranking|optimi[sz]ation)|rank\s+(?:#?1|first)\s+on\s+google|domain\s+authority)\b/i;
const urlsIn = (t) => [...new Set((String(t).match(URL_RE) || []).map((u) => u.toLowerCase().replace(/[.,;:!?]+$/, "")))];
/* -> a short reason when the text looks like it was posted to pass links / sell SEO, otherwise "" */
function seoSpamReason(text) {
  const t = String(text || ""), urls = urlsIn(t), words = (t.match(/\S+/g) || []).length || 1;
  const maxLinks = Number(process.env.DOC_SEO_MAX_LINKS || 8);
  if (urls.length >= 1 && PROMO_RE.test(t)) return "SEO / link promotion";
  if (urls.length >= maxLinks && urls.length * 150 > words) return "too many outbound links (" + urls.length + ")";
  return "";
}
/* Turns URLs inside ALREADY HTML-ESCAPED text into links that pass no SEO value. */
const linkNF = (escaped) => String(escaped).replace(URL_RE, (m) => {
  const tail = (m.match(/[.,;:!?]+$/) || [""])[0], u = tail ? m.slice(0, -tail.length) : m, href = /^www\./i.test(u) ? "https://" + u : u;
  return `<a href="${href}" rel="nofollow ugc noopener noreferrer" target="_blank">${u}</a>${tail}`;
});
async function classify(id) {
  const d = (await query("SELECT title FROM docs WHERE id=$1", [id])).rows[0];
  if (!d) return;
  const text = (await query("SELECT body FROM doc_pages WHERE doc_id=$1", [id])).rows.map((r) => r.body || "").join("\n").trim();
  if (text.length < 20) return;   /* nothing readable yet (scan waiting for OCR): stays unindexed */
  const spam = seoSpamReason(d.title + "\n" + text);
  if (spam) { await query("UPDATE docs SET removed=true, noindex=true, idx=0, idx_note=$2 WHERE id=$1", [id, "removed: " + spam]); console.warn("[DOCS] document", id, "removed:", spam); return; }
  const why = piiReasons(d.title + "\n" + text);
  await query("UPDATE docs SET idx=$2, idx_note=$3 WHERE id=$1", [id, why.length ? 0 : 1, why.join(", ") || null]);
}
async function classifyBackfill() {
  const { rows } = await query("SELECT id FROM docs WHERE idx IS NULL AND removed=false ORDER BY id LIMIT 500");
  for (const r of rows) await classify(r.id);
}

/* Re-processes documents uploaded before page images existed (e.g. scanned PDFs that showed up blank). */
async function backfill() {
  if (!sharp) return;
  const { rows } = await query("SELECT id, kind, filename FROM docs WHERE img=false AND removed=false AND kind IN ('pdf','image','doc','text','sheet') ORDER BY id LIMIT 25");
  for (const d of rows) {
    const f = (await query("SELECT data FROM doc_files WHERE doc_id=$1", [d.id])).rows[0];
    if (!f) continue;
    let imgs = null, pages = null;
    if (["doc", "text", "sheet"].includes(d.kind)) { const o = await officeRender({ buffer: f.data, originalname: d.filename }, d.kind); if (o) { imgs = o.imgs; pages = o.pages; } }
    else imgs = await renderPages({ buffer: f.data }, d.kind);
    if (!imgs) continue;
    await query("DELETE FROM doc_pages WHERE doc_id=$1 AND page_no>$2", [d.id, imgs.length]);
    for (let i = 0; i < imgs.length; i++)
      await query(`INSERT INTO doc_pages(doc_id,page_no,body,preview,"full") VALUES($1,$2,$5,$3,$4) ON CONFLICT (doc_id,page_no) DO UPDATE SET preview=EXCLUDED.preview,"full"=EXCLUDED."full"${pages ? ",body=EXCLUDED.body" : ""}`, [d.id, i + 1, imgs[i].preview, imgs[i].full, pages ? pages[i] || "" : ""]);
    await query("UPDATE docs SET img=true, page_count=$2 WHERE id=$1", [d.id, imgs.length]);
    console.log("[DOCS] rendered page images for document", d.id);
  }
}

function splitPages(text, size = 3000) {
  const paras = String(text || "").replace(/\r/g, "").split(/\n+/), pages = []; let cur = "";
  for (const p of paras) { if (cur.length + p.length > size && cur) { pages.push(cur); cur = ""; } cur += (cur ? "\n" : "") + p; }
  if (cur.trim() || !pages.length) pages.push(cur);
  return pages;
}

async function extract(file) {
  const name = String(file.originalname || "").toLowerCase(), mime = file.mimetype || "";
  if (mime === "application/pdf" || name.endsWith(".pdf")) {
    const pages = [];
    let n = 0;
    try {
      const r = await require("pdf-parse")(file.buffer, { pagerender: async (pd) => {
        const tc = await pd.getTextContent(); let t = "", y;
        for (const it of tc.items) { if (!it.str) { if (it.hasEOL) t += "\n"; continue; } if (y !== undefined && Math.abs(y - it.transform[5]) > 2) t += "\n"; t += it.str; y = it.transform[5]; }
        pages.push(t); return t; } });
      n = r.numpages || pages.length;
    } catch (e) { console.warn("[DOCS] pdf text extraction failed:", e.message); }
    return { kind: "pdf", pages: pages.length ? pages : [""], count: n || pages.length || 1 };
  }
  if (name.endsWith(".docx")) { const t = (await require("mammoth").extractRawText({ buffer: file.buffer })).value; const p = splitPages(t); return { kind: "doc", pages: p, count: p.length }; }
  if (/\.(txt|md|csv|rtf)$/.test(name) || mime.startsWith("text/")) { const p = splitPages(file.buffer.toString("utf8")); return { kind: "text", pages: p, count: p.length }; }
  if (/\.(xlsx|xls)$/.test(name)) {
    let X; try { X = require("xlsx"); } catch { const e = new Error("Excel support needs: npm install xlsx"); e.status = 415; throw e; }
    const wb = X.read(file.buffer); const p = wb.SheetNames.map((s) => s + "\n" + X.utils.sheet_to_csv(wb.Sheets[s]));
    return { kind: "sheet", pages: p, count: p.length };
  }
  if (mime.startsWith("image/")) return { kind: "image", pages: [""], count: 1 };
  const e = new Error("Unsupported file type. Upload PDF, DOCX, XLSX, CSV, TXT or an image."); e.status = 415; throw e;
}

/* ~10% of the words stay readable; every other letter/digit is replaced, spacing and punctuation kept. */
function preview(body, ratio = RATIO()) {
  const words = maskSensitive(String(body)).split(/(\s+)/), real = words.filter((w) => w.trim()).length;
  let keep = Math.ceil(real * ratio), seen = 0;
  const L = "abcdefghijklmnopqrstuvwxyz";
  return words.map((w) => { if (!w.trim()) return w; if (seen++ < keep) return w;
    return "\u0001" + w.replace(/[a-z]/gi, (c) => { const r = L[crypto.randomInt(26)]; return c === c.toUpperCase() ? r.toUpperCase() : r; }).replace(/\d/g, () => String(crypto.randomInt(10))) + "\u0002"; }).join("");
}

async function stripe(method, path, form) {
  if (!STRIPE_KEY()) { const e = new Error("Payments aren't switched on yet."); e.status = 503; throw e; }
  const r = await fetch("https://api.stripe.com" + path, { method, headers: { Authorization: "Bearer " + STRIPE_KEY(), "Content-Type": "application/x-www-form-urlencoded" }, body: form ? new URLSearchParams(form).toString() : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { console.error("[DOCS] Stripe:", d.error && d.error.message); const e = new Error("Payments are temporarily unavailable."); e.status = 502; throw e; }
  return d;
}

async function planStatus(userId) {
  const { rows } = await query("SELECT stripe_sub_id FROM doc_plans WHERE user_id=$1", [userId]);
  if (!rows[0]) return { active: false, used: 0, limit: PLAN_FILES() };
  let active = false;
  try { active = ["active", "trialing"].includes((await stripe("GET", "/v1/subscriptions/" + rows[0].stripe_sub_id)).status); } catch { active = false; }
  const u = await query("SELECT COUNT(*)::int n FROM doc_unlocks WHERE user_id=$1 AND source='plan' AND created_at > NOW() - INTERVAL '30 days'", [userId]);
  return { active, used: u.rows[0].n, limit: PLAN_FILES() };
}

/* Subscription check, cached for a minute so a page view does not call Stripe every time. */
const PLAN_CACHE = new Map();
async function planActive(userId) {
  const hit = PLAN_CACHE.get(String(userId));
  if (hit && hit.t > Date.now()) return hit.v;
  let v = false;
  try { v = (await planStatus(userId)).active; } catch { v = false; }
  PLAN_CACHE.set(String(userId), { v, t: Date.now() + 60000 });
  return v;
}
const forgetPlan = (userId) => PLAN_CACHE.delete(String(userId));

/* Uploads earn free unlocks: upload at least UPLOADS_PER_FREE (5) qualifying documents (3+ pages, not duplicates) and you receive
   UNLOCKS_PER_BATCH (5) free unlocks. Every further block of 5 uploads earns another 5. */
const UNLOCKS_PER_BATCH = () => Math.max(1, Number(process.env.DOC_UNLOCKS_PER_BATCH || 5));
async function uploadCredits(userId) {
  const per = UPLOADS_PER_FREE(), reward = UNLOCKS_PER_BATCH();
  const up = (await query("SELECT COUNT(*)::int n FROM docs WHERE owner_id=$1 AND removed=false AND page_count>=$2", [userId, MIN_PAGES()])).rows[0].n;
  const sp = (await query("SELECT COUNT(*)::int n FROM doc_unlocks WHERE user_id=$1 AND source='upload'", [userId])).rows[0].n;
  const earned = Math.floor(up / per) * reward;
  return { uploads: up, per, reward, earned, spent: sp, available: Math.max(0, earned - sp), toNext: per - (up % per), minPages: MIN_PAGES() };
}

/* Visitors without an account earn unlocks too (counted by the guest cookie). They can use them after signing up: the uploads move to the new account. */
async function guestCredits(gid) {
  const per = UPLOADS_PER_FREE(), reward = UNLOCKS_PER_BATCH();
  const up = gid ? (await query("SELECT COUNT(*)::int n FROM docs WHERE guest_id=$1 AND owner_id IS NULL AND removed=false AND page_count>=$2", [gid, MIN_PAGES()])).rows[0].n : 0;
  const earned = Math.floor(up / per) * reward;
  return { uploads: up, per, reward, earned, spent: 0, available: earned, toNext: per - (up % per), minPages: MIN_PAGES(), guest: true };
}
async function claimGuest(gid, userId) {
  if (!gid || !userId) return 0;
  return (await query("UPDATE docs SET owner_id=$2 WHERE guest_id=$1 AND owner_id IS NULL", [gid, userId])).rowCount;
}

/* ---------- Quality + duplicate checks for new uploads ---------- */
const MIN_PAGES = () => Math.max(1, Number(process.env.DOC_MIN_PAGES || 3));
const DUP_SIM = () => Math.min(1, Math.max(0.5, Number(process.env.DOC_DUP_SIMILARITY || 0.8)));   /* 80%+ similar = duplicate */
const NPERM = 128;
const SEEDS = Array.from({ length: NPERM }, (_, i) => (Math.imul(i + 1, 0x9e3779b1) ^ 0x85ebca6b) >>> 0);
function h32(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const mix = (x) => { x ^= x >>> 16; x = Math.imul(x, 0x7feb352d); x ^= x >>> 15; x = Math.imul(x, 0x846ca68b); x ^= x >>> 16; return x >>> 0; };
/* text -> { sig (base64 MinHash), n (shingle count) } or null when there is too little text to compare (e.g. a scan not yet read by OCR). */
function fingerprint(text) {
  const w = String(text || "").toLowerCase().replace(/[^a-z0-9\u00c0-\uffff]+/g, " ").trim().split(" ").filter(Boolean).slice(0, 40000);
  if (w.length < 60) return null;
  const set = new Set(); for (let i = 0; i + 3 <= w.length; i++) set.add(h32(w.slice(i, i + 3).join(" ")));
  const mins = new Uint32Array(NPERM).fill(0xffffffff);
  for (const x of set) for (let k = 0; k < NPERM; k++) { const v = mix((x ^ SEEDS[k]) >>> 0); if (v < mins[k]) mins[k] = v; }
  return { sig: Buffer.from(mins.buffer).toString("base64"), n: set.size };
}
const decodeSig = (b64) => new Uint32Array(Uint8Array.from(Buffer.from(b64, "base64")).buffer);
/* Fingerprints for documents stored before this existed (or whose OCR finished later). */
async function ensureSigs() {
  for (let round = 0; round < 20; round++) {
    const rows = (await query(`SELECT id FROM docs WHERE removed=false AND sig IS NULL AND EXISTS (SELECT 1 FROM doc_pages p WHERE p.doc_id=docs.id AND length(p.body)>200) ORDER BY id LIMIT 100`)).rows;
    if (!rows.length) return;
    let did = 0;
    for (const r of rows) {
      const text = (await query("SELECT body FROM doc_pages WHERE doc_id=$1 ORDER BY page_no", [r.id])).rows.map((x) => x.body).join("\n"), f = fingerprint(text);
      if (f) { await query("UPDATE docs SET sig=$2, nsh=$3 WHERE id=$1", [r.id, f.sig, f.n]); did++; } else await query("UPDATE docs SET sig='-', nsh=0 WHERE id=$1", [r.id]);   /* too little text: never compared */
    }
    if (!did && rows.length < 100) return;
  }
}
/* -> { title, similarity } of an already-uploaded document that is the same file or 80%+ the same text, else null. */
async function findDuplicate(buffer, text) {
  const sha = require("crypto").createHash("sha256").update(buffer).digest("hex");
  const same = (await query("SELECT d.title FROM doc_upload_log l JOIN docs d ON d.id=l.doc_id WHERE l.sha256=$1 AND d.removed=false LIMIT 1", [sha])).rows[0];
  if (same) return { title: same.title, similarity: 100, sha };
  const f = fingerprint(text);
  if (!f) return { none: true, sha, fp: null };
  await ensureSigs();
  const mine = decodeSig(f.sig), rows = (await query("SELECT title, sig, nsh FROM docs WHERE removed=false AND sig IS NOT NULL AND sig<>'-'")).rows;
  let best = null;
  for (const r of rows) {
    const o = decodeSig(r.sig); let eq = 0; for (let k = 0; k < NPERM; k++) if (o[k] === mine[k]) eq++;
    /* Text is compared as 3-word shingles. If a fraction p of the WORDS are the same, about p^3 of the shingles are the same, so "80% similar" means
       at least 0.8^3 of the smaller document's shingles are found in the other one. Reported as the word-level % (cube root). */
    const j = eq / NPERM, inter = j * (f.n + r.nsh) / (1 + j), contained = Math.min(1, inter / Math.max(1, Math.min(f.n, r.nsh)));
    if (contained >= Math.pow(DUP_SIM(), 3)) { const pct = Math.min(100, Math.round(Math.cbrt(contained) * 100)); if (!best || pct > best.similarity) best = { title: r.title, similarity: pct }; }
  }
  return best ? { ...best, sha, fp: f } : { none: true, sha, fp: f };
}

/* ---------- $30 pack: 30 unlocks, valid for 1 month ---------- */
async function packStatus(userId) {
  const r = (await query("SELECT COALESCE(SUM(unlocks-used),0)::int AS available, MIN(expires_at) AS expires FROM doc_packs WHERE user_id=$1 AND expires_at>NOW() AND used<unlocks", [userId])).rows[0];
  return { available: r.available, expires: r.available > 0 ? r.expires : null, size: PACK_UNLOCKS(), days: PACK_DAYS() };
}
async function addPack(userId, ref) {
  await query("INSERT INTO doc_packs(user_id,stripe_ref,unlocks,expires_at) VALUES($1,$2,$3, NOW() + ($4 || ' days')::interval) ON CONFLICT (stripe_ref) DO NOTHING", [userId, ref, PACK_UNLOCKS(), String(PACK_DAYS())]);
}
/* Spends one pack unlock (the pack that expires first) on a document. Returns false when no unlock is left. */
async function spendPack(userId, docId) {
  const u = await query("UPDATE doc_packs SET used=used+1 WHERE id=(SELECT id FROM doc_packs WHERE user_id=$1 AND expires_at>NOW() AND used<unlocks ORDER BY expires_at LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING id", [userId]);
  if (!u.rowCount) return false;
  const ins = await query("INSERT INTO doc_unlocks(doc_id,user_id,source) VALUES($1,$2,'pack') ON CONFLICT DO NOTHING", [docId, userId]);
  if (!ins.rowCount) await query("UPDATE doc_packs SET used=used-1 WHERE id=$1", [u.rows[0].id]);   /* already unlocked: nothing is spent */
  return true;
}

/* ---------- Unlock balance (shown in the navbar), automatic debit, and the member's unlocked / downloaded list ---------- */
async function balance(userId) {
  const c = await uploadCredits(userId), k = await packStatus(userId);
  return { upload: c.available, pack: k.available, packExpires: k.expires, total: c.available + k.available, uploads: c.uploads, per: c.per, reward: c.reward };
}
/* Debits ONE unlock automatically: earned upload unlocks first, then the paid pack (the pack that expires first). Returns the source used, or null when there is nothing left. */
async function spendAuto(userId, docId) {
  const c = await uploadCredits(userId);
  if (c.available > 0) {
    const r = await query("INSERT INTO doc_unlocks(doc_id,user_id,source) VALUES($1,$2,'upload') ON CONFLICT DO NOTHING", [docId, userId]);
    return r.rowCount ? "upload" : "already";
  }
  return (await spendPack(userId, docId)) ? "pack" : null;
}
/* Downloading uses ONE unlock the first time a member downloads a given document (the document then stays unlocked, so downloading it again is free).
   Members with the $30/month plan never spend unlocks. Owners are charged too, unless DOC_OWNER_DOWNLOAD_FREE=1. */
async function downloadCost(doc, user) {
  if (!user) return false;
  if (doc.owner_id && String(doc.owner_id) === String(user.id) && process.env.DOC_OWNER_DOWNLOAD_FREE === "1") return false;
  if (await planActive(user.id)) return false;
  return (await query("SELECT 1 FROM doc_unlocks WHERE doc_id=$1 AND user_id=$2", [doc.id, user.id])).rowCount === 0;
}
async function chargeDownload(doc, user) {
  if (!(await downloadCost(doc, user))) return { ok: true, charged: false };
  const used = await spendAuto(user.id, doc.id);
  return used ? { ok: true, charged: used !== "already", used } : { ok: false };
}
async function unlockedList(userId) {
  return (await query(`SELECT u.doc_id AS id, u.source, u.created_at AS unlocked, d.title, d.slug, d.page_count AS pages,
      (SELECT COUNT(*)::int FROM doc_downloads x WHERE x.doc_id=u.doc_id AND x.user_id=u.user_id) AS downloads,
      (SELECT MAX(created_at) FROM doc_downloads x WHERE x.doc_id=u.doc_id AND x.user_id=u.user_id) AS last_download
    FROM doc_unlocks u JOIN docs d ON d.id=u.doc_id AND d.removed=false WHERE u.user_id=$1 ORDER BY u.created_at DESC LIMIT 500`, [userId])).rows;
}

async function canRead(doc, user) {
  if (!user) return false;
  if (doc.owner_id && String(doc.owner_id) === String(user.id)) return true;
  if ((await query("SELECT 1 FROM doc_unlocks WHERE doc_id=$1 AND user_id=$2", [doc.id, user.id])).rowCount > 0) return true;
  return planActive(user.id);   /* the $30/month plan opens every document */
}

/* What the page VIEWER may see in full: someone who unlocked it. Owners get the same blurred view as the public (they have Download). */
async function canView(doc, user) {
  if (!user || (doc.owner_id && String(doc.owner_id) === String(user.id))) return false;
  return canRead(doc, user);
}

const STOP = new Set("the and for with that this have from your you can any need want please find search looking look give show document documents doc docs file files pdf notes note about some one get got are was not but how what when where who why does there their them then than into out has had its our".split(" "));
const INTENT = /\b(docs?|documents?|files?|pdf|notes?|solutions?|homework|assignment|milestone|worksheet|study ?guide|essay|lab|library|sample|template|find|search|looking for|do you have)\b/i;
/* Used by the site chat box: returns up to 5 library documents matching what the visitor asked for. */
async function searchForChat(message) {
  const text = String(message || "").slice(0, 400), words = [...new Set((text.toLowerCase().match(/[a-z0-9]{3,}/g) || []).filter((w) => !STOP.has(w)))].slice(0, 8);
  if (!words.length) return [];
  const tq = words.join(" | "), intent = INTENT.test(text);
  const { rows } = await query(`SELECT d.id,d.idx,d.noindex,d.title,d.slug,d.img,d.school,d.course,d.page_count,d.kind,
      ts_rank(to_tsvector('english', d.title||' '||coalesce(d.course,'')), to_tsquery('english',$1)) AS r
    FROM docs d WHERE d.removed=false AND (to_tsvector('english', d.title||' '||coalesce(d.course,'')) @@ to_tsquery('english',$1)
      OR d.school ILIKE ANY($2)) ORDER BY r DESC, d.views DESC LIMIT 5`, [tq, words.map((w) => "%" + w + "%")]);
  const hits = rows.filter((r) => intent || Number(r.r) >= 0.1);
  for (const r of hits) { const p = (await query("SELECT body FROM doc_pages WHERE doc_id=$1 AND page_no=1", [r.id])).rows[0]; r.thumb = p ? thumbText(r, p.body) : ""; }
  return hits.map((r) => ({ id: r.id, title: r.title, school: r.school, course: r.course, pages: r.page_count, kind: r.kind, thumb: r.thumb || "", img: r.img ? `/api/docs/${r.id}/page/1?p=1` : "", url: urlFor(r) }));
}

module.exports = { downloadCost, chargeDownload, guestCredits, claimGuest, titleCase, balance, spendAuto, unlockedList, PACK_CENTS, PACK_UNLOCKS, PACK_DAYS, packStatus, addPack, spendPack, docMeta, castVote, MIN_PAGES, findDuplicate, fingerprint, layText, layPageHtml, ensureLayout, layFor, pdfLayouts, ensureBg, pageBg, LIB_CATS, visibleRatio, queryTerms, refQuery, searchWindow, layParas, layVisibleText, sentenceCut, planActive, forgetPlan, uploadCredits, UPLOADS_PER_FREE, ocrImage, pageParts, ocrDoc, excerpt, seoData, canView, thumbImage, thumbText, tidy, pickTitle, keywordsOf, headingOf, classify, classifyBackfill, isIndexable, clearRatio, piiReasons, previewImage, renderStatus, renderPages, officeRender, seoSpamReason, linkNF, slugify, stripLinks, urlFor, uniqueSlug, slugById, searchForChat, initTables, extract, preview, stripe, planStatus, canRead, PAGE_CENTS, PLAN_CENTS, PLAN_FILES };
