"use strict";
/*
 * Questions & Answers.
 *   - A member posts a question: it is LIVE at once on /qa/<slug> and is in /qa-sitemap.xml on the very next request (no cache).
 *   - An expert answers it: the answer appears on the SAME url (no new page).
 *   - The person who asked, experts and anyone who spent an "answer view" see the whole answer. Everybody else sees the whole question and the
 *     first QA_ANSWER_CLEAR_RATIO (30%) of the answer; the rest is blurred.
 *   - 2 questions are free per member (QA_FREE_QUESTIONS). After that a $30 pass (QA_PASS_PRICE_CENTS) is needed: valid 30 days,
 *     30 questions + 30 answer views (QA_PASS_QUESTIONS / QA_PASS_VIEWS / QA_PASS_DAYS).
 */
const crypto = require("crypto");
const { query } = require("../config/database");
const D = require("./docService");

const FREE_Q = () => Math.max(0, Number(process.env.QA_FREE_QUESTIONS == null || process.env.QA_FREE_QUESTIONS === "" ? 2 : process.env.QA_FREE_QUESTIONS));
const PASS_CENTS = () => Number(process.env.QA_PASS_PRICE_CENTS || 3000);
const PASS_Q = () => Math.max(1, Number(process.env.QA_PASS_QUESTIONS || 30));
const PASS_V = () => Math.max(1, Number(process.env.QA_PASS_VIEWS || 30));
const PASS_DAYS = () => Math.max(1, Number(process.env.QA_PASS_DAYS || 30));
const CLEAR = () => { const v = Number(process.env.QA_ANSWER_CLEAR_RATIO); return v > 0 && v < 1 ? v : 0.3; };
const CRAWL_FULL = () => process.env.QA_CRAWL_FULL === "1";   /* 1 = the hidden 70% of an answer is real (blurred) text in the HTML, like the documents; default 0 = it is scrambled on the server */
const RESERVED = new Set(["ask", "new", "api", "admin", "sitemap", "page"]);

async function initTables() {
  await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_expert BOOLEAN NOT NULL DEFAULT FALSE");
  await query(`CREATE TABLE IF NOT EXISTS qa_questions (
    id BIGSERIAL PRIMARY KEY, owner_id BIGINT REFERENCES users(id) ON DELETE SET NULL, slug VARCHAR(220) NOT NULL UNIQUE,
    title VARCHAR(300) NOT NULL, body TEXT NOT NULL DEFAULT '', subject VARCHAR(80), via VARCHAR(8) NOT NULL DEFAULT 'free',
    status VARCHAR(10) NOT NULL DEFAULT 'open', noindex BOOLEAN NOT NULL DEFAULT FALSE, idx_note TEXT, removed BOOLEAN NOT NULL DEFAULT FALSE,
    views INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), answered_at TIMESTAMPTZ, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await query("CREATE INDEX IF NOT EXISTS idx_qa_q_owner ON qa_questions(owner_id, via)");
  await query("CREATE INDEX IF NOT EXISTS idx_qa_q_list ON qa_questions(removed, noindex, id DESC)");
  await query(`CREATE TABLE IF NOT EXISTS qa_answers (q_id BIGINT PRIMARY KEY REFERENCES qa_questions(id) ON DELETE CASCADE,
    expert_id BIGINT REFERENCES users(id) ON DELETE SET NULL, body TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await query(`CREATE TABLE IF NOT EXISTS qa_passes (id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, stripe_ref VARCHAR(120) UNIQUE,
    questions INTEGER NOT NULL, views INTEGER NOT NULL, q_used INTEGER NOT NULL DEFAULT 0, v_used INTEGER NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await query("CREATE INDEX IF NOT EXISTS idx_qa_pass_user ON qa_passes(user_id, expires_at)");
  await query(`CREATE TABLE IF NOT EXISTS qa_unlocks (q_id BIGINT NOT NULL REFERENCES qa_questions(id) ON DELETE CASCADE, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (q_id, user_id))`);
}

/* ---------- people ---------- */
const expertEmails = () => String(process.env.QA_EXPERT_EMAILS || "").toLowerCase().split(/[,\s;]+/).filter(Boolean);
async function isExpert(user) {
  if (!user) return false;
  if (expertEmails().includes(String(user.email || "").toLowerCase())) return true;
  const r = (await query("SELECT is_expert FROM users WHERE id=$1", [user.id])).rows[0];
  return !!(r && r.is_expert);
}
async function setExpert(email, on) {
  const r = await query("UPDATE users SET is_expert=$2 WHERE LOWER(email)=LOWER($1) RETURNING id", [String(email || "").trim(), !!on]);
  return r.rowCount > 0;
}

/* ---------- quota + pass ---------- */
async function passStatus(userId) {
  const r = (await query("SELECT COALESCE(SUM(questions-q_used),0)::int AS q, COALESCE(SUM(views-v_used),0)::int AS v, MIN(expires_at) AS expires FROM qa_passes WHERE user_id=$1 AND expires_at>NOW()", [userId])).rows[0];
  return { questions: r.q, views: r.v, expires: r.q > 0 || r.v > 0 ? r.expires : null };
}
async function quota(userId) {
  const used = (await query("SELECT COUNT(*)::int n FROM qa_questions WHERE owner_id=$1 AND via='free'", [userId])).rows[0].n;
  const pass = await passStatus(userId);
  return { free: { limit: FREE_Q(), used: Math.min(used, FREE_Q()), left: Math.max(0, FREE_Q() - used) }, pass, price: PASS_CENTS() / 100, passQuestions: PASS_Q(), passViews: PASS_V(), passDays: PASS_DAYS() };
}
async function addPass(userId, ref) {
  await query("INSERT INTO qa_passes(user_id,stripe_ref,questions,views,expires_at) VALUES($1,$2,$3,$4, NOW() + ($5 || ' days')::interval) ON CONFLICT (stripe_ref) DO NOTHING", [userId, ref, PASS_Q(), PASS_V(), String(PASS_DAYS())]);
}
const spendPass = async (userId, col) => {   /* col: 'q' or 'v'. One atomic UPDATE, so two clicks at once can never spend the same credit twice. */
  const [used, cap] = col === "q" ? ["q_used", "questions"] : ["v_used", "views"];
  const r = await query(`UPDATE qa_passes SET ${used}=${used}+1 WHERE id=(SELECT id FROM qa_passes WHERE user_id=$1 AND expires_at>NOW() AND ${used}<${cap} ORDER BY expires_at LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING id`, [userId]);
  return r.rowCount ? r.rows[0].id : null;
};
const refund = (passId, col) => query(`UPDATE qa_passes SET ${col === "q" ? "q_used" : "v_used"}=GREATEST(0, ${col === "q" ? "q_used" : "v_used"}-1) WHERE id=$1`, [passId]);

/* ---------- questions ---------- */
async function uniqueSlug(base) {
  base = String(base || "question").slice(0, 150).replace(/-+$/, "") || "question";
  if (RESERVED.has(base)) base += "-q";
  const { rows } = await query("SELECT slug FROM qa_questions WHERE slug=$1 OR slug LIKE $2", [base, base.replace(/[\\%_]/g, "\\$&") + "-%"]);
  const used = new Set(rows.map((r) => r.slug));
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) if (!used.has(base + "-" + n)) return base + "-" + n;
}
const clean = (t, max) => String(t == null ? "" : t).replace(/\r/g, "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{4,}/g, "\n\n\n").trim().slice(0, max);

/* Creates the question (live immediately). Returns { ok, q } or { ok:false, status, message, needPass }. */
async function ask(user, { title, body, subject }) {
  title = clean(title, 300).replace(/\s+/g, " "); body = clean(body, 8000); subject = clean(subject, 80).replace(/\s+/g, " ");
  if (title.length < 10) return { ok: false, status: 400, message: "Write your question in at least 10 characters." };
  const pii = D.piiReasons(title + "\n" + body), noindex = pii.length > 0;   /* personal / financial data: the question is live for its owner but is not indexed or listed */
  const slug = await uniqueSlug(D.slugify(title));
  const insert = (via) => query("INSERT INTO qa_questions(owner_id,slug,title,body,subject,via,noindex,idx_note) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *", [user.id, slug, title, body, subject || null, via, noindex, noindex ? pii.join(", ") : null]);
  let q = null, passId = null;
  if (FREE_Q() > 0) {
    q = (await insert("free")).rows[0];
    /* two posts at the same moment can both pass a count check, so the rank is verified after the insert */
    const rank = (await query("SELECT COUNT(*)::int n FROM qa_questions WHERE owner_id=$1 AND via='free' AND id<=$2", [user.id, q.id])).rows[0].n;
    if (rank > FREE_Q()) { await query("DELETE FROM qa_questions WHERE id=$1", [q.id]); q = null; }
  }
  if (!q) {
    passId = await spendPass(user.id, "q");
    if (!passId) return { ok: false, status: 402, needPass: true, message: `Your ${FREE_Q()} free questions are used. Get the $${PASS_CENTS() / 100} membership to ask more.` };
    try { q = (await insert("pass")).rows[0]; } catch (e) { await refund(passId, "q"); throw e; }
  }
  return { ok: true, q };
}
async function bySlug(slug) {
  const q = (await query("SELECT q.*, u.name AS owner_name FROM qa_questions q LEFT JOIN users u ON u.id=q.owner_id WHERE q.slug=$1 AND q.removed=false", [String(slug || "").toLowerCase()])).rows[0];
  if (!q) return null;
  q.answer = (await query("SELECT a.body, a.created_at, a.updated_at, u.name AS expert_name FROM qa_answers a LEFT JOIN users u ON u.id=a.expert_id WHERE a.q_id=$1", [q.id])).rows[0] || null;
  return q;
}
async function byId(id) { return (await query("SELECT * FROM qa_questions WHERE id=$1 AND removed=false", [id])).rows[0] || null; }
const firstName = (n) => { const p = String(n || "").trim().split(/\s+/); return p[0] ? p[0] + (p[1] ? " " + p[1][0].toUpperCase() + "." : "") : "Member"; };

async function canSeeAnswer(q, user) {
  if (!user) return false;
  if (String(q.owner_id) === String(user.id)) return true;
  if (await isExpert(user)) return true;
  return (await query("SELECT 1 FROM qa_unlocks WHERE q_id=$1 AND user_id=$2", [q.id, user.id])).rowCount > 0;
}
/* Spends one answer view of the pass (nothing is spent when the answer is already open to the member). */
async function unlockAnswer(q, user) {
  if (await canSeeAnswer(q, user)) return { ok: true, spent: false };
  const passId = await spendPass(user.id, "v");
  if (!passId) return { ok: false, status: 402, needPass: true, message: `Get the $${PASS_CENTS() / 100} membership to open answers (${PASS_V()} answer views, ${PASS_DAYS()} days).` };
  const ins = await query("INSERT INTO qa_unlocks(q_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [q.id, user.id]);
  if (!ins.rowCount) { await refund(passId, "v"); return { ok: true, spent: false }; }
  return { ok: true, spent: true };
}
async function saveAnswer(q, expert, body) {
  body = clean(body, 20000);
  if (body.length < 20) return { ok: false, status: 400, message: "Write the answer in at least 20 characters." };
  await query("INSERT INTO qa_answers(q_id,expert_id,body) VALUES($1,$2,$3) ON CONFLICT (q_id) DO UPDATE SET body=$3, expert_id=$2, updated_at=NOW()", [q.id, expert.id, body]);
  await query("UPDATE qa_questions SET status='answered', answered_at=COALESCE(answered_at,NOW()), updated_at=NOW() WHERE id=$1", [q.id]);
  return { ok: true };
}
async function removeQuestion(q, user) {
  if (String(q.owner_id) !== String(user.id) && !(await isExpert(user))) return false;
  await query("UPDATE qa_questions SET removed=true, updated_at=NOW() WHERE id=$1", [q.id]);
  return true;
}

/* ---------- 30% of an answer ---------- */
/* a = the clear first part (whole words), b = the rest. For viewers without access b is either scrambled text (default) or the real text (QA_CRAWL_FULL=1, blurred by CSS). */
function splitAnswer(body, ratio) {
  const toks = String(body || "").split(/(\s+)/), N = toks.filter((w) => w.trim()).length, keep = Math.max(1, Math.ceil(N * (ratio == null ? CLEAR() : ratio)));
  let a = "", b = "", seen = 0;
  for (const t of toks) { if (t.trim()) seen++; (seen <= keep ? (a += t) : (b += t)); }
  return { a: a.trimEnd(), b: b.replace(/^\s+/, ""), words: N };
}
const L = "abcdefghijklmnopqrstuvwxyz";
const scramble = (t) => String(t).replace(/\S+/g, (w) => w.replace(/[a-z]/gi, (c) => { const r = L[crypto.randomInt(26)]; return c === c.toUpperCase() ? r.toUpperCase() : r; }).replace(/\d/g, () => String(crypto.randomInt(10))));
const hiddenPart = (b) => (CRAWL_FULL() ? b : scramble(b));

/* ---------- lists + sitemap ---------- */
async function list({ filter, page, size = 30 }) {
  const where = ["removed=false", "noindex=false"]; if (filter === "answered") where.push("status='answered'"); if (filter === "open") where.push("status='open'");
  const off = (Math.max(1, page || 1) - 1) * size;
  const rows = (await query(`SELECT slug,title,subject,status,created_at,answered_at FROM qa_questions WHERE ${where.join(" AND ")} ORDER BY id DESC LIMIT ${size + 1} OFFSET ${off}`)).rows;
  return { rows: rows.slice(0, size), more: rows.length > size };
}
/* Fresh from the database on every request: a question is listed the moment it is saved, an answer bumps <lastmod>. */
async function sitemapRows(limit, offset) {
  return (await query("SELECT slug, GREATEST(created_at, COALESCE(answered_at, created_at), updated_at) AS lm FROM qa_questions WHERE removed=false AND noindex=false ORDER BY id LIMIT $1 OFFSET $2", [limit, offset])).rows;
}
async function sitemapCount() { return (await query("SELECT COUNT(*)::int n FROM qa_questions WHERE removed=false AND noindex=false")).rows[0].n; }

/* Search-engine notice. Google no longer has a ping URL (it reads /qa-sitemap.xml, which is always current). IndexNow (Bing, Yahoo, Yandex, Seznam...)
   is told at once when INDEXNOW_KEY is set; the key file is served at /<key>.txt by qaPages. */
async function indexNow(urls, host) {
  const key = String(process.env.INDEXNOW_KEY || "").trim(); if (!key || !urls.length) return;
  try { await fetch("https://api.indexnow.org/indexnow", { method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" }, body: JSON.stringify({ host, key, keyLocation: `https://${host}/${key}.txt`, urlList: urls.slice(0, 100) }), signal: AbortSignal.timeout(5000) }); }
  catch (e) { console.warn("[QA] IndexNow:", e.message); }
}

module.exports = { initTables, FREE_Q, PASS_CENTS, PASS_Q, PASS_V, PASS_DAYS, CLEAR, isExpert, setExpert, passStatus, quota, addPass, ask, bySlug, byId, firstName, canSeeAnswer, unlockAnswer, saveAnswer, removeQuestion,
  splitAnswer, hiddenPart, list, sitemapRows, sitemapCount, indexNow, stripe: D.stripe };
