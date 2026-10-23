"use strict";
/*
 * Human-only live chat. No AI anywhere in this file: every reply is typed by a person
 * in the agent console (/agent). Visitors and agents are connected with Server-Sent Events.
 * When a chat ends (visitor, agent, or 30 min of silence) the transcript is emailed.
 */
const crypto = require("crypto");
const { query } = require("../config/database");
const mailer = require("./mailer");
const personas = require("./personas");

const IDLE_MS = 30 * 60 * 1000;
const visitorStreams = new Map(); // sessionId -> Set(res)
const agentStreams = new Set();   // res

async function initTables() {
  await query(`CREATE TABLE IF NOT EXISTS livechat_sessions (
    id VARCHAR(32) PRIMARY KEY,
    token VARCHAR(64) NOT NULL,
    name VARCHAR(120) NOT NULL,
    email VARCHAR(255) NOT NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'waiting',
    agent_name VARCHAR(100),
    transcript_sent BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_activity TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ)`);
  for (const col of ["client_ip VARCHAR(100)", "country VARCHAR(100)", "country_code VARCHAR(2)", "persona SMALLINT", "agent_user VARCHAR(100)", "phone VARCHAR(40)", "page_url VARCHAR(400)", "page_title VARCHAR(200)"]) {
    await query(`ALTER TABLE livechat_sessions ADD COLUMN IF NOT EXISTS ${col}`);
  }
  await query(`CREATE TABLE IF NOT EXISTS livechat_messages (
    id BIGSERIAL PRIMARY KEY,
    session_id VARCHAR(32) NOT NULL REFERENCES livechat_sessions(id) ON DELETE CASCADE,
    sender VARCHAR(10) NOT NULL,
    sender_name VARCHAR(120),
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await query(`CREATE INDEX IF NOT EXISTS idx_lcm_session ON livechat_messages(session_id, id)`);
  await query(`CREATE TABLE IF NOT EXISTS livechat_settings (key VARCHAR(40) PRIMARY KEY, value TEXT NOT NULL DEFAULT '')`);
  setInterval(() => closeIdle().catch((e) => console.error("[LIVECHAT] idle sweep:", e.message)), 60 * 1000).unref();
}

/* ------------------------------ streams ------------------------------ */
function sse(res, event, data) { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); }

function openStream(req, res, onClose) {
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  res.flushHeaders();
  res.write(": connected\n\n");
  const ping = setInterval(() => res.write(": ping\n\n"), 25000);
  req.on("close", () => { clearInterval(ping); onClose(); });
}
function attachVisitor(req, res, id) {
  if (!visitorStreams.has(id)) visitorStreams.set(id, new Set());
  visitorStreams.get(id).add(res);
  openStream(req, res, () => visitorStreams.get(id)?.delete(res));
}
function attachAgent(req, res) { agentStreams.add(res); openStream(req, res, () => agentStreams.delete(res)); }
const toVisitor = (id, ev, d) => (visitorStreams.get(id) || []).forEach((r) => sse(r, ev, d));
const toAgents = (ev, d) => agentStreams.forEach((r) => sse(r, ev, d));

/* ------------------------------ settings (edited in the agent console) ------------------------------ */
/* forward_emails: comma separated addresses that receive every finished chat transcript (and new-chat alerts).
   Falls back to LIVECHAT_EMAIL_TO / EMAIL_TO from .env until someone saves it in the console. */
async function getSettings() {
  const rows = (await query("SELECT key,value FROM livechat_settings")).rows;
  const m = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const envList = String(process.env.LIVECHAT_EMAIL_TO || process.env.EMAIL_TO || "");
  const list = (m.forward_emails != null ? m.forward_emails : envList).split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter(validEmail);
  return {
    forward_emails: [...new Set(list)],
    notify_new_chat: m.notify_new_chat != null ? m.notify_new_chat === "1" : true,
    send_visitor_copy: m.send_visitor_copy != null ? m.send_visitor_copy === "1" : true,
    whatsapp_number: cleanWa(m.whatsapp_number != null ? m.whatsapp_number : (process.env.WHATSAPP_NUMBER || "917042660369")),
    whatsapp_text: m.whatsapp_text || "Hi, I need expert help"
  };
}
/* WhatsApp number as digits only, with country code and no leading zeros / + (the format wa.me needs). */
const cleanWa = (v) => String(v || "").replace(/\D/g, "").replace(/^0+/, "");
/* Public bits the website needs (the WhatsApp icon). Never put anything private in here. */
async function publicConfig() {
  const c = await getSettings();
  return { whatsapp: c.whatsapp_number, text: c.whatsapp_text };
}
async function saveSettings({ forward_emails, notify_new_chat, send_visitor_copy, whatsapp_number, whatsapp_text }) {
  const raw = Array.isArray(forward_emails) ? forward_emails.join(",") : String(forward_emails || "");
  const parts = raw.split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter(Boolean);
  const bad = parts.filter((e) => !validEmail(e));
  if (bad.length) throw Object.assign(new Error("Invalid email address: " + bad[0]), { status: 400 });
  const put = (k, v) => query("INSERT INTO livechat_settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value", [k, v]);
  await put("forward_emails", [...new Set(parts)].join(","));
  await put("notify_new_chat", notify_new_chat ? "1" : "0");
  await put("send_visitor_copy", send_visitor_copy ? "1" : "0");
  if (whatsapp_number !== undefined) {
    const wa = cleanWa(whatsapp_number);
    if (wa && (wa.length < 7 || wa.length > 15)) throw Object.assign(new Error("Enter the WhatsApp number with its country code, 7-15 digits (e.g. 14155550100)."), { status: 400 });
    await put("whatsapp_number", wa);
    await put("whatsapp_text", clean(whatsapp_text, 200) || "Hi, I need expert help");
  }
  return getSettings();
}

/* Saves only the WhatsApp fields (used by the admin panel, so nothing else is reset). */
async function saveWhatsapp({ whatsapp_number, whatsapp_text }) {
  const wa = cleanWa(whatsapp_number);
  if (wa && (wa.length < 7 || wa.length > 15)) throw Object.assign(new Error("Enter the WhatsApp number with its country code, 7-15 digits (e.g. 14155550100)."), { status: 400 });
  const put = (k, v) => query("INSERT INTO livechat_settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value", [k, v]);
  await put("whatsapp_number", wa);
  await put("whatsapp_text", clean(whatsapp_text, 200) || "Hi, I need expert help");
  return publicConfig();
}

/* ------------------------------ sessions ------------------------------ */
const clean = (s, n) => String(s || "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, n);
/* Page address sent by the visitor's browser: only http(s) links are kept (it is shown to the admin as a link). */
const cleanUrl = (u) => { u = clean(u, 400); return /^https?:\/\/[^\s<>"']+$/i.test(u) ? u : ""; };
const cleanPhone = (p) => String(p || "").replace(/[^0-9+()\-\s.]/g, "").replace(/\s+/g, " ").trim().slice(0, 25);

const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 255;

async function getSession(id) {
  const r = await query("SELECT * FROM livechat_sessions WHERE id=$1", [id]);
  return r.rows[0] || null;
}
async function authVisitor(id, token) {
  const s = await getSession(String(id));
  if (!s || !token || s.token.length !== String(token).length) return null;
  return crypto.timingSafeEqual(Buffer.from(s.token), Buffer.from(String(token))) ? s : null;
}

async function addMessage(session, sender, senderName, body) {
  chatActivity++;   // a chat was created / got a message: the idle sweep must look at the database again
  const [r] = await Promise.all([
    query("INSERT INTO livechat_messages(session_id,sender,sender_name,body) VALUES($1,$2,$3,$4) RETURNING id,sender,sender_name,body,created_at",
      [session.id, sender, senderName, body]),
    query("UPDATE livechat_sessions SET last_activity=NOW() WHERE id=$1", [session.id])
  ]);
  const m = r.rows[0];
  toVisitor(session.id, "message", m);
  toAgents("message", { session_id: session.id, ...m });
  return m;
}

async function start({ name, email, message, ip, cf, persona, page_url, page_title }) {
  // Visitors can start a chat with just a message: name and email are optional.
  message = clean(message, 1000);
  if (!message) throw Object.assign(new Error("Please type your message."), { status: 400 });
  const id = crypto.randomBytes(12).toString("hex"), token = crypto.randomBytes(24).toString("hex");
  name = clean(name, 120) || `Visitor ${id.slice(0, 4).toUpperCase()}`;
  email = clean(email, 255).toLowerCase();
  if (email && !validEmail(email)) email = "";
  const pi = Number.isInteger(Number(persona)) && personas.name(Number(persona)) ? Number(persona) : personas.pick();
  const s = (await query("INSERT INTO livechat_sessions(id,token,name,email,client_ip,persona,page_url,page_title) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
    [id, token, name, email, String(ip || "").slice(0, 100), pi, cleanUrl(page_url), clean(page_title, 200)])).rows[0];
  toAgents("session_new", publicSession(s));
  geoLookup(ip, cf).then(async (g) => {
    await query("UPDATE livechat_sessions SET country=$2, country_code=$3 WHERE id=$1", [id, g.name, g.code || null]);
    toAgents("session_update", publicSession(await getSession(id)));
  }).catch((e) => console.error("[LIVECHAT] geo failed:", e.message));
  const first = await addMessage(s, "visitor", name, message);
  notifyNewChat(s, message).catch((e) => console.error("[LIVECHAT] new-chat alert failed:", e.message));
  return { id, token, persona: pi, message: first };
}

async function notifyNewChat(s, message) {
  const cfg = await getSettings();
  if (!cfg.notify_new_chat || !cfg.forward_emails.length) return;
  const base = String(process.env.WEBSITE_URL || "").replace(/\/+$/, "");
  const link = base ? base + "/agent" : "";
  const text = `New live chat from ${s.name}\n\n"${message}"\n\n${link ? "Reply here: " + link : "Open the agent console (/agent) to reply."}\n`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px"><h3 style="margin:0 0 8px">New live chat from ${esc(s.name)}</h3><p style="background:#f1f5f9;padding:10px 12px;border-radius:8px;white-space:pre-wrap">${esc(message)}</p><p>${link ? `<a href="${esc(link)}">Open the agent console to reply</a>` : "Open the agent console (/agent) to reply."}</p></div>`;
  for (const to of cfg.forward_emails) await mailer.send({ to, subject: `New live chat - ${s.name}`, html, text });
}

const publicSession = (s) => ({ id: s.id, name: s.name, email: s.email, phone: s.phone || "", page_url: s.page_url || "", page_title: s.page_title || "", status: s.status, agent_name: s.agent_name, agent_user: s.agent_user, persona: s.persona, created_at: s.created_at, last_activity: s.last_activity, client_ip: s.client_ip, country: s.country, country_code: s.country_code });

/* Country of a visitor from their IP (CDN header first, then ipapi.co). Never throws. */
async function geoLookup(ip, headerCode) {
  ip = String(ip || "").replace(/^::ffff:/i, "");
  let code = /^[A-Za-z]{2}$/.test(headerCode || "") ? String(headerCode).toUpperCase() : "", name = "";
  if (!ip || /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fe80|fc|fd)/i.test(ip)) return { name: name || "Local / Unknown", code };
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 4000);
  try {
    const j = await (await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, { signal: ctl.signal })).json();
    if (!j.error) { name = String(j.country_name || "").trim(); code = String(j.country_code || code).toUpperCase().slice(0, 2); }
  } catch (e) { /* keep header result */ } finally { clearTimeout(t); }
  if (!name) { // second provider if the first is rate limited / down
    const c2 = new AbortController(), t2 = setTimeout(() => c2.abort(), 4000);
    try {
      const j = await (await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, { signal: c2.signal })).json();
      if (j.success) { name = String(j.country || "").trim(); code = String(j.country_code || code).toUpperCase().slice(0, 2); }
    } catch (e) { /* ignore */ } finally { clearTimeout(t2); }
  }
  if (code && !name) { try { name = new Intl.DisplayNames(["en"], { type: "region" }).of(code); } catch (e) {} }
  return { name: name || "Unknown", code };
}

async function messages(id) {
  return (await query("SELECT id,sender,sender_name,body,created_at FROM livechat_messages WHERE session_id=$1 ORDER BY id", [id])).rows;
}

async function visitorSend(s, body) {
  body = clean(body, 1000);
  if (!body) throw Object.assign(new Error("Message is empty."), { status: 400 });
  if (s.status === "closed") throw Object.assign(new Error("This chat has ended."), { status: 409 });
  return addMessage(s, "visitor", s.name, body);
}

async function agentSend(s, agentName, body) {
  body = clean(body, 2000);
  if (!body) throw Object.assign(new Error("Message is empty."), { status: 400 });
  if (s.status === "closed") throw Object.assign(new Error("This chat has ended."), { status: 409 });
  if (s.status === "waiting" || !s.agent_name) {
    const shown = personas.name(s.persona) || agentName;
    await query("UPDATE livechat_sessions SET status='active', agent_name=$2, agent_user=$3 WHERE id=$1", [s.id, shown, agentName]);
    s.status = "active"; s.agent_name = shown; s.agent_user = agentName;
    toVisitor(s.id, "joined", { agent_name: shown });
    toAgents("session_update", publicSession(s));
  }
  return addMessage(s, "agent", s.agent_name, body);
}

/* The visitor typed their name (and optionally a contact number) in the chat box after a few messages.
   The console updates at once and the name is also used for the earlier messages in the transcript. */
async function saveProfile(s, { name, phone }) {
  name = clean(name, 120);
  if (!name) throw Object.assign(new Error("Please enter your name."), { status: 400 });
  phone = cleanPhone(phone);
  if (phone && phone.replace(/\D/g, "").length < 6) throw Object.assign(new Error("Please enter a valid contact number or leave it empty."), { status: 400 });
  await query("UPDATE livechat_sessions SET name=$2, phone=$3 WHERE id=$1", [s.id, name, phone]);
  await query("UPDATE livechat_messages SET sender_name=$2 WHERE session_id=$1 AND sender='visitor'", [s.id, name]);
  const fresh = await getSession(s.id);
  toAgents("session_update", publicSession(fresh));
  return { name, phone };
}

async function listSessions() {
  return (await query(
    `SELECT s.*, (SELECT body FROM livechat_messages m WHERE m.session_id=s.id AND m.sender<>'system' ORDER BY id DESC LIMIT 1) AS last_body
     FROM livechat_sessions s WHERE status<>'closed' OR closed_at > NOW() - INTERVAL '1 day'
     ORDER BY (status='closed'), last_activity DESC LIMIT 100`)).rows;
}

/* ------------------------------ closing + email ------------------------------ */
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const stamp = (d) => new Date(d).toUTCString().replace(" GMT", " UTC");

function buildTranscript(s, msgs) {
  const lines = msgs.map((m) => `[${stamp(m.created_at)}] ${m.sender === "system" ? "System" : m.sender_name || m.sender}: ${m.body}`);
  const text = `Live chat transcript\nVisitor: ${s.name}${s.email ? ` <${s.email}>` : ""}${s.phone ? ` | Phone: ${s.phone}` : ""}\nAgent: ${s.agent_name ? s.agent_name + (s.agent_user && s.agent_user !== s.agent_name ? ` (login: ${s.agent_user})` : "") : "(not answered)"}\nStarted: ${stamp(s.created_at)}\n\n${lines.join("\n")}\n`;
  const rows = msgs.map((m) => {
    const who = m.sender === "system" ? "System" : m.sender_name || m.sender;
    const bg = m.sender === "agent" ? "#eef2ff" : m.sender === "visitor" ? "#f1f5f9" : "#fff";
    return `<tr><td style="padding:8px 10px;background:${bg};border-bottom:1px solid #e2e8f0;font:13px/1.5 Arial,sans-serif"><b>${esc(who)}</b> <span style="color:#94a3b8;font-size:11px">${esc(stamp(m.created_at))}</span><br>${esc(m.body).replace(/\n/g, "<br>")}</td></tr>`;
  }).join("");
  const html = `<div style="max-width:640px;font-family:Arial,sans-serif"><h2 style="margin:0 0 6px">Live chat transcript</h2><p style="margin:0 0 14px;color:#475569;font-size:13px">Visitor: ${esc(s.name)}${s.email ? ` &lt;${esc(s.email)}&gt;` : ""}${s.phone ? ` | Phone: ${esc(s.phone)}` : ""}<br>Agent: ${esc(s.agent_name || "(not answered)")}<br>Started: ${esc(stamp(s.created_at))}</p><table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0">${rows}</table></div>`;
  return { text, html };
}

async function closeSession(id, { extraEmails = [], closedBy = "system" } = {}) {
  const claimed = await query(
    "UPDATE livechat_sessions SET status='closed', closed_at=NOW() WHERE id=$1 AND status<>'closed' RETURNING *", [id]);
  const s = claimed.rows[0];
  if (!s) return { alreadyClosed: true, emailed: [] };
  const msgs = await messages(id);
  if (closedBy !== "system") await addMessage({ id }, "system", null, closedBy === "agent" ? "The agent ended this chat." : "The visitor ended this chat.");
  else await addMessage({ id }, "system", null, "This chat ended due to inactivity.");
  toVisitor(id, "closed", {}); toAgents("session_closed", { id });

  const cfg = await getSettings();
  const recipients = [...new Set([cfg.send_visitor_copy ? s.email : "", ...cfg.forward_emails, ...extraEmails]
    .map((e) => String(e || "").trim().toLowerCase()).filter(validEmail))];
  const { text, html } = buildTranscript(s, await messages(id));
  const emailed = [];
  for (const to of recipients) {
    try {
      await mailer.send({ to, subject: `Live chat transcript - ${s.name} (${new Date(s.created_at).toISOString().slice(0, 10)})`, html, text });
      emailed.push(to);
    } catch (e) { console.error("[LIVECHAT] transcript email failed for", to, e.message); }
  }
  await query("UPDATE livechat_sessions SET transcript_sent=$2 WHERE id=$1", [id, emailed.length > 0]);
  return { emailed, failed: recipients.filter((r) => !emailed.includes(r)) };
}

/* The sweep used to query the database every minute, which kept a hosted database awake 24/7 (it only sleeps after
   5 idle minutes). Now it touches the database only while a chat is open or something changed since the last check.
   A visitor starting a chat always works at once: that INSERT simply wakes the database (a few hundred ms). */
let chatActivity = 1;   // bumped by every chat message / new chat; starts at 1 so one check runs after boot
let chatChecked = 0;    // the chatActivity value at which the last check found no open chats
async function closeIdle() {
  if (chatActivity === chatChecked) return;   // nothing new since the last check found no open chats: no database query
  const seen = chatActivity;
  const r = await query("SELECT id, (last_activity < NOW() - ($1 || ' milliseconds')::interval) AS idle FROM livechat_sessions WHERE status<>'closed'", [String(IDLE_MS)]);
  let open = 0;
  for (const row of r.rows) {
    if (row.idle) await closeSession(row.id, { closedBy: "system" });
    else open++;
  }
  if (open === 0) chatChecked = seen;   // no open chats left: stay quiet until the next chat activity
}

module.exports = { saveProfile, toAgents, agentCount: () => agentStreams.size, geoLookup, publicConfig, saveWhatsapp, getSettings, saveSettings, initTables, attachVisitor, attachAgent, getSession, authVisitor, start, messages, visitorSend, agentSend, listSessions, closeSession, validEmail, publicSession };
