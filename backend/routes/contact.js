"use strict";
/*
 * POST /api/contact   (JSON: name, email, phone?, subject, message, website = honeypot)
 *
 * The message is saved in `contact_messages` (so nothing is lost if email is down) and, when mail is configured,
 * forwarded to EMAIL_TO with Reply-To set to the visitor so the team can just hit "reply".
 * Logged-in members are linked to their account. Limited to 5 messages / 15 min per IP.
 */
const express = require("express");
const { query } = require("../config/database");
const mailer = require("../services/mailer");
const { makeLimiter } = require("../middleware/authRateLimit");
const { optionalUser } = require("../middleware/userAuth");

const router = express.Router();
const limit = makeLimiter({ windowMs: 15 * 60 * 1000, max: 5, message: "You've sent a few messages already. Please wait a little before sending another." });

const SUBJECTS = ["Order question", "Help getting started", "Payment or billing", "Account or login", "Tools (Ask AI, AI Detector, CiteMe)", "Feedback", "Something else"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const SITE_NAME = String(process.env.SITE_NAME || "Expert Help").trim();
const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clean = (v, max) => String(v == null ? "" : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max);

let ready = null;
function ensureTable() {
  return ready || (ready = (async () => {
    await query(`CREATE TABLE IF NOT EXISTS contact_messages (
      id BIGSERIAL PRIMARY KEY, user_id BIGINT, name VARCHAR(120) NOT NULL, email VARCHAR(200) NOT NULL, phone VARCHAR(40),
      subject VARCHAR(120) NOT NULL, message TEXT NOT NULL, ip VARCHAR(64), emailed BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  })().catch((e) => { ready = null; throw e; }));
}

router.post("/", optionalUser, limit, async (req, res) => {
  res.set("Cache-Control", "no-store");
  const b = req.body || {};
  if (clean(b.website, 200)) return res.json({ success: true, message: "Thanks! We'll be in touch soon." });   // honeypot: bots fill this in, people never see it

  const name = clean(b.name, 120), email = clean(b.email, 200).toLowerCase(), phone = clean(b.phone, 40);
  const subject = SUBJECTS.includes(b.subject) ? b.subject : "Something else", message = clean(b.message, 5000);
  const errors = {};
  if (name.length < 2) errors.name = "Please enter your name.";
  if (!EMAIL_RE.test(email)) errors.email = "Enter an email address we can reply to.";
  if (phone && !/^[0-9+()\-.\s]{6,40}$/.test(phone)) errors.phone = "Use digits, spaces, + or - only.";
  if (message.length < 10) errors.message = "Tell us a little more (at least 10 characters).";
  if (Object.keys(errors).length) return res.status(400).json({ success: false, message: "Please fix the highlighted fields.", errors });

  let id = null;
  try {
    await ensureTable();
    const ip = String(req.ip || (req.socket && req.socket.remoteAddress) || "").slice(0, 64);
    id = (await query("INSERT INTO contact_messages(user_id,name,email,phone,subject,message,ip) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id",
      [req.user ? req.user.id : null, name, email, phone || null, subject, message, ip])).rows[0].id;
  } catch (e) { console.error("[CONTACT] save:", e.message); }

  let emailed = false;
  const to = String(process.env.CONTACT_INBOX || process.env.EMAIL_TO || "").trim();
  if (to && mailer.isConfigured()) {
    try {
      const html = `<div style="font-family:Arial,sans-serif;max-width:560px;color:#1e1b4b"><h2 style="margin:0 0 12px;color:#5b21b6">New message from the ${esc(SITE_NAME)} contact page</h2>
        <table style="border-collapse:collapse;width:100%"><tr><td style="padding:6px 0;color:#6b7280;width:90px">Name</td><td>${esc(name)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Email</td><td><a href="mailto:${esc(email)}">${esc(email)}</a></td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Phone</td><td>${esc(phone || "-")}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Topic</td><td>${esc(subject)}</td></tr>${req.user ? `<tr><td style="padding:6px 0;color:#6b7280">Member</td><td>${esc(req.user.user_code || req.user.id)}</td></tr>` : ""}</table>
        <p style="white-space:pre-wrap;background:#f5f3ff;border-radius:10px;padding:14px;margin:14px 0 0">${esc(message)}</p></div>`;
      await mailer.send({ to, replyTo: email, subject: `[Contact] ${subject} - ${name}`, html, text: `From: ${name} <${email}>\nPhone: ${phone || "-"}\nTopic: ${subject}\n\n${message}` });
      emailed = true;
      if (id) query("UPDATE contact_messages SET emailed=TRUE WHERE id=$1", [id]).catch(() => {});
    } catch (e) { console.error("[CONTACT] email:", e.message); }
  }
  if (!id && !emailed) return res.status(500).json({ success: false, message: "We couldn't send your message. Please try again, or email us directly." });
  res.json({ success: true, message: "Thanks! We'll reply within 2 hours during business hours." });
});

module.exports = router;
