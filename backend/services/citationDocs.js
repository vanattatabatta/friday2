"use strict";
/*
 * Citation Generator documents: STORED when uploaded, made LIVE in the Document Library after 2 months.
 *
 *  1. POST /api/citation-generator calls store(): the uploaded .docx is saved in `citation_uploads` (private, not in the library, not in any sitemap).
 *  2. Every CITATION_PUBLISH_CHECK_MINUTES (default 60) publishDue() looks for stored files whose publish_at has passed and turns each one into a normal
 *     library document (same pipeline as /api/docs/upload: duplicate + SEO-spam checks, page images, text, upload log, personal-data check).
 *  3. The personal-data check (classify) then decides whether it is indexable: only indexable documents appear in /sitemap-citation.xml (with their
 *     <image:image> thumbnail). Documents with personal data go live NOT indexed and with all text hidden, exactly like any other library document.
 *
 * Env:  CITATION_PUBLISH_MONTHS  months to wait before going live (default 2; 0 = publish at the next check)
 *       CITATION_AUTOPUBLISH=0   keeps storing but never publishes (kill-switch)
 *       CITATION_PUBLISH_CHECK_MINUTES  how often the check runs (default 60)
 * Published documents are not owned by any member (owner_id NULL) so they do not earn the uploader free unlocks; the uploader stays recorded in
 * citation_uploads and in doc_upload_log for takedown / copyright requests.
 */
const crypto = require("crypto");
const { query } = require("../config/database");
const S = require("./docService");

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MIME = { pdf: "application/pdf", docx: DOCX, doc: "application/msword", rtf: "application/rtf", odt: "application/vnd.oasis.opendocument.text", txt: "text/plain", md: "text/markdown", csv: "text/csv", xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", html: "text/html", htm: "text/html" };
const mimeOf = (name) => MIME[(/\.([a-z0-9]+)$/i.exec(String(name || "")) || [, ""])[1].toLowerCase()] || "application/octet-stream";
const MONTHS = () => { const n = Number(process.env.CITATION_PUBLISH_MONTHS); return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 2; };
let ready = null;

function ensureTable() {
  return ready || (ready = (async () => {
    await query(`CREATE TABLE IF NOT EXISTS citation_uploads (
      id BIGSERIAL PRIMARY KEY, owner_id BIGINT, filename VARCHAR(300), size_bytes INT, data BYTEA NOT NULL, sha256 CHAR(64), style VARCHAR(20), ip VARCHAR(64),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), publish_at TIMESTAMPTZ NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending', doc_id BIGINT, note TEXT)`);   /* status: pending | publishing | published | duplicate | rejected */
    await query("CREATE INDEX IF NOT EXISTS idx_citation_uploads_due ON citation_uploads(status, publish_at)");
    await query("CREATE INDEX IF NOT EXISTS idx_citation_uploads_sha ON citation_uploads(sha256)");
  })().catch((e) => { ready = null; throw e; }));
}

/* Called right after the upload was accepted. Never throws into the caller's flow: the generator must work even if storing fails. */
async function store(req, file, style) {
  try {
    await ensureTable();
    const sha = crypto.createHash("sha256").update(file.buffer).digest("hex");
    if ((await query("SELECT 1 FROM citation_uploads WHERE sha256=$1 LIMIT 1", [sha])).rowCount) return null;   /* same file retried: keep one copy */
    const r = await query(
      "INSERT INTO citation_uploads(owner_id,filename,size_bytes,data,sha256,style,ip,publish_at) VALUES($1,$2,$3,$4,$5,$6,$7, NOW() + make_interval(months => $8)) RETURNING id",
      [req.user ? req.user.id : null, String(file.originalname || "document.docx").slice(0, 300), file.size || file.buffer.length, file.buffer, sha, String(style || "").slice(0, 20),
       String(req.ip || (req.socket && req.socket.remoteAddress) || "").slice(0, 64), MONTHS()]);
    return r.rows[0].id;
  } catch (e) { console.warn("[CITATION-DOCS] store:", e.message); return null; }
}

async function setStatus(id, status, note, docId) {
  await query("UPDATE citation_uploads SET status=$2, note=$3, doc_id=COALESCE($4, doc_id) WHERE id=$1", [id, status, note || null, docId || null]);
}

/* Turns one stored upload into a library document. Mirrors /api/docs/upload. */
async function publishOne(row) {
  const f = { buffer: row.data, originalname: row.filename, mimetype: mimeOf(row.filename), size: row.size_bytes };
  const same = await S.findDuplicate(f.buffer, "");
  if (same && !same.none) return setStatus(row.id, "duplicate", `same file as "${same.title}"`);
  const ex = await S.extract(f);
  ex.pages = ex.pages.map(S.tidy);
  let imgs = null;
  if (["doc", "text", "sheet"].includes(ex.kind)) { const o = await S.officeRender(f, ex.kind); if (o) { imgs = o.imgs; if (o.pages.length) ex.pages = o.pages; } }
  else imgs = await S.renderPages(f, ex.kind);
  const spam = S.seoSpamReason(ex.pages.join("\n"));
  if (spam) return setStatus(row.id, "rejected", "seo/link promotion: " + spam);
  if (imgs) ex.count = imgs.length;
  const dup = await S.findDuplicate(f.buffer, ex.pages.join("\n"));
  if (dup && !dup.none) return setStatus(row.id, "duplicate", `${dup.similarity}% same as "${dup.title}"`);
  const title = S.pickTitle("", row.filename, ex.pages);
  let d = null;
  for (let t = 0; t < 5 && !d; t++) {
    const slug = await S.uniqueSlug(S.slugify(title));
    try {
      d = (await query("INSERT INTO docs(owner_id,guest_id,title,slug,filename,mime,kind,page_count,img) VALUES(NULL,NULL,$1,$2,$3,$4,$5,$6,$7) RETURNING id",
        [title, slug, row.filename.slice(0, 300), f.mimetype, ex.kind, ex.count, !!imgs])).rows[0];
    } catch (e) { if (e.code !== "23505") throw e; }   /* slug taken a moment ago: try the next one */
  }
  if (!d) throw new Error("could not create a unique slug");
  try {
    if (dup && dup.fp) await query("UPDATE docs SET sig=$2, nsh=$3 WHERE id=$1", [d.id, dup.fp.sig, dup.fp.n]);
    await query("INSERT INTO doc_files(doc_id,data) VALUES($1,$2)", [d.id, f.buffer]);
    try {   /* who uploaded it (takedown / copyright evidence) */
      const u = row.owner_id ? (await query("SELECT name,email,phone FROM users WHERE id=$1", [row.owner_id])).rows[0] || {} : {};
      await query("INSERT INTO doc_upload_log(doc_id,user_id,user_name,user_email,user_phone,ip,forwarded_for,user_agent,title,original_filename,mime,size_bytes,sha256) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
        [d.id, row.owner_id || null, u.name || null, u.email || null, u.phone || null, row.ip || null, "", "citation-generator (auto-published)", title, row.filename.slice(0, 300), f.mimetype, row.size_bytes || f.buffer.length, row.sha256]);
    } catch (e) { console.warn("[CITATION-DOCS] upload log:", e.message); }
    for (let n = 0; n < ex.count; n++)
      await query('INSERT INTO doc_pages(doc_id,page_no,body,preview,"full",bg,lay,bgimg) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [d.id, n + 1, imgs && imgs[n].lay && imgs[n].lay.t.length >= 3 ? S.layText(imgs[n].lay) : ex.pages[n] || "", imgs ? imgs[n].preview : null, imgs ? imgs[n].full : null,
         imgs ? await S.pageBg(imgs[n].full) : null, imgs && imgs[n].lay ? JSON.stringify(imgs[n].lay) : null, imgs ? imgs[n].bgimg || null : null]);
  } catch (e) {   /* half-created document: take it down again and retry later */
    await query("UPDATE docs SET removed=true WHERE id=$1", [d.id]).catch(() => {});
    throw e;
  }
  S.classify(d.id).catch((e) => console.warn("[CITATION-DOCS] classify:", e.message));          /* personal-data check decides whether it is indexable / in the sitemap */
  if (imgs) S.ocrDoc(d.id).catch((e) => console.warn("[CITATION-DOCS] OCR:", e.message));
  await setStatus(row.id, "published", null, d.id);
  console.log("[CITATION-DOCS] stored upload", row.id, "is now live as document", d.id);
}

let running = false;
async function publishDue(limit = 5) {
  if (running || process.env.CITATION_AUTOPUBLISH === "0") return 0;
  running = true; let n = 0;
  try {
    await ensureTable();
    /* a crash while publishing leaves 'publishing' rows behind: release them after 30 minutes */
    await query("UPDATE citation_uploads SET status='pending' WHERE status='publishing' AND publish_at < NOW() - INTERVAL '30 minutes'");
    const { rows } = await query(
      `UPDATE citation_uploads SET status='publishing' WHERE id IN
         (SELECT id FROM citation_uploads WHERE status='pending' AND publish_at <= NOW() ORDER BY publish_at LIMIT $1 FOR UPDATE SKIP LOCKED) RETURNING *`, [limit]);
    for (const row of rows) {
      try { await publishOne(row); n++; }
      catch (e) {
        console.warn("[CITATION-DOCS] publish", row.id, e.message);
        await query("UPDATE citation_uploads SET status='pending', note=$2, publish_at=NOW() + INTERVAL '6 hours' WHERE id=$1", [row.id, String(e.message).slice(0, 300)]).catch(() => {});
      }
    }
  } catch (e) { console.warn("[CITATION-DOCS] check:", e.message); }
  finally { running = false; }
  return n;
}

function start() {
  ensureTable().catch((e) => console.warn("[CITATION-DOCS] table:", e.message));
  const every = Math.max(1, Number(process.env.CITATION_PUBLISH_CHECK_MINUTES || (process.env.DATABASE_URL ? 360 : 60))) * 60000;
  setTimeout(() => publishDue(), 60000).unref();
  setInterval(() => publishDue(), every).unref();
}

module.exports = { store, publishDue, start, ensureTable };
