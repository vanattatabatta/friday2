"use strict";
/*
 * "Who is on the website right now". Pages send a heartbeat every ~20s (js/presence.js); a visitor
 * counts as online until 50s pass without one. Everything lives in memory (nothing is written to the
 * database), so a restart simply starts the list again. The agent console receives a snapshot over
 * the existing SSE stream. Visitors who open the live chat are linked to their chat session so the
 * console can show the name / email / message they typed.
 */
const { query } = require("../config/database");
const svc = require("./liveChatService");

const TTL_MS = 50 * 1000;
const MAX_VISITORS = 5000;
const BOT_RE = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|headless|lighthouse|pagespeed|pingdom|uptime|monitor|preview|python-requests|curl\//i;
const visitors = new Map();   // vid -> record
const geoCache = new Map();   // ip -> { name, code, at }
const geoPending = new Map(); // ip -> Promise

const validVid = (v) => /^[A-Za-z0-9]{8,40}$/.test(String(v || ""));
const cleanIp = (ip) => String(ip || "").replace(/^::ffff:/i, "").slice(0, 100);
const cleanPage = (p) => String(p || "/").split(/[?#]/)[0].replace(/[^\x20-\x7E]/g, "").slice(0, 100) || "/";
const cleanTitle = (t) => String(t || "").replace(/[\u0000-\u001F]/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
const cleanHref = (h) => { h = String(h || "").replace(/#.*$/, "").slice(0, 400); return /^https?:\/\/[^\s<>"']+$/i.test(h) ? h : ""; };
const deviceOf = (ua) => (/mobile|android|iphone|ipad/i.test(ua) ? "Mobile" : "Desktop");

function geo(ip, cf) {
  const hit = geoCache.get(ip);
  if (hit && Date.now() - hit.at < 24 * 3600 * 1000) return Promise.resolve(hit);
  if (!geoPending.has(ip)) {
    geoPending.set(ip, svc.geoLookup(ip, cf).then((g) => {
      const r = { name: g.name, code: g.code || "", at: Date.now() };
      if (g.name && g.name !== "Unknown") geoCache.set(ip, r); // do not cache failures
      if (geoCache.size > 5000) geoCache.clear();
      return r;
    }).finally(() => geoPending.delete(ip)));
  }
  return geoPending.get(ip);
}

/* A heartbeat from a page. Returns false when ignored (bot / bad id). */
function touch({ vid, ip, page, title, href, ua, cf }) {
  ua = String(ua || "");
  if (!validVid(vid) || BOT_RE.test(ua)) return false;
  ip = cleanIp(ip);
  const now = Date.now();
  let v = visitors.get(vid);
  if (!v) {
    if (visitors.size >= MAX_VISITORS) return false;
    v = { vid, ip, country: "", country_code: "", page: "", title: "", url: "", device: deviceOf(ua), first_seen: now, last_seen: now, session_id: null };
    visitors.set(vid, v);
    geo(ip, cf).then((g) => { v.country = g.name; v.country_code = g.code; schedule(); }).catch(() => {});
    schedule();
  }
  if (v.ip !== ip) { v.ip = ip; geo(ip, cf).then((g) => { v.country = g.name; v.country_code = g.code; schedule(); }).catch(() => {}); }
  v.page = cleanPage(page);
  v.title = cleanTitle(title) || v.title || "";
  v.url = cleanHref(href) || v.url || "";
  v.last_seen = now;
  return true;
}

function leave(vid) { if (visitors.delete(String(vid || ""))) schedule(); }

/* Called once a visitor has started a chat so the console can show who they are. */
function attachChat(vid, sessionId) {
  const v = visitors.get(String(vid || ""));
  if (v) { v.session_id = sessionId; schedule(); }
}

async function snapshot() {
  const now = Date.now();
  const live = [...visitors.values()].filter((v) => now - v.last_seen < TTL_MS);
  const ids = live.map((v) => v.session_id).filter(Boolean);
  const chats = {};
  if (ids.length) {
    const r = await query(
      `SELECT s.id, s.name, s.email, s.phone, s.status, s.page_url, s.page_title,
              (SELECT body FROM livechat_messages m WHERE m.session_id=s.id AND m.sender='visitor' ORDER BY id DESC LIMIT 1) AS last_body,
              (SELECT COUNT(*) FROM livechat_messages m WHERE m.session_id=s.id AND m.sender='visitor') AS msgs
       FROM livechat_sessions s WHERE s.id = ANY($1)`, [ids]);
    r.rows.forEach((c) => { chats[c.id] = c; });
  }
  const list = live.map((v) => {
    const c = v.session_id && chats[v.session_id];
    return {
      id: v.vid.slice(0, 8), ip: v.ip, country: v.country || "Locating...", country_code: v.country_code || "",
      page: v.page, page_title: v.title || (c && c.page_title) || "", page_url: v.url || (c && c.page_url) || "", device: v.device, first_seen: v.first_seen, last_seen: v.last_seen,
      chatting: !!(c && c.status !== "closed"),
      session_id: c ? c.id : null, name: c ? c.name : "", email: c ? c.email : "", phone: c ? c.phone || "" : "",
      last_message: c ? c.last_body || "" : "", messages: c ? Number(c.msgs) : 0
    };
  }).sort((a, b) => (b.chatting - a.chatting) || (b.first_seen - a.first_seen));
  const by = {};
  list.forEach((v) => { const k = v.country_code || "??"; (by[k] = by[k] || { code: v.country_code, name: v.country, count: 0 }).count++; });
  return { online: list.length, chatting: list.filter((v) => v.chatting).length, countries: Object.values(by).sort((a, b) => b.count - a.count), visitors: list, at: now };
}

/* Push to agents at most once per second, only when someone is watching. */
let timer = null;
function schedule() {
  if (timer || !svc.agentCount()) return;
  timer = setTimeout(async () => {
    timer = null;
    try { if (svc.agentCount()) svc.toAgents("presence", await snapshot()); } catch (e) { console.error("[PRESENCE]", e.message); }
  }, 800);
}

/* Drop visitors that went quiet, and refresh the console every 5s so "time on site" stays true. */
setInterval(() => {
  const cutoff = Date.now() - TTL_MS;
  let dropped = false;
  for (const [k, v] of visitors) if (v.last_seen < cutoff) { visitors.delete(k); dropped = true; }
  if (dropped || svc.agentCount()) schedule();
}, 5000).unref();

module.exports = { touch, leave, attachChat, snapshot };
