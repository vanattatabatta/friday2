#!/usr/bin/env node
"use strict";
/* node backend/scripts/backup-tools.js decrypt backup-2026-10-20T09-00-00.zip.enc [passphrase]  ->  backup-....zip */
const fs = require("fs");
const [, , cmd, file, pass] = process.argv;
if (cmd !== "decrypt" || !file) { console.log("Usage: node backend/scripts/backup-tools.js decrypt <file.zip.enc> [passphrase]  (or set BACKUP_PASSPHRASE)"); process.exit(1); }
const p = pass || process.env.BACKUP_PASSPHRASE;
if (!p) { console.error("Give the passphrase as the last argument or in BACKUP_PASSPHRASE."); process.exit(1); }
try {
  const out = file.replace(/\.enc$/, "");
  fs.writeFileSync(out, require("../services/backupService").decrypt(fs.readFileSync(file), p));
  console.log("Decrypted ->", out);
} catch (e) { console.error("Could not decrypt (wrong passphrase or damaged file):", e.message); process.exit(1); }
