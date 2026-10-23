/* Shared header for every page except the home page: Library, CiteMe, Ask AI, AI Detector, Expert Help, Study Resources and Login.
   - Logo on the left, navbar buttons in the middle, Login / account on the right (no unlock count).
   - Second row: breadcrumb + search bar (60% wide, grows to full width when you click it).
   - The button of the page you are on is left out (CiteMe page: no CiteMe, Ask AI page: no Ask AI, AI Detector page: no AI Detector). Override with data-hide="cite,ask,ai,doc".
   - Expert Help opens the live-chat box. The WhatsApp + chat icons are loaded on every page, but the chat never opens by itself.
   Usage: <div id="site-header"></div> first in <body>; load this script BEFORE /js/study-resources.js. Add data-lib on the Doc Library page (keeps ids #sf / #q / #acc). */
(function () {
  var host = document.getElementById("site-header");
  if (!host || host.__sh) return; host.__sh = 1;
  window.__ahBc = 1;   /* this header draws the breadcrumb, so crumb.js must not add a second one */
  var LIB = host.hasAttribute("data-lib");
  var path = location.pathname.replace(/\/+$/, "") || "/", parts = path.split("/").filter(Boolean);
  var inDoc = parts[0] === "doc" || parts[0] === "docs";
  var CATS = { school: "School", solutions: "Textbook Solutions", literature: "Literature Title", guides: "Study Guides" };
  var hide = {};
  (host.getAttribute("data-hide") || "").split(/[\s,]+/).forEach(function (k) { if (k) hide[k] = 1; });
  if (parts[0] === "citation-generator") hide.cite = 1;
  if (parts[0] === "ask-ai") hide.ask = 1;
  if (parts[0] === "tools" && parts[1] === "ai-detector") hide.ai = 1;

  var esc = function (t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var I = function (p, s, w) { return '<svg width="' + (s || 16) + '" height="' + (s || 16) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (w || 2) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>'; };

  /* ---- breadcrumb trail: [[label, href]], a null label = the page title ---- */
  var trail = [];
  var TOOLNAMES = { "ai-detector": "AI Detector", "document-creator": "Document Creator", ocr: "Image & PDF to Text", diagram: "Diagram Generator", "grammar-checker": "Grammar Checker", "spell-checker": "Spell Checker", proofreader: "Proofreader", paraphraser: "Paraphraser", flashcards: "Flashcards" };
  if (inDoc) {
    if (parts.length === 1) trail = [["Doc Library", "/doc"]];
    else if (parts[1] === "upload") trail = [["Doc Library", "/doc"], ["Unlock", "/doc/upload"]];
    else if (CATS[parts[1]]) trail = [["Doc Library", "/doc"], [CATS[parts[1]], path]];
    else trail = [["Doc Library", "/doc"], [null, path]];
  } else if (parts[0] === "tools" && parts[1]) trail = [[TOOLNAMES[parts[1]] || null, path]];
  else if (parts[0] === "citation-generator") trail = [["CiteMe", path]];
  else if (parts[0] === "ask-ai") trail = [["Ask AI", path]];
  else if (parts[0] === "contact-us") trail = [["Contact Us", path]];
  else if (parts[0] === "ai-to-human-expert") trail = [["Hire AI to Human Expert", path]];
  else if (parts[0] === "legal" && parts[1]) trail = [["Legal", "/legal/copyright-protection"], [null, path]];

  var css = [
    '.hdr{--teal:#0f766e;--ink:#0b1220;--mut:#5b6575;font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink);box-sizing:border-box}.hdr *{box-sizing:border-box}.hdr a{color:inherit;text-decoration:none}',
    '.hdr-top{position:sticky;top:0;z-index:50;display:flex;align-items:center;gap:18px;background:#fff;padding:12px 28px;box-shadow:0 1px 6px #0b12200f;min-height:68px}',
    '.hdr-logo{display:flex;align-items:center;gap:10px;flex:none}.hdr-logo img{width:44px;height:40px;object-fit:contain;display:block}.hdr-logo b{display:block;font:700 19px/1.1 system-ui;color:var(--ink)}.hdr-logo b i{font-style:normal;color:var(--teal)}.hdr-logo small{display:block;font:12px/1.2 system-ui;color:var(--mut)}',
    '.hdr-nav{display:flex;align-items:center;justify-content:center;gap:10px;flex:1 1 auto;min-width:0;white-space:nowrap}',
    '.hdr-b{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:40px;padding:0 16px;border:0;border-radius:11px;color:#fff!important;font:700 14.5px/1 system-ui,sans-serif;cursor:pointer;flex:none;position:relative;overflow:hidden;transition:transform .2s,box-shadow .2s,filter .2s}',
    '.hdr-b:hover{transform:translateY(-2px);filter:brightness(1.06)}.hdr-b:active{transform:scale(.97)}.hdr-b:focus-visible,.hdr-q:focus-visible{outline:3px solid #0f766e55;outline-offset:2px}',
    '.hdr-doc{background:linear-gradient(135deg,#65a30d,#0f766e);box-shadow:0 5px 14px #0f766e40}',
    '.hdr-ask{background:linear-gradient(135deg,#8b5cf6,#d946ef);box-shadow:0 5px 14px #8b5cf640}',
    '.hdr-cite{background:linear-gradient(135deg,#fb923c,#ef4444);box-shadow:0 5px 14px #ef444440}',
    '.hdr-ai{background:linear-gradient(135deg,#2563eb,#06b6d4);box-shadow:0 5px 14px #2563eb40}',
    '.hdr-unlock{background:linear-gradient(135deg,#a21caf,#e11d74 55%,#f97316);box-shadow:0 5px 14px #a21caf40}',
    '.hdr-b::after{content:"";position:absolute;top:0;left:-70%;width:40%;height:100%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.45),transparent);transform:skewX(-20deg);animation:hdrsh 4.2s ease-in-out infinite;pointer-events:none}',
    '.hdr-q{display:inline-flex;align-items:center;height:40px;padding:0 6px;font:700 15px system-ui;color:var(--ink)!important;flex:none}.hdr-q:hover{color:var(--teal)!important}',
    '.hdr-xh{gap:10px;padding:0 16px 0 6px;background:linear-gradient(135deg,#0b1b24,#16373a);border:1px solid #d9a93b66;color:#ffe9a8!important;box-shadow:0 6px 18px #0b1b2440}.hdr-xh::after{display:none}',
    '.hdr-xh .av{position:relative;width:28px;height:28px;border-radius:50%;background:#f5a623;color:#3b2a00;display:grid;place-items:center;flex:none}.hdr-xh .av i{position:absolute;right:-2px;top:-2px;width:10px;height:10px;border-radius:50%;background:#22c55e;border:2px solid #0b1b24}',
    '.hdr-r{display:flex;align-items:center;gap:10px;flex:none}',
    '.hdr-acc{display:inline-grid;place-items:center;height:40px;min-width:40px;padding:0 16px;border-radius:20px;background:#eef1f5;font:700 15px system-ui;color:var(--ink)!important;flex:none}.hdr-acc:not(.in){padding:0;width:40px;border-radius:50%}',
    '.hdr-band{position:relative;z-index:4;background:linear-gradient(135deg,#c9ece6,#e6eff2 60%,#f1ecf6);padding:14px 28px}',
    '.hdr-bandin{display:flex;align-items:center;gap:14px;max-width:1240px;margin:0 auto}',
    '.hdr-bc{display:flex;align-items:center;gap:8px;flex:none;max-width:42%;background:#fff;border-radius:14px;padding:6px 16px 6px 6px;box-shadow:0 2px 10px #0b122010;font:500 15px/1.3 Poppins,Inter,system-ui,sans-serif;color:#5b6575;min-width:0}',
    '.hdr-bc .hi{flex:none;width:32px;height:32px;border-radius:10px;display:grid;place-items:center;color:#fff!important;background:linear-gradient(135deg,#2563eb,#7c3aed)}',
    '.hdr-bc ol{display:flex;align-items:center;gap:8px;list-style:none;margin:0;padding:0;min-width:0}.hdr-bc li{display:flex;align-items:center;gap:8px;min-width:0}.hdr-bc li:before{content:"/";color:#9aa3b2}.hdr-bc li a{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:30ch;color:#5b6575}.hdr-bc li:last-child a{font-weight:600}',
    '.hdr-sbw{flex:1 1 0;min-width:0;display:flex}',
    '.hdr-sb{width:60%;min-width:0;display:flex;align-items:center;margin:0;background:#fff;border:2px solid #0f766e;border-radius:999px;padding:3px 4px 3px 18px;box-shadow:0 0 0 5px #0f766e1a;transition:width .35s cubic-bezier(.2,.8,.2,1),box-shadow .25s}',
    '.hdr-sb:focus-within,.hdr-sb.has{width:100%;box-shadow:0 0 0 6px #0f766e26}',
    '.hdr-sb input{flex:1;min-width:0;width:100%;border:0;outline:0;background:none;font:15.5px system-ui;color:var(--ink);padding:8px 0}',
    '.hdr-sb button{width:38px;height:38px;border-radius:50%;border:0;background:linear-gradient(135deg,#0f766e,#14b8a6);color:#fff;display:grid;place-items:center;cursor:pointer;flex:none;padding:0}',
    '@keyframes hdrsh{60%,100%{left:130%}}',
    /* modal: log in / sign up before uploading */
    '@media(max-width:1180px){.hdr-top{gap:10px;padding:10px 16px}.hdr-b{padding:0 12px;font-size:13.5px}.hdr-logo small{display:none}}',
    /* phone: logo + login on top, the buttons in a tidy grid below, then breadcrumb + search */
    '@media(max-width:1000px){.hdr-top{position:relative;flex-wrap:wrap;gap:10px 8px;padding:10px 12px 12px;min-height:0}.hdr-logo{order:1}.hdr-logo b{font-size:17px}.hdr-r{order:2;margin-left:auto}',
    '.hdr-nav{order:3;flex:1 0 100%;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;white-space:nowrap}.hdr-nav .hdr-b{height:38px;padding:0 6px;font-size:12.5px;gap:6px;width:100%}.hdr-nav .hdr-b svg{width:15px;height:15px}',
    '.hdr-q{justify-content:center;height:38px;border-radius:11px;background:#f1f4f8;font-size:13px}.hdr-nav [data-study-resources]{display:block;min-width:0}.hdr-nav [data-study-resources] .srx{display:block}.hdr-nav [data-study-resources] .srx-b{width:100%;height:38px;justify-content:center;background:#f1f4f8;border-radius:11px;padding:0 6px;font-size:12.5px;gap:4px}.hdr-nav [data-study-resources] .srx-b span{display:inline}',
    '.hdr-nav .srx-m{position:fixed;left:12px;right:12px;top:auto;min-width:0;max-height:70vh;overflow:auto}',
    '.hdr-xh{padding:0 8px 0 4px;gap:6px}.hdr-xh .av{width:24px;height:24px}.hdr-band{padding:10px 12px}.hdr-bandin{gap:8px}.hdr-bc{padding:4px;gap:6px;max-width:44%}.hdr-bc .hi{width:30px;height:30px}.hdr-bc li:first-child:before{display:none}.hdr-bc ol{display:none}.hdr-sb input{font-size:15px}}',
    '@media(max-width:380px){.hdr-nav .hdr-b{font-size:11.5px;padding:0 4px}}',
    '@media(prefers-reduced-motion:reduce){.hdr-b::after{animation:none}.hdr-b,.hdr-sb{transition:none}}'
  ].join("");
  var st = document.createElement("style"); st.id = "hdr-css"; st.textContent = css; document.head.appendChild(st);

  var nav = "";
  /* Unlock: shown on every page (Library, CiteMe, Ask AI, AI Detector). Log in / sign up first, then the upload page (handled by docs-upload.js). */
  nav += '<a class="hdr-b hdr-unlock" href="/doc/upload" data-doc-upload title="Upload documents and earn free unlocks">' + I('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M7 11V8a5 5 0 0 1 9.6-2"/>', 16, 2.2) + '<span>Unlock</span></a>';
  nav += hide.doc ? "" : '<a class="hdr-b hdr-doc" href="/doc" title="Browse the Library">' + I('<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>') + '<span>Library</span></a>';
  nav += hide.cite ? "" : '<a class="hdr-b hdr-cite" href="/citation-generator" title="CiteMe: Citation Generator">' + I('<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>', 16, 2.2) + '<span>CiteMe</span></a>';
  nav += hide.ask ? "" : '<a class="hdr-b hdr-ask" href="/ask-ai" title="Ask AI: type your question to our assistant">' + I('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z"/><path d="M12 8.2l.9 2.2 2.2.9-2.2.9-.9 2.2-.9-2.2-2.2-.9 2.2-.9z"/>') + '<span>Ask AI</span></a>';
  nav += hide.ai ? "" : '<a class="hdr-b hdr-ai" href="/tools/ai-detector" title="AI Detector: see how much of a text is human vs AI written">' + I('<path d="M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>') + '<span>AI Detector</span></a>';
  nav += '<button type="button" class="hdr-b hdr-xh" data-expert-help aria-label="Expert Help: open live chat" title="Chat with an expert now"><span class="av">' + I('<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><path d="M4 14h3v5H6a2 2 0 0 1-2-2z"/><path d="M20 14h-3v5h1a2 2 0 0 0 2-2z"/>', 16, 2.3) + '<i></i></span><span>Expert Help</span></button>';
  nav += '<div data-study-resources></div>';

  var band = "";
  var chip = trail.length ? '<nav class="hdr-bc" aria-label="Breadcrumb"><a class="hi" href="/" aria-label="Home" title="Home">' + I('<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>', 18) + '</a><ol>' + trail.map(function (t, i) {
    return '<li><a href="' + esc(t[1]) + '"' + (i === trail.length - 1 ? ' aria-current="page"' : "") + (t[0] === null ? " data-bc-title" : "") + ">" + esc(t[0] === null ? pageName() : t[0]) + "</a></li>";
  }).join("") + "</ol></nav>" : "";
  function pageName() {
    var h = document.getElementById("h1") || document.querySelector(".wrap h1") || document.querySelector("h1");
    return (h && h.textContent.trim()) || document.title.split(" | ")[0].trim() || "Page";
  }
  band = '<div class="hdr hdr-band"><div class="hdr-bandin">' + chip + '<div class="hdr-sbw"><form class="hdr-sb" id="' + (LIB ? "sf" : "shf") + '" role="search"><input id="' + (LIB ? "q" : "shq") + '" placeholder="Search documents, notes and study guides\u2026" aria-label="Search documents" autocomplete="off"><button type="submit" aria-label="Search">' + I('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>', 18, 2.2) + '</button></form></div></div></div>';

  /* two siblings: the top bar stays pinned while scrolling (desktop), the search band scrolls away */
  host.outerHTML = '<div class="hdr hdr-top" role="banner"><a class="hdr-logo" href="/" aria-label="Expert Help home"><img src="/img/logo.webp?v=20260926" alt="Expert Help" width="44" height="40"><span><b>Expert <i>Help</i></b><small>Doc Library</small></span></a>'
    + '<nav class="hdr-nav" aria-label="Main">' + nav + '</nav><div class="hdr-r"><a class="hdr-q hdr-contact" href="/contact-us"' + (parts[0] === "contact-us" ? ' aria-current="page"' : "") + '>Contact</a><a id="acc" class="hdr-acc in" href="/login">Login</a></div></div>' + band;

  /* search: click grows the bar to full width; typing keeps it open */
  var form = document.getElementById(LIB ? "sf" : "shf"), inp = document.getElementById(LIB ? "q" : "shq");
  function keep() { form.classList.toggle("has", !!inp.value); }
  inp.addEventListener("input", keep); inp.addEventListener("blur", keep); setTimeout(keep, 400);
  form.addEventListener("click", function () { inp.focus(); });
  if (!LIB) form.onsubmit = function (e) { e.preventDefault(); location.href = "/doc?q=" + encodeURIComponent(inp.value); };

  /* breadcrumb title follows the page title (document pages) */
  var a = document.querySelector("[data-bc-title]");
  if (a) {
    var sync = function () { var n = pageName(); if (a.textContent !== n) a.textContent = n; };
    var tt = document.querySelector("title"); if (tt && window.MutationObserver) new MutationObserver(sync).observe(tt, { childList: true, characterData: true, subtree: true });
    var h1 = document.getElementById("h1"); if (h1 && window.MutationObserver) new MutationObserver(sync).observe(h1, { childList: true, characterData: true, subtree: true });
    document.addEventListener("DOMContentLoaded", sync); setTimeout(sync, 1200);
  }

  /* ---- Expert Help opens the chat box (the chat script is loaded on demand if it is not there yet) ---- */
  window.AH_LIVECHAT = Object.assign({ whatsapp: "917042660369", text: "Hi, I need expert help", autoOpenDelay: -1, tease: false, agentPhotos: false }, window.AH_LIVECHAT || {});
  var chatLoading = false;
  function loadChat() {
    if (chatLoading || window.AHLiveChat || document.getElementById("lc-dock")) return; chatLoading = true;
    var n = 0, L = ["/js/flags.js?v=20261002fm", "/js/livechat.js?v=20261020ld"];
    L.forEach(function (u) { if (document.querySelector('script[src^="' + u.split("?")[0] + '"]')) { n++; return; } var s = document.createElement("script"); s.src = u; s.async = false; document.body.appendChild(s); });
  }
  function openChat() { if (window.AHLiveChat) { window.AHLiveChat.open(); return; } window.__ahWantChat = 1; loadChat(); }
  document.addEventListener("click", function (e) { var b = e.target.closest && e.target.closest("[data-expert-help]"); if (b) { e.preventDefault(); openChat(); } });
  (window.requestIdleCallback || function (f) { setTimeout(f, 600); })(loadChat, { timeout: 1500 });

  if (!window.__ahGate) { var gs = document.createElement("script"); gs.src = "/js/auth-gate.js?v=1"; document.head.appendChild(gs); }   /* tool links: log in / sign up first, then come back */
  if (!window.AHDocs) { var ds = document.createElement("script"); ds.src = "/js/docs-upload.js?v=3"; document.head.appendChild(ds); }   /* Unlock: login/sign-up first, then the upload page */
  fetch("/api/account/me", { credentials: "same-origin" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
    var u = d && d.user, ac = document.getElementById("acc"); if (!u || !ac) return;
    var w = String(u.name || "Account").trim().split(/\s+/);
    ac.textContent = ((w[0] || "A")[0] + (w.length > 1 ? w[w.length - 1][0] : "")).toUpperCase();
    ac.classList.remove("in"); ac.title = u.name || "My account"; ac.href = "/account";
  }).catch(function () {});
})();

/* resume background document uploads that were started on another page */
try { if (!window.AHUp && localStorage.getItem("ah_upq")) { var ahu = document.createElement("script"); ahu.src = "/js/upload-manager.js?v=1"; document.head.appendChild(ahu); } } catch (e) {}
