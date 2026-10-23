#!/usr/bin/env node
"use strict";
/*
 * Your own mail-sending server. Run it on a PC / VPS whose outbound port 25 is open; the website (wherever it is hosted)
 * then sends all email through it over HTTPS:
 *
 *   on the relay machine:   MAIL_RELAY_TOKEN=<long random> MAIL_FROM="Expert Help <support@yourdomain.com>" node backend/scripts/mail-relay.js
 *   on the website host:    MAIL_PROVIDER=relay  MAIL_RELAY_URL=https://mail.yourdomain.com  MAIL_RELAY_TOKEN=<same token>
 *
 * Expose it with a reverse proxy / Cloudflare Tunnel / ngrok (HTTPS); never publish the plain-HTTP port on the internet.
 * Endpoints:  POST /send {to,subject,html,text,replyTo,attachments}   GET /health      (Authorization: Bearer <token>)
 * DKIM / HELO settings: see services/directMailer.js. Create a DKIM key with: node backend/scripts/make-dkim.js yourdomain.com
 */
const path = require("path");
try { require("dotenv").config({ path: path.join(__dirname, "..", ".env") }); } catch { /* dotenv optional */ }
const http = require("http");
const crypto = require("crypto");
const direct = require("../services/directMailer");
const nodemailer = require("nodemailer");

/* Two ways to deliver, chosen automatically:
 *  - SMTP_USER + SMTP_PASS set (e.g. Gmail + App Password, port 587 is normally open at home): mail goes through that account. Easiest, lands in inbox.
 *  - otherwise: straight to the recipient's mail server (needs open outbound port 25, DKIM/SPF DNS records). */
const SMTP_MODE = !!(process.env.SMTP_USER && process.env.SMTP_PASS) && String(process.env.MAIL_RELAY_MODE || "").toLowerCase() !== "direct";
let smtpT = null;
async function deliver(m) {
  if (!SMTP_MODE) return direct.send(m, FROM);
  const port = Number(process.env.SMTP_PORT) || 587;
  smtpT = smtpT || nodemailer.createTransport({ host: process.env.SMTP_HOST || "smtp.gmail.com", port, secure: port === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 60000 });
  const info = await smtpT.sendMail({ from: FROM || process.env.SMTP_USER, to: m.to, replyTo: m.replyTo, subject: m.subject, html: m.html, text: m.text, attachments: (m.attachments || []).map((a) => ({ filename: a.filename, content: Buffer.from(a.content, "base64") })) });
  return { messageId: info.messageId };
}

const TOKEN = String(process.env.MAIL_RELAY_TOKEN || "").trim();
const PORT = Number(process.env.MAIL_RELAY_PORT) || 8025;
const HOST = process.env.MAIL_RELAY_HOST || "127.0.0.1";
const FROM = String(process.env.MAIL_FROM || process.env.SMTP_FROM || "").trim();
if (TOKEN.length < 16) { console.error("Set MAIL_RELAY_TOKEN to a random string of at least 16 characters."); process.exit(1); }
if (!FROM && !process.env.SMTP_USER) { console.error("Set MAIL_FROM, e.g. \"Expert Help <support@yourdomain.com>\"."); process.exit(1); }

const same = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const reply = (res, code, body) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };

http.createServer((req, res) => {
  const given = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!same(given, TOKEN)) return reply(res, 401, { success: false, message: "Bad token." });
  if (req.method === "GET" && req.url === "/health") return reply(res, 200, { success: true, mode: SMTP_MODE ? "smtp" : "direct", ...direct.status() });
  if (req.method !== "POST" || req.url !== "/send") return reply(res, 404, { success: false, message: "Not found." });
  const chunks = []; let size = 0;
  req.on("data", (c) => { size += c.length; if (size > 60 * 1048576) { reply(res, 413, { success: false, message: "Too large." }); req.destroy(); } else chunks.push(c); });
  req.on("end", async () => {
    try {
      const m = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const info = await deliver(m);
      console.log(new Date().toISOString(), "sent ->", [].concat(m.to).join(","), "|", m.subject);
      reply(res, 200, { success: true, messageId: info.messageId });
    } catch (e) { console.error("send failed:", e.message); reply(res, e.status || 500, { success: false, message: e.message }); }
  });
}).listen(PORT, HOST, () => console.log(`Mail relay listening on http://${HOST}:${PORT}  (from ${FROM})  mode=${SMTP_MODE ? "smtp" : "direct"}  dkim=${direct.status().dkim}`));
