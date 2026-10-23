"use strict";
/*
 * Static pages uploaded from the admin console (Admin > "Static pages").
 *   - The HTML is stored in the database (Railway's disk is wiped on every deploy, so files there would disappear).
 *   - Each page is served at a clean URL with no extension:  https://<your-domain>/database-expert-help
 *   - Every published, indexable page is listed automatically in /sitemap.xml the moment it is saved (read live from the database, no cache).
 *   - /database-expert-help.html redirects (301) to /database-expert-help.
 *   - Every page created in the admin is ALSO written as a plain .html file into the project folder  "static pages/"  (e.g.
 *     "static pages/database-expert-help.html"). Only pages made from the admin go there. The folder is kept in step automatically:
 *     saving rewrites the file, deleting removes it, and on every server start any missing/changed file is rewritten from the database.
 *     The folder is never served directly (server.js blocks /static pages/*); pages are always served through their clean URL above.
 */
const fs = require("fs");
const path = require("path");
const express = require("express");
const { query } = require("../config/database");

/* ---------- "static pages" folder: a plain .html copy of every page created from the admin ---------- */
const FOLDER_NAME = "static pages";
const DIR = path.join(__dirname, "..", "..", FOLDER_NAME);
const filePathFor = (slug) => {
  const f = path.resolve(DIR, String(slug) + ".html");
  return f.startsWith(DIR + path.sep) && /^[a-z0-9][a-z0-9-]*\.html$/.test(path.basename(f)) ? f : null;   /* slugs are already [a-z0-9-]; this is a second guard against path tricks */
};
/* Never throws: a read-only disk must not stop a page from being saved in the database. */
function writeFolderFile(slug, html) {
  try {
    const f = filePathFor(slug); if (!f) return false;
    fs.mkdirSync(DIR, { recursive: true });
    try { if (fs.readFileSync(f, "utf8") === html) return true; } catch (e) { /* not there yet */ }
    const tmp = f + ".tmp-" + process.pid; fs.writeFileSync(tmp, html, "utf8"); fs.renameSync(tmp, f);   /* write then rename = never a half-written file */
    return true;
  } catch (e) { console.warn("[STATIC-PAGES] could not write " + FOLDER_NAME + "/" + slug + ".html:", e.message); return false; }
}
function removeFolderFile(slug) {
  try { const f = filePathFor(slug); if (f && fs.existsSync(f)) fs.unlinkSync(f); } catch (e) { console.warn("[STATIC-PAGES] could not delete " + FOLDER_NAME + "/" + slug + ".html:", e.message); }
}

/* URLs the site already uses: a static page can never take these over. */
const RESERVED = new Set(("admin api backend node_modules css js img webfonts fonts assets static public docs doc qa tools tool login signup logout account agent citation-generator citegenie " +
  "robots sitemap sitemap-index sitemap-citation sitemap-docs qa-sitemap favicon apple-touch-icon site index home clear-cookies open-search-description llms ai-catalog well-known " +
  "upload uploads download downloads health checkout stripe webhook webhooks").split(/\s+/));

const MAX_HTML = 2 * 1024 * 1024;   /* 2 MB per page */
let ready = null;

function ensureTable() {
  return ready || (ready = (async () => {
    await query(`CREATE TABLE IF NOT EXISTS static_pages (
      id BIGSERIAL PRIMARY KEY, slug VARCHAR(120) NOT NULL UNIQUE, title VARCHAR(300), description VARCHAR(400), html TEXT NOT NULL,
      noindex BOOLEAN NOT NULL DEFAULT FALSE, published BOOLEAN NOT NULL DEFAULT TRUE, plain BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await query("ALTER TABLE static_pages ADD COLUMN IF NOT EXISTS plain BOOLEAN NOT NULL DEFAULT FALSE");
    await query("ALTER TABLE static_pages ADD COLUMN IF NOT EXISTS hero_h1 VARCHAR(300)");     /* optional: H1 shown in the hero (otherwise the page's own <h1> / title) */
    await query("ALTER TABLE static_pages ADD COLUMN IF NOT EXISTS hero_text VARCHAR(1000)");  /* optional: text shown under the H1 (otherwise the meta description) */   /* plain = served exactly as uploaded, without the site layout */
  })().catch((e) => { ready = null; throw e; }));
}

/* "Database Expert Help.html" -> "database-expert-help" */
function cleanSlug(input) {
  return String(input || "").toLowerCase().trim().replace(/^https?:\/\/[^/]+/, "").replace(/^\/+|\/+$/g, "").replace(/\.(html?|docx?|pdf|xlsx?|csv|tsv|txt|rtf|odt|ods|md)$/i, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100).replace(/-+$/g, "");
}
function slugProblem(slug) {
  if (!slug) return "Enter a page URL name, for example database-expert-help.";
  if (RESERVED.has(slug) || /^sitemap/.test(slug)) return `"${slug}" is used by the site itself. Choose a different URL name.`;
  return "";
}

const esc = (t) => String(t == null ? "" : t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const origin = (req) => String(process.env.SITE_URL || "").trim().replace(/\/+$/, "") || `${String(req.get("x-forwarded-proto") || req.protocol || "https").split(",")[0]}://${req.get("host")}`;

/* Pull title / description out of the uploaded HTML so the admin does not have to type them. */
function sniff(html) {
  const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html), d = /<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i.exec(html) || /<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i.exec(html);
  return { title: t ? t[1].replace(/\s+/g, " ").trim().slice(0, 300) : "", description: d ? d[1].replace(/\s+/g, " ").trim().slice(0, 400) : "" };
}

/* Adds only what is missing: canonical link, title, description, viewport. The admin's own tags are never overwritten. */
function prepare(row, o) {
  let h = row.html;
  const add = [];
  if (!/<link[^>]+rel=["']canonical["']/i.test(h)) add.push(`<link rel="canonical" href="${esc(o + "/" + row.slug)}">`);
  if (!/<meta[^>]+name=["']viewport["']/i.test(h)) add.push('<meta name="viewport" content="width=device-width,initial-scale=1">');
  if (!/<title[\s>]/i.test(h) && row.title) add.push(`<title>${esc(row.title)}</title>`);
  if (!/<meta[^>]+name=["']description["']/i.test(h) && row.description) add.push(`<meta name="description" content="${esc(row.description)}">`);
  if (!add.length) return h;
  if (/<\/head>/i.test(h)) return h.replace(/<\/head>/i, add.join("\n") + "\n</head>");
  if (/<head[^>]*>/i.test(h)) return h.replace(/<head[^>]*>/i, (m) => m + "\n" + add.join("\n"));
  return h;
}

/* ---------- public side ---------- */
let known = { t: 0, set: new Set() };
async function slugs(force) {
  if (!force && Date.now() - known.t < 30000) return known.set;
  try { await ensureTable(); known = { t: Date.now(), set: new Set((await query("SELECT slug FROM static_pages WHERE published=true")).rows.map((r) => r.slug)) }; }
  catch (e) { console.warn("[STATIC-PAGES] slug list:", e.message); known.t = Date.now(); }
  return known.set;
}
const forget = () => { known.t = 0; };

const router = express.Router();
router.get("/:name", async (req, res, next) => {
  try {
    const raw = String(req.params.name || "").toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{0,99}(\.html?)?$/.test(raw)) return next();      /* real files (favicon.ico, ...) and odd URLs are not ours */
    const slug = raw.replace(/\.html?$/, "");
    if (!(await slugs()).has(slug)) return next();
    if (slug !== raw) return res.redirect(301, "/" + slug);                      /* /page.html -> /page */
    const row = (await query("SELECT slug,title,description,html,noindex,plain,hero_h1,hero_text,updated_at FROM static_pages WHERE slug=$1 AND published=true", [slug])).rows[0];
    if (!row) return next();
    res.set({ "Content-Type": "text/html; charset=UTF-8", "Cache-Control": "public, max-age=300, must-revalidate" });
    if (row.noindex) res.set("X-Robots-Tag", "noindex, nofollow");
    let out = null;
    if (!row.plain) { try { out = require("./staticShell").render(row, origin(req)); } catch (e) { console.warn("[STATIC-PAGES] layout:", e.message); } }   /* site layout; falls back to the raw page if the layout cannot be built */
    res.send(out || prepare(row, origin(req)));
  } catch (e) { console.warn("[STATIC-PAGES] serve:", e.message); next(); }
});

/* ---------- admin side (called from routes/admin.js, already behind requireAdmin) ---------- */
async function list() {
  await ensureTable();
  return (await query("SELECT slug,title,noindex,published,length(html) AS size,created_at,updated_at FROM static_pages ORDER BY updated_at DESC LIMIT 1000")).rows;
}
async function get(slug) { await ensureTable(); return (await query("SELECT slug,title,description,html,noindex,published,plain,hero_h1,hero_text,updated_at FROM static_pages WHERE slug=$1", [cleanSlug(slug)])).rows[0] || null; }

/* Create or replace a page. Returns { slug, created, indexed }. Throws {status,message} for bad input. */
async function save(b) {
  await ensureTable();
  const html = String(b.html || "").replace(/\u0000/g, "").replace(/\uFFFD{3,}/g, "");   /* NUL bytes make PostgreSQL reject the row ("Could not save the page") */
  if (/^PK\u0003\u0004|^PK/.test(html)) throw Object.assign(new Error("That is a Word/ZIP file, not HTML. Choose the .docx in the file box so it is converted first."), { status: 400 });
  if (html.trim().length < 20) throw Object.assign(new Error("The page is empty. Choose an .html file or paste the page HTML."), { status: 400 });
  if (Buffer.byteLength(html) > MAX_HTML) throw Object.assign(new Error("The page is larger than 2 MB."), { status: 413 });
  const slug = cleanSlug(b.slug), bad = slugProblem(slug);
  if (bad) throw Object.assign(new Error(bad), { status: 400 });
  const s = sniff(html), title = String(b.title || "").trim().slice(0, 300) || s.title || slug.replace(/-/g, " "), description = String(b.description || "").trim().slice(0, 400) || s.description;
  const noindex = b.noindex === true || b.noindex === "true" || b.noindex === 1, published = !(b.published === false || b.published === "false"), plain = b.plain === true || b.plain === "true" || b.plain === 1 || b.plain === "1";
  /* hero H1 / text under it: undefined = keep what is stored, "" = clear it */
  const clip = (v, n) => (v === undefined || v === null) ? null : String(v).replace(/\s+/g, " ").trim().slice(0, n);
  const heroH1 = clip(b.hero_h1, 300), heroText = clip(b.hero_text, 1000);
  const r = await query(`INSERT INTO static_pages(slug,title,description,html,noindex,published,plain,hero_h1,hero_text) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (slug) DO UPDATE SET title=EXCLUDED.title, description=EXCLUDED.description, html=EXCLUDED.html, noindex=EXCLUDED.noindex, published=EXCLUDED.published, plain=EXCLUDED.plain,
        hero_h1=COALESCE(EXCLUDED.hero_h1, static_pages.hero_h1), hero_text=COALESCE(EXCLUDED.hero_text, static_pages.hero_text), updated_at=NOW()
      RETURNING (xmax = 0) AS created`, [slug, title, description, html, noindex, published, plain, heroH1, heroText]);
  forget();
  const file = writeFolderFile(slug, html) ? FOLDER_NAME + "/" + slug + ".html" : null;
  return { slug, created: !!r.rows[0].created, indexed: published && !noindex, title, file };
}
async function setFlags(slug, b) {
  await ensureTable();
  const sets = [], v = [cleanSlug(slug)];
  if (typeof b.noindex === "boolean") { v.push(b.noindex); sets.push(`noindex=$${v.length}`); }
  if (typeof b.published === "boolean") { v.push(b.published); sets.push(`published=$${v.length}`); }
  if (!sets.length) return false;
  const r = await query(`UPDATE static_pages SET ${sets.join(",")}, updated_at=NOW() WHERE slug=$1`, v);
  forget(); return r.rowCount > 0;
}
async function remove(slug) { await ensureTable(); const sl = cleanSlug(slug), r = await query("DELETE FROM static_pages WHERE slug=$1", [sl]); forget(); if (r.rowCount > 0) removeFolderFile(sl); return r.rowCount > 0; }

/* Rewrites any missing / changed file in "static pages/" from the database (runs at server start). Returns how many files were written. */
async function syncFolder() {
  await ensureTable();
  let n = 0;
  for (const r of (await query("SELECT slug, html FROM static_pages ORDER BY slug")).rows) { if (writeFolderFile(r.slug, r.html)) n++; }
  return n;
}

/* Any file (html, docx, doc, pdf, xlsx, csv, txt ...) -> HTML page: see services/fileToHtml.js */
const convertFile = (buffer, filename) => require("./fileToHtml").convertFile(buffer, filename);

/* Rows for /sitemap.xml: published and indexable only. */
async function sitemapRows() { await ensureTable(); return (await query("SELECT slug, updated_at FROM static_pages WHERE published=true AND noindex=false ORDER BY slug")).rows; }

module.exports = { router, convertFile, ensureTable, syncFolder, FOLDER_NAME, cleanSlug, list, get, save, setFlags, remove, sitemapRows };
