"use strict";

/*
============================================================
GROQ KEY POOL - up to 10 API keys, switched automatically
============================================================
Groq limits every account (organisation) to a number of requests per minute. Put the API keys of up to 10 different
Groq accounts in backend/.env and this module keeps count of the calls made with each key:

  - It uses the FIRST key until it has made GROQ_CALLS_PER_MIN calls (default 500) in the last 60 seconds,
    then moves on to the next key, then the next ... and comes back to key 1 as soon as its minute has freed up.
  - If Groq answers 429 (limit reached) for a key anyway, that key rests for the time Groq asks (Retry-After), the same
    request is sent again with the next key, and the caller never notices.
  - A key that Groq rejects (401/403 - wrong or revoked) is skipped for 10 minutes, then tried again.

.env settings (any of these):
  GROQ_API_KEY=gsk_...                 the original single key (still works, it is key 1)
  GROQ_API_KEYS=gsk_a,gsk_b,gsk_c      comma / space / new-line separated list (max 10)
  GROQ_API_KEY_2=...  ..  GROQ_API_KEY_10=...   numbered keys (optional alternative)
  GROQ_CALLS_PER_MIN=500               calls allowed per key per minute before switching (default 500)

Every Groq call in the site (chat assistant, humanizer, AI detector, tools) goes through groqFetch(), so they all share
the same pool and the same counters. keyStatus() / poolSummary() return the live state (keys are shown masked, never in
full) and are what the admin console's "Groq keys" tab displays (GET /api/admin/groq-keys); checkKeys() asks Groq whether
each key is accepted (POST /api/admin/groq-keys/test, the "Test keys" button). Counters live in memory, so they start
again at 0 when the server restarts.
============================================================
*/

const URL = "https://api.groq.com/openai/v1/chat/completions";
const MODELS_URL = "https://api.groq.com/openai/v1/models";
const MAX_KEYS = 10;
const WINDOW_MS = 60 * 1000;
const BAD_KEY_MS = 10 * 60 * 1000;

function loadKeys() {
  const out = [];
  const add = (v) => String(v || "").split(/[\s,;]+/).forEach((k) => { k = k.trim().replace(/^["']|["']$/g, ""); if (k && !out.includes(k)) out.push(k); });
  add(process.env.GROQ_API_KEY);
  add(process.env.GROQ_API_KEYS);
  for (let i = 1; i <= MAX_KEYS; i++) add(process.env["GROQ_API_KEY_" + i]);
  return out.slice(0, MAX_KEYS);
}

let pool = null, poolSig = "";
function getPool() {
  const keys = loadKeys(), sig = keys.join("|");
  if (!pool || sig !== poolSig) {                       // first use, or .env changed and the server was restarted
    const old = new Map((pool || []).map((s) => [s.key, s]));
    pool = keys.map((key) => old.get(key) || { key, calls: [], restUntil: 0, bad: 0, total: 0, limited: 0, lastUsed: 0, lastStatus: 0 });
    poolSig = sig;
  }
  return pool;
}
const limit = () => Math.max(1, parseInt(process.env.GROQ_CALLS_PER_MIN, 10) || 500);
const mask = (k) => (k.length > 10 ? k.slice(0, 4) + "..." + k.slice(-4) : "****");

function prune(slot, now) { while (slot.calls.length && now - slot.calls[0] >= WINDOW_MS) slot.calls.shift(); }
function ready(slot, now) { prune(slot, now); return now >= slot.restUntil && now >= slot.bad && slot.calls.length < limit(); }

/* the first key that still has calls left in its minute (fill-first, so key 1 is used until it is exhausted) */
function pick(skip) {
  const now = Date.now();
  for (const s of getPool()) if (!skip.has(s) && ready(s, now)) return s;
  return null;
}

/* milliseconds until some key can be used again (for the 429 we hand back when every key is used up) */
function nextFreeIn() {
  const now = Date.now(); let best = Infinity;
  for (const s of getPool()) {
    prune(s, now);
    const t = Math.max(s.restUntil, s.bad, s.calls.length >= limit() ? s.calls[0] + WINDOW_MS : 0) - now;
    best = Math.min(best, Math.max(t, 0));
  }
  return Number.isFinite(best) ? best : 0;
}

function hasKeys() { return getPool().length > 0; }

function retryAfterMs(res) {
  const h = parseFloat(res.headers && res.headers.get && res.headers.get("retry-after"));
  return Number.isFinite(h) && h > 0 ? Math.min(h * 1000, WINDOW_MS) : 15000;
}

/* Sends one chat-completions request with the first available key. `body` is the JSON payload (object); `opts.signal`
   is an optional AbortSignal. Returns the fetch Response (callers handle !ok as before). Moves to the next key when
   one is used up, rate limited (429) or rejected (401/403). */
async function groqFetch(body, opts) {
  opts = opts || {};
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  const tried = new Set();
  let last = null;
  for (;;) {
    const slot = pick(tried);
    if (!slot) break;
    tried.add(slot);
    slot.calls.push(Date.now()); slot.total++; slot.lastUsed = Date.now();
    let res;
    try {
      res = await fetch(URL, { method: "POST", signal: opts.signal, headers: { "Content-Type": "application/json", Authorization: "Bearer " + slot.key }, body: payload });
    } catch (e) {
      slot.calls.pop(); slot.total--;                    // never reached Groq: do not count it, and let the caller handle the network error
      throw e;
    }
    slot.lastStatus = res.status;
    if (res.status === 429) {
      slot.limited++; slot.restUntil = Date.now() + retryAfterMs(res);
      console.warn("[GROQ] key " + (getPool().indexOf(slot) + 1) + " (" + mask(slot.key) + ") rate limited - switching to the next key");
      last = res; continue;
    }
    if (res.status === 401 || res.status === 403) {
      slot.bad = Date.now() + BAD_KEY_MS;
      console.error("[GROQ] key " + (getPool().indexOf(slot) + 1) + " (" + mask(slot.key) + ") was rejected (" + res.status + ") - skipping it for 10 minutes");
      last = res; continue;
    }
    return res;
  }
  if (last) return last;                                   // every key tried and refused: pass on the last answer
  const wait = Math.ceil(nextFreeIn() / 1000) || 1;        // no key was usable at all (all used up for this minute, or none configured)
  return new Response(JSON.stringify({ error: { message: hasKeys() ? "All Groq keys have reached their per-minute limit. Please try again in about " + wait + "s." : "No Groq API key is configured." } }),
    { status: hasKeys() ? 429 : 503, headers: { "Content-Type": "application/json", "Retry-After": String(wait) } });
}

/* Live state of every key, for the admin console. status is one of:
   in_use       the key that takes the next call (the first key that still has calls left this minute)
   standby      ready, but an earlier key is being used first
   exhausted    made `limit` calls in the last minute; the pool has already moved on and it is free again after waitSeconds
   rate_limited Groq itself answered 429 for this key; it rests for waitSeconds
   rejected     Groq answered 401/403 (wrong or revoked key); it is skipped for waitSeconds, or until "Test keys" finds it working */
function keyStatus() {
  const now = Date.now(), pool = getPool(), first = pool.find((s) => ready(s, now));
  return pool.map((s, i) => {
    prune(s, now);
    const lim = limit();
    let status = "standby", wait = 0;
    if (now < s.bad) { status = "rejected"; wait = s.bad - now; }
    else if (now < s.restUntil) { status = "rate_limited"; wait = s.restUntil - now; }
    else if (s.calls.length >= lim) { status = "exhausted"; wait = s.calls[0] + WINDOW_MS - now; }
    else if (s === first) status = "in_use";
    return {
      key: i + 1, id: mask(s.key), status, waitSeconds: Math.max(0, Math.ceil(wait / 1000)),
      callsLastMinute: s.calls.length, limit: lim, remaining: Math.max(0, lim - s.calls.length),
      resting: now < s.restUntil || now < s.bad,          // (kept for older callers)
      totalCalls: s.total, rateLimited: s.limited,
      lastUsed: s.lastUsed ? new Date(s.lastUsed).toISOString() : null, lastStatus: s.lastStatus || null,
    };
  });
}

function poolSummary() {
  const list = keyStatus(), now = Date.now();
  const inUse = list.find((k) => k.status === "in_use");
  return {
    configured: list.length, maxKeys: MAX_KEYS, limit: limit(), windowSeconds: WINDOW_MS / 1000,
    ready: list.filter((k) => k.status === "in_use" || k.status === "standby").length,
    inUse: inUse ? inUse.key : null,
    allBusy: list.length > 0 && !inUse,                    // every key is used up / resting right now
    nextFreeInSeconds: list.length && !inUse ? Math.ceil(nextFreeIn() / 1000) : 0,
    totalCalls: list.reduce((a, k) => a + k.totalCalls, 0), serverTime: new Date(now).toISOString(),
  };
}

/* Asks Groq (GET /models, which does not use up chat calls) whether each key is accepted. A key that works again is
   taken out of its "rejected" rest straight away; one that Groq refuses is parked for 10 minutes. */
async function checkKeys() {
  const out = [];
  for (const [i, s] of getPool().entries()) {
    const t0 = Date.now(), ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 8000);
    const row = { key: i + 1, id: mask(s.key), ok: false, httpStatus: null, ms: 0, message: "" };
    try {
      const r = await fetch(MODELS_URL, { headers: { Authorization: "Bearer " + s.key }, signal: ctl.signal });
      row.httpStatus = r.status;
      if (r.ok) { row.ok = true; row.message = "Key accepted by Groq"; if (Date.now() < s.bad) s.bad = 0; }
      else if (r.status === 401 || r.status === 403) { row.message = "Groq rejected this key (wrong, revoked or from a blocked account)"; s.bad = Date.now() + BAD_KEY_MS; }
      else if (r.status === 429) { row.ok = true; row.message = "Key accepted, but Groq is rate limiting it right now"; }
      else row.message = "Groq answered HTTP " + r.status;
    } catch (e) {
      row.message = e && e.name === "AbortError" ? "Groq did not answer within 8 seconds" : "Could not reach api.groq.com (" + (e && e.message ? e.message : "network error") + ")";
    } finally { clearTimeout(timer); row.ms = Date.now() - t0; }
    out.push(row);
  }
  return out;
}

module.exports = { groqFetch, hasKeys, keyStatus, poolSummary, checkKeys, MAX_KEYS };
