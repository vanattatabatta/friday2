"use strict";
/* The site's real "404 - Page not found" page: HTTP 404, noindex, never cached. Used for unknown URLs and for removed
   documents / questions / static pages, so search engines drop them (they also disappear from the XML sitemaps automatically). */
const esc = (t) => String(t == null ? "" : t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function render(site) {
  const s = esc(site || process.env.SITE_NAME || "Doc Library");
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>404 - Page not found | ${s}</title>
<style>body{margin:0;font:17px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1f2937;background:#f8fafc;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px;box-sizing:border-box}
.c{max-width:560px;text-align:center}h1{font-size:72px;margin:0;color:#0f766e;line-height:1}h2{margin:8px 0 12px}p{color:#4b5563}
form{display:flex;gap:8px;margin:20px 0}input{flex:1;padding:12px 14px;border:1.5px solid #cbd5e1;border-radius:10px;font:inherit}button,.b{padding:12px 18px;border:0;border-radius:10px;background:#0f766e;color:#fff;font:inherit;font-weight:600;text-decoration:none;cursor:pointer}
nav{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}nav a{color:#0f766e;font-weight:600}</style></head>
<body><main class="c"><h1>404</h1><h2>Page not found</h2><p>This page does not exist or has been removed.</p>
<form action="/doc" method="get"><input name="q" type="search" placeholder="Search documents" aria-label="Search documents"><button type="submit">Search</button></form>
<p><a class="b" href="/">Back to the home page</a></p><nav><a href="/doc">Document library</a><a href="/qa">Questions &amp; answers</a><a href="/citation-generator">Citation generator</a></nav></main></body></html>`;
}
function send(res) {
  res.status(404).set({ "Content-Type": "text/html; charset=UTF-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" }).send(render());
}
module.exports = { render, send };
