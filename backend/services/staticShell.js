"use strict";
/*
 * Site layout for static pages (Admin > Static pages).
 * Every static page is rendered INSIDE the home page's own chrome, so it is an extension of the home page:
 *   top bar, nav bar, search / chat box, hero background, the SAME submit form, marquee, footer, chat widgets, language switch.
 * The uploaded page only supplies the title (hero heading) and the body content. The compact steps card is added after the 1st
 * heading's content and again after the 5th, the feature cards after the 3rd and a call-to-action at the end, with scroll animations,
 * a reading-progress bar and animated counters. The page uses the hero's own column grid (col-lg-7 / col-lg-5), so the article is as wide as
 * the hero text. The quick-tools menu (Doc Library, Upload to Unlock, Citations, AI Detector) lives in the top navbar only. A free AI report / free
 * revision / 24*7 strip is added under the hero stats. Icons added here are inline SVG because css/all.min.css is only a subset of Font Awesome.
 * The layout is read from index.html at request time, so a change to the home page header/footer/form shows on every static page.
 * Pages saved with the "Plain page" option skip this and are served exactly as uploaded.
 */
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");

const esc = (t) => String(t == null ? "" : t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const text = (h) => String(h || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
/* "database expert help" -> "Database Expert Help" (short joining words stay lower-case) */
const SMALL = new Set("a an and as at by for in of on or the to".split(" "));
const titleCase = (t) => String(t || "").replace(/\s+/g, " ").trim().split(" ").map((w, i) => (i && SMALL.has(w.toLowerCase())) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "section";

/* ---------- the home page, cut into parts ---------- */
let cache = { m: 0, v: null };
function parts() {
  const f = path.join(ROOT, "index.html"), st = fs.statSync(f);
  if (cache.v && cache.m === st.mtimeMs) return cache.v;
  const h = fs.readFileSync(f, "utf8");
  const iBody = h.indexOf("<body>"), iMain = h.indexOf('<main id="main-content">'), iHero = h.indexOf('<section id="hero">');
  const iHeroEnd = iHero < 0 ? -1 : h.indexOf("</section>", iHero) + "</section>".length, iAbout = h.indexOf("<!-- ABOUT -->"), iFoot = h.indexOf("<!-- FOOTER -->");
  if ([iBody, iMain, iHero, iHeroEnd, iAbout, iFoot].some((i) => i < 0) || !(iBody < iMain && iMain < iHero && iHero < iHeroEnd && iHeroEnd <= iAbout && iAbout < iFoot)) return null;
  const fix = (s) => s.replace(/href="#(?!assignment-form"|main-content")([^"]*)"/g, (m, a) => `href="/${a ? "#" + a : ""}"`);   /* #about -> /#about: the sections live on the home page */
  cache = { m: st.mtimeMs, v: {
    head: h.slice(0, iBody),
    chrome: fix(h.slice(iBody, iMain + '<main id="main-content">'.length)),
    hero: fix(h.slice(iHero, iHeroEnd)),
    marquee: fix(h.slice(iHeroEnd, iAbout)),
    tail: fix(h.slice(iFoot))
  } };
  return cache.v;
}

/* ---------- visual blocks ---------- */
const FEATURES = [
  ["fa-user-graduate", "1790+", "Subject Experts", "PhD-qualified writers across every academic field."],
  ["fa-circle-check", "100%", "AI-Free, Original Work", "Every order is researched and written from scratch."],
  ["fa-truck-fast", "On-Time", "Delivery, Guaranteed", "Tight deadline? We plan backwards from your due date."],
  ["fa-headset", "24/7", "Support", "Real people are available around the clock."]
];
/* ---------- inline SVG icons (the site's Font Awesome file is a small subset, so new icons are drawn inline and always show) ---------- */
const IC = {
  book: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  unlock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  sparkles: '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4M22 5h-4M4 17v2M5 18H3"/>',
  cap: '<path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>',
  award: '<path d="m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526"/><circle cx="12" cy="8" r="6"/>',
  truck: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  headset: '<path d="M3 11h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Zm0 0a9 9 0 1 1 18 0m0 0v5a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3Z"/><path d="M21 16v2a4 4 0 0 1-4 4h-5"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="m9 15 2 2 4-4"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  list: '<path d="M3 6h.01M3 12h.01M3 18h.01M8 6h13M8 12h13M8 18h13"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  card: '<rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>'
};
const ic = (n, c) => `<svg class="sp-ic${c ? " " + c : ""}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${IC[n]}</svg>`;

/* ---------- steps card (compact, ~40% of the old height) ---------- */
function stepsBlock(title) {
  const t = esc(title);   /* already title-cased page title, e.g. "Database Expert Help" */
  const steps = [
    ["Add Your Details", "Share your subject, topic and deadline."],
    ["Make the Payment", "Pay securely. See the price before you confirm."],
    ["Receive the Delivery", "On-time, guaranteed."]
  ];
  return `<section class="sp-comp sp-steps" data-steps aria-label="How it works">
<div class="sp-ch">Steps to Get ${t} Instantly</div>
<div class="sp-grid">
<div class="sp-shot" data-shot title="Click to see the next step"><div class="sp-mock" aria-hidden="true">
<div class="sp-pane on"><b class="sp-brand">Trusted Expert Help</b><small>Hire ${t} Online</small>
<div class="sp-sel"><span>Coursework</span>${ic("down")}</div><div class="sp-sel"><span class="sp-typed" data-t="${t}">${t}</span><i class="sp-caret"></i>${ic("down")}</div></div>
<div class="sp-pane"><b class="sp-brand">Secure checkout</b><small>Your price is shown before you pay</small>
<div class="sp-pay">${ic("lock")}<span>Card &middot; Wallet &middot; Bank</span></div><div class="sp-fakebtn">Pay securely</div></div>
<div class="sp-pane"><b class="sp-brand">Order delivered</b><small>Ready before your deadline</small>
<div class="sp-done">${ic("check")}</div><div class="sp-file">${ic("file")} Your work + AI report</div></div>
</div></div>
<div class="sp-acc" role="group" aria-label="Steps">${steps.map((s, i) =>
    `<div class="sp-step${i === 0 ? " on" : ""}" data-i="${i}"><button type="button" class="sp-sh" aria-expanded="${i === 0}"><span class="sp-c">0${i + 1}</span><span class="sp-t"><b>${s[0]}</b><small>${s[1]}</small></span></button>${i === 2 ? `<a class="sp-order" href="/order-now">Hire ${t}</a>` : ""}<span class="sp-bar"></span></div>`).join("")}
</div></div></section>`;
}

function featuresBlock() {
  return `<section class="sp-comp sp-feat" aria-label="Why choose us"><div class="sp-ch">Why Students Choose Our Experts</div><div class="sp-fgrid">${FEATURES.map((f) =>
    `<div class="sp-fcard"><span class="sp-fi"><i class="fas ${f[0]}"></i></span><div><b data-count="${esc(f[1])}">${esc(f[1])}</b> <strong>${esc(f[2])}</strong><p>${esc(f[3])}</p></div></div>`).join("")}</div></section>`;
}
/* the blue call-to-action (order) bar; only TWO per page: ~40% of the article and the bottom */
const CTA = [
  (t) => [`Stuck on ${t}? Don't wait for the deadline.`, "Our PhD-qualified experts are online 24/7 and can start within minutes."]
];
function ctaBlock(title, v) {
  const c = CTA[(v || 0) % CTA.length](esc(title));
  return `<section class="sp-comp sp-cta"><div><div class="sp-ch">${c[0]}</div><p>${c[1]}</p></div>
<div class="sp-cta-btns"><a class="sp-btn" href="/order-now"><i class="fas fa-graduation-cap"></i> Get Expert Help</a><a class="sp-btn ghost" href="/#contact-section">Talk to us</a></div></section>`;
}
/* puts the blue bar before the <h2> nearest 40% of the article, and one at the end */
function addCtas(html, title) {
  /* "how far down" = visible text plus ~900 characters of height for every card (steps / features), so 40% matches what the reader sees */
  const weight = (h) => text(h.replace(/<section[\s\S]*?<\/section>/gi, "")).length + (h.match(/<\/section>/gi) || []).length * 900;
  const total = weight(html) || 1;
  /* candidate spots: before every <h2>; when the page has no <h2> (bold lines, lists...), after every top-level block instead */
  let spots = [], m, re = /<h2[\s>]/gi;
  while ((m = re.exec(html))) spots.push(m.index);
  if (!spots.length) {
    const tag = /<(\/?)(section|ol|ul|div|table|blockquote|p|h[1-6])\b[^>]*>/gi, box = new Set(["section", "ol", "ul", "div", "table", "blockquote"]); let depth = 0, start = 0;
    while ((m = tag.exec(html))) {
      const name = m[2].toLowerCase();
      if (m[1]) {
        if (box.has(name)) depth = Math.max(0, depth - 1);
        if (depth === 0) {
          const blk = html.slice(start, m.index + m[0].length), t = text(blk);
          /* never split a bold "heading" line from its list, and never sit right next to a card */
          const headingLike = name === "p" && /^\s*<p[^>]*>\s*<(strong|b)\b[\s\S]*<\/\1>\s*<\/p>\s*$/i.test(blk) && t.length < 140;
          if (name !== "section" && !/^h[1-6]$/.test(name) && !headingLike && t.length) spots.push(m.index + m[0].length);
        }
      } else { if (depth === 0) start = m.index; if (box.has(name)) depth++; }
    }
    spots = spots.filter((x) => x < html.length - 20);
  }
  let best = null;
  spots.forEach((pos) => { const f = weight(html.slice(0, pos)) / total; if (f > 0.08 && f < 0.92 && (!best || Math.abs(f - 0.4) < Math.abs(best.f - 0.4))) best = { pos, f }; });
  if (best) html = html.slice(0, best.pos) + ctaBlock(title) + html.slice(best.pos);
  return html + ctaBlock(title);
}

/* ---------- the page body ---------- */
function prepareBody(html, title, h1Override) {
  let b = String(html || "");
  const bm = /<body[^>]*>([\s\S]*)<\/body>/i.exec(b);
  b = bm ? bm[1] : b.replace(/<!doctype[^>]*>|<\/?html[^>]*>|<head[\s\S]*?<\/head>/gi, "");
  b = b.replace(/<(script|style|noscript|template)[\s\S]*?<\/\1>/gi, "").replace(/<\/?(?:main|link|meta|title|base)[^>]*>/gi, "");
  /* the first <h1> becomes the hero heading; any further <h1> is demoted */
  let h1 = "";
  b = b.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/i, (m, t) => { h1 = text(t); return ""; });
  title = titleCase(h1Override || h1 || title);
  b = b.replace(/<h1([^>]*)>/gi, "<h2$1>").replace(/<\/h1>/gi, "</h2>");
  b = b.replace(/<table/gi, '<div class="sp-tw"><table').replace(/<\/table>/gi, "</table></div>").replace(/<img (?![^>]*loading=)/gi, '<img loading="lazy" ');
  /* ids for the table of contents */
  const toc = [], used = new Set();
  b = b.replace(/<h2([^>]*)>([\s\S]*?)<\/h2>/gi, (m, attr, inner) => {
    const label = text(inner); if (!label) return m;
    let id = (/\sid="([^"]+)"/.exec(attr) || [])[1];
    if (!id) { id = slugify(label); let n = 2, base = id; while (used.has(id)) id = base + "-" + n++; attr += ` id="${id}"`; }
    used.add(id); toc.push([id, label]);
    return `<h2${attr}>${inner}</h2>`;
  });
  /* visual blocks: the steps card once, after the 1st heading's content, the "why us" cards after the 3rd, the call-to-action at the end */
  const place = { 1: () => stepsBlock(title), 3: () => featuresBlock() };
  const cut = []; const re = /<h2[\s>]/gi; let m; while ((m = re.exec(b))) cut.push(m.index);
  let out = "";
  if (!cut.length) {
    const p = [...b.matchAll(/<\/p>/gi)], at = p.length >= 3 ? p[2].index + 4 : b.length;
    out = b.slice(0, at) + stepsBlock(title) + b.slice(at);
  } else {
    const secs = [b.slice(0, cut[0])]; cut.forEach((c, i) => secs.push(b.slice(c, cut[i + 1] === undefined ? b.length : cut[i + 1])));
    secs.forEach((s, k) => { out += s; if (place[k]) out += place[k](); });
  }
  out = addCtas(out, title);
  return { h1, body: out, toc, words: text(b).split(" ").filter(Boolean).length };
}


/* trust strip shown under the hero stats: free AI / plagiarism report, free revision, 24*7 availability */
function trustStrip() {
  return `<div class="sp-trust" role="list" aria-label="Included with every order">
<div class="sp-ti" role="listitem"><span class="sp-tic t1">${ic("search")}<em class="sp-free">FREE</em></span><span>AI/Plagiarism<br>Report</span></div>
<div class="sp-ti" role="listitem"><span class="sp-tic t2">${ic("refresh")}</span><span>Free<br>Revision</span></div>
<div class="sp-ti" role="listitem"><span class="sp-tic t3">${ic("headset")}</span><span>24*7<br>Availability</span></div>
</div>`;
}
/* inserts html right after the closing tag of the first <div class="cls"> in s */
function afterDiv(s, cls, html) {
  const i = s.indexOf(`<div class="${cls}"`); if (i < 0) return s;
  const re = /<(\/?)div\b/g; re.lastIndex = i; let d = 0, m;
  while ((m = re.exec(s))) { d += m[1] ? -1 : 1; if (d === 0) { const e = s.indexOf(">", m.index) + 1; return s.slice(0, e) + html + s.slice(e); } }
  return s;
}

const CSS = `
.sp-crumb{display:flex;align-items:center;gap:12px;margin:2px 0 18px;padding:0;font:500 15px/1.4 Poppins,system-ui,sans-serif}
.sp-crumb-ic{flex:none;width:32px;height:32px;border-radius:10px;display:grid;place-items:center;color:#fff!important;text-decoration:none!important;background:linear-gradient(135deg,#2563eb,#7c3aed);box-shadow:0 6px 16px rgba(37,99,235,.28);transition:transform .2s,box-shadow .2s}
.sp-crumb-ic:hover{transform:translateY(-2px) scale(1.05);box-shadow:0 10px 22px rgba(37,99,235,.38)}
.sp-crumb ol{list-style:none;display:flex;flex-wrap:wrap;align-items:center;gap:2px 10px;margin:0;padding:5px 12px;min-width:0;flex:1;background:#f4f6fd;border:1px solid #e3e8f8;border-radius:12px}
.sp-crumb li{display:inline-flex;align-items:center;gap:10px;min-width:0;margin:0}
.sp-crumb li+li:before{content:"/";color:#94a3b8}
.sp-article .sp-crumb a{text-decoration:none;color:#1d4ed8}.sp-article .sp-crumb a:hover{color:#1e3a8a;text-decoration:underline}
.sp-crumb li:last-child a{color:#374151;overflow-wrap:anywhere}
@media(max-width:575px){.sp-crumb{gap:8px;font-size:14px}.sp-crumb-ic{width:30px;height:30px}.sp-crumb ol{padding:4px 10px}}
#sp-prog{position:relative;z-index:1;display:block;height:10px;margin:8px 0 22px;border-radius:8px;background:#cfd5ea;box-shadow:inset 0 1px 2px rgba(17,24,39,.18);overflow:hidden}
#sp-prog i{display:block;height:100%;width:4%;min-width:14px;border-radius:8px;background:linear-gradient(90deg,#f6a623,#e8281a);transition:width .1s linear}
#hero .hero-title,#hero .hdesc{text-align:left!important;max-width:none!important;margin-left:0!important}
.sp-article,.sp-box,.sp-comp,.sp-trust{font-family:Poppins,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.sp-ic{width:1em;height:1em;display:inline-block;flex:none;vertical-align:-.125em}
.sp-q{font:700 1.7em/.8 Georgia,serif;width:auto;height:auto;margin-top:.25em}
#sp-main{padding:34px 0 60px;background:linear-gradient(180deg,#fff,#f5f6fb)}
.sp-article,.sp-aside{min-width:0}
@media(max-width:991px){.sp-aside{margin-top:10px}}
.sp-meta{display:flex;gap:14px;flex-wrap:wrap;font-size:14px;color:#6b7280;margin:0 0 18px}.sp-meta span{display:inline-flex;gap:6px;align-items:center}.sp-meta i{color:#f6a623}
.sp-article{position:relative;font-size:17px;line-height:1.85;color:#2b3340;background:#fff;border:1.5px solid rgba(37,99,235,.16);border-radius:22px;padding:26px 24px 14px;box-shadow:0 14px 40px rgba(17,24,39,.07);transition:box-shadow .35s,border-color .35s}
.sp-article:hover{border-color:rgba(37,99,235,.38);box-shadow:0 20px 50px rgba(37,99,235,.12)}
.sp-article:before{content:"";position:absolute;top:-1.5px;left:22px;right:22px;height:3px;border-radius:0 0 4px 4px;background:linear-gradient(90deg,#2563eb,#7c3aed,#f6a623)}
.sp-anc{all:unset;cursor:pointer;margin-left:10px;font:600 .7em/1 Poppins,sans-serif;color:#f6a623;opacity:0;transition:opacity .2s;vertical-align:middle;position:relative}
.sp-article h2:hover .sp-anc,.sp-article h3:hover .sp-anc,.sp-anc:focus-visible{opacity:1}.sp-anc.ok:after{content:"Link copied";position:absolute;left:100%;margin-left:8px;top:50%;transform:translateY(-50%);white-space:nowrap;font-size:12px;background:#111827;color:#fff;padding:4px 8px;border-radius:6px}
@media(max-width:575px){.sp-article{padding:20px 16px 8px}}
.sp-article h2{position:relative;font-size:clamp(22px,3vw,30px);line-height:1.25;color:#111827;margin:34px 0 16px;padding-bottom:12px;scroll-margin-top:90px}
.sp-article h2:after{content:"";position:absolute;left:0;bottom:0;width:72px;height:3px;border-radius:3px;background:#f6a623;box-shadow:18px 6px 0 -1px #f6a623}
.sp-article h3{font-size:21px;color:#111827;margin:28px 0 10px;scroll-margin-top:90px}
.sp-article p{margin:0 0 16px}.sp-article ul,.sp-article ol{padding-left:22px;margin:0 0 18px}.sp-article li{margin:6px 0}.sp-article li::marker{color:#f6a623;font-weight:700}
.sp-article a{color:#2457ff;text-decoration:underline;text-underline-offset:3px}
.sp-article img{max-width:100%;height:auto;border-radius:16px;box-shadow:0 14px 40px rgba(17,24,39,.14);margin:14px 0}
.sp-article blockquote{margin:20px 0;padding:14px 20px;border-left:4px solid #f6a623;background:#fff8f0;border-radius:0 12px 12px 0}
.sp-tw{overflow-x:auto;margin:18px 0;border-radius:12px;box-shadow:0 0 0 1px #e5e7eb}.sp-tw table{border-collapse:collapse;width:100%;font-size:15px}.sp-tw th{background:#fff4e0;text-align:left}.sp-tw th,.sp-tw td{padding:10px 14px;border-bottom:1px solid #eef0f4}

/* ---- hero trust strip: AI/Plagiarism report, free revision, 24*7 ---- */
.sp-trust{display:flex;flex-wrap:wrap;gap:10px;margin-top:20px}
.sp-ti{display:flex;align-items:center;gap:10px;padding:8px 16px 8px 9px;border-radius:14px;background:rgba(255,255,255,.78);border:1px solid rgba(37,99,235,.14);box-shadow:0 6px 18px rgba(30,41,90,.07);font-size:12.5px;font-weight:600;line-height:1.25;color:#1f2a44;transition:transform .25s,box-shadow .25s,border-color .25s;cursor:default}
.sp-ti:hover{transform:translateY(-3px);box-shadow:0 14px 26px rgba(30,41,90,.14);border-color:rgba(37,99,235,.4)}
.sp-tic{position:relative;width:38px;height:38px;border-radius:12px;display:grid;place-items:center;color:#fff;font-size:19px;flex:none}
.sp-tic.t1{background:linear-gradient(135deg,#2563eb,#7c3aed)}.sp-tic.t2{background:linear-gradient(135deg,#10b981,#059669)}.sp-tic.t3{background:linear-gradient(135deg,#f59e0b,#ef6c1a)}
.sp-tic .sp-ic{animation:sp-ti 4.5s ease-in-out infinite}.t2 .sp-ic{animation:sp-spin 6s ease-in-out infinite}.t3 .sp-ic{animation:sp-bob 3s ease-in-out infinite}
.sp-free{position:absolute;top:-7px;left:-8px;background:#e11d48;color:#fff;font:800 8px/1 Poppins,sans-serif;font-style:normal;padding:3px 5px;border-radius:5px;letter-spacing:.6px;box-shadow:0 3px 8px rgba(225,29,72,.4);animation:sp-pulse 2s infinite}

/* ---- sidebar: same column width as the submit form, styled like it ---- */
@media(min-width:992px) and (min-height:760px){.sp-aside-in{position:sticky;top:92px;max-height:calc(100vh - 108px)}}
.sp-aside-in{display:flex;flex-direction:column;gap:16px}@media(min-width:992px){.sp-aside-in{width:93.75%}}
.sp-box{background:#fff;border:1px solid #eceff5;border-radius:18px;padding:16px 16px 10px;box-shadow:0 10px 30px rgba(17,24,39,.06)}
.sp-box h3{font-size:16px;margin:0 0 10px;color:#111827;display:flex;gap:8px;align-items:center}.sp-box h3 .sp-ic{color:#f6a623}
.sp-tocbox{display:flex;flex-direction:column;min-height:0;flex:0 1 auto}
.sp-toc{list-style:none;margin:0;padding:0 0 6px;overflow:auto;min-height:0;max-height:260px}.sp-toc a{display:block;padding:7px 10px;border-radius:10px;color:#374151;font-size:14.5px;line-height:1.35;border-left:3px solid transparent;text-decoration:none;transition:.2s}
.sp-toc a:hover{background:#fff4e0;transform:translateX(3px)}.sp-toc a.on{background:#fff4e0;border-color:#f6a623;color:#111827;font-weight:600}

/* ---- steps card ---- */
.sp-comp{margin:38px 0;padding:26px;border-radius:22px;background:#f4f6fb;box-shadow:inset 0 0 0 1px #e8ecf5}
.sp-ch{font-size:clamp(20px,2.6vw,27px);font-weight:700;line-height:1.25;color:#111827;margin:0 0 22px;position:relative;padding-bottom:12px}
.sp-ch:after{content:"";position:absolute;left:0;bottom:0;width:70px;height:2px;background:#f6a623;box-shadow:12px 5px 0 #f6a623}
.sp-steps{margin:26px -10px;padding:12px 14px 13px;border-radius:18px}@media(max-width:575px){.sp-steps{margin-left:0;margin-right:0}}
.sp-steps .sp-ch{font-size:clamp(16px,2vw,19px);margin:0 0 8px;padding-bottom:5px}.sp-steps .sp-ch:after{width:52px;box-shadow:10px 4px 0 #f6a623}
.sp-grid{display:grid;gap:12px;align-items:stretch}@media(min-width:700px){.sp-grid{grid-template-columns:minmax(0,.78fr) minmax(0,1.22fr)}}
.sp-shot{display:flex;background:linear-gradient(160deg,#86b04a,#6f9a38);border-radius:14px;padding:8px;min-height:140px;box-shadow:0 10px 24px rgba(79,120,40,.3);overflow:hidden;cursor:pointer;transition:transform .35s,box-shadow .35s}
.sp-shot:hover{transform:translateY(-3px);box-shadow:0 16px 30px rgba(79,120,40,.4)}
.sp-mock{flex:1;position:relative;background:#fff;border-radius:12px 12px 0 0;color:#111827;overflow:hidden}
.sp-pane{position:absolute;inset:9px 12px;opacity:0;transform:translateY(14px) scale(.98);transition:opacity .45s,transform .45s;pointer-events:none}.sp-pane.on{opacity:1;transform:none}
.sp-brand{display:block;text-align:center;font:700 14px/1.2 "Playfair Display",Georgia,serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sp-pane small{display:block;text-align:center;font-size:9.5px;color:#6b7280;margin:1px 0 7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sp-sel{display:flex;align-items:center;border:1px solid #cfd4dc;border-radius:7px;padding:5px 9px;font-size:11.5px;margin:5px 0;color:#374151;white-space:nowrap;overflow:hidden;transition:border-color .3s}.sp-sel span{flex:1;overflow:hidden;text-overflow:ellipsis}.sp-sel .sp-ic{width:11px;height:11px;color:#6b7280}
.sp-pane.on .sp-sel:nth-of-type(2){border-color:#f7931e}.sp-caret{width:1px;height:12px;background:#f7931e;margin-right:6px;opacity:0}.typing .sp-caret{opacity:1;animation:sp-blink .8s steps(1) infinite}
.sp-fakebtn{margin-top:7px;display:inline-block;background:#f7931e;color:#fff;font-size:11px;font-weight:700;padding:5px 14px;border-radius:7px}.sp-pane{text-align:left}.sp-pane .sp-fakebtn{display:table;margin-left:auto;margin-right:auto}
.sp-pay{display:flex;gap:9px;align-items:center;border:1px dashed #f7931e;border-radius:9px;padding:7px 10px;font-size:11.5px;margin:6px 0;color:#374151}.sp-pay .sp-ic{color:#f7931e;font-size:14px}
.sp-done{width:34px;height:34px;border-radius:50%;background:#e8f6e8;color:#2d9a4f;display:grid;place-items:center;font-size:18px;margin:2px auto 7px}.sp-pane.on .sp-done{animation:sp-pop .6s}
.sp-file{display:flex;justify-content:center;gap:7px;align-items:center;font-size:11.5px;border:1px solid #e5e7eb;border-radius:8px;padding:5px 9px}.sp-file .sp-ic{color:#f7931e;font-size:14px}
.sp-acc{display:flex;flex-direction:column;gap:5px;min-width:0}
.sp-step{position:relative;display:flex;align-items:center;gap:8px;border:1.5px solid #f6b45a;border-radius:11px;background:#fff;overflow:hidden;transition:box-shadow .3s,background .3s,border-color .3s,transform .25s}
.sp-step:hover{transform:translateX(3px)}.sp-step.on{background:#fffaf2;border-color:#f7931e;box-shadow:0 8px 20px rgba(247,147,30,.2)}
.sp-sh{all:unset;box-sizing:border-box;flex:1;min-width:0;display:flex;align-items:center;gap:12px;padding:5px 12px;cursor:pointer;color:#1f2937}.sp-sh:focus-visible{outline:2px solid #f7931e;outline-offset:-3px;border-radius:10px}
.sp-c{width:32px;height:32px;border:2px dashed #f7931e;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#c2410c;font:600 14px/1 Poppins,sans-serif;flex:none;transition:.4s}.sp-step.on .sp-c{background:#c2410c;border-color:#c2410c;color:#fff;border-style:solid;transform:rotate(360deg)}
.sp-t{min-width:0;display:block}.sp-t b{display:block;font:600 15px/1.25 Poppins,sans-serif;white-space:nowrap}.sp-t small{display:block;font-size:12px;line-height:1.35;color:#6b7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sp-order{flex:none;margin-right:8px;background:#c2410c;color:#fff!important;font:700 13px/1 Poppins,sans-serif;padding:10px 14px;border-radius:7px;text-decoration:none!important;transition:transform .2s,box-shadow .2s;position:relative;overflow:hidden;white-space:normal;max-width:230px;text-align:center;line-height:1.25}
.sp-order:hover{transform:translateY(-2px);box-shadow:0 10px 20px rgba(247,147,30,.45)}.sp-order:after{content:"";position:absolute;top:0;left:-60%;width:40%;height:100%;background:rgba(255,255,255,.35);transform:skewX(-20deg);animation:sp-shine 3s infinite}
.sp-bar{position:absolute;left:0;bottom:0;height:3px;width:0;background:linear-gradient(90deg,#f7931e,#f6a623)}
.sp-steps.run .sp-step.on .sp-bar{animation:sp-fill 5s linear forwards}.sp-steps:hover .sp-bar,.sp-steps:focus-within .sp-bar{animation-play-state:paused}
.sp-fgrid{display:grid;gap:14px}@media(min-width:640px){.sp-fgrid{grid-template-columns:1fr 1fr}}
.sp-fcard{display:flex;gap:14px;background:#fff;border-radius:16px;padding:16px;border:1px solid #eceff5;transition:transform .3s,box-shadow .3s}.sp-fcard:hover{transform:translateY(-5px);box-shadow:0 16px 34px rgba(17,24,39,.12)}
.sp-fi{width:46px;height:46px;border-radius:13px;background:#fff4e0;color:#f7931e;display:flex;align-items:center;justify-content:center;font-size:20px;flex:none}
.sp-fcard b{font-size:19px;color:#111827}.sp-fcard strong{color:#111827}.sp-fcard p{margin:4px 0 0;font-size:14px;line-height:1.5;color:#6b7280}
.sp-cta{background:linear-gradient(135deg,#1e1b4b,#3730a3 55%,#6d28d9);color:#fff;box-shadow:0 20px 50px rgba(55,48,163,.35);display:flex;gap:22px;flex-wrap:wrap;align-items:center;justify-content:space-between}
.sp-cta .sp-ch{color:#fff;margin-bottom:10px}.sp-cta p{margin:0;max-width:520px;color:#dbe0ff;font-size:16px}.sp-cta-btns{display:flex;gap:12px;flex-wrap:wrap}
.sp-btn{display:inline-flex;gap:8px;align-items:center;background:#c2410c;color:#fff!important;font-weight:700;padding:13px 22px;border-radius:12px;text-decoration:none!important;transition:.25s}.sp-btn:hover{transform:translateY(-3px);box-shadow:0 14px 28px rgba(0,0,0,.3)}.sp-btn.ghost{background:rgba(255,255,255,.14);box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.5)}
#assignment-form.sp-flash{animation:sp-flash 1.6s ease-out}
.rv{opacity:0;transform:translateY(26px);transition:opacity .7s cubic-bezier(.2,.7,.2,1),transform .7s cubic-bezier(.2,.7,.2,1)}.rv.in{opacity:1;transform:none}
.rv .sp-mb{opacity:0}.rv.in .sp-mb{animation:sp-slide .6s cubic-bezier(.2,.8,.2,1) both}.rv.in .sp-mb:nth-child(2){animation-delay:.08s}.rv.in .sp-mb:nth-child(3){animation-delay:.16s}.rv.in .sp-mb:nth-child(4){animation-delay:.24s}
@keyframes sp-slide{from{opacity:0;transform:translateX(-22px)}to{opacity:1;transform:none}}
@keyframes sp-border{to{left:100%}}@keyframes sp-fill{to{width:100%}}@keyframes sp-blink{50%{opacity:0}}
@keyframes sp-shine{0%,60%{left:-60%}100%{left:130%}}@keyframes sp-pop{0%{transform:scale(.4)}70%{transform:scale(1.15)}100%{transform:scale(1)}}
@keyframes sp-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.12)}}
@keyframes sp-ti{0%,100%{transform:translate(0,0)}25%{transform:translate(2px,-2px)}50%{transform:translate(-2px,1px)}75%{transform:translate(1px,2px)}}
@keyframes sp-spin{0%,60%{transform:rotate(0)}100%{transform:rotate(360deg)}}@keyframes sp-bob{50%{transform:translateY(-2px)}}
@keyframes sp-flip{0%,70%,100%{transform:rotateY(0)}85%{transform:rotateY(180deg)}}@keyframes sp-jig{0%,70%,100%{transform:rotate(0)}78%{transform:rotate(-14deg)}86%{transform:rotate(12deg)}94%{transform:rotate(-6deg)}}
@keyframes sp-beat{0%,100%{transform:scale(1)}50%{transform:scale(1.18)}}@keyframes sp-twinkle{0%,100%{transform:scale(1) rotate(0);opacity:1}50%{transform:scale(1.2) rotate(18deg);opacity:.8}}
@keyframes sp-flash{0%{box-shadow:0 0 0 0 rgba(247,147,30,.7)}60%{box-shadow:0 0 0 16px rgba(247,147,30,0)}100%{box-shadow:0 0 0 0 rgba(247,147,30,0)}}
@media(prefers-reduced-motion:reduce){.rv{opacity:1;transform:none;transition:none}.rv .sp-mb{opacity:1}.sp-ic,.sp-order:after,.sp-pane.on .sp-done,.sp-free,.sp-new,.rv.in .sp-mb{animation:none!important}}
@media(max-width:699px){.sp-shot{min-height:140px}.sp-step.has-order,.sp-step:last-of-type{flex-wrap:wrap}.sp-step:last-of-type .sp-sh{flex-basis:100%}.sp-order{margin:0 10px 10px;flex:1;text-align:center}.sp-t small{white-space:normal}}
@media(max-width:575px){.sp-comp{padding:18px}.sp-steps{padding:12px}}

/* extra content motion (all switched off by prefers-reduced-motion) */
.sp-article h2{position:relative}
.sp-article h2:after{content:"";display:block;height:3px;width:0;margin-top:8px;border-radius:3px;background:linear-gradient(90deg,#6d28d9,#06b6d4,#f59e0b);transition:width .9s cubic-bezier(.2,.7,.2,1) .2s}
.sp-article h2.in:after{width:64px}
.sp-article li{transition:transform .25s,color .25s}.sp-article li:hover{transform:translateX(5px)}
.sp-article ul.rv li,.sp-article ol.rv li{opacity:0;transform:translateX(-14px)}
.sp-article ul.rv.in li,.sp-article ol.rv.in li{animation:sp-li .55s cubic-bezier(.2,.8,.2,1) both;animation-delay:calc(var(--i,0)*70ms)}
@keyframes sp-li{from{opacity:0;transform:translateX(-14px)}to{opacity:1;transform:none}}
.sp-article table.rv tbody tr{opacity:0}.sp-article table.rv.in tbody tr{animation:sp-li .5s both;animation-delay:calc(var(--i,0)*60ms)}
.sp-article blockquote.rv{transform:translateX(-26px)}.sp-article blockquote.rv.in{transform:none}
.sp-article img.rv{transform:scale(.94)}.sp-article img.rv.in{transform:none}
.sp-article img{transition:transform .35s,box-shadow .35s}.sp-article img:hover{transform:scale(1.02);box-shadow:0 16px 40px rgba(49,46,129,.2)}
.sp-cta{position:relative;overflow:hidden;background-size:200% 200%;animation:sp-cta-bg 9s ease infinite;margin:28px 0;padding:18px 26px;flex-wrap:nowrap;gap:14px 22px}
.sp-cta>div:first-child{flex:1 1 auto;min-width:0}.sp-cta .sp-ch{margin:0 0 4px;font-size:clamp(18px,2vw,22px);line-height:1.25}.sp-cta .sp-ch:after{display:none}.sp-cta p{max-width:none;margin:0;font-size:15px;line-height:1.45}.sp-cta-btns{flex:0 0 auto}.sp-cta .sp-btn{padding:10px 18px;font-size:14px}
@media(max-width:899px){.sp-cta{flex-wrap:wrap}}
.sp-cta:before{content:"";position:absolute;top:0;left:-60%;width:40%;height:100%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.16),transparent);transform:skewX(-20deg);animation:sp-shine 5s ease-in-out infinite;pointer-events:none}
.sp-cta .sp-btn:not(.ghost){animation:sp-pulse 2.4s ease-in-out infinite}
.sp-cta .sp-btn:hover{transform:translateY(-3px);animation-play-state:paused}
@keyframes sp-cta-bg{0%,100%{background-position:0 50%}50%{background-position:100% 50%}}
@keyframes sp-shine{0%,60%{left:-60%}100%{left:140%}}
@keyframes sp-pulse{0%,100%{box-shadow:0 0 0 0 rgba(249,115,22,.5)}60%{box-shadow:0 0 0 12px rgba(249,115,22,0)}}
.sp-fcard{transition:transform .3s,box-shadow .3s}.sp-fcard:hover{transform:translateY(-4px);box-shadow:0 14px 30px rgba(49,46,129,.14)}
@media(prefers-reduced-motion:reduce){.sp-article h2:after{width:64px;transition:none}.sp-article ul.rv li,.sp-article ol.rv li,.sp-article table.rv tbody tr{opacity:1;transform:none;animation:none!important}.sp-cta,.sp-cta:before,.sp-cta .sp-btn{animation:none!important}}
`;

const JS = `(function(){
var d=document,art=d.getElementById("sp-article");if(!art)return;
var RM=matchMedia("(prefers-reduced-motion: reduce)").matches,bar=d.getElementById("sp-prog");
var nav=d.getElementById("nav"),fill=bar&&bar.firstChild;
function navH(){return nav&&getComputedStyle(nav).position!=="static"?Math.round(nav.getBoundingClientRect().height):0}
function prog(){var r=art.getBoundingClientRect(),t=r.height-innerHeight;if(fill)fill.style.width=(t>0?Math.max(4,Math.min(100,(-r.top)/t*100)):4)+"%"}
addEventListener("scroll",prog,{passive:true});addEventListener("resize",prog);prog();
/* first order bar: placed before the heading nearest 40% of the content height (measured on screen); the second stays at the bottom */
function place40(){var ctas=[].slice.call(art.querySelectorAll(":scope > .sp-cta"));if(ctas.length<2)return;var first=ctas[0],kids=[].filter.call(art.children,function(c){return c.id!=="sp-prog"&&!c.classList.contains("sp-cta")&&c.offsetHeight>0}),total=0,pos=[];
 kids.forEach(function(c){pos.push(total);total+=c.offsetHeight});if(!total)return;var best=null,bd=9;
 kids.forEach(function(c,k){if(c.tagName==="H2"&&pos[k]/total>.08){var dd=Math.abs(pos[k]/total-.4);if(dd<bd){bd=dd;best=c}}});
 if(best&&first.nextElementSibling!==best)art.insertBefore(first,best)}
place40();addEventListener("load",function(){place40();prog()});
/* animated counters (1790+, 100% ...) */
function count(root){[].forEach.call(root.querySelectorAll("[data-count]"),function(b){var s=b.getAttribute("data-count"),m=/^(\\d+)(.*)$/.exec(s);if(!m||b.__c)return;b.__c=1;var n=+m[1],suf=m[2],t0=null;function f(t){if(t0===null)t0=t;var p=Math.min(1,(t-t0)/1200);b.textContent=Math.round(n*(1-Math.pow(1-p,3)))+suf;if(p<1)requestAnimationFrame(f)}requestAnimationFrame(f)})}
/* scroll reveal */
var els=[].slice.call(d.querySelectorAll("#sp-article > *:not(p):not(#sp-prog):not(.sp-crumb), .sp-aside-in > *, .sp-comp .sp-fcard"));
if("IntersectionObserver" in window&&!RM){
 var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){var t=e.target;t.classList.add("in");io.unobserve(t);count(t);setTimeout(function(){t.style.transitionDelay=""},1200)}})},{threshold:.08,rootMargin:"0px 0px -6% 0px"});
 [].forEach.call(d.querySelectorAll("#sp-article ul.rv li,#sp-article ol.rv li,#sp-article table.rv tbody tr"),function(x,k){x.style.setProperty("--i",k)});
 els.forEach(function(el,i){el.classList.add("rv");el.style.transitionDelay=(el.classList.contains("sp-fcard")?(i%4)*80:0)+"ms";io.observe(el)});
}else{count(d)}
/* steps card: click, keyboard, auto-play with a progress bar (pauses on hover / focus / when off screen) */
[].forEach.call(d.querySelectorAll("[data-steps]"),function(root){
 var steps=[].slice.call(root.querySelectorAll(".sp-step")),tabs=steps.map(function(s){return s.querySelector(".sp-sh")}),panes=[].slice.call(root.querySelectorAll(".sp-pane")),
  typed=root.querySelector(".sp-typed"),n=steps.length,cur=0,tt=null,auto=!RM;
 function type(){if(!typed||RM)return;var full=typed.getAttribute("data-t"),i=0;clearInterval(tt);typed.textContent="";typed.parentNode.classList.add("typing");tt=setInterval(function(){i++;typed.textContent=full.slice(0,i);if(i>=full.length){clearInterval(tt);typed.parentNode.classList.remove("typing")}},38)}
 function go(i,user){
  cur=(i+n)%n;if(user)auto=false;
  steps.forEach(function(s,k){s.classList.toggle("on",k===cur);tabs[k].setAttribute("aria-expanded",k===cur)});
  panes.forEach(function(p,k){p.classList.toggle("on",k===cur)});
  var b=steps[cur].querySelector(".sp-bar");b.style.animation="none";void b.offsetWidth;b.style.animation="";
  if(cur===0)type();
 }
 steps.forEach(function(s,k){
  tabs[k].addEventListener("click",function(){go(k,true)});
  tabs[k].addEventListener("keydown",function(e){var t=e.key==="ArrowDown"||e.key==="ArrowRight"?cur+1:e.key==="ArrowUp"||e.key==="ArrowLeft"?cur-1:e.key==="Home"?0:e.key==="End"?n-1:null;if(t===null)return;e.preventDefault();go(t,true);tabs[cur].focus()});
  s.querySelector(".sp-bar").addEventListener("animationend",function(){if(auto&&k===cur)go(cur+1)});
 });
 root.querySelector("[data-shot]").addEventListener("click",function(){go(cur+1,true)});
 if("IntersectionObserver" in window&&!RM){new IntersectionObserver(function(e){root.classList.toggle("run",e[0].isIntersecting&&auto)},{threshold:.4}).observe(root)}
 root.addEventListener("click",function(){if(!auto)root.classList.remove("run")});
});
/* lay the page out on the hero's own grid: the article is as wide as the hero text column, the sidebar starts where the submit form starts and is 93.75% of its width (125% of the old 75%) */
var form=d.getElementById("assignment-form"),side=d.querySelector(".sp-aside-in");
function sync(){
 var h7=d.querySelector("#hero .col-lg-7"),h5=d.querySelector("#hero .col-lg-5"),m7=d.querySelector("#sp-main .col-lg-7"),m5=d.querySelector("#sp-main .col-lg-5");
 if(!h7||!h5||!m7||!m5||!form||!side)return;
 m7.style.width=m5.style.width=side.style.width=side.style.marginLeft="";
 if(innerWidth<992)return;
 m7.style.width=h7.getBoundingClientRect().width+"px";m5.style.width=h5.getBoundingClientRect().width+"px";
 var f=form.getBoundingClientRect(),c=m5.getBoundingClientRect(),pad=parseFloat(getComputedStyle(m5).paddingLeft)||0;
 if(f.width>240&&f.width<=c.width){var ml=Math.max(0,f.left-c.left-pad);side.style.width=Math.round(Math.min(f.width*.75*1.25,c.width-pad*2-ml))+"px";side.style.marginLeft=ml+"px"}
}
function navw(){var a=d.getElementById("sp-article"),nv=d.querySelector("#nav .container"),br=d.querySelector("#nav .navbar-brand"),co=d.querySelector("#nav .navbar-collapse");if(!a||!br||!co)return;a.style.maxWidth=a.style.marginLeft="";if(innerWidth<992)return;var r=0;[].forEach.call(nv.querySelectorAll("a,button"),function(c){var b=c.getBoundingClientRect();if(b.width>0&&c.offsetHeight>0&&b.top<200)r=Math.max(r,b.right)});var l=br.getBoundingClientRect().left,ar=a.getBoundingClientRect();if(r>l+300&&r-l<ar.width-2){a.style.maxWidth=Math.round(r-l)+"px";a.style.marginLeft=Math.round(l-ar.left)+"px"}}
sync();navw();addEventListener("resize",function(){sync();navw()});addEventListener("load",function(){navw();setTimeout(navw,400);setTimeout(navw,1500)});if(window.ResizeObserver){var nvEl=d.querySelector("#nav .container");if(nvEl){var ro=new ResizeObserver(function(){navw()});[].forEach.call(nvEl.querySelectorAll("a,button"),function(x){ro.observe(x)})}}if(d.fonts&&d.fonts.ready)d.fonts.ready.then(navw);
addEventListener("resize",sync);addEventListener("load",sync);if(d.fonts&&d.fonts.ready)d.fonts.ready.then(sync);
/* every "Order / Get expert help" link: smooth scroll to the form, focus it and give it a short highlight */
d.addEventListener("click",function(e){var a=e.target.closest&&e.target.closest('a[href="#assignment-form"]');if(!a)return;var f=d.getElementById("assignment-form");if(!f)return;e.preventDefault();
 f.scrollIntoView({behavior:RM?"auto":"smooth",block:"center"});f.classList.remove("sp-flash");void f.offsetWidth;f.classList.add("sp-flash");
 setTimeout(function(){var i=f.querySelector("input:not([type=hidden]),select,textarea");if(i)try{i.focus({preventScroll:true})}catch(x){}},RM?0:650)});
/* a "#" link beside every heading that copies the link to that section */
[].forEach.call(art.querySelectorAll("h2[id],h3[id]"),function(h){var b=d.createElement("button");b.type="button";b.className="sp-anc";b.textContent="#";b.setAttribute("aria-label","Copy link to this section");
 b.addEventListener("click",function(){var u=location.origin+location.pathname+"#"+h.id;try{history.replaceState(null,"","#"+h.id)}catch(x){}try{navigator.clipboard.writeText(u)}catch(x){}b.classList.add("ok");setTimeout(function(){b.classList.remove("ok")},1600)});h.appendChild(b)});
/* table of contents: highlight the section being read */
var links=[].slice.call(d.querySelectorAll(".sp-toc a"));
if(links.length&&"IntersectionObserver" in window){var map={};links.forEach(function(a){map[a.getAttribute("href").slice(1)]=a});
 var so=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){links.forEach(function(a){a.classList.remove("on")});var a=map[e.target.id];if(a){a.classList.add("on");var box=a.closest(".sp-toc");if(box&&box.scrollHeight>box.clientHeight){var r=a.getBoundingClientRect(),b=box.getBoundingClientRect();if(r.top<b.top||r.bottom>b.bottom)box.scrollTop+=r.top-b.top-40}}}})},{rootMargin:"-20% 0px -70% 0px"});
 [].forEach.call(art.querySelectorAll("h2[id]"),function(h){so.observe(h)})}
})();`;

/* the reading-progress (scrub) bar sits inside the article box, right BELOW the title line that opens the content
   (a short first <p>/<h*> block); if the content does not open with a title line, it stays at the top of the box */
const PROG = '<div id="sp-prog" aria-hidden="true"><i></i></div>';
function withBar(body) {
  const m = /^\s*(?:<(?:p|h[1-6])\b[^>]*>[\s\S]*?<\/(?:p|h[1-6])>)/i.exec(body || "");
  if (m && text(m[0]).length > 0 && text(m[0]).length <= 160) return m[0] + PROG + body.slice(m[0].length);
  return PROG + (body || "");
}

/* ---------- main entry ---------- */
function render(row, o) {
  const P = parts(); if (!P) return null;
  const doc = prepareBody(row.html, row.title || "", row.hero_h1);
  const title = row.hero_h1 || doc.h1 || row.title || row.slug.replace(/-/g, " "), desc = row.description || text(doc.body).slice(0, 155);
  const url = o + "/" + row.slug, site = process.env.SITE_NAME || "Expert Help", mins = Math.max(1, Math.round(doc.words / 220));
  const ld = JSON.stringify([
    { "@context": "https://schema.org", "@type": "Article", headline: title.slice(0, 110), description: desc, url, mainEntityOfPage: url, inLanguage: "en", dateModified: new Date(row.updated_at || Date.now()).toISOString(), author: { "@type": "Organization", name: site }, publisher: { "@type": "Organization", name: site } },
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Home", item: o + "/" }, { "@type": "ListItem", position: 2, name: title, item: url }] }
  ]).replace(/</g, "\\u003c");
  let head = P.head
    .replace(/<title>[\s\S]*?<\/title>/i, "")
    .replace(/<meta[^>]+name=["']description["'][^>]*>/i, "")
    .replace(/<meta[^>]+name=["']robots["'][^>]*>/gi, "")
    .replace(/<link[^>]+rel=["']canonical["'][^>]*>/gi, "")
    .replace(/<meta[^>]+(?:property|name)=["'](?:og|twitter):[^>]*>/gi, "")
    .replace(/<script[^>]+application\/ld\+json[^>]*>[\s\S]*?<\/script>/gi, "");
  const add = `<title>${esc(title)} | ${esc(site)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${esc(url)}">`
    + `<meta name="robots" content="${row.noindex ? "noindex, nofollow" : "index, follow, max-image-preview:large"}">`
    + `<meta property="og:type" content="article"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(url)}"><meta property="og:site_name" content="${esc(site)}">`
    + `<meta name="twitter:card" content="summary"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(desc)}">`
    + `<script type="application/ld+json">${ld}</script><style id="sp-css">${CSS}</style>`;
  head = /<\/head>/i.test(head) ? head.replace(/<\/head>/i, add + "</head>") : head + add;
  /* hero: the page's own heading and description replace the home page's; the chat box, badge, buttons, stats and form stay.
     The "free AI report / free revision / 24*7" strip is added under the stats. */
  const w = title.split(/\s+/), hl = w.length > 2 ? esc(w.slice(0, -2).join(" ")) + " <span>" + esc(w.slice(-2).join(" ")) + "</span>" : "<span>" + esc(title) + "</span>";
  let hero = P.hero.replace(/<h1 class="hero-title">[\s\S]*?<\/h1>/, () => `<h1 class="hero-title">${hl}</h1>`)
    .replace(/<p class="hdesc">[\s\S]*?<\/p>/, () => `<p class="hdesc">${esc(row.hero_text || desc)}</p>`);
  hero = afterDiv(hero, "hstats", trustStrip());
  /* body: same two-column grid as the hero (col-lg-7 / col-lg-5), so the article is as wide as the hero text and the sidebar is exactly as wide as the submit form */
  const crumb = `<nav class="sp-crumb" id="ah-crumb" aria-label="Breadcrumb"><ol><li><a class="sp-crumb-ic" href="/" aria-label="Home" title="Home"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg></a></li><li><a href="${esc(url)}" aria-current="page">${esc(title)}</a></li></ol></nav>`;
  const main = `<section id="sp-main"><div class="container"><div class="row g-4 sp-layout">
<div class="col-lg-12"><article class="sp-article" id="sp-article">${crumb}${withBar(doc.body)}</article></div>
</div></div></section></main>`;
  return head + P.chrome + hero + P.marquee + main + P.tail.replace(/<\/body>/i, `<script>${JS}</script><script src="/js/content-enhance.js?v=2n" data-root="#sp-article" data-bars="off" data-style="card" data-title="${esc(title)}" data-href="/order-now"></script></body>`);
}
module.exports = { render };
