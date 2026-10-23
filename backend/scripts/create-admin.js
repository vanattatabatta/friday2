"use strict";
/*
 * Run on YOUR laptop:   npm run create-admin
 *  1) asks for the admin username + password (typed twice, hidden),
 *  2) creates / resets that admin in your LOCAL database (stop the local server first),
 *  3) writes backend/admin-account.json = username + bcrypt HASH (never the password). That small file is deployed with the website, and the
 *     server re-creates this admin from it at every start, so the login works on the live site after every deploy, restore or empty database.
 * Nothing is set on the host, no database goes to GitHub, and the password exists only in your memory.
 * (The file holds a hash: keep your GitHub repo PRIVATE.)
 */
require("dotenv").config();
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const fs = require("fs"), path = require("path"), readline = require("readline");
const bcrypt = require("bcrypt");
const { initDatabase, query, pool } = require("../config/database");

function ask(q, hidden) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) { rl._writeToOutput = (s) => { if (s.includes(q)) process.stdout.write(s); else if (/[\r\n]/.test(s)) process.stdout.write("\n"); else process.stdout.write("*"); }; }
    rl.question(q, (a) => { rl.close(); resolve(a); });
  });
}
(async () => {
  try {
    const user = String(process.env.ADMIN_USER || await ask("Admin username: ")).trim();
    let pass = process.env.ADMIN_PASS;
    if (!pass) { pass = await ask("Admin password (10+ characters): ", true); const again = await ask("Repeat password: ", true); if (pass !== again) throw new Error("The two passwords are different."); }
    if (!/^[A-Za-z0-9._@-]{3,60}$/.test(user)) throw new Error("Username: 3-60 letters, numbers or . _ @ -");
    if (String(pass).length < 10) throw new Error("Password must be at least 10 characters.");
    const hash = await bcrypt.hash(String(pass), 12);

    await initDatabase();
    await query(
      `INSERT INTO admin_users(username,password_hash,is_active,role,must_change_password) VALUES($1,$2,TRUE,'main',FALSE)
       ON CONFLICT(username) DO UPDATE SET password_hash=EXCLUDED.password_hash,is_active=TRUE,role='main',must_change_password=FALSE`,
      [user, hash]);
    console.log("\nAdmin account ready in your local database: " + user);

    const file = path.join(__dirname, "..", "admin-account.json");
    fs.writeFileSync(file, JSON.stringify({ username: user, passwordHash: hash }, null, 2) + "\n");
    console.log("Saved backend/admin-account.json (username + hash only). Deploy the website as usual: this file goes with it.");
    console.log("Your password is not stored anywhere. Remember it. To change it later: run  npm run create-admin  again and deploy again.");
    try { await pool.end(); } catch { /* ignore */ }
    process.exit(0);
  } catch (e) { console.error("\n" + e.message); process.exit(1); }
})();
