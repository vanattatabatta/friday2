"use strict";

/*
 * One place that actually delivers email.
 *
 * WHY THIS EXISTS: Railway (and most PaaS hosts) block outbound SMTP ports
 * (25 / 465 / 587) on Free, Trial and Hobby plans, so Gmail SMTP silently times out.
 * HTTPS (port 443) is never blocked, so the preferred providers below use an HTTP API.
 *
 * Provider is chosen automatically:
 *   MAIL_PROVIDER=relay  -> your own mail relay (scripts/mail-relay.js on your PC, reached over HTTPS / Cloudflare Tunnel)
 *   MAIL_PROVIDER=direct -> delivered from this process straight to the recipient's mail server (needs outbound port 25)
 *   otherwise RESEND_API_KEY -> Resend, or SMTP_USER + SMTP_PASS -> SMTP (works on hosts that allow SMTP).
 *
 * Sender address: MAIL_FROM, else SMTP_FROM, else SMTP_USER.
 *   "Expert Help <you@gmail.com>"  or just  "you@gmail.com"
 */

const nodemailer = require("nodemailer");

const env = (k) => String(process.env[k] || "").trim();

function fromAddress() {
  return env("MAIL_FROM") || env("SMTP_FROM") || env("SMTP_USER");
}

function provider() {
  /* own mail server: MAIL_PROVIDER=direct (deliver from this process) or relay (deliver through scripts/mail-relay.js) */
  const forced = env("MAIL_PROVIDER").toLowerCase();
  if (forced === "direct" || forced === "relay") return forced;
  if (env("RESEND_API_KEY")) return "resend";
  if (env("SMTP_USER") && env("SMTP_PASS")) return "smtp";
  return null;
}

function isConfigured() {
  return Boolean(provider() && fromAddress());
}

/* "Name <a@b.com>" -> { name, email } */
function parseFrom(v) {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(v);
  return m ? { name: m[1].trim() || undefined, email: m[2].trim() } : { email: v.trim() };
}

function fail(message, status, code) {
  const e = new Error(message);
  e.status = status;
  e.code = code;
  return e;
}

/* ---------------------------- SMTP ---------------------------- */
let smtp = null;
function smtpTransport() {
  if (smtp) return smtp;
  const port = Number(env("SMTP_PORT")) || 465;
  smtp = nodemailer.createTransport({
    host: env("SMTP_HOST") || "smtp.gmail.com",
    port,
    secure: env("SMTP_SECURE") ? env("SMTP_SECURE").toLowerCase() === "true" : port === 465,
    auth: { user: env("SMTP_USER"), pass: env("SMTP_PASS") },
    // Fail in seconds instead of hanging, so the real reason reaches the logs.
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000
  });
  return smtp;
}

async function sendSmtp(m) {
  return smtpTransport().sendMail({
    from: fromAddress(), to: m.to, replyTo: m.replyTo, subject: m.subject,
    html: m.html, text: m.text,
    attachments: (m.attachments || []).map((a) => ({ filename: a.filename, content: Buffer.from(a.content, "base64") }))
  });
}

/* ------------------- own mail server (no third-party API) ------------------- */
async function sendRelay(m) {
  const url = env("MAIL_RELAY_URL").replace(/\/+$/, "");
  if (!url || !env("MAIL_RELAY_TOKEN")) throw fail("MAIL_RELAY_URL and MAIL_RELAY_TOKEN are required for MAIL_PROVIDER=relay.", 503, "NOT_CONFIGURED");
  const r = await fetch(url + "/send", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + env("MAIL_RELAY_TOKEN") },
    body: JSON.stringify({ to: m.to, subject: m.subject, html: m.html, text: m.text, replyTo: m.replyTo, attachments: m.attachments || [] }),
    signal: AbortSignal.timeout(120000)
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.success === false) throw fail(`Mail relay ${r.status}: ${d.message || r.statusText}`, r.status, "RELAY_" + r.status);
  return { messageId: d.messageId };
}

/* ---------------------------- Resend ---------------------------- */
async function sendResend(m) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: fromAddress(),
      to: [].concat(m.to),
      reply_to: m.replyTo || undefined,
      subject: m.subject,
      html: m.html,
      text: m.text || undefined,
      attachments: (m.attachments || []).length ? m.attachments.map((a) => ({ filename: a.filename, content: a.content })) : undefined
    }),
    signal: AbortSignal.timeout(20000)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw fail(`Resend ${res.status}: ${data.message || res.statusText}`, res.status, "RESEND_" + res.status);
  return { messageId: data.id };
}

/*
 * send({ to, subject, html, text?, replyTo?, attachments?: [{filename, content(base64)}] })
 * Throws with the REAL reason (also logged) so problems are diagnosable from the Railway logs.
 */
async function send(m) {
  const p = provider();
  if (!p || !fromAddress()) throw fail("Email is not configured on the server.", 503, "NOT_CONFIGURED");
  try {
    if (p === "direct") return await require("./directMailer").send(m, fromAddress());
    if (p === "relay") return await sendRelay(m);
    if (p === "resend") return await sendResend(m);
    return await sendSmtp(m);
  } catch (error) {
    const hint =
      p === "smtp" && /ETIMEDOUT|ECONNREFUSED|ESOCKET|ENETUNREACH|Greeting never received|Connection timeout/i.test(`${error.code} ${error.message}`)
        ? " -> The host is blocking outbound SMTP (Railway does this on Free/Hobby plans). Use MAIL_PROVIDER=relay (your own mail relay over HTTPS) instead."
        : p === "smtp" && error.code === "EAUTH"
          ? " -> Gmail rejected the login. SMTP_PASS must be a 16-character Google App Password (2-Step Verification on), not your normal password."
          : "";
    console.error(`[MAIL] ${p} send failed (${error.code || "no-code"}): ${error.message}${hint}`);
    throw error;
  }
}

async function verify() {
  const p = provider();
  if (!p) return { configured: false, verified: false, provider: null, error: "No email provider configured." };
  try {
    if (p === "relay") {
      const r = await fetch(env("MAIL_RELAY_URL").replace(/\/+$/, "") + "/health", { headers: { Authorization: "Bearer " + env("MAIL_RELAY_TOKEN") }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error(`The mail relay answered ${r.status}. Check MAIL_RELAY_URL / MAIL_RELAY_TOKEN.`);
    } else if (p === "smtp") await smtpTransport().verify();
    return { configured: true, verified: true, provider: p };
  } catch (error) {
    return { configured: true, verified: false, provider: p, error: error.message };
  }
}

module.exports = { send, verify, isConfigured, provider, fromAddress };
