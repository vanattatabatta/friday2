"use strict";
/* POST /api/citation-generator  (multipart: files[]=any documents, count, style) -> real journal articles from Crossref, formatted as plain citation strings.
   Nothing is invented: every item comes from Crossref and carries its DOI. */
const express = require("express");
const multer = require("multer");
const mammoth = require("mammoth");
const { chatRateLimit } = require("../middleware/chatRateLimit");
const { requirePlan } = require("../middleware/requirePlan");
const CD = require("../services/citationDocs");

const router = express.Router();
const MAX_FILES = 10, MAX_BYTES = Number(process.env.CITATION_MAX_MB || 30) * 1048576;
/* Several documents at once, ANY file type (field "files"; the old single "file" field still works). */
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: MAX_FILES } })
  .fields([{ name: "files", maxCount: MAX_FILES }, { name: "file", maxCount: 1 }]);
const { readAny } = require("../services/citationReader");
const readText = (f) => readAny(f);   /* type detected from the file's bytes; PDFs of any length are read by poppler outside the event loop */
const withTimeout = (p, ms, label) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error((label || "step") + " timed out"), { status: 503 })), ms).unref())]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const STOP = new Set("the and for with that this from have has had not but can may such these those more most other our their there which into than then also been were was are its about over under between during after before while within without using used use based study results data analysis one two page pages question questions answer answers following correct which option options topic topics booklet class syllabus sample papers www http https figure table chapter section".split(" "));

function keywords(text, take = 8) {
  const c = {};
  /* very long documents: look at the start, the middle and the end instead of every page */
  const t = text.length > 400000 ? text.slice(0, 150000) + " " + text.slice(Math.floor(text.length / 2) - 75000, Math.floor(text.length / 2) + 75000) + " " + text.slice(-100000) : text;
  (t.toLowerCase().match(/[a-z]{5,}/g) || []).forEach((w) => { if (!STOP.has(w)) c[w] = (c[w] || 0) + 1; });
  return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, take).map((x) => x[0]);
}

/* Crossref is a free public API that is sometimes slow or briefly unavailable. Instead of failing the whole request, try several times
   and with progressively simpler queries, and keep whatever real articles come back. Never invents anything. */
async function findArticles(words, n, deadline) {
  const found = new Map();
  const attempts = [[6, true], [4, true], [3, false], [2, false]];
  let reached = false;
  for (const [k, abs] of attempts) {
    const q = words.slice(0, k).join(" ");
    if (!q) continue;
    for (let tryNo = 0; tryNo < 2; tryNo++) {
      const left = deadline - Date.now();
      if (left < 3000) break;
      const url = "https://api.crossref.org/works?query.bibliographic=" + encodeURIComponent(q) + "&rows=" + Math.min(100, n * 4)
        + "&filter=type:journal-article" + (abs ? ",has-abstract:true" : "") + "&select=title,author,issued,container-title,volume,issue,page,DOI,publisher"
        + "&mailto=" + encodeURIComponent(process.env.CONTACT_EMAIL || "support@assignmenthelp.site");
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(Math.min(14000, left)), headers: { "User-Agent": "CitationGenerator/1.0 (mailto:" + (process.env.CONTACT_EMAIL || "support@assignmenthelp.site") + ")" } });
        if (!r.ok) { if (r.status === 429 || r.status >= 500) { await sleep(700 * (tryNo + 1)); continue; } break; }
        reached = true;
        for (const w of (await r.json()).message.items || []) if (w.title?.[0] && w.author?.length && w.issued && w.DOI && !found.has(w.DOI)) found.set(w.DOI, w);
        break;
      } catch (e) { await sleep(500); }
    }
    if (found.size >= n) break;
  }
  if (!found.size && !reached) { const e = new Error("source database unreachable"); e.status = 503; throw e; }
  return [...found.values()].slice(0, n);
}
const ini = (g) => String(g || "").split(/[\s-]+/).filter(Boolean).map((x) => x[0].toUpperCase());
const dots = (g) => ini(g).map((x) => x + ".");
const join = (a, last) => (a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + last + a[a.length - 1]);

function fmt(w, s) {
  const au = (w.author || []).filter((a) => a.family), y = w.issued?.["date-parts"]?.[0]?.[0] || "n.d.";
  const t = String(w.title?.[0] || "").replace(/\.$/, ""), j = w["container-title"]?.[0] || w.publisher || "";
  const v = w.volume, i = w.issue, p = w.page, d = w.DOI ? "https://doi.org/" + w.DOI : "";
  const FG = (a) => a.family + ", " + a.given, GF = (a) => a.given + " " + a.family;
  let A;
  switch (s) {
    case "MLA": A = au.length > 2 ? FG(au[0]) + ", et al" : join(au.map((a, k) => (k ? GF(a) : FG(a))), ", and ");
      return `${A}. "${t}." ${j}, ${v ? "vol. " + v + ", " : ""}${i ? "no. " + i + ", " : ""}${y}${p ? ", pp. " + p : ""}. ${d}`;
    case "Chicago": A = au.length > 3 ? FG(au[0]) + ", et al" : join(au.map((a, k) => (k ? GF(a) : FG(a))), ", and ");
      return `${A}. "${t}." ${j} ${v || ""}${i ? ", no. " + i : ""} (${y})${p ? ": " + p : ""}. ${d}`;
    case "Harvard": A = join(au.map((a) => a.family + ", " + dots(a.given).join("")), ", and ");
      return `${A} (${y}) '${t}', ${j}${v ? ", " + v : ""}${i ? `(${i})` : ""}${p ? ", pp. " + p : ""}. ${d}`;
    case "Oxford": A = join(au.map((a) => dots(a.given).join("") + " " + a.family), ", and ");
      return `${A}, '${t}', ${j}${v ? ", " + v : ""}${i ? "." + i : ""} (${y})${p ? ", " + p : ""}. ${d}`;
    case "Vancouver": case "AMA": A = au.slice(0, 6).map((a) => a.family + " " + ini(a.given).join("")).join(", ") + (au.length > 6 ? ", et al" : "");
      return s === "AMA" ? `${A}. ${t}. ${j}. ${y};${v || ""}${i ? `(${i})` : ""}${p ? ":" + p : ""}. ${d}`
        : `${A}. ${t}. ${j}. ${y}${v ? ";" + v : ""}${i ? `(${i})` : ""}${p ? ":" + p : ""}. ${d}`;
    case "IEEE": A = join(au.map((a) => dots(a.given).join(" ") + " " + a.family), ", and ");
      return `${A}, "${t}," ${j}${v ? ", vol. " + v : ""}${i ? ", no. " + i : ""}${p ? ", pp. " + p : ""}, ${y}. ${d}`;
    case "ACS": A = au.map((a) => a.family + ", " + dots(a.given).join(" ")).join("; ");
      return `${A} ${t}. ${j} ${y}, ${v || ""}${p ? ", " + p : ""}. ${d}`;
    default: A = join(au.slice(0, 20).map((a) => a.family + ", " + dots(a.given).join(" ")), ", & ");   /* APA 7 */
      return `${A} (${y}). ${t}. ${j ? j + (v ? ", " + v : "") + (i ? `(${i})` : "") + (p ? ", " + p : "") + ". " : ""}${d}`;
  }
}

function receive(req, res, next) {
  upload(req, res, (error) => {
    if (!error) return next();
    const m = error.code === "LIMIT_FILE_SIZE" ? `One of the files is too large (limit ${Math.round(MAX_BYTES / 1048576)} MB).` : error.code === "LIMIT_FILE_COUNT" || error.code === "LIMIT_UNEXPECTED_FILE" ? `You can upload up to ${MAX_FILES} files at once.` : "Couldn't read the uploaded files.";
    res.status(400).json({ success: false, message: m });
  });
}

router.post("/", chatRateLimit, requirePlan, receive, async (req, res) => {
  const deadline = Date.now() + 80000;   /* answer before the host's ~100 s proxy limit so the browser always gets JSON, never an HTML error page */
  try {
    const files = [].concat((req.files && req.files.files) || [], (req.files && req.files.file) || []);
    if (!files.length) return res.status(400).json({ success: false, message: "Please upload at least one document." });
    const n = Math.max(1, Math.min(30, parseInt(req.body.count, 10) || 5));
    const style = ["APA", "MLA", "Chicago", "Harvard", "Oxford", "Vancouver", "IEEE", "AMA", "ACS"].includes(req.body.style) ? req.body.style : "APA";
    /* read every document; a file that can't be read is skipped and reported, the rest still count */
    const texts = [], skipped = [], used = [];
    for (const f of files) {
      try {
        const t = await withTimeout(readText(f), Math.max(5000, Math.min(70000, deadline - Date.now() - 20000)), "reading");
        if (String(t).trim().length < 40) { skipped.push(`${f.originalname}: too little text`); continue; }
        texts.push(t); used.push(f);
      } catch (e) { console.warn("[CITATION-GENERATOR] read", f.originalname, e.message); skipped.push(`${f.originalname}: ${e.status === 415 ? "unsupported type" : e.status === 422 ? e.message : "couldn't be read"}`); }
    }
    if (!texts.length) return res.status(422).json({ success: false, message: skipped.length ? `We couldn't read any text from your files (${skipped.join("; ")}).` : "Those documents have too little text to find sources for." });
    const text = texts.join("\n\n");
    /* keep each document (goes live in the Document Library after CITATION_PUBLISH_MONTHS, default 2) - in the background, so a big file never delays or breaks the answer */
    Promise.all(used.map((f) => CD.store(req, f, style))).catch(() => {});
    const items = await findArticles(keywords(text), n, deadline);
    if (!items.length) return res.status(404).json({ success: false, message: "No matching sources found. Try a document with more text." });
    res.json({ success: true, style, filesUsed: used.length, skipped, refs: items.map((w) => fmt(w, style).replace(/\s+/g, " ").trim()) });
  } catch (e) {
    console.warn("[CITATION-GENERATOR]", e.message);
    if (res.headersSent) return;
    res.status(e.status === 503 || /unreachable|timed out/i.test(e.message) ? 503 : 500).json({ success: false, message: e.status === 503 ? "The scholarly database is busy right now. Please try again in a moment." : "We couldn't finish that request. Please try again." });
  }
});
/* any error that slips past the handlers above (multer, body parsing...) is still answered as JSON */
router.use((e, req, res, next) => { if (res.headersSent) return next(e); res.status(e.status || 500).json({ success: false, message: "We couldn't finish that request. Please try again." }); });
module.exports = router;
