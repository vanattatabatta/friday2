/* Content enhancer: "Order now" bars + interactive, animated paragraphs.
 *
 *  1. ORDER BARS  - a terracotta call-to-action bar in the middle of the content and another at the bottom
 *                   ("Avail online ... now / Place your order right away! / [Place your order >]").
 *  2. PARAGRAPHS  - every paragraph fades/slides in as it scrolls into view, gets an accent rail that draws itself on hover and
 *                   while it is in the reading zone (middle of the screen), highlighted key terms (<strong>) and a small floating
 *                   toolbar (copy paragraph / read aloud). Nothing is hidden when JavaScript is off, and reduced-motion users get a
 *                   static version.
 *
 * Usage (all options are data-attributes on the script tag, or pass the same names, camelCased, to AHContent.init({...})):
 *   <script src="/js/content-enhance.js" data-root="#sp-article" data-title="Database Expert Help" data-href="#assignment-form"></script>
 *   data-root     CSS selector of the content container (bars are placed between its children)
 *   data-paras    CSS selector(s) of containers whose <p> get the effects (default: the root); "off" = no paragraph effects
 *   data-bars     "both" (default) | "bottom" | "off"
 *   data-style    "card" (rounded, default) | "band" (full width, square)
 *   data-marks    where the bars go, as % of the content (default "30,60"); each bar goes before the heading nearest that mark
 *   data-mid      selector of an element to put a single middle bar BEFORE (overrides data-marks)
 *   data-end      selector of an element to put the bottom bar BEFORE (default: the end of the root)
 *   data-title    wording used in the heading: "Avail online <title> now" (default "expert help")
 *   data-href     where the button goes (default "#assignment-form" when the page has that form, otherwise "/#assignment-form")
 */
(function () {
  "use strict";
  if (window.AHContent) { return; }
  var d = document, RM = false;
  try { RM = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}

  var ACCENT = "linear-gradient(180deg,#f6a623,#e8281a)";
  var CSS = [
    /* ---------- order bar ---------- */
    ".eob{position:relative;overflow:hidden;isolation:isolate;box-sizing:border-box;text-align:center;color:#fff;margin:40px 0;padding:40px 22px 42px;border-radius:22px;background:linear-gradient(115deg,#d4745c 0%,#e08a6f 50%,#d4745c 100%);background-size:100% 100%;box-shadow:0 18px 42px rgba(212,116,92,.35);font-family:'Open Sans',Poppins,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;clear:both}",
    ".eob *{box-sizing:border-box}",
    ".eob--band{border-radius:0;margin:0;padding:48px 22px 50px;box-shadow:none}",
    ".eob:before,.eob:after{content:'';position:absolute;z-index:-1;border-radius:50%;background:rgba(255,255,255,.1);pointer-events:none}",
    ".eob:before{width:220px;height:220px;left:-60px;top:-90px;animation:eob-float 7s ease-in-out infinite}",
    ".eob:after{width:300px;height:300px;right:-90px;bottom:-170px;animation:eob-float 9s ease-in-out infinite reverse}",
    ".eob-h{margin:0 0 6px;font-size:clamp(22px,3.3vw,33px);font-weight:700;line-height:1.25;letter-spacing:-.2px;color:#fff}",
    ".eob-s{margin:0 0 24px;font-size:clamp(16px,2vw,21px);font-style:italic;font-weight:700;color:#fff;opacity:.96}",
    ".eob-b{position:relative;overflow:hidden;display:inline-flex;align-items:center;gap:10px;padding:15px 36px;border-radius:12px;background:#fff;color:#d4745c!important;font-size:18px;font-weight:700;line-height:1.2;text-decoration:none!important;box-shadow:0 10px 24px rgba(0,0,0,.2);transition:transform .25s cubic-bezier(.3,1.4,.5,1),box-shadow .25s;animation:eob-ring 2.6s ease-out infinite}",
    ".eob-b:hover{transform:translateY(-3px) scale(1.04);box-shadow:0 16px 32px rgba(0,0,0,.28);animation:none}.eob-b:active{transform:scale(.97);animation:none}",
    ".eob-b:focus-visible{outline:3px solid #fff;outline-offset:3px}",
    ".eob-b:before{content:'';position:absolute;inset:0;background:linear-gradient(90deg,transparent 27.5%,rgba(212,116,92,.28) 50%,transparent 72.5%);transform:translate3d(-100%,0,0) skewX(-20deg);animation:eob-shine 3.4s ease-in-out infinite}",
    ".eob-b svg{width:20px;height:20px;flex:none;transition:transform .25s}.eob-b:hover svg{transform:translateX(5px)}",
    ".eob.eob-pre{opacity:0;transform:translateY(26px) scale(.98)}",
    ".eob{transition:opacity .7s cubic-bezier(.2,.7,.2,1),transform .7s cubic-bezier(.2,.7,.2,1)}",
    "@keyframes eob-float{50%{transform:translate(18px,14px)}}",
    "@keyframes eob-shine{0%,55%{transform:translate3d(-100%,0,0) skewX(-20deg)}100%{transform:translate3d(115%,0,0) skewX(-20deg)}}",
    "@keyframes eob-ring{0%,60%,100%{transform:none}30%{transform:scale(1.04)}}",
    "@media(max-width:575px){.eob{padding:30px 16px 32px;border-radius:18px;margin:30px 0}.eob--band{padding:36px 16px 38px;border-radius:0;margin:0}.eob-b{width:100%;max-width:340px;justify-content:center;padding:15px 20px}}",
    /* ---------- interactive paragraphs ---------- */
    ".eop{position:relative}",
    ".eop.eop-pre{opacity:0;transform:translateY(20px)}",
    ".eop{transition:opacity .7s cubic-bezier(.2,.7,.2,1) var(--eop-d,0ms),transform .7s cubic-bezier(.2,.7,.2,1) var(--eop-d,0ms)}",
    ".eop.in:hover,.eop.in.eop-on{transform:translateX(4px)}",
    ".eop:before{content:'';position:absolute;left:-13px;top:3px;bottom:3px;width:3px;border-radius:3px;background:" + ACCENT + ";transform:scaleY(0);transform-origin:top;transition:transform .4s cubic-bezier(.2,.8,.2,1);pointer-events:none}",
    ".eop:hover:before,.eop.eop-on:before{transform:scaleY(1)}",
    ".eop.eop-c:before{left:50%;top:auto;bottom:-6px;height:3px;width:64px;margin-left:-32px;transform:scaleX(0);transform-origin:center}",
    ".eop.eop-c:hover:before,.eop.eop-c.eop-on:before{transform:scaleX(1)}",
    ".eop strong,.eop b{background:linear-gradient(transparent 62%,rgba(246,166,35,.38) 0) no-repeat left center;background-size:0 100%;transition:background-size .9s ease .35s}",
    ".eop.in strong,.eop.in b{background-size:100% 100%}",
    ".eop-say{box-shadow:0 0 0 6px rgba(37,99,235,.09);border-radius:6px;animation:eop-say 1.6s ease-in-out infinite}",
    "@keyframes eop-say{50%{box-shadow:0 0 0 9px rgba(37,99,235,.16)}}",
    /* floating toolbar + toast */
    ".eop-tb{position:absolute;z-index:9990;display:flex;gap:2px;padding:3px;border-radius:11px;background:#111827;box-shadow:0 10px 26px rgba(0,0,0,.3);opacity:0;transform:translateY(6px) scale(.96);pointer-events:none;transition:opacity .18s,transform .18s}",
    ".eop-tb.on{opacity:1;transform:none;pointer-events:auto}",
    ".eop-tb button{all:unset;box-sizing:border-box;width:32px;height:32px;display:grid;place-items:center;border-radius:8px;color:#e5e7eb;cursor:pointer;transition:background .15s,color .15s}",
    ".eop-tb button:hover,.eop-tb button:focus-visible{background:#f6a623;color:#111827}.eop-tb button[aria-pressed=true]{background:#2563eb;color:#fff}",
    ".eop-tb svg{width:17px;height:17px;pointer-events:none}",
    ".eop-toast{position:fixed;left:50%;bottom:26px;z-index:99995;transform:translate(-50%,20px);opacity:0;background:#111827;color:#fff;font:600 14px/1 Poppins,system-ui,sans-serif;padding:11px 18px;border-radius:999px;box-shadow:0 10px 26px rgba(0,0,0,.3);pointer-events:none;transition:opacity .25s,transform .25s}",
    ".eop-toast.on{opacity:1;transform:translate(-50%,0)}",
    "@media(max-width:991px){.eop:before{left:-9px}}",
    "@media(prefers-reduced-motion:reduce){.eob,.eob:before,.eob:after,.eob-b,.eob-b:before,.eop,.eop:before,.eop strong,.eop b,.eop-say{animation:none!important;transition:none!important}.eop.eop-pre,.eob.eob-pre{opacity:1;transform:none}.eop strong,.eop b{background-size:100% 100%}}"
  ].join("\n");

  function addCss() {
    if (d.getElementById("eo-css")) return;
    var s = d.createElement("style"); s.id = "eo-css"; s.textContent = CSS; (d.head || d.documentElement).appendChild(s);
  }
  function $(sel, ctx) { try { return (ctx || d).querySelector(sel); } catch (e) { return null; } }
  function $$(sel, ctx) { try { return [].slice.call((ctx || d).querySelectorAll(sel)); } catch (e) { return []; } }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  /* ---------------------------------------------------------------- order bars */
  var CHEV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m9 6 6 6-6 6"/></svg>';
  /* three different headlines so no two bars on a page read the same */
  var VARS = [
    function (t) { return ["Avail online " + t + " now", "Place your order right away!"]; },
    function (t) { return ["Need " + t + " before your deadline?", "Our experts are online 24/7 – start in minutes."]; },
    function (t) { return ["Get " + t + " from a PhD-qualified expert", "Free AI report and free revisions included."]; }
  ];
  function bar(o, where, v) {
    var el = d.createElement("div"), txt = VARS[(v || 0) % VARS.length](o.title);
    el.className = "eob" + (o.band ? " eob--band" : "") + (RM ? "" : " eob-pre");
    el.setAttribute("data-eob", where); el.setAttribute("role", "region"); el.setAttribute("aria-label", "Place your order");
    el.innerHTML = '<div class="eob-h">' + esc(txt[0]) + '</div>'
      + '<div class="eob-s">' + esc(txt[1]) + '</div>'
      + '<a class="eob-b" href="' + esc(o.href) + '">Place your order ' + CHEV + '</a>';
    return el;
  }
  function revealOnView(list, cls) {
    if (RM || !("IntersectionObserver" in window)) { list.forEach(function (e) { e.classList.remove(cls + "-pre"); e.classList.add("in"); }); return; }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (x) { if (x.isIntersecting) { x.target.classList.remove(cls + "-pre"); x.target.classList.add("in"); io.unobserve(x.target); } });
    }, { threshold: .15 });
    list.forEach(function (e) { io.observe(e); });
  }
  /* bars go BEFORE a heading: for each mark (e.g. 30 and 60 percent of the content) take the heading whose position is closest to it */
  function headingSpots(root, marks) {
    var kids = [].filter.call(root.children, function (c) { return !/^(SCRIPT|STYLE|LINK)$/.test(c.tagName) && !c.hasAttribute("data-eob") && c.offsetHeight > 0; });
    var total = 0, pos = [];
    kids.forEach(function (c) { pos.push(total); total += c.offsetHeight; });
    if (!total) return [];
    var heads = [], used = [];
    kids.forEach(function (c, k) { if (/^H[1-6]$/.test(c.tagName) && pos[k] / total > .08) heads.push({ el: c, f: pos[k] / total }); });
    marks.forEach(function (m) {
      var best = null;
      heads.forEach(function (h) { if (used.indexOf(h.el) < 0 && (!best || Math.abs(h.f - m / 100) < Math.abs(best.f - m / 100))) best = h; });
      if (best) { used.push(best.el); }
    });
    return used;
  }
  function placeBars(o, root) {
    var made = [];
    /* The terracotta "Avail online ... now / Place your order" bar has been removed from the whole site. */
    if (true || o.bars === "off" || $("[data-eob]", root.parentNode || root)) return made;
    if (o.bars !== "bottom") {
      var before = o.mid ? $(o.mid) : null;
      if (before && before.parentNode) { var m = bar(o, "mid", 0); before.parentNode.insertBefore(m, before); made.push(m); }
      else {
        var spots = headingSpots(root, o.marks);
        spots.sort(function (a, b) { return a.getBoundingClientRect().top - b.getBoundingClientRect().top; });
        spots.forEach(function (h, i) { var m2 = bar(o, "mark" + i, i); h.parentNode.insertBefore(m2, h); made.push(m2); });
      }
    }
    var end = o.end ? $(o.end) : null, b = bar(o, "bottom", 2);
    if (end && end.parentNode) end.parentNode.insertBefore(b, end); else root.appendChild(b);
    made.push(b);
    revealOnView(made, "eob");
    return made;
  }

  /* ---------------------------------------------------------------- paragraphs */
  var SKIP = "header,nav,footer,form,button,select,label,[role=dialog],[data-eob],.eob,.sp-comp,.sp-meta,.sp-trust,.sp-tw,#hero,.marquee,.mq-wrap,[data-no-enhance]";
  var IC = {
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="13" height="13" x="9" y="9" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/></svg>',
    stop: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>'
  };
  var tb, toast, cur = null, hideT = 0, toastT = 0, speaking = null;
  function note(msg) {
    if (!toast) { toast = d.createElement("div"); toast.className = "eop-toast"; toast.setAttribute("role", "status"); d.body.appendChild(toast); }
    toast.textContent = msg; toast.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(function () { toast.classList.remove("on"); }, 1700);
  }
  function plain(p) { return (p.textContent || "").replace(/\s+/g, " ").trim(); }
  function legacyCopy(t) {
    return new Promise(function (ok, no) { try { var a = d.createElement("textarea"); a.value = t; a.setAttribute("readonly", ""); a.style.cssText = "position:fixed;top:0;left:0;opacity:0"; d.body.appendChild(a); a.select(); var r = d.execCommand("copy"); a.remove(); r ? ok() : no(); } catch (e) { no(e); } });
  }
  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t).catch(function () { return legacyCopy(t); });
    return legacyCopy(t);
  }
  function stopSpeech() {
    try { window.speechSynthesis.cancel(); } catch (e) {}
    if (speaking) { speaking.classList.remove("eop-say"); speaking = null; }
    if (tb) { var l = tb.querySelector("[data-a=listen]"); if (l) { l.innerHTML = IC.play; l.setAttribute("aria-pressed", "false"); l.setAttribute("aria-label", "Read this paragraph aloud"); l.title = "Read aloud"; } }
  }
  function buildToolbar() {
    if (tb) return;
    tb = d.createElement("div"); tb.className = "eop-tb"; tb.setAttribute("role", "toolbar"); tb.setAttribute("aria-label", "Paragraph tools");
    tb.innerHTML = '<button type="button" data-a="copy" aria-label="Copy this paragraph" title="Copy">' + IC.copy + '</button>'
      + ("speechSynthesis" in window && window.SpeechSynthesisUtterance ? '<button type="button" data-a="listen" aria-label="Read this paragraph aloud" aria-pressed="false" title="Read aloud">' + IC.play + '</button>' : "");
    d.body.appendChild(tb);
    tb.addEventListener("mouseenter", function () { clearTimeout(hideT); });
    tb.addEventListener("mouseleave", function () { schedHide(); });
    tb.addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b || !cur) return;
      if (b.getAttribute("data-a") === "copy") { copyText(plain(cur)).then(function () { note("Paragraph copied"); }, function () { note("Couldn't copy"); }); }
      else if (b.getAttribute("data-a") === "listen") {
        if (speaking === cur) { stopSpeech(); return; }
        stopSpeech();
        var u = new SpeechSynthesisUtterance(plain(cur)), p = cur; speaking = p; p.classList.add("eop-say");
        u.onend = u.onerror = function () { if (speaking === p) stopSpeech(); };
        b.innerHTML = IC.stop; b.setAttribute("aria-pressed", "true"); b.setAttribute("aria-label", "Stop reading"); b.title = "Stop";
        try { window.speechSynthesis.speak(u); } catch (er) { stopSpeech(); }
      }
    });
    addEventListener("resize", hideTb, { passive: true });
  }
  function showTb(p) {
    buildToolbar(); clearTimeout(hideT); cur = p;
    var r = p.getBoundingClientRect(), w = tb.offsetWidth || 72, top = r.top + scrollY - 40;
    if (r.top < 96) top = r.top + scrollY + 6;                                  /* near the sticky header: tuck it inside the paragraph */
    var left = Math.min(Math.max(8, r.right + scrollX - w), scrollX + d.documentElement.clientWidth - w - 8);
    tb.style.top = Math.round(top) + "px"; tb.style.left = Math.round(left) + "px"; tb.classList.add("on");
    var l = tb.querySelector("[data-a=listen]"); if (l && speaking !== p) { l.innerHTML = IC.play; l.setAttribute("aria-pressed", "false"); }
  }
  function hideTb() { if (tb) tb.classList.remove("on"); }
  function schedHide() { clearTimeout(hideT); hideT = setTimeout(hideTb, 260); }

  /* step 1 (reads only): pick the paragraphs and read their computed text-align. Runs BEFORE addCss()/placeBars() so the browser
     is never asked for styles while it has pending DOM changes (that was a forced reflow). */
  function collectParas(o, root) {
    var scopes = o.paras ? $$(o.paras) : [root], list = [];
    scopes.forEach(function (sc) {
      $$("p", sc).forEach(function (p) {
        if (p.__eop || p.closest(SKIP) || plain(p).length < 40) return;
        p.__eop = 1; list.push(p);
      });
    });
    if (!list.length) return null;
    return { list: list, centered: list.map(function (p) { return getComputedStyle(p).textAlign === "center"; }) };
  }
  /* step 2 (writes only) */
  function enhanceParas(o, root, pre) {
    var list = pre.list, centered = pre.centered;
    list.forEach(function (p, i) {                                                                    /* ... then all writes */
      p.classList.add("eop");
      if (centered[i]) p.classList.add("eop-c");
      if (!RM) p.classList.add("eop-pre");
    });
    /* reveal as it scrolls in, staggered within the same batch */
    if (!RM && "IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (es) {
        var n = 0;
        es.forEach(function (x) {
          if (!x.isIntersecting) return;
          var t = x.target; io.unobserve(t);
          t.style.setProperty("--eop-d", Math.min(n++, 4) * 70 + "ms");
          t.classList.remove("eop-pre"); t.classList.add("in");
          setTimeout(function () { t.style.removeProperty("--eop-d"); }, 1200);
        });
      }, { threshold: .08, rootMargin: "0px 0px -5% 0px" });
      list.forEach(function (p) { io.observe(p); });
      /* reading zone: the paragraph(s) crossing the middle of the screen get the accent rail */
      var rz = new IntersectionObserver(function (es) {
        es.forEach(function (x) { x.target.classList.toggle("eop-on", x.isIntersecting); });
      }, { rootMargin: "-42% 0px -42% 0px" });
      list.forEach(function (p) { rz.observe(p); });
    } else { list.forEach(function (p) { p.classList.remove("eop-pre"); p.classList.add("in"); }); }
    /* toolbar: hover on desktop, tap on touch screens */
    list.forEach(function (p) {
      p.addEventListener("mouseenter", function (e) { if (e.pointerType === "touch") return; showTb(p); });
      p.addEventListener("mouseleave", schedHide);
      p.addEventListener("pointerup", function (e) {
        if (e.pointerType !== "touch" || (e.target.closest && e.target.closest("a"))) return;
        if (cur === p && tb && tb.classList.contains("on")) hideTb(); else showTb(p);
      });
    });
    addEventListener("scroll", function () { if (tb && tb.classList.contains("on") && 'ontouchstart' in window) hideTb(); }, { passive: true });
  }

  /* ---------------------------------------------------------------- public API */
  function init(o) {
    o = o || {};
    var root = typeof o.root === "string" ? $(o.root) : o.root;
    if (!root) return false;
    o.title = o.title || "expert help";
    o.marks = (o.marks ? String(o.marks).split(",") : [30, 60]).map(Number).filter(function (n) { return n > 0 && n < 100; });
    if (!o.href) o.href = "/order-now";
    o.band = o.style === "band";
    var pre = o.paras !== "off" ? collectParas(o, root) : null;   /* reads first ... */
    placeBars(o, root);                                              /* (its own reads come before its inserts) */
    addCss();                                                        /* ... then writes */
    if (pre) enhanceParas(o, root, pre);
    return true;
  }
  window.AHContent = { init: init };

  var me = d.currentScript;
  if (me && me.getAttribute("data-root")) {
    var g = function (n) { return me.getAttribute("data-" + n); };
    var boot = function () {
      init({ root: g("root"), paras: g("paras"), bars: g("bars") || "both", style: g("style"), mid: g("mid"), end: g("end"), title: g("title"), href: g("href"), marks: g("marks") });
    };
    /* run after the first frame has been rendered: the style tree is clean by then, so getComputedStyle() no longer forces a reflow */
    var later = function () { var go = function () { setTimeout(boot, 0); }; if (window.requestAnimationFrame) requestAnimationFrame(go); else go(); };
    if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", later); else later();
    /* layout (and the middle position) settles once fonts and images are in */
  }
})();
