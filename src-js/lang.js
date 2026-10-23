/* Top-bar language picker - MANUAL selection only.
 * Default is English (US). There is no IP / browser-region detection and no "view this site in ...?" prompt.
 * Picking another language loads Google's free website translator on demand; English (UK/CA/AU/NZ) keep the page in English. */
(function () {
  "use strict";
  var ITEMS = [["en-US", "English (US)", "us", "en", "English"], ["en-GB", "English (UK)", "gb", "en", "English"], ["en-CA", "English (CA)", "ca", "en", "English"], ["en-AU", "English (AU)", "au", "en", "English"], ["en-NZ", "English (NZ)", "nz", "en", "English"], ["fr", "Fran\u00e7ais", "fr", "fr", "Europe"], ["de", "Deutsch", "de", "de", "Europe"], ["es", "Espa\u00f1ol", "es", "es", "Europe"], ["it", "Italiano", "it", "it", "Europe"], ["pt", "Portugu\u00eas", "pt", "pt", "Europe"], ["nl", "Nederlands", "nl", "nl", "Europe"], ["sv", "Svenska", "se", "sv", "Europe"], ["da", "Dansk", "dk", "da", "Europe"], ["no", "Norsk", "no", "no", "Europe"], ["fi", "Suomi", "fi", "fi", "Europe"], ["pl", "Polski", "pl", "pl", "Europe"], ["cs", "\u010ce\u0161tina", "cz", "cs", "Europe"], ["sk", "Sloven\u010dina", "sk", "sk", "Europe"], ["hu", "Magyar", "hu", "hu", "Europe"], ["ro", "Rom\u00e2n\u0103", "ro", "ro", "Europe"], ["bg", "\u0411\u044a\u043b\u0433\u0430\u0440\u0441\u043a\u0438", "bg", "bg", "Europe"], ["el", "\u0395\u03bb\u03bb\u03b7\u03bd\u03b9\u03ba\u03ac", "gr", "el", "Europe"], ["hr", "Hrvatski", "hr", "hr", "Europe"], ["sl", "Sloven\u0161\u010dina", "si", "sl", "Europe"], ["sr", "Srpski", "rs", "sr", "Europe"], ["uk", "\u0423\u043a\u0440\u0430\u0457\u043d\u0441\u044c\u043a\u0430", "ua", "uk", "Europe"], ["ru", "\u0420\u0443\u0441\u0441\u043a\u0438\u0439", "ru", "ru", "Europe"], ["et", "Eesti", "ee", "et", "Europe"], ["lv", "Latvie\u0161u", "lv", "lv", "Europe"], ["lt", "Lietuvi\u0173", "lt", "lt", "Europe"], ["is", "\u00cdslenska", "is", "is", "Europe"], ["ga", "Gaeilge", "ie", "ga", "Europe"], ["hi", "\u0939\u093f\u0928\u094d\u0926\u0940", "in", "hi", "More languages"], ["zh", "\u4e2d\u6587", "cn", "zh", "More languages"], ["ar", "\u0627\u0644\u0639\u0631\u0628\u064a\u0629", "ae", "ar", "More languages"], ["vi", "Ti\u1ebfng Vi\u1ec7t", "vn", "vi", "More languages"]];   // [id, label, flag, language, group]
  var GT = { zh: "zh-CN" }, CHAT = { en: 1, fr: 1, hi: 1, de: 1, zh: 1, ar: 1, es: 1, it: 1, vi: 1 };
  var PKEY = "ah_lang_pick";
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} return null; }
  function find(id) { for (var i = 0; i < ITEMS.length; i++) if (ITEMS[i][0] === id) return ITEMS[i]; return null; }
  function flag(c) { return (window.AHFlags && window.AHFlags.uri(c)) || "https://flagcdn.com/w40/" + c + ".png"; }
  function cookieLang() {
    var m = /(?:^|;\s*)googtrans=\/en\/([\w-]+)/.exec(document.cookie); if (!m) return "en"; var c = m[1];
    for (var k in GT) if (GT[k] === c) return k;
    for (var i = 0; i < ITEMS.length; i++) if (ITEMS[i][3] === c) return c;
    return "en";
  }
  var cur = (function () {
    var lc = cookieLang(), saved = find(ls(PKEY));
    if (saved && saved[3] === lc) return saved;
    for (var i = 0; i < ITEMS.length; i++) if (ITEMS[i][3] === lc) return ITEMS[i];
    return ITEMS[0];                                   // English (US)
  })();

  /* ---- styles ---- */
  var st = document.createElement("style");
  st.textContent = "#topbar{overflow:visible!important}#ah-lang{position:relative;font-family:Poppins,Arial,sans-serif}#ah-lang>button{display:flex;align-items:center;gap:7px;height:24px;padding:0 10px 0 7px;border:1px solid rgba(255,255,255,.4);border-radius:999px;background:rgba(255,255,255,.14);color:#fff;font:600 .76rem/1 Poppins,Arial,sans-serif;cursor:pointer;transition:background .15s;white-space:nowrap}#ah-lang>button:hover,#ah-lang>button[aria-expanded=true]{background:rgba(255,255,255,.28)}" +
    ".ahl-fl{width:20px;height:14px;border-radius:2px;object-fit:cover;box-shadow:0 0 0 1px rgba(0,0,0,.2);flex:none;background:#fff}#ah-lang svg{width:10px;height:10px;fill:none;stroke:#fff;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round}" +
    "#ahl-menu{position:absolute;top:calc(100% + 8px);right:0;z-index:100001;width:340px;max-width:calc(100vw - 20px);max-height:min(70vh,460px);overflow-y:auto;overscroll-behavior:contain;display:none;grid-template-columns:1fr 1fr;gap:2px;padding:8px;background:#fff;border-radius:16px;box-shadow:0 18px 44px rgba(15,23,42,.35)}#ahl-menu.on{display:grid}" +
    "#ahl-menu .ahl-h{grid-column:1/-1;padding:8px 10px 3px;font:700 10.5px Poppins,Arial,sans-serif;letter-spacing:.07em;text-transform:uppercase;color:#9f1239}" +
    "#ahl-menu button{display:flex;align-items:center;gap:10px;min-width:0;padding:9px 10px;border:0;border-radius:10px;background:none;color:#1f2937;font:500 14px Poppins,Arial,sans-serif;cursor:pointer;text-align:start}#ahl-menu button span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#ahl-menu button:hover{background:#fff1f2}#ahl-menu button[aria-selected=true]{background:#ffe4e6;color:#881337;font-weight:600}" +
    "#ah-lang button:focus-visible{outline:2px solid #fbbf24;outline-offset:2px}" +
    ".goog-te-banner-frame,.goog-te-balloon-frame,#goog-gt-tt,.goog-tooltip,.skiptranslate>iframe{display:none!important}body{top:0!important}.goog-text-highlight{background:none!important;box-shadow:none!important}";
  document.head.appendChild(st);

  /* ---- Google website translator (loaded on demand) ---- */
  function setCookie(v) {
    var host = location.hostname, exp = v ? "" : ";expires=Thu, 01 Jan 1970 00:00:00 GMT", val = v ? "/en/" + v : "";
    document.cookie = "googtrans=" + val + ";path=/" + exp;
    document.cookie = "googtrans=" + val + ";path=/;domain=" + host + exp;
  }
  function gtList() { var o = []; ITEMS.forEach(function (i) { if (i[3] !== "en") o.push(GT[i[3]] || i[3]); }); return o.join(","); }
  function loadGT(cb) {
    if (window.google && google.translate && google.translate.TranslateElement) return cb();
    var box = document.getElementById("ah-gt");
    if (!box) { box = document.createElement("div"); box.id = "ah-gt"; box.setAttribute("translate", "no"); box.style.cssText = "position:absolute;left:-9999px;top:0"; document.body.appendChild(box); }
    window.__ahGT = function () { new google.translate.TranslateElement({ pageLanguage: "en", autoDisplay: false, includedLanguages: gtList() }, "ah-gt"); cb(); };
    var s = document.createElement("script"); s.async = true; s.src = "https://translate.google.com/translate_a/element.js?cb=__ahGT"; document.head.appendChild(s);
  }
  function translate(code) {
    var g = GT[code] || code; setCookie(g);
    loadGT(function () {
      var tries = 0;
      (function wait() {
        var sel = document.querySelector("select.goog-te-combo");
        if (sel) { sel.value = g; sel.dispatchEvent(new Event("change")); } else if (tries++ < 40) setTimeout(wait, 150);
      })();
    });
  }

  /* ---- UI ---- */
  var wrap = document.createElement("div"); wrap.id = "ah-lang"; wrap.setAttribute("translate", "no"); wrap.className = "notranslate";
  var btn = document.createElement("button"); btn.type = "button"; btn.setAttribute("aria-haspopup", "listbox"); btn.setAttribute("aria-expanded", "false");
  var bf = document.createElement("img"); bf.className = "ahl-fl"; bf.alt = "";
  var bn = document.createElement("span");
  btn.appendChild(bf); btn.appendChild(bn);
  btn.insertAdjacentHTML("beforeend", '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 4l4 4 4-4"/></svg>');
  var menu = document.createElement("div"); menu.id = "ahl-menu"; menu.setAttribute("role", "listbox");
  wrap.appendChild(btn); wrap.appendChild(menu);

  function paint() {
    bf.src = flag(cur[2]); bn.textContent = cur[2].toUpperCase();
    btn.setAttribute("aria-label", "Language: " + cur[1]); btn.title = "Choose language";
    Array.prototype.forEach.call(menu.querySelectorAll("button"), function (b) { b.setAttribute("aria-selected", b.getAttribute("data-id") === cur[0] ? "true" : "false"); });
  }
  function toggle(on) {
    menu.classList.toggle("on", on); btn.setAttribute("aria-expanded", on ? "true" : "false");
    if (on) { var s = menu.querySelector("[aria-selected=true]"); if (s) { s.focus(); if (s.scrollIntoView) s.scrollIntoView({ block: "nearest" }); } }
  }
  function choose(item) {
    var was = cur[3]; cur = item; ls(PKEY, item[0]);
    if (item[3] === "en") document.documentElement.lang = item[0];
    window.dispatchEvent(new CustomEvent("ah-lang", { detail: { lang: CHAT[item[3]] ? item[3] : "en", region: item[0] } }));
    if (item[3] === "en") { setCookie(""); if (was !== "en") { location.reload(); return; } } else translate(item[3]);
    paint();
  }
  var group = "";
  ITEMS.forEach(function (it) {
    if (it[4] !== group) { group = it[4]; var h = document.createElement("div"); h.className = "ahl-h"; h.textContent = group; menu.appendChild(h); }
    var b = document.createElement("button"), im = document.createElement("img"), sp = document.createElement("span");
    b.type = "button"; b.setAttribute("role", "option"); b.setAttribute("data-id", it[0]);
    im.className = "ahl-fl"; im.alt = ""; im.loading = "lazy"; im.src = flag(it[2]);
    sp.textContent = it[1]; b.appendChild(im); b.appendChild(sp);
    b.onclick = function () { toggle(false); choose(it); btn.focus(); };
    menu.appendChild(b);
  });
  btn.onclick = function (e) { e.stopPropagation(); toggle(!menu.classList.contains("on")); };
  document.addEventListener("click", function (e) { if (!wrap.contains(e.target)) toggle(false); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && menu.classList.contains("on")) { toggle(false); btn.focus(); } });

  function mount() {
    var host = document.querySelector("#topbar .top-right"), slot = document.getElementById("ah-lang-slot");
    if (slot && slot.parentNode) slot.parentNode.replaceChild(wrap, slot);   /* same size as the reserved slot: no layout shift */
    else if (host) host.insertBefore(wrap, host.firstChild); else { wrap.style.cssText = "position:fixed;top:6px;right:12px;z-index:100001"; document.body.appendChild(wrap); }
    paint();
    if (cur[3] !== "en") translate(cur[3]);            // keep the page translated on later visits (only after a manual choice)
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
})();
