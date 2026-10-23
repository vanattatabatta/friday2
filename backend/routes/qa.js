"use strict";
const express = require("express");
const { requireUser } = require("../middleware/userAuth");
const { requireAdmin } = require("../middleware/auth");
const { chatRateLimit } = require("../middleware/chatRateLimit");
const Q = require("../services/qaService");

const router = express.Router();
router.use((req, res, next) => { res.setHeader("X-Robots-Tag", "noindex, nofollow"); res.setHeader("Cache-Control", "no-store"); next(); });
router.param("id", (req, res, next, v) => (/^\d{1,18}$/.test(v) ? next() : next("route")));
const wrap = (fn) => (req, res) => fn(req, res).catch((e) => { console.warn("[QA]", e.message); res.status(e.status || 500).json({ success: false, message: e.status ? e.message : "Something went wrong." }); });
const origin = (req) => String(process.env.SITE_URL || "").trim().replace(/\/+$/, "") || `${(req.get("x-forwarded-proto") || req.protocol || "https").split(",")[0]}://${req.get("host")}`;
const host = (req) => origin(req).replace(/^https?:\/\//, "");

/* What the signed-in member can still do. */
router.get("/me", requireUser, wrap(async (req, res) => res.json({ success: true, expert: await Q.isExpert(req.user), ...(await Q.quota(req.user.id)) })));

/* Ask: the question is saved and LIVE in the same request. /qa-sitemap.xml is read from the database on every request, so it already lists the new URL. */
router.post("/ask", chatRateLimit, requireUser, wrap(async (req, res) => {
  const r = await Q.ask(req.user, req.body || {});
  if (!r.ok) return res.status(r.status).json({ success: false, needPass: !!r.needPass, message: r.message });
  const url = "/qa/" + encodeURIComponent(r.q.slug);
  if (!r.q.noindex) Q.indexNow([origin(req) + url], host(req));
  res.json({ success: true, url, slug: r.q.slug, indexed: !r.q.noindex, via: r.q.via, quota: await Q.quota(req.user.id) });
}));

/* An expert answers: same URL, the answer shows up there at once (30% to other visitors, all of it to the asker). */
router.post("/:id/answer", chatRateLimit, requireUser, wrap(async (req, res) => {
  if (!(await Q.isExpert(req.user))) return res.status(403).json({ success: false, message: "Only experts can post answers." });
  const q = await Q.byId(req.params.id); if (!q) return res.status(404).json({ success: false, message: "Question not found." });
  const r = await Q.saveAnswer(q, req.user, (req.body || {}).body);
  if (!r.ok) return res.status(r.status).json({ success: false, message: r.message });
  if (!q.noindex) Q.indexNow([origin(req) + "/qa/" + encodeURIComponent(q.slug)], host(req));
  res.json({ success: true, url: "/qa/" + encodeURIComponent(q.slug) });
}));

/* A member opens an answer with one of the 30 answer views of the pass. */
router.post("/:id/unlock", chatRateLimit, requireUser, wrap(async (req, res) => {
  const q = await Q.byId(req.params.id); if (!q) return res.status(404).json({ success: false, message: "Question not found." });
  const r = await Q.unlockAnswer(q, req.user);
  if (!r.ok) return res.status(r.status).json({ success: false, needPass: !!r.needPass, message: r.message });
  res.json({ success: true, spent: r.spent });
}));

router.delete("/:id", requireUser, wrap(async (req, res) => {
  const q = await Q.byId(req.params.id); if (!q) return res.status(404).json({ success: false, message: "Question not found." });
  if (!(await Q.removeQuestion(q, req.user))) return res.status(403).json({ success: false, message: "Not allowed." });
  res.json({ success: true });
}));

/* $30 membership: one Stripe payment (no subscription). */
router.post("/pass/checkout", chatRateLimit, requireUser, wrap(async (req, res) => {
  let back = "/qa"; const s0 = String((req.body || {}).slug || ""); if (/^[\p{L}\p{N}-]{1,220}$/u.test(s0)) back = "/qa/" + encodeURIComponent(s0);
  const s = await Q.stripe("POST", "/v1/checkout/sessions", { mode: "payment", customer_email: req.user.email, "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd", "line_items[0][price_data][unit_amount]": String(Q.PASS_CENTS()),
    "line_items[0][price_data][product_data][name]": `Q&A membership: ${Q.PASS_Q()} questions + ${Q.PASS_V()} answer views (${Q.PASS_DAYS()} days)`,
    "metadata[user_id]": String(req.user.id), "metadata[kind]": "qa_pass", success_url: `${origin(req)}${back}?qapass={CHECKOUT_SESSION_ID}`, cancel_url: `${origin(req)}${back}` });
  res.json({ success: true, url: s.url });
}));
/* Never trusts the browser: the session is read back from Stripe. Recording the same session twice is harmless. */
router.post("/pass/confirm", requireUser, wrap(async (req, res) => {
  const id = String((req.body || {}).session_id || "");
  if (!/^cs_[A-Za-z0-9_]+$/.test(id)) return res.status(400).json({ success: false, message: "Bad session." });
  const s = await Q.stripe("GET", "/v1/checkout/sessions/" + id), m = s.metadata || {};
  if (String(m.user_id) !== String(req.user.id) || m.kind !== "qa_pass" || s.status !== "complete" || s.payment_status !== "paid") return res.status(403).json({ success: false, message: "Payment not confirmed." });
  await Q.addPass(req.user.id, id);
  res.json({ success: true, quota: await Q.quota(req.user.id) });
}));

/* Admin: make a member an expert (or remove it).  POST /api/qa/admin/expert  { "email": "...", "expert": true }  with the admin bearer token. */
router.post("/admin/expert", requireAdmin, wrap(async (req, res) => {
  const ok = await Q.setExpert((req.body || {}).email, (req.body || {}).expert !== false);
  res.status(ok ? 200 : 404).json({ success: ok, message: ok ? "Saved." : "No member with that email." });
}));

module.exports = router;
