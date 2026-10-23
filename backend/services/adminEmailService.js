"use strict";
/* Sign-in details for admin / manager accounts, sent by the main admin. Uses the site's mail setup (own relay / Resend / SMTP). */
const mailer = require("./mailer");
const SITE_NAME = String(process.env.SITE_NAME || "Expert Help").trim();
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const loginUrl = () => {
  const base = String(process.env.SITE_URL || process.env.WEBSITE_URL || "").trim().replace(/\/+$/, "");
  return base ? base + "/admin/" : "";
};

async function sendCredentials({ username, email, password, role, reason }) {
  if (!mailer.isConfigured()) {
    const e = new Error("Email is not configured on the server (set MAIL_PROVIDER=relay + MAIL_RELAY_URL/MAIL_RELAY_TOKEN + MAIL_FROM, or SMTP_*). Share the details manually.");
    e.status = 503; throw e;
  }
  const url = loginUrl();
  const roleName = role === "manager" ? "Manager" : "Admin";
  const intro = reason === "reset" ? "Your password was reset by the main admin. New sign-in details:" : `An ${roleName.toLowerCase()} account was created for you. Sign-in details:`;
  const row = (k, v, mono) => `<tr><td style="padding:12px 16px;color:#6b7280;font-size:13px">${k}</td><td style="padding:12px 16px;${mono ? "font-family:Consolas,monospace;font-size:16px;font-weight:bold" : ""}">${esc(v)}</td></tr>`;
  const html = `<!doctype html><html><body style="margin:0;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;color:#1e1b4b">
  <div style="max-width:520px;margin:0 auto;padding:24px"><div style="background:#fff;border-radius:14px;padding:28px;border:1px solid #e5e7f5">
    <h2 style="margin:0 0 6px;color:#5b21b6">${esc(SITE_NAME)} - ${roleName} console</h2>
    <p style="margin:0 0 16px">${esc(intro)}</p>
    <table role="presentation" style="width:100%;border-collapse:collapse;background:#f5f3ff;border-radius:10px">
      ${row("Role", roleName)}${row("Username (User ID)", username, true)}${row("Password", password, true)}
    </table>
    <p style="margin:16px 0 0;font-size:14px">You will be asked to choose your own password the first time you sign in.</p>
    ${url ? `<p style="margin:20px 0"><a href="${esc(url)}" style="background:#6d28d9;color:#fff;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:bold">Open admin console</a></p>` : ""}
    <p style="margin:18px 0 0;font-size:12px;color:#6b7280">Keep this email private and delete it after changing your password.</p>
  </div></div></body></html>`;
  const text = `${intro}\n\nRole: ${roleName}\nUsername: ${username}\nPassword: ${password}\n${url ? "Sign in: " + url + "\n" : ""}\nYou will be asked to choose your own password the first time you sign in.\n`;
  await mailer.send({ to: email, subject: `Your ${SITE_NAME} ${roleName.toLowerCase()} sign-in details`, html, text });
}
module.exports = { sendCredentials };
