"use strict";
/* npm run db:reset -> DELETES all local data (backend/data/pglite). Needs --yes. */
const fs = require("fs"), path = require("path");
const dir = path.resolve(process.env.PGLITE_DIR || path.join(__dirname, "..", "data", "pglite"));
if (!process.argv.includes("--yes")) { console.log("This deletes ALL local data in " + dir + ".\nRun again with:  npm run db:reset -- --yes"); process.exit(0); }
fs.rmSync(dir, { recursive: true, force: true });
console.log("Deleted " + dir + ". Run  npm run db:setup  to create empty tables.");
