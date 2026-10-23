/* "Study Resources" menu: School, Textbook Solutions, Literature, Study Guides, Flashcards and the writing tools.
   Every entry opens a page on THIS site; nothing here links to another company's service. Put <div data-study-resources></div> where the menu should appear. */
(function () {
  var I = function (p) { return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>'; };
  var ITEMS = [
    ["/doc/school", "School", I('<path d="M3 10l9-5 9 5M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18"/>')],
    ["/doc/solutions", "Textbook Solutions", I('<path d="M3 5.5C5 4.5 8 4.5 12 6.5c4-2 7-2 9-1V19c-2-1-5-1-9 1-4-2-7-2-9-1z"/><path d="M12 6.5V20"/>')],
    ["/doc/literature", "Literature Title", I('<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>')],
    ["/doc/guides", "Study Guides", I('<path d="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>')],
    ["/tools/flashcards", "Flashcards", I('<rect x="3" y="7" width="18" height="12" rx="2"/><path d="M6 4h12"/>'), "AUTO"],
    ["/tools/grammar-checker", "Grammar Checker", I('<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>'), "AUTO"],
    ["/tools/paraphraser", "Paraphraser", I('<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>'), "AUTO"],
    ["/tools/proofreader", "Proofreader", I('<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>'), "AUTO"],
    ["/tools/spell-checker", "Spell Checker", I('<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>'), "AUTO"]
  ];
  var css = '.srx{position:relative;display:inline-block}.srx-b{display:inline-flex;align-items:center;gap:6px;border:0;background:transparent;color:inherit;font:600 15px/1 system-ui,sans-serif;padding:10px 12px;border-radius:10px;cursor:pointer}.srx-b:hover,.srx.o .srx-b{background:#0f766e12}.srx-b svg{transition:transform .2s}.srx.o .srx-b svg{transform:rotate(180deg)}'
    + '.srx-m{position:absolute;right:0;top:calc(100% + 8px);min-width:310px;background:#fff;color:#0b1220;border-radius:22px;box-shadow:0 18px 50px #0b122033,0 0 0 1px #e4e7ee;padding:10px;z-index:60;opacity:0;visibility:hidden;transform:translateY(-6px) scale(.98);transform-origin:top right;transition:.18s}.srx.o .srx-m{opacity:1;visibility:visible;transform:none}'
    + '.srx-m a{white-space:nowrap;display:flex;align-items:center;gap:14px;padding:12px 16px;border-radius:12px;color:#0b1220;text-decoration:none;font:600 15.5px/1.2 system-ui,sans-serif}.srx-m a svg{color:#8a94a6;flex:none;transition:color .15s,transform .2s}.srx-m a:hover,.srx-m a:focus-visible{background:#e6f7f4;outline:0}.srx-m a:hover svg{color:#0f766e;transform:scale(1.15)}'
    + '.srx-t{margin-left:auto;font-size:10px;font-weight:800;letter-spacing:.4px;color:#047857;background:#d1fae5;border-radius:6px;padding:3px 6px}.srx-hr{height:1px;background:#e8ebf2;margin:6px 8px}'
    + '@media(max-width:640px){.srx-b span{display:none}.srx-m{right:-40px;min-width:250px}}@media(prefers-reduced-motion:reduce){.srx-m,.srx-m a svg,.srx-b svg{transition:none}}';
  function build(host) {
    if (host.__sr) return; host.__sr = 1;
    host.className = (host.className ? host.className + " " : "") + "srx";
    host.innerHTML = '<button type="button" class="srx-b" aria-haspopup="true" aria-expanded="false"><span>Study Resources</span>' + I('<path d="M6 9l6 6 6-6"/>') + '</button><div class="srx-m" role="menu">'
      + ITEMS.map(function (x) { return '<a role="menuitem" href="' + x[0] + '">' + x[2] + '<span>' + x[1] + '</span>' + (x[3] ? '<em class="srx-t" style="font-style:normal">' + x[3] + '</em>' : "") + '</a>'; }).join("")
      + '<div class="srx-hr"></div><a role="menuitem" href="/doc">' + I('<path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5"/>') + '<span>Browse all documents</span></a>'
      + '<a role="menuitem" href="/citation-generator">' + I('<path d="M4 5h16v11H8l-4 4z"/><path d="M8 9h8M8 12h5"/>') + '<span>Citation Generator</span></a></div>';
    var b = host.querySelector(".srx-b"), set = function (o) { host.classList.toggle("o", o); b.setAttribute("aria-expanded", o); };
    b.onclick = function (e) { e.stopPropagation(); set(!host.classList.contains("o")); };
    document.addEventListener("click", function (e) { if (!host.contains(e.target)) set(false); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") { set(false); } });
  }
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  [].forEach.call(document.querySelectorAll("[data-study-resources]"), build);
})();
