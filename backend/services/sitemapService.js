"use strict";
/*
 * Automatic sitemaps. Nothing here has to be regenerated or redeployed:
 *   /sitemap.xml        the main site pages + every static page uploaded in Admin > Static pages (clean URLs, listed the moment they are saved)
 *   /sitemap-docs.xml   every indexable library document (/doc/<slug>) EXCEPT those made live by the citation generator
 *   /sitemap-citation.xml  ONLY the documents the Citation Generator made live automatically (read live from the database)
 *   /qa-sitemap.xml     every question (/qa/<slug>), read live from the database with NO cache
 *   /robots.txt         points crawlers to the 4 sitemaps (sitemap.xml, sitemap-citation.xml, sitemap-docs.xml, qa-sitemap.xml); /sitemap-index.xml lists the same 4, using your real domain
 * A document appears as soon as it is uploaded AND approved for indexing (the personal-data check runs right after the upload);
 * removed / noindex documents disappear. Results are cached for 60 seconds only, so updates show up within a minute.
 * Set SITE_URL (e.g. https://assignmenthelp.site) so the links always use your real domain instead of the Railway address.
 */
const express = require("express");
const fs = require("fs");
const path = require("path");
const { query } = require("../config/database");

const ROOT = path.join(__dirname, "..", "..");
const PER_FILE = 45000;                       /* Google allows 50,000 URLs per sitemap file */
const TTL = 60 * 1000;

/* Public pages that are served by a route rather than by a file name. */
const FIXED = [
  ["/", "weekly", "1.0", "index.html"],
  ["/citation-generator", "monthly", "0.8", "citation-generator.html"],
  ["/tools/document-creator", "monthly", "0.7", "tools.html"],
  ["/tools/ocr", "monthly", "0.7", "tools.html"],
  ["/tools/diagram", "monthly", "0.7", "tools.html"],
  ["/tools/grammar-checker", "monthly", "0.7", "tools.html"],
  ["/tools/spell-checker", "monthly", "0.7", "tools.html"],
  ["/tools/proofreader", "monthly", "0.7", "tools.html"],
  ["/tools/paraphraser", "monthly", "0.7", "tools.html"],
  ["/tools/flashcards", "monthly", "0.7", "tools.html"],
  /* legal pages (also linked from the bottom bar of every page) */
  ["/legal/privacy-policy", "yearly", "0.4", "legal/privacy-policy.html"],
  ["/legal/service-terms", "yearly", "0.4", "legal/service-terms.html"],
  ["/legal/copyright-protection", "yearly", "0.5", "legal/copyright-protection.html"],
  ["/legal/community-guidelines", "yearly", "0.4", "legal/community-guidelines.html"],
  ["/legal/academic-integrity", "yearly", "0.4", "legal/academic-integrity.html"],
  ["/legal/honor-code", "yearly", "0.4", "legal/honor-code.html"],
  ["/legal/content-management", "yearly", "0.4", "legal/content-management.html"],
  ["/legal/attributions", "yearly", "0.3", "legal/attributions.html"]
];
/* .html files that are templates or private pages: never listed. Every OTHER .html file you drop in the project folder is listed automatically
   (unless it contains <meta name="robots" content="noindex">). */
const SKIP = new Set(["index.html", "doc.html", "tools.html", "citation-generator.html", "login.html", "signup.html", "account.html", "agent.html", "order-now.html", "ai-to-human-expert.html"]);

const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
const day = (d) => new Date(d).toISOString().slice(0, 10);
function origin(req) {
  const env = String(process.env.SITE_URL || "").trim().replace(/\/+$/, "");
  if (env) return env;
  return `${String(req.get("x-forwarded-proto") || req.protocol || "https").split(",")[0]}://${req.get("host")}`;
}
const cache = new Map();
async function cached(key, make) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < TTL) return hit.v;
  const v = await make();
  cache.set(key, { t: Date.now(), v });
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  return v;
}
const mtime = (f) => { try { return fs.statSync(path.join(ROOT, f)).mtime; } catch { return new Date(); } };
const urlset = (items, images) => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${images ? ' xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"' : ""}>\n${items.join("\n")}\n</urlset>\n`;
const send = (res, xml) => { res.type("application/xml").set("Cache-Control", "public, max-age=300").send(xml); };

async function pageEntries(o) {
  let last = new Date();
  try { const r = (await query("SELECT MAX(created_at) d FROM docs WHERE removed=false AND idx=1 AND noindex=false")).rows[0]; if (r && r.d) last = r.d; } catch { /* no database: file dates */ }
  const seen = new Set(), out = [];
  const add = (loc, freq, prio, file) => { if (seen.has(loc)) return; seen.add(loc); out.push(`<url><loc>${esc(o + loc)}</loc><lastmod>${day(mtime(file))}</lastmod><changefreq>${freq}</changefreq><priority>${prio}</priority>${loc === "/" ? `<image:image><image:loc>${esc(o)}/img/logo.webp</image:loc></image:image>` : ""}</url>`); };
  /* Doc Library home + category pages change whenever a document is uploaded, so they are marked daily with the newest upload date */
  for (const l of ["/doc", "/doc/school", "/doc/solutions", "/doc/literature", "/doc/guides", "/tools/ai-detector"]) { if (!seen.has(l)) { seen.add(l); out.push(`<url><loc>${esc(o + l)}</loc><lastmod>${day(last)}</lastmod><changefreq>daily</changefreq><priority>${l === "/docs" ? "0.9" : "0.8"}</priority></url>`); } }
  FIXED.forEach((f) => add(...f));
  let files = [];
  try { files = fs.readdirSync(ROOT).filter((f) => /\.html$/i.test(f) && !SKIP.has(f)); } catch { /* folder not readable: fixed pages only */ }
  for (const f of files) {
    let head = "";
    try { head = fs.readFileSync(path.join(ROOT, f), "utf8").slice(0, 4000); } catch { continue; }
    if (/<meta[^>]+name=["']robots["'][^>]*noindex/i.test(head)) continue;
    add("/" + f, "monthly", "0.6", f);
  }
  return out;
}

const router = express.Router();

/* /sitemap.xml = the main site pages + every static page uploaded in Admin > Static pages (clean URLs such as /database-expert-help).
   The fixed pages are cached for 60 s, the uploaded static pages are read live, so a page is listed the moment it is saved. */
router.get("/sitemap-pages.xml", async (req, res) => {
  try {
    const o = origin(req), base = await cached("pages|" + o, () => pageEntries(o));
    let extra = [];
    try { extra = (await require("./staticPages").sitemapRows()).map((r) => `<url><loc>${esc(o + "/" + r.slug)}</loc><lastmod>${day(r.updated_at)}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>`); }
    catch (e) { console.warn("[SITEMAP] static pages:", e.message); }
    sendFresh(res, urlset([...base, ...extra], true));
  } catch (e) { console.warn("[SITEMAP] pages:", e.message); res.status(503).type("text/plain").send("sitemap temporarily unavailable"); }
});

/* documents: one file up to 45,000 URLs; beyond that /sitemap-docs.xml turns into an index of /sitemap-docs-2.xml, -3.xml ...
   Documents that the Citation Generator published automatically live ONLY in /sitemap-citation.xml (each URL is in exactly one sitemap). */
const BASE_DOC = "removed=false AND slug IS NOT NULL AND idx=1 AND noindex=false";
const FROM_CIT = "id IN (SELECT doc_id FROM citation_uploads WHERE doc_id IS NOT NULL)";
async function scope(kind) {
  let cit = true;
  try { await require("./citationDocs").ensureTable(); } catch { cit = false; }   /* no table: nothing came from the citation generator */
  if (kind === "citation") return cit ? `${BASE_DOC} AND ${FROM_CIT}` : "false";
  return cit ? `${BASE_DOC} AND NOT (${FROM_CIT})` : BASE_DOC;
}
async function docsFile(o, n, kind = "docs") {
  const where = await scope(kind);
  const { rows } = await query(`SELECT id, slug, title, img, created_at FROM docs WHERE ${where} ORDER BY id DESC LIMIT ${PER_FILE} OFFSET ${(n - 1) * PER_FILE}`);
  /* Every document that has page images lists its page-1 thumbnail (the same picture used as og:image) so Google Images can find it. */
  return urlset(rows.map((r) => `<url><loc>${esc(o + "/doc/" + encodeURIComponent(r.slug))}</loc><lastmod>${day(r.created_at)}</lastmod><changefreq>monthly</changefreq>`
    + (r.img ? `<image:image><image:loc>${esc(o + "/api/docs/" + r.id + "/page/1?p=1")}</image:loc><image:title>${esc(String(r.title || "").slice(0, 200))}</image:title></image:image>` : "") + "</url>"), true);
}
async function docsIndexOrFile(o, kind, name) {
  const total = (await query(`SELECT COUNT(*)::int n FROM docs WHERE ${await scope(kind)}`)).rows[0].n;
  if (total <= PER_FILE) return docsFile(o, 1, kind);
  const parts = Math.ceil(total / PER_FILE), now = day(new Date());
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${Array.from({ length: parts }, (_, i) => `<sitemap><loc>${esc(o)}/${name}-${i + 1}.xml</loc><lastmod>${now}</lastmod></sitemap>`).join("\n")}\n</sitemapindex>\n`;
}
router.get("/sitemap-docs.xml", async (req, res) => {
  try { const o = origin(req); send(res, await cached("docs1|" + o, () => docsIndexOrFile(o, "docs", "sitemap-docs"))); }
  catch (e) { console.warn("[SITEMAP] docs:", e.message); res.status(503).type("text/plain").send("sitemap temporarily unavailable"); }
});
router.get("/sitemap-docs-:n.xml", async (req, res) => {
  try {
    const n = Math.max(1, parseInt(req.params.n, 10) || 1), o = origin(req);
    send(res, await cached(`docs${n}|` + o, () => docsFile(o, n)));
  } catch (e) { console.warn("[SITEMAP] docs part:", e.message); res.status(503).type("text/plain").send("sitemap temporarily unavailable"); }
});

/* /sitemap-citation.xml: ONLY the documents the Citation Generator made live automatically (2 months after upload, see services/citationDocs.js).
   Read live (no cache): a document is listed as soon as its personal-data check says it may be indexed. */
router.get("/sitemap-citation.xml", async (req, res) => {
  try { const o = origin(req); sendFresh(res, await docsIndexOrFile(o, "citation", "sitemap-citation")); }
  catch (e) { console.warn("[SITEMAP] citation:", e.message); res.status(503).type("text/plain").send("sitemap temporarily unavailable"); }
});
router.get("/sitemap-citation-:n.xml", async (req, res) => {
  try { const n = Math.max(1, parseInt(req.params.n, 10) || 1); sendFresh(res, await docsFile(origin(req), n, "citation")); }
  catch (e) { console.warn("[SITEMAP] citation part:", e.message); res.status(503).type("text/plain").send("sitemap temporarily unavailable"); }
});

/* Questions & Answers: read from the database on EVERY request (no cache, no-cache header), so a question posted a second ago is already listed.
   An expert's answer bumps <lastmod> of the same URL. Beyond 45,000 URLs this becomes an index of /qa-sitemap-2.xml, -3.xml ... */
const qaFile = async (o, n) => {
  const Q = require("./qaService"), rows = await Q.sitemapRows(PER_FILE, (n - 1) * PER_FILE);
  return urlset(rows.map((r) => `<url><loc>${esc(o)}/qa/${encodeURIComponent(r.slug)}</loc><lastmod>${new Date(r.lm).toISOString()}</lastmod><changefreq>daily</changefreq><priority>0.6</priority></url>`));
};
const sendFresh = (res, xml) => { res.type("application/xml").set("Cache-Control", "no-cache, must-revalidate").send(xml); };
router.get("/qa-sitemap.xml", async (req, res) => {
  try {
    const o = origin(req), Q = require("./qaService"), total = await Q.sitemapCount();
    if (total <= PER_FILE) return sendFresh(res, await qaFile(o, 1));
    const parts = Math.ceil(total / PER_FILE), now = new Date().toISOString();
    sendFresh(res, `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${Array.from({ length: parts }, (_, i) => `<sitemap><loc>${esc(o)}/qa-sitemap-${i + 1}.xml</loc><lastmod>${now}</lastmod></sitemap>`).join("\n")}\n</sitemapindex>\n`);
  } catch (e) { console.warn("[SITEMAP] qa:", e.message); res.status(503).type("text/plain").send("sitemap temporarily unavailable"); }
});
router.get("/qa-sitemap-:n.xml", async (req, res) => {
  try { const n = Math.max(1, parseInt(req.params.n, 10) || 1); sendFresh(res, await qaFile(origin(req), n)); }
  catch (e) { console.warn("[SITEMAP] qa:", e.message); res.status(503).type("text/plain").send("sitemap temporarily unavailable"); }
});

/* /sitemap.xml is the MASTER INDEX: it lists /sitemap-pages.xml (main pages + uploaded static pages), /sitemap-citation.xml, /sitemap-docs.xml and /qa-sitemap.xml.
   /sitemap-index.xml serves the same index, so either URL can be submitted in Search Console. */
const masterIndex = (req, res) => {
  const o = origin(req), now = day(new Date());
  sendFresh(res, `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${["/sitemap-pages.xml", "/sitemap-citation.xml", "/sitemap-docs.xml", "/qa-sitemap.xml"].map((p) => `<sitemap><loc>${esc(o + p)}</loc><lastmod>${now}</lastmod></sitemap>`).join("\n")}\n</sitemapindex>\n`);
};
router.get(["/sitemap.xml", "/sitemap-index.xml"], masterIndex);

/* robots.txt: everything public is crawlable (pages, doc library, Q/A, tools, CSS/JS/fonts and the document images); only private / account / API areas are blocked.
   NOTE: unlike some sites, CSS and JS are deliberately NOT blocked: Google needs them to render the pages. The more specific (longer) Allow rules
   below beat "Disallow: /api/", so the public document images stay crawlable for Google Images. */
router.get("/robots.txt", (req, res) => {
  const o = origin(req);
  const lines = [
    "User-agent: *",
    "Allow: /",
    "",
    "# Public content: home, static pages, Doc Library, Q/A, tools",
    "Allow: /doc",
    "Allow: /doc",
    "Allow: /doc/",
    "Allow: /qa",
    "Allow: /citation-generator",
    "Allow: /tools/",
    "",
    "# Page rendering files and images (needed by Google to render and to list images)",
    "Allow: /*.css",
    "Allow: /*.js",
    "Allow: /css/",
    "Allow: /js/",
    "Allow: /img/",
    "Allow: /webfonts/",
    "Allow: /*.webp",
    "Allow: /*.png",
    "Allow: /*.jpg",
    "Allow: /*.jpeg",
    "Allow: /*.svg",
    "Allow: /*.gif",
    "Allow: /api/docs/*/bg/",
    "Allow: /api/docs/*/page/*?p=1",
    "Allow: /sitemap*.xml",
    "Allow: /qa-sitemap*.xml",
    "",
    "# Private / non-content areas",
    "Disallow: /admin/",
    "Disallow: /api/",
    "Disallow: /backend/",
    "Disallow: /login",
    "Disallow: /signup",
    "Disallow: /account",
    "Disallow: /agent",
    "Disallow: /doc/upload",
    "Disallow: /qa/ask",
    "Disallow: /clear-cookies",
    "",
    "# Tracking / session parameters create duplicates",
    "Disallow: /*?session_id=",
    "Disallow: /*?qapass=",
    "Disallow: /*?utm_",
    "",
    "User-agent: ia_archiver",
    "Disallow: /",
    "",
    `Sitemap: ${o}/sitemap.xml`,
    `Sitemap: ${o}/sitemap-citation.xml`,
    `Sitemap: ${o}/sitemap-docs.xml`,
    `Sitemap: ${o}/qa-sitemap.xml`,
    ""
  ];
  res.type("text/plain").set("Cache-Control", "public, max-age=3600").send(lines.join("\n"));
});

/* Every URL the sitemaps list right now: [[url, kind], ...]. Used by services/sitemapSweeper.js to notice pages that were removed. */
router.allUrls = async (o) => {
  const out = [];
  for (const e of await pageEntries(o)) { const m = /<loc>([^<]+)<\/loc>/.exec(e); if (m) out.push([m[1], "page"]); }
  try { for (const r of await require("./staticPages").sitemapRows()) out.push([o + "/" + r.slug, "static"]); } catch { /* none */ }
  for (const kind of ["docs", "citation"]) {
    try { for (const r of (await query(`SELECT slug FROM docs WHERE ${await scope(kind)}`)).rows) out.push([o + "/doc/" + encodeURIComponent(r.slug), kind]); } catch { /* none */ }
  }
  try { for (const r of await require("./qaService").sitemapRows(1000000, 0)) out.push([o + "/qa/" + encodeURIComponent(r.slug), "qa"]); } catch { /* none */ }
  return out;
};
router.clearCache = () => cache.clear();

module.exports = router;
