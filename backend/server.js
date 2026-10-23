// backend/server.js
const express = require("express");
const helmet = require("helmet");
const path = require("path");
const fs = require("fs");
require("dotenv").config();
require("dotenv").config({ path: require("path").join(__dirname, ".env") });   /* backend/.env too (dotenv never overrides values already set) */

const adminRoutes = require("./routes/admin");
const submissionRoutes = require("./routes/submissions");
const chatRoutes = require("./routes/chat");
const liveChatRoutes = require("./routes/livechat");
const aiCheckRoutes = require("./routes/aicheck");
const billingRoutes = require("./routes/billing");
const authRoutes = require("./routes/auth");
const accountRoutes = require("./routes/account");
const docsRoutes = require("./routes/docs");
const citationGeneratorRoutes = require("./routes/citation-generator");
const toolsRoutes = require("./routes/tools");
const qaRoutes = require("./routes/qa");
const { optionalUser: qaOptionalUser } = require("./middleware/userAuth");
const { initDatabase } = require("./config/database");

const app = express();

const PORT = Number(process.env.PORT || 3000);
const HOST = "0.0.0.0";

app.set("trust proxy", true);

// Google Sign-In opens a popup and reports back to this page with postMessage. Helmet's default
// "Cross-Origin-Opener-Policy: same-origin" severs that link and leaves the popup blank, so allow popups.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" }
}));

/*
 * These parsers do not consume multipart/form-data, so Multer remains
 * responsible for the submission upload route.
 */
/*
 * Development only: lets pages opened straight from disk (file://, Origin "null") or from another localhost port call
 * this API. Never active when NODE_ENV=production.
 */
if (process.env.NODE_ENV !== "production") {
  app.use("/api", (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && (origin === "null" || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin))) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      if (req.method === "OPTIONS") return res.sendStatus(204);
    }
    next();
  });
}

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

const ROOT_DIR = path.join(__dirname, "..");
const ADMIN_DIR = path.join(__dirname, "public", "admin");

// Never expose server source, environment files, package manifests, or Git data
// through the public static-file handler.
app.use((req, res, next) => {
  const pathname = req.path || "/";
  if (/^\/(?:backend|node_modules|\.git)(?:\/|$)/i.test(pathname) ||
      /^\/static(?:%20|\+|\s|-|_)?pages(?:\/|$)/i.test(pathname) ||   /* the "static pages" folder: pages are served only through their clean URL, so drafts stay private */
      /^\/(?:package(?:-lock)?\.json|\.env(?:\.|$))/i.test(pathname) ||
      /^\/admin\/(?:package(?:-lock)?\.json|vite\.config\.js)/i.test(pathname)) {
    return res.status(404).end();
  }
  next();
});

// A precompressed copy is used only if it exists AND is not older than the file it was made from; a stale .br/.gz
// would otherwise keep serving an old version of the page after the real file was edited.
function fresh(compressedPath, sourcePath) {
  try { return fs.statSync(compressedPath).mtimeMs >= fs.statSync(sourcePath).mtimeMs - 2000; } catch (e) { return false; }
}

// Serve Brotli/GZIP variants when they exist. This keeps the public HTML/CSS/JS
// payloads small without adding a runtime compression dependency.
function servePrecompressed(req, res, next) {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  const pathname = req.path || "/";
  const allowed = /\.(?:html|css|js|json|xml|txt|svg|webmanifest)$/i.test(pathname);
  if (!allowed) return next();
  const relative = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.resolve(ROOT_DIR, "." + relative);
  if (!filePath.startsWith(ROOT_DIR + path.sep) || !fs.existsSync(filePath)) return next();
  const accept = String(req.headers["accept-encoding"] || "").toLowerCase();
  let compressed = null;
  let encoding = null;
  if (accept.includes("br") && fresh(filePath + ".br", filePath)) {
    compressed = filePath + ".br"; encoding = "br";
  } else if (accept.includes("gzip") && fresh(filePath + ".gz", filePath)) {
    compressed = filePath + ".gz"; encoding = "gzip";
  }
  if (!compressed) return next();
  res.setHeader("Content-Encoding", encoding);
  res.setHeader("Vary", "Accept-Encoding");
  if (/\.(?:css|js|html)$/i.test(filePath)) res.setHeader("Content-Type", ({'.css':'text/css; charset=UTF-8','.js':'application/javascript; charset=UTF-8','.html':'text/html; charset=UTF-8'}[path.extname(filePath).toLowerCase()] || "application/octet-stream"));
  // The precompressed branch bypasses express.static's setHeaders callback below,
  // so it must set its own Cache-Control/Expires or every css/js/html response
  // (i.e. almost every real browser request) goes out with no caching headers at all.
  if (/\.html$/i.test(filePath)) {
    res.setHeader("Cache-Control", "public, max-age=600, must-revalidate");
    res.setHeader("Expires", new Date(Date.now() + 600000).toUTCString());
  } else if (/\.(?:css|js)$/i.test(filePath)) {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("Expires", new Date(Date.now() + 31536000000).toUTCString());
  } else {
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("Expires", new Date(Date.now() + 86400000).toUTCString());
  }
  return res.sendFile(compressed);
}

/* Auto-updating /sitemap.xml, /sitemap-citation.xml, /sitemap-docs.xml, /qa-sitemap.xml, /sitemap-index.xml and /robots.txt (must come before the static handlers) */
app.use(require("./services/sitemapService"));

/* Legal pages: /legal/<name> (privacy policy, service terms, copyright, community guidelines, academic integrity, honor code, content management, attributions). */
const LEGAL = new Set(["privacy-policy", "service-terms", "copyright-protection", "community-guidelines", "academic-integrity", "honor-code", "content-management", "attributions"]);
app.get(["/legal", "/legal/"], (req, res) => res.redirect(301, "/legal/copyright-protection"));
app.get("/legal/:slug", (req, res, next) => {
  const raw = String(req.params.slug || "").toLowerCase(), slug = raw.replace(/\.html$/, "");
  if (!LEGAL.has(slug)) return next();
  if (raw !== slug) return res.redirect(301, "/legal/" + slug);
  res.setHeader("X-Robots-Tag", "index, follow"); res.setHeader("Cache-Control", "public, max-age=300");
  res.sendFile(path.join(ROOT_DIR, "legal", slug + ".html"));
});

app.use(servePrecompressed);

app.use(express.static(ROOT_DIR, {
  setHeaders: (res, filePath) => {
    if (/\.(?:png|jpe?g|webp|avif|gif|svg|ico|woff2?)$/i.test(filePath)) {
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.setHeader("Expires", new Date(Date.now() + 31536000000).toUTCString());
    } else if (/\.(?:css|js)$/i.test(filePath)) {
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.setHeader("Expires", new Date(Date.now() + 31536000000).toUTCString());
    }
  }
}));
app.use("/admin", (req, res, next) => {
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  next();
}, express.static(ADMIN_DIR));

app.get("/api/health", async (req, res) => {
  res.json({
    success: true,
    status: "ok",
    service: "assignment-help",
    time: new Date().toISOString()
  });
});

app.use(["/api/auth", "/api/account"], (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

/* Open /clear-cookies in a browser to wipe that browser's cookies, local storage and cache for this site (Clear-Site-Data). It also signs that browser out. */
app.get("/clear-cookies", (req, res) => {
  res.setHeader("Clear-Site-Data", '"cookies", "storage", "cache"');
  res.setHeader("Cache-Control", "no-store");
  res.type("html").send('<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>Cookies cleared</title><body style="font:16px system-ui;padding:40px;text-align:center"><h2>Cookies and site data cleared</h2><p>You are signed out of this browser.</p><p><a href="/">Back to the home page</a></p>');
});
/* Visit /clear-cookies in a browser: asks that browser to delete this site's cookies, local storage and cache (it also logs that browser out). */
app.get("/clear-cookies", (req, res) => {
  res.setHeader("Clear-Site-Data", '"cookies", "storage", "cache"');
  res.setHeader("Cache-Control", "no-store");
  res.type("html").send('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Cookies cleared</title><body style="font:16px system-ui;text-align:center;padding:60px"><h1>Cookies and site data cleared</h1><p><a href="/">Back to the home page</a></p></body>');
});
app.use("/api/admin", adminRoutes);
app.use("/api/submissions", submissionRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/livechat", liveChatRoutes);
app.use("/api/aicheck", aiCheckRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/account", accountRoutes);
app.use("/api/docs", docsRoutes);
app.use("/api/citation-generator", citationGeneratorRoutes);
app.use("/api/tools", toolsRoutes);
app.use("/api/qa", qaRoutes);
app.use("/api/contact", require("./routes/contact"));

/*
 * If the client disconnects while a multipart upload is in progress,
 * record it clearly. This is different from a database failure.
 */
app.use((req, res, next) => {
  req.on("aborted", () => {
    console.warn("[HTTP REQUEST ABORTED]", req.method, req.originalUrl);
  });
  next();
});

/*
 * API 404s should return JSON instead of an HTML page.
 */
app.use("/api", (req, res) => {
  res.status(404).json({
    success: false,
    message: "API endpoint not found."
  });
});

/*
 * These paths are checked by AI-agent discoverability crawlers (llms.txt,
 * ai-catalog.json / ARD manifests). We don't publish either, so return a
 * real 404 instead of letting the SPA fallback below serve index.html at
 * these URLs (which was making PSI's "Agentic browsing" audit think a
 * broken/malformed file existed here).
 */
app.get(["/llms.txt", "/ai-catalog.json", "/.well-known/ai-catalog.json"], (req, res) => {
  res.status(404).type("text/plain").send("Not found");
});

/*
 * Customer account pages.
 */
const ACCOUNT_PAGES = { "/login": "login.html", "/signup": "signup.html", "/account": "account.html", "/agent": "agent.html", "/order-now": "order-now.html", "/ai-to-human-expert": "ai-to-human-expert.html", "/ai-to-human-expert.html": "ai-to-human-expert.html" };
/* Document pages may be indexed but every link on them is nofollow. The library home / upload pages are not indexed. */
const escH = (t) => String(t == null ? "" : t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
let DOC_TPL = null;
const docTpl = () => DOC_TPL || (DOC_TPL = require("fs").readFileSync(path.join(ROOT_DIR, "doc.html"), "utf8"));
const siteOrigin = (req) => String(process.env.SITE_URL || "").trim().replace(/\/+$/, "") || `${(req.get("x-forwarded-proto") || req.protocol || "https").split(",")[0]}://${req.get("host")}`;
/* Questions & Answers: /qa, /qa/ask, /qa/<slug> (server-rendered, see services/qaPages.js) */
require("./services/qaPages")(app, { siteOrigin, optionalUser: qaOptionalUser });
const sendDocPage = (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", /^\/doc\//.test(req.path) ? "index, nofollow" : "noindex, nofollow");
  res.sendFile(path.join(ROOT_DIR, "doc.html"));
};
/* Old links /doc/7 and /doc/7/account-statement -> permanent redirect to /doc/account-statement. */
app.get("/doc/:id/:slug", async (req, res, next) => {
  if (!/^\d{1,18}$/.test(req.params.id)) return sendDocPage(req, res);
  try {
    const slug = await require("./services/docService").slugById(req.params.id);
    if (slug) return res.redirect(301, "/doc/" + encodeURIComponent(slug) + (req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : ""));
  } catch (e) { /* fall through: the page itself shows "not found" */ }
  sendDocPage(req, res);
});
/* /doc/<slug>: for indexable documents ALL the text is written into the HTML itself (30% clear, 70% blurred + declared paywalled) so search engines read it without running JavaScript. */
const LIB_RESERVED = ["upload", "school", "solutions", "literature", "guides"];   /* /doc/<these> are library pages, not documents */
app.get("/doc/:slug", async (req, res, next) => {
  const ref = String(req.params.slug || "").toLowerCase();
  if (LIB_RESERVED.includes(ref)) return next("route");
  try {
    const S = require("./services/docService");
    if (/^\d{1,18}$/.test(ref)) { const sl = await S.slugById(ref); if (sl) return res.redirect(301, "/doc/" + encodeURIComponent(sl)); }
    const seo = await S.seoData(ref);
    if (!seo) return require("./services/notFound").send(res);   /* removed / unknown document: real 404 page */
    const { doc, text } = seo, url = siteOrigin(req) + "/doc/" + encodeURIComponent(doc.slug);
    res.setHeader("Cache-Control", "no-store");
    if (!seo.indexable) {   /* personal data found / scan not read yet / admin noindex: no text in the HTML, not indexable */
      res.setHeader("X-Robots-Tag", "noindex, nofollow");
      return res.type("html").send(docTpl().replace('<meta name="robots" content="index, nofollow">', '<meta name="robots" content="noindex, nofollow">')
        .replace("<title>Document Library</title>", () => `<title>${escH(doc.title)} | Document Library</title>`));
    }
    const desc = (text.replace(/\s+/g, " ").slice(0, 155) || `${doc.title} - ${doc.course || "study document"}${doc.school ? " at " + doc.school : ""}, ${doc.page_count} pages.`).trim();
    const meta = [doc.school, doc.course, doc.page_count + " pages"].filter(Boolean).join(" • ");
    const P = (t) => t.split(/\n+/).filter((l) => l.trim()).map((l) => "<p>" + S.linkNF(escH(l)) + "</p>").join("");   /* URLs inside a document are nofollow links */
    /* Same markup the browser builds: .cl = the part shown clearly, .bl = the rest (blurred by CSS, declared paywalled in the JSON-LD). Everyone gets this exact HTML. */
    /* What the visitor searched for (?q=, ?search=, or the query a search engine passes in the Referer) moves the clear window to the matching lines. */
    const terms = S.queryTerms(req.query.q || req.query.search || S.refQuery(req.get("referer")));
    const noSnip = process.env.DOC_NOSNIPPET === "1" ? " data-nosnippet" : "";
    /* Snippet = the clear part of each page, cut at the END OF A SENTENCE (never mid-sentence); "…" only when more text follows. */
    const snip = seo.pages.map((p) => { const raw = p.lay ? S.layVisibleText(p, terms) : p.a; if (!raw || !raw.trim()) return ""; const c = S.sentenceCut(raw, 400, 800); return `<p><b>Page ${p.n}</b> ${escH(c.text)}${c.cut || (p.lay ? false : !!p.b) ? " …" : ""}</p>`; }).join("");
    const paras = seo.pages.map((p) => p.lay ? S.layPageHtml(p, doc.id, terms) : `<section class="pg" id="page-${p.n}" style="background:${/^#[0-9a-f]{6}$/i.test(p.bg) ? p.bg : '#ffffff'}"><h2>Page ${p.n}</h2><div class="cl">${P(p.a)}</div>${p.b ? `<div class="bl"${noSnip}>${P(p.b)}</div>` : ""}</section>`).join("");
    const M = await S.docMeta(doc, null), dm = `<p class="dmeta">${escH([M.by, new Date(M.date).toLocaleDateString("en-US"), M.pct == null ? "Not rated yet" : M.pct + "% (" + M.total + ") helpful", M.filename].filter(Boolean).join(" • "))}</p>`;
    const words = text.split(/\s+/).filter(Boolean).length, siteName = process.env.SITE_NAME || "Doc Library", base = siteOrigin(req);
    const ld = JSON.stringify([{ "@context": "https://schema.org", "@type": ["CreativeWork", "LearningResource"], name: doc.title, headline: doc.title, description: desc, url, mainEntityOfPage: url, inLanguage: "en", numberOfPages: doc.page_count, wordCount: words, dateCreated: doc.created_at, datePublished: doc.created_at, dateModified: doc.created_at, keywords: S.keywordsOf(doc.title, seo.heading).join(", "), isPartOf: { "@type": "WebSite", name: siteName, url: base }, publisher: { "@type": "Organization", name: siteName, url: base }, isAccessibleForFree: false, hasPart: { "@type": "WebPageElement", isAccessibleForFree: false, cssSelector: ".bl" } },
      { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Home", item: base + "/" }, { "@type": "ListItem", position: 2, name: siteName, item: base + "/doc" }, { "@type": "ListItem", position: 3, name: doc.title, item: url }] }]).replace(/</g, "\\u003c");
    const site = process.env.SITE_NAME || "Doc Library", origin = siteOrigin(req), ogImg = doc.img ? origin + "/api/docs/" + doc.id + "/page/1?p=1" : origin + "/img/logo.webp", bigCard = !!doc.img;
    const ttl = `${doc.title} | ${site}`, E = escH;
    const head = `<title>${E(ttl)}</title><meta name="description" content="${E(desc)}"><meta name="keywords" content="${E(S.keywordsOf(doc.title, seo.heading).join(", "))}">`
      + `<meta name="theme-color" content="#0f766e"><link rel="canonical" href="${E(url)}"><link rel="search" type="application/opensearchdescription+xml" title="${E(site)}" href="/open-search-description.xml">`
      + `<meta property="og:type" content="article"><meta property="og:site_name" content="${E(site)}"><meta property="og:title" content="${E(ttl)}"><meta property="og:description" content="${E(desc)}"><meta property="og:url" content="${E(url)}">`
      + (ogImg ? `<meta property="og:image" content="${E(ogImg)}">` : "")
      + `<meta name="twitter:card" content="${bigCard ? "summary_large_image" : "summary"}"><meta name="twitter:title" content="${E(ttl)}"><meta name="twitter:description" content="${E(desc)}">`
      + (ogImg ? `<meta name="twitter:image" content="${E(ogImg)}">` : "")
      + `<script type="application/ld+json">${ld}</script>`;
    const html = docTpl()
      .replace("<title>Document Library</title>", () => head)
      .replace('<div id="app"></div>', () => `<div id="app"><main style="display:block;max-width:900px"><nav aria-label="Breadcrumb" style="font-size:14px;margin:0 0 8px"><a href="/">Home</a> › <a href="/doc">${escH(process.env.SITE_NAME || "Doc Library")}</a> › ${escH(doc.title)}</nav><article itemscope itemtype="https://schema.org/CreativeWork"><h1 itemprop="name">${escH(doc.title)}</h1>${seo.heading && seo.heading.toLowerCase() !== doc.title.toLowerCase() ? `<h2>${escH(seo.heading)}</h2>` : ""}<p>${escH(meta)}</p>${dm}<section id="snippet"><h2>Snippet</h2>${snip}</section>${paras}</article></main></div>`);
    res.setHeader("X-Robots-Tag", "index, nofollow");
    res.type("html").send(html);
  } catch (e) { console.warn("[DOCS] page render:", e.message); sendDocPage(req, res); }
});
app.get("/open-search-description.xml", (req, res) => { const o = siteOrigin(req), n = escH(process.env.SITE_NAME || "Doc Library"); res.type("application/opensearchdescription+xml").send(`<?xml version="1.0" encoding="UTF-8"?><OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/"><ShortName>${n}</ShortName><Description>Search documents on ${n}</Description><InputEncoding>UTF-8</InputEncoding><Url type="text/html" template="${escH(o)}/doc?q={searchTerms}"/></OpenSearchDescription>`); });
/* Doc Library home + category pages: INDEXABLE. The first response already contains a real list of documents (links, titles, schools, courses)
   so Google and other search engines can read and follow them without running JavaScript; the page script then replaces it with the live app. */
const LIB_PAGE = 48;
const LIB_META = {
  "": ["Doc Library: study documents, notes and solutions", "Browse and search shared study documents, class notes, textbook solutions, literature analyses and study guides. New documents are added every day."],
  school: ["School documents", "Documents from courses, classes and campuses."],
  solutions: ["Textbook solutions", "Worked solutions, answer keys and chapter exercises."],
  literature: ["Literature title documents", "Novels, poems, plays and the essays written about them."],
  guides: ["Study guides", "Notes, summaries, cheat sheets and revision material."]
};
/* Old /docs URLs (library, /docs/upload, categories, document slugs) -> permanent redirect to the same path under /doc. */
app.get(["/docs", "/docs/{*rest}"], (req, res) => res.redirect(301, req.originalUrl.replace(/^\/docs(?=\/|\?|$)/, "/doc")));
/* Clean category URLs: /doc/literature (the old /doc?cat=literature redirects here with a 301). */
app.get("/doc/:cat", (req, res, next) => {
  const c = String(req.params.cat || "").toLowerCase();
  if (c === "upload" || !LIB_META[c]) return next("route");
  req.libCat = c; next();
});
app.get(["/doc", "/doc/upload", "/doc/:cat"], async (req, res, next) => {
  const oldCat = String(req.query.cat || "");
  if (req.path.replace(/\/+$/, "") === "/doc" && oldCat && LIB_META[oldCat]) {   /* legacy ?cat= URL -> clean URL */
    const rest = new URLSearchParams(req.query); rest.delete("cat"); const qs = rest.toString();
    return res.redirect(301, "/doc/" + oldCat + (qs ? "?" + qs : ""));
  }
  if (req.path === "/doc/upload") {   /* upload page: private, never indexed */
    res.setHeader("Cache-Control", "no-store"); res.setHeader("X-Robots-Tag", "noindex, nofollow");
    return res.sendFile(path.join(ROOT_DIR, "doc.html"));
  }
  try {
    const S = require("./services/docService"), { query } = require("./config/database");
    const cat = req.libCat && S.LIB_CATS[req.libCat] ? req.libCat : "";
    const pg = Math.min(500, Math.max(1, parseInt(req.query.page, 10) || 1));
    const args = [], where = ["removed=false", "slug IS NOT NULL", "idx=1", "noindex=false"];
    if (cat) { args.push("\\m(?:" + S.LIB_CATS[cat] + ")"); const c = args.length; where.push(`(title ~* $${c} OR coalesce(course,'') ~* $${c} OR coalesce(school,'') ~* $${c}${cat === "school" ? " OR coalesce(school,'') <> ''" : ""})`); }
    const rows = (await query(`SELECT title, slug, school, course, page_count, created_at FROM docs WHERE ${where.join(" AND ")} ORDER BY id DESC LIMIT ${LIB_PAGE + 1} OFFSET ${(pg - 1) * LIB_PAGE}`, args)).rows;
    const more = rows.length > LIB_PAGE, list = rows.slice(0, LIB_PAGE);
    const site = process.env.SITE_NAME || "Doc Library", o = siteOrigin(req), E = escH;
    const base = "/doc" + (cat ? "/" + cat : ""), pageUrl = (n) => base + (n > 1 ? "?page=" + n : "");
    const url = o + pageUrl(pg), [h1, intro] = LIB_META[cat], ttl = (cat ? h1 : "Doc Library: study documents, notes and solutions") + (pg > 1 ? " - page " + pg : "") + " | " + site;
    const ld = JSON.stringify([{ "@context": "https://schema.org", "@type": "CollectionPage", name: h1, description: intro, url, isPartOf: { "@type": "WebSite", name: site, url: o },
        mainEntity: { "@type": "ItemList", itemListElement: list.map((d, i) => ({ "@type": "ListItem", position: (pg - 1) * LIB_PAGE + i + 1, url: o + "/doc/" + encodeURIComponent(d.slug), name: d.title })) } },
      { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Home", item: o + "/" }, { "@type": "ListItem", position: 2, name: site, item: o + "/doc" }].concat(cat ? [{ "@type": "ListItem", position: 3, name: h1, item: o + "/doc/" + cat }] : []) }]).replace(/</g, "\\u003c");
    const head = `<title>${E(ttl)}</title><meta name="description" content="${E(intro)}"><link rel="canonical" href="${E(url)}">`
      + (pg > 1 ? `<link rel="prev" href="${E(o + pageUrl(pg - 1))}">` : "") + (more ? `<link rel="next" href="${E(o + pageUrl(pg + 1))}">` : "")
      + `<meta property="og:type" content="website"><meta property="og:site_name" content="${E(site)}"><meta property="og:title" content="${E(ttl)}"><meta property="og:description" content="${E(intro)}"><meta property="og:url" content="${E(url)}"><meta property="og:image" content="${E(o + "/img/logo.webp")}">`
      + `<meta name="twitter:card" content="summary"><meta name="twitter:title" content="${E(ttl)}"><meta name="twitter:description" content="${E(intro)}"><meta name="theme-color" content="#0f766e"><script type="application/ld+json">${ld}</script>`;
    const items = list.map((d) => `<li><a href="/doc/${encodeURIComponent(d.slug)}"><b>${E(d.title)}</b></a> <span>${E([d.school, d.course, d.page_count + " page" + (d.page_count > 1 ? "s" : "")].filter(Boolean).join(" • "))}</span></li>`).join("");
    const nav = `<nav aria-label="Pages">${pg > 1 ? `<a rel="prev" href="${E(pageUrl(pg - 1))}">Previous</a> ` : ""}${more ? `<a rel="next" href="${E(pageUrl(pg + 1))}">Next</a>` : ""}</nav>`;
    const cats = Object.keys(LIB_META).filter(Boolean).map((k) => `<a href="/doc/${k}">${E(LIB_META[k][0])}</a>`).join(" · ");
    const body = `<main style="display:block;max-width:900px;margin:0 auto;padding:24px 18px"><h1>${E(cat ? h1 : "Doc Library")}</h1><p>${E(intro)}</p><p>${cats}</p>${list.length ? `<ul>${items}</ul>` : "<p>No documents yet.</p>"}${nav}</main>`;
    const html = docTpl().replace("<title>Document Library</title>", () => head).replace('<meta name="robots" content="index, nofollow">', '<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">').replace('<div id="app"></div>', () => `<div id="app">${body}</div>`);
    res.setHeader("X-Robots-Tag", "index, follow");
    res.setHeader("Cache-Control", "public, max-age=300");
    res.type("html").send(html);
  } catch (e) { console.warn("[DOCS] library page:", e.message); res.setHeader("X-Robots-Tag", "index, follow"); res.sendFile(path.join(ROOT_DIR, "doc.html")); }
});
/* Tool pages: every tool gets its OWN title, description, canonical, <h1>, links, FAQ and structured data written into the first HTML response (services/toolSeo.js). */
const TS = require("./services/toolSeo"), readText = (f) => fs.readFileSync(path.join(ROOT_DIR, f), "utf8");
app.get("/tools", (req, res) => res.redirect(301, "/tools/document-creator"));
/* AI Detector: its own page (no dialog). /ai-detector is the short alias. */
app.get("/ai-detector", (req, res) => res.redirect(301, "/tools/ai-detector"));
app.get("/tools/ai-detector", (req, res) => {
  res.setHeader("X-Robots-Tag", "index, follow"); res.setHeader("Cache-Control", "public, max-age=300");
  res.sendFile(path.join(ROOT_DIR, "ai-detector.html"));
});
app.get(Object.keys(TS.TOOLS), (req, res) => {
  try {
    const html = TS.renderTool(readText("tools.html"), siteOrigin(req), req.path.replace(/\/+$/, ""));
    res.setHeader("X-Robots-Tag", "index, follow"); res.setHeader("Cache-Control", "public, max-age=300");
    return html ? res.type("html").send(html) : res.sendFile(path.join(ROOT_DIR, "tools.html"));
  } catch (e) { console.warn("[TOOLS] page render:", e.message); res.sendFile(path.join(ROOT_DIR, "tools.html")); }
});
/* Ask AI: full-page chat with the site assistant (uses /api/chat). /ask is a short alias. */
app.get("/ask", (req, res) => res.redirect(301, "/ask-ai"));
app.get("/ask-ai", (req, res) => {
  res.setHeader("X-Robots-Tag", "index, follow");
  res.setHeader("Cache-Control", "public, max-age=300");
  res.sendFile(path.join(ROOT_DIR, "ask-ai.html"));
});
app.get("/citegenie", (req, res) => res.redirect(301, "/citation-generator"));
app.get("/citation-generator", (req, res) => {
  res.setHeader("X-Robots-Tag", "index, follow");
  try { res.setHeader("Cache-Control", "public, max-age=300"); res.type("html").send(TS.renderCitation(readText("citation-generator.html"), siteOrigin(req))); }
  catch (e) { console.warn("[TOOLS] citation render:", e.message); res.sendFile(path.join(ROOT_DIR, "citation-generator.html")); }
});
/* Contact page: /contact-us (the short /contact and /contact-us.html forms redirect here). */
app.get(["/contact", "/contact.html", "/contact-us.html"], (req, res) => res.redirect(301, "/contact-us"));
app.get("/contact-us", (req, res) => {
  res.setHeader("X-Robots-Tag", "index, follow"); res.setHeader("Cache-Control", "public, max-age=300");
  res.sendFile(path.join(ROOT_DIR, "contact-us.html"));
});
app.get(Object.keys(ACCOUNT_PAGES), (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.sendFile(path.join(ROOT_DIR, ACCOUNT_PAGES[req.path]));
});

/* Static pages uploaded from the admin console: clean URLs such as /database-expert-help (must stay before the fallback below). */
app.use(require("./services/staticPages").router);

/*
 * Frontend fallback.
 */
app.get("/{*splat}", (req, res) => {
  /* Unknown URLs used to return the home page with status 200 (a "soft 404": search engines index endless duplicates of the home page).
     Now only "/" is the home page; anything else is a real 404 that is not indexed. */
  if (req.path !== "/") {
    if (req.path.startsWith("/api/")) return res.status(404).json({ success: false, message: "Not found." });
    return require("./services/notFound").send(res);
  }
  res.sendFile(path.join(ROOT_DIR, "index.html"));
});

/*
 * Final error handler.
 */
app.use((err, req, res, next) => {
  console.error("🔴 Server Error:", err);

  if (res.headersSent) {
    return next(err);
  }

  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error"
  });
});

async function start() {
  try {
    await initDatabase();
    console.log("✅ Database initialized");
    require("./services/dbUsage").logOnce();
    await require("./services/adminBootstrap").ensureAdmin().catch((e) => console.warn("[ADMIN] bootstrap:", e.message));
  } catch (error) {
    console.error("❌ Database initialization failed:", error);
    process.exit(1);
  }

  app.listen(PORT, HOST, () => {
    const host = process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : `http://localhost:${PORT}`;

    console.log(`Running on: ${host}`);
    console.log(`Admin: ${host}/admin/`);
    console.log(`Health: ${host}/api/health`);
  });
  require("./services/citationDocs").start();
  require("./services/sitemapSweeper").start();   /* removed pages leave the sitemaps and search engines are told (every few hours) */
  require("./services/liveBackup").start();   /* live database backup every minute (kept on the server, downloadable in Admin > Backup) */
  require("./services/backupService").start();   /* automatic website backups (Admin > Backup) */
  require("./services/staticPages").syncFolder().then((n) => console.log(`[STATIC-PAGES] "static pages" folder in sync (${n} file${n === 1 ? "" : "s"})`)).catch((e) => console.warn("[STATIC-PAGES] table/folder:", e.message));   /* stored citation-generator documents go live after 2 months */
}

start();
