"use strict";
/*
 * Self-hosted email delivery: no third-party mail service. The message is handed straight to the recipient's own
 * mail server (the MX records of their domain), exactly like a normal mail server does.
 *
 *   MAIL_PROVIDER=direct            use this module inside the website process
 *   MAIL_FROM="Expert Help <support@yourdomain.com>"
 *   DKIM_DOMAIN=yourdomain.com  DKIM_SELECTOR=mail  DKIM_PRIVATE_KEY_FILE=./dkim-private.pem   (or DKIM_PRIVATE_KEY="-----BEGIN...")
 *   MAIL_HELO=mail.yourdomain.com   (optional: name announced to the other server; should match your server's reverse DNS)
 *
 * It needs OUTBOUND port 25, which Railway / most PaaS hosts and home internet providers block. If port 25 is blocked,
 * run scripts/mail-relay.js on a machine that has it (your own PC / a VPS) and use MAIL_PROVIDER=relay instead.
 * Without SPF + DKIM + a matching reverse-DNS name, Gmail / Outlook will put the mail in spam or refuse it.
 */
const dns = require("dns").promises;
const fs = require("fs");
const nodemailer = require("nodemailer");

const env = (k) => String(process.env[k] || "").trim();
const addrOf = (v) => { const m = /<([^>]+)>/.exec(String(v)); return (m ? m[1] : String(v)).trim().toLowerCase(); };

function dkim() {
  const domainName = env("DKIM_DOMAIN"), keySelector = env("DKIM_SELECTOR") || "mail";
  let privateKey = env("DKIM_PRIVATE_KEY").replace(/\\n/g, "\n");
  const file = env("DKIM_PRIVATE_KEY_FILE");
  if (!privateKey && file) { try { privateKey = fs.readFileSync(file, "utf8"); } catch { /* reported by status() */ } }
  return domainName && privateKey ? { domainName, keySelector, privateKey } : null;
}

async function mxHosts(domain) {
  try {
    const mx = (await dns.resolveMx(domain)).sort((a, b) => a.priority - b.priority).map((x) => x.exchange);
    if (mx.length) return mx;
  } catch (e) { if (e.code !== "ENODATA" && e.code !== "ENOTFOUND") throw e; }
  return [domain];   // no MX record: mail goes to the domain's own address (RFC 5321)
}

/* send one message (to may be a comma list; each recipient domain is delivered separately) */
async function send(m, from) {
  const recipients = [].concat(m.to).join(",").split(",").map((s) => s.trim()).filter(Boolean);
  if (!recipients.length) throw Object.assign(new Error("No recipient."), { status: 400 });
  const byDomain = {};
  recipients.forEach((r) => { const d = addrOf(r).split("@")[1]; (byDomain[d] = byDomain[d] || []).push(r); });
  const key = dkim(), results = [];
  for (const [domain, list] of Object.entries(byDomain)) {
    let lastErr = null, done = false;
    for (const host of await mxHosts(domain)) {
      try {
        const t = nodemailer.createTransport({
          host, port: Number(env("DIRECT_SMTP_PORT")) || 25, secure: false, requireTLS: false, opportunisticTLS: true, name: env("MAIL_HELO") || undefined,
          tls: { rejectUnauthorized: false }, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 60000,
          ...(key ? { dkim: key } : {})
        });
        const info = await t.sendMail({
          from, to: list, replyTo: m.replyTo, subject: m.subject, html: m.html, text: m.text,
          attachments: (m.attachments || []).map((a) => ({ filename: a.filename, content: Buffer.from(a.content, "base64") }))
        });
        results.push({ domain, host, id: info.messageId }); done = true; break;
      } catch (e) { lastErr = e; }   // try the next MX host
    }
    if (!done) {
      const blocked = /ETIMEDOUT|ECONNREFUSED|ENETUNREACH|EHOSTUNREACH|Connection timeout|Greeting never received/i.test(`${lastErr && lastErr.code} ${lastErr && lastErr.message}`);
      throw Object.assign(new Error(`Could not deliver to ${domain}: ${lastErr && lastErr.message}${blocked ? " -> outbound port 25 looks blocked on this machine. Use scripts/mail-relay.js on a PC/VPS that allows it." : ""}`), { status: 502, code: "DIRECT_FAILED" });
    }
  }
  return { messageId: results.map((r) => r.id).join(","), deliveredVia: results };
}

function status() {
  const k = dkim();
  return { dkim: !!k, domain: k && k.domainName, selector: k && k.keySelector, helo: env("MAIL_HELO") || null };
}
module.exports = { send, status };
