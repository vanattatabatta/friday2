"use strict";
/*
 * Free trial for the $30/month services (citations, document creator, text recognition, diagrams).
 * Every visitor gets FREE_TOOL_USES (default 1) free successful uses in total, shared across all services.
 * Signed-in users are counted by account; visitors who are not signed in are counted by a long-lived cookie AND by IP,
 * so clearing cookies alone does not hand out extra free uses. Nobody has to sign up or log in to use their free try.
 * A use is reserved when the request starts and given back if the request fails, so an error never burns the free try.
 */
const crypto = require("crypto");
const { query } = require("../config/database");

const LIMIT = () => Math.max(0, parseInt(process.env.FREE_TOOL_USES || "1", 10) || 0);
const COOKIE = "ah_visitor";
let ready = null;
const ensure = () => ready || (ready = query("CREATE TABLE IF NOT EXISTS tool_free_uses (k VARCHAR(120) PRIMARY KEY, uses INT NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())").catch((e) => { ready = null; throw e; }));

function cookieId(req, res) {
  const m = String(req.headers.cookie || "").match(new RegExp("(?:^|;\\s*)" + COOKIE + "=([a-f0-9]{32})"));
  if (m) return m[1];
  const id = crypto.randomBytes(16).toString("hex");
  if (res) res.append("Set-Cookie", `${COOKIE}=${id}; Path=/; Max-Age=${60 * 60 * 24 * 365 * 2}; HttpOnly; SameSite=Lax${req.secure ? "; Secure" : ""}`);
  return id;
}
function keys(req, res) {
  if (req.user && req.user.id) return ["u:" + req.user.id];
  const ip = String(req.ip || (req.socket && req.socket.remoteAddress) || "unknown").slice(0, 64);
  return ["c:" + cookieId(req, res), "ip:" + ip];
}
async function used(ks) {
  const { rows } = await query("SELECT COALESCE(MAX(uses),0)::int n FROM tool_free_uses WHERE k = ANY($1)", [ks]);
  return rows[0].n;
}
async function status(req, res) {
  await ensure();
  const limit = LIMIT(), n = await used(keys(req, res));
  return { limit, left: Math.max(0, limit - n) };
}
/* Atomically takes one free use; returns the keys it took (to refund on failure) or null when none are left. */
async function reserve(req, res) {
  await ensure();
  const limit = LIMIT(), ks = keys(req, res);
  if (!limit || (await used(ks)) >= limit) return null;
  for (const k of ks)
    await query("INSERT INTO tool_free_uses(k,uses) VALUES($1,1) ON CONFLICT (k) DO UPDATE SET uses = tool_free_uses.uses + 1, updated_at = NOW()", [k]);
  return ks;
}
async function refund(ks) {
  try { await query("UPDATE tool_free_uses SET uses = GREATEST(uses - 1, 0) WHERE k = ANY($1)", [ks]); } catch (e) { console.warn("[FREE] refund:", e.message); }
}
module.exports = { status, reserve, refund, LIMIT };
