#!/usr/bin/env node
/*
 * Self-host Playfair Display, Poppins and Dancing Script (latin subset only).
 *
 *   node self-host-fonts.js
 *
 * Needs internet ONCE (Node 18+). It
 *   1. downloads Google's font CSS and the latin .woff2 files into fonts/,
 *   2. removes the fonts.googleapis.com / fonts.gstatic.com tags from index.html,
 *   3. inlines the @font-face rules (<style id="self-fonts">) and preloads the two fonts the first screen needs,
 *   4. rebuilds the .gz/.br copies (node compress-assets.js).
 * Safe to re-run: it replaces its own block. Nothing is changed if a download fails.
 */
const fs = require("fs"), path = require("path"), cp = require("child_process");
const ROOT = __dirname, FONT_DIR = path.join(ROOT, "fonts"), HTML = path.join(ROOT, "index.html");
const CSS_URL = "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=Poppins:wght@400;500;600;700&family=Dancing+Script:wght@700&display=optional";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"; // modern UA => woff2
const PRELOAD = [["Playfair Display", "700"], ["Poppins", "400"]];   // hero heading + body text (LCP)

async function main() {
  const css = await (await fetch(CSS_URL, { headers: { "User-Agent": UA } })).text();
  const blocks = [...css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*(@font-face\s*{[^}]*})/g)].filter((m) => m[1] === "latin");
  if (!blocks.length) throw new Error("No latin @font-face blocks found in Google's response.");
  fs.mkdirSync(FONT_DIR, { recursive: true });

  const files = new Map(), rules = [], preloads = [], pending = [];
  for (const [, , rule] of blocks) {
    const fam = /font-family:\s*'([^']+)'/.exec(rule)[1], wt = /font-weight:\s*(\d+)/.exec(rule)[1];
    const url = /url\((https:[^)]+\.woff2)\)/.exec(rule)[1];
    if (!files.has(url)) files.set(url, fam.toLowerCase().replace(/\s+/g, "-") + "-" + wt + ".woff2"); // variable fonts: 700 & 900 share one file
    const name = files.get(url);
    rules.push(`@font-face{font-family:"${fam}";font-style:normal;font-weight:${wt};font-display:optional;src:url(fonts/${name}) format("woff2");unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}`);
    if (PRELOAD.some(([f, w]) => f === fam && w === wt) && !preloads.includes(name)) preloads.push(name);
  }
  for (const [url, name] of files) pending.push(fetch(url).then(async (r) => {
    if (!r.ok) throw new Error(url + " -> " + r.status);
    return [name, Buffer.from(await r.arrayBuffer())];
  }));
  const downloaded = await Promise.all(pending);          // throws before anything is written if one fails
  for (const [name, buf] of downloaded) { fs.writeFileSync(path.join(FONT_DIR, name), buf); console.log("saved fonts/" + name, (buf.length / 1024).toFixed(1) + " KiB"); }

  let h = fs.readFileSync(HTML, "utf8");
  h = h.replace(/<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com"\/>\s*/g, "")
       .replace(/<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com"[^>]*\/>\s*/g, "")
       .replace(/<link rel="preload" as="style" href="https:\/\/fonts\.googleapis\.com[^>]*\/>\s*/g, "")
       .replace(/<noscript><link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*\/><\/noscript>\s*/g, "")
       .replace(/<!-- self-fonts -->[\s\S]*?<!-- \/self-fonts -->\s*/g, "");
  const block = "<!-- self-fonts -->\n" + preloads.map((n) => `<link rel="preload" as="font" type="font/woff2" href="fonts/${n}" crossorigin/>`).join("\n") +
    `\n<style id="self-fonts">${rules.join("")}</style>\n<!-- /self-fonts -->\n`;
  if (!h.includes('<style id="critical-css">')) throw new Error("critical-css block not found in index.html");
  h = h.replace('<style id="critical-css">', block + '<style id="critical-css">');
  fs.writeFileSync(HTML, h);
  console.log("index.html patched (" + rules.length + " @font-face rules, " + preloads.length + " preloads)");
  if (process.argv.includes("--no-compress")) return;
  cp.execFileSync(process.execPath, [path.join(ROOT, "compress-assets.js")], { stdio: "inherit" });
}
main().catch((e) => { console.error("FAILED, nothing was changed in index.html:", e.message); process.exit(1); });
