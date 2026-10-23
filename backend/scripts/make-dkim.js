#!/usr/bin/env node
"use strict";
/* node backend/scripts/make-dkim.js yourdomain.com [selector]
   Writes dkim-private.pem next to this script's parent folder and prints the DNS records that make your own mail trusted. */
const crypto = require("crypto"), fs = require("fs"), path = require("path");
const domain = process.argv[2], selector = process.argv[3] || "mail";
if (!domain) { console.error("Usage: node backend/scripts/make-dkim.js yourdomain.com [selector]"); process.exit(1); }
const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });
const file = path.join(__dirname, "..", "dkim-private.pem");
fs.writeFileSync(file, privateKey, { mode: 0o600 });
const p = publicKey.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
console.log(`Private key saved: ${file}  (keep it secret; it is git-ignored if you add dkim-private.pem to .gitignore)\n`);
console.log("Add these DNS records at your domain provider:\n");
console.log(`  TXT  ${selector}._domainkey.${domain}   v=DKIM1; k=rsa; p=${p}`);
console.log(`  TXT  ${domain}                          v=spf1 ip4:YOUR.SERVER.PUBLIC.IP ~all`);
console.log(`  TXT  _dmarc.${domain}                   v=DMARC1; p=none; rua=mailto:postmaster@${domain}`);
console.log(`\nAlso ask your host to set the server's reverse DNS (PTR) to your MAIL_HELO name.\nThen set: DKIM_DOMAIN=${domain}  DKIM_SELECTOR=${selector}  DKIM_PRIVATE_KEY_FILE=./dkim-private.pem`);
