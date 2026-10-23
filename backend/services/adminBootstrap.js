"use strict";
/*
 * Universal admin, created on your laptop with  npm run create-admin  (nothing is set on the host).
 * That command writes backend/admin-account.json (username + bcrypt hash, never the password) which is deployed with the website.
 * At every start this makes sure that admin exists, is active, is a main admin and has exactly that password, so a deploy, a restore
 * or a brand-new empty database never locks you out. The file wins: to change this admin's password run create-admin again and deploy again.
 */
const fs = require("fs"), path = require("path");
const { query } = require("../config/database");
const FILE = path.join(__dirname, "..", "admin-account.json");

function readFile() {
  let j; try { j = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch (e) { if (e.code !== "ENOENT") console.warn("[ADMIN] admin-account.json could not be read:", e.message); return null; }
  const user = String(j && j.username || "").trim(), hash = String(j && j.passwordHash || "").trim();
  if (!/^[A-Za-z0-9._@-]{3,60}$/.test(user) || !/^\$2[aby]\$\d\d\$[./A-Za-z0-9]{53}$/.test(hash)) { console.warn("[ADMIN] admin-account.json is not valid. Run  npm run create-admin  again."); return null; }
  return { user, hash };
}

async function ensureAdmin() {
  const a = readFile();
  if (a) {
    await query(
      `INSERT INTO admin_users(username,password_hash,is_active,role,must_change_password) VALUES($1,$2,TRUE,'main',FALSE)
       ON CONFLICT(username) DO UPDATE SET password_hash=EXCLUDED.password_hash,is_active=TRUE,role='main',must_change_password=FALSE`,
      [a.user, a.hash]);
    console.log("[ADMIN] universal admin \"" + a.user + "\" is in place (from admin-account.json)");
    return;
  }
  const r = await query("SELECT COUNT(*)::int AS n FROM admin_users WHERE is_active=TRUE");
  console.log(r.rows[0].n ? "[ADMIN] admin account found" : "[ADMIN] no admin yet. Run  npm run create-admin  on your laptop, then deploy.");
}
module.exports = { ensureAdmin };
