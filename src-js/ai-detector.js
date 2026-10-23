/* AI Detector. The navbar "AI Detector" box opens this panel.
 * Detector tab: paste text -> POST /api/aicheck -> overall "% AI GPT" + sentence highlighting (ZeroGPT-style layout).
 * Rewriting to read human is handled by the "Hire AI to Human Expert" link to /ai-to-human-expert. */
(function () {
  "use strict";
  var MIN = 20, API = "/api/aicheck", MAXC = 25000;
  var css = [
    "#aic-ov{position:fixed;inset:0;z-index:100001;display:none;align-items:center;justify-content:center;padding:14px;background:rgba(8,15,35,.62);backdrop-filter:blur(3px)}#aic-ov.on{display:flex}",
    "#aic{width:min(1040px,100%);max-height:calc(100vh - 28px);display:flex;flex-direction:column;background:#fff;border-radius:18px;box-shadow:0 30px 80px rgba(0,0,0,.4);overflow:hidden;font:14px/1.5 Poppins,Arial,sans-serif;color:#1e293b}#aic *{box-sizing:border-box}",
    "#aic .h{display:flex;align-items:center;gap:12px;padding:12px 16px;background:linear-gradient(135deg,#0b1b3a,#312e81);color:#fff}#aic .h>div{flex:1;min-width:0}#aic .h b{display:block;font-size:17px;line-height:1.2}#aic .h small{opacity:.75;font-size:12px}",
    "#aic .x{border:0;background:rgba(255,255,255,.15);color:#fff;width:34px;height:34px;border-radius:10px;font-size:20px;cursor:pointer;line-height:1}#aic .x:hover{background:rgba(255,255,255,.28)}",
    "#aic .tabs{display:flex;gap:6px;padding:10px 16px 0;border-bottom:1px solid #e2e8f0;background:#f8fafc}#aic .tabs button{border:0;background:none;padding:10px 16px;border-radius:10px 10px 0 0;font:600 13.5px Poppins,Arial,sans-serif;color:#64748b;cursor:pointer;border-bottom:3px solid transparent}#aic .tabs button.on{color:#4338ca;background:#fff;border-bottom-color:#4f46e5}",
    "#aic .b{padding:16px;overflow:auto;flex:1;min-height:0}#aic .pane{display:none}#aic .pane.on{display:block}",
    "#aic textarea{width:100%;height:min(75px,10vh);resize:vertical;padding:14px;border:1.5px solid #cbd5e1;border-radius:12px;font:14px/1.6 Poppins,Arial,sans-serif;color:#0f172a;outline:none}#aic textarea:focus{border-color:#4f46e5;box-shadow:0 0 0 4px rgba(79,70,229,.12)}",
    "#aic .bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:12px}#aic .bar .cnt{flex:1;color:#64748b;font-size:12.5px;min-width:140px}#aic .bar .cnt.ok{color:#16a34a}",
    "#aic .btn{border:0;border-radius:10px;padding:11px 24px;font:700 13.5px Poppins,Arial,sans-serif;cursor:pointer;color:#fff;background:#4f46e5;box-shadow:0 6px 16px rgba(79,70,229,.28)}#aic .btn:hover{background:#4338ca}#aic .btn:disabled{opacity:.5;cursor:not-allowed;box-shadow:none}#aic .btn.g{background:#eef2ff;color:#3730a3;box-shadow:none}#aic .btn.sm{padding:7px 14px;font-size:12.5px}#aic a.btn{display:inline-block;text-decoration:none;text-align:center;line-height:1.5;color:#fff}#aic a.btn:visited{color:#fff}",
    "#aic .err{color:#dc2626;font-size:13px;margin-top:10px;min-height:18px}",
    /* detector result, ZeroGPT style: highlighted text on the left, score card on the right */
    "#aic .rep{display:none;grid-template-columns:1fr 280px;gap:16px}#aic .pane.res .rep{display:grid}#aic .pane.res .inp{display:none}",
    "#aic .tx{max-height:min(440px,52vh);overflow:auto;padding:14px 16px;border:1px solid #e2e8f0;border-radius:12px;background:#fff;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.85}#aic .tx span{border-radius:3px;padding:1px 0;background:#fde047;cursor:default}#aic .tx span.l{background:#fef08a}",
    "#aic .hl{margin-top:8px;font-size:12.5px;color:#475569}#aic .hl i{display:inline-block;width:14px;height:10px;border-radius:3px;background:#fde047;margin-right:6px}",
    "#aic .sc{text-align:center;padding:18px 14px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;align-self:start}",
    "#aic .ov{font-size:12.5px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px}#aic .pct{font-size:54px;line-height:1.1;font-weight:800;margin:4px 0 0}#aic .pct.ai{color:#dc2626}#aic .pct.mx{color:#d97706}#aic .pct.hu{color:#16a34a}#aic .pl{font-weight:700;font-size:15px}",
    "#aic .meter{height:10px;border-radius:99px;background:#bbf7d0;margin:12px 0;overflow:hidden}#aic .meter i{display:block;height:100%;width:0;background:#ef4444;transition:width 1s cubic-bezier(.2,.8,.2,1)}",
    "#aic .fb{font-size:14px;font-weight:700;margin:10px 0 4px}#aic .stats{display:flex;justify-content:space-between;gap:8px;margin-top:12px;font-size:12px;color:#475569}#aic .stats div{flex:1;background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:6px}#aic .stats b{display:block;font-size:15px;color:#0f172a}",
    "#aic .acts{display:grid;gap:8px;margin-top:14px}#aic .btn.hm{background:#16a34a;box-shadow:0 6px 16px rgba(22,163,74,.28)}#aic .btn.hm:hover{background:#15803d}",
    "#aic .note{margin-top:14px;padding:10px 12px;border-radius:10px;background:#fffbeb;border:1px solid #fde68a;color:#92400e;font-size:12px}",
    /* humanizer */
    "#aic .opts{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px}#aic .opts label{display:flex;flex-direction:column;gap:3px;font-size:11.5px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.4px;flex:1;min-width:150px}#aic .opts select{padding:9px 10px;border:1.5px solid #cbd5e1;border-radius:10px;background:#fff;font:600 13px Poppins,Arial,sans-serif;color:#1e293b;text-transform:none;letter-spacing:0}",
    "#aic .hg{display:grid;grid-template-columns:1fr 1fr;gap:16px}#aic .hg h4{margin:0 0 6px;font-size:13px;color:#334155}#aic .hg textarea{height:min(82px,10.5vh)}#aic .out{width:100%;height:min(82px,10.5vh);overflow:auto;padding:14px;border:1.5px solid #bbf7d0;border-radius:12px;background:#f0fdf4;white-space:pre-wrap;overflow-wrap:anywhere;font:14px/1.6 Poppins,Arial,sans-serif;color:#0f172a}#aic .out.empty{color:#94a3b8;background:#f8fafc;border-color:#e2e8f0}",
    "#aic .hres{display:none;margin-top:12px;gap:10px;flex-wrap:wrap;align-items:center;font-size:13px}#aic .hres.on{display:flex}#aic .chip{padding:6px 12px;border-radius:99px;background:#eef2ff;color:#3730a3;font-weight:700}#aic .chip.ok{background:#dcfce7;color:#166534}#aic .warn{flex-basis:100%;color:#92400e;font-size:12px}",
    "#aic .hx{background:#fde047;border-radius:3px;padding:1px 0}#aic .blr{filter:blur(3px);user-select:none;pointer-events:none;-webkit-user-select:none}",
    "#aic .hin{width:100%;height:min(82px,10.5vh);overflow:auto;padding:14px;border:1.5px solid #cbd5e1;border-radius:12px;background:#fff;white-space:pre-wrap;overflow-wrap:anywhere;font:14px/1.6 Poppins,Arial,sans-serif;color:#0f172a;cursor:text}#aic .hin[hidden]{display:none}",
    "#aic .ow{position:relative}#aic .ow .out{height:min(82px,10.5vh)}#aic .ul{position:absolute;left:0;right:0;bottom:22px;display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none}#aic .ul>*{pointer-events:auto}#aic .ul .tip{background:#fff;border-radius:10px;padding:8px 14px;font-size:13px;color:#334155;box-shadow:0 6px 20px rgba(15,23,42,.18)}#aic .ul .btn{background:#1d4ed8;border-radius:99px;padding:13px 26px;box-shadow:0 8px 22px rgba(29,78,216,.4)}#aic .ul .btn:hover{background:#1e40af}",
    "#aic .q{font-size:12.5px;font-weight:700;color:#166534;background:#dcfce7;border-radius:99px;padding:5px 12px}#aic .q.off{color:#9a3412;background:#ffedd5}#aic .eh{font-size:12px;color:#4338ca;cursor:pointer;background:none;border:0;padding:0;font-weight:600;text-decoration:underline}",
    "#aic .up{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 10px;padding:10px 12px;border:1.5px dashed #a5b4fc;border-radius:12px;background:#f5f7ff}#aic .up.drag{background:#e0e7ff;border-color:#4f46e5}#aic .up .btn{padding:8px 16px;font-size:13px;box-shadow:none}#aic .up span{color:#475569;font-size:12.5px;flex:1;min-width:160px}#aic .up .fn{color:#4338ca;font-weight:700}#aic .up input{display:none}#aic .hg .up{margin-bottom:8px}#aic .btn.cv{background:#16a34a;box-shadow:0 6px 16px rgba(22,163,74,.28)}#aic .btn.cv:hover{background:#15803d}",
    "@media(max-width:820px){#aic .rep,#aic .hg{grid-template-columns:1fr}#aic .sc{order:-1}}"
  ].join("");
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  var ov = document.createElement("div"); ov.id = "aic-ov";
  ov.innerHTML =
    '<div id="aic" role="dialog" aria-modal="true" aria-label="AI detector">' +
    '<div class="h"><div><b>AI Detector</b><small>Check how much of a text reads as AI-written</small></div><button class="x" type="button" aria-label="Close">&times;</button></div>' +
    '<div class="b">' +
    /* detector pane */
    '<div class="pane on" id="aic-pd">' +
    '<div class="inp"><div class="up" id="aic-u1"><button class="btn" type="button" data-pick="1">Upload file</button><input type="file" id="aic-f1" accept=".txt,.md,.docx,.pdf"><span id="aic-n1">or drop a .txt, .docx or .pdf file here, or paste your text below.</span></div><textarea id="aic-t" placeholder="Paste or write your text here (at least ' + MIN + ' words)..." maxlength="' + MAXC + '"></textarea>' +
    '<div class="bar"><span class="cnt" id="aic-c">0 words</span><a class="btn cv" id="aic-cv" href="/ai-to-human-expert" title="Have a human expert rewrite your AI text">Hire AI to Human Expert</a><button class="btn g" id="aic-clr" type="button">Clear</button><button class="btn" id="aic-go" type="button" disabled>Detect Text</button></div><div class="err" id="aic-e"></div></div>' +
    '<div class="rep"><div><div class="tx" id="aic-x"></div><div class="hl"><i></i>Highlighted sentences are suspected to be AI-generated.</div></div>' +
    '<div class="sc"><div class="ov">Overall AI score</div><div class="pct" id="aic-p">0%</div><div class="pl">AI GPT*</div><div class="meter"><i id="aic-m"></i></div>' +
    '<div class="fb" id="aic-fb"></div><div class="stats"><div><b id="aic-w">0</b>Words</div><div><b id="aic-ch">0</b>Characters</div><div><b id="aic-f">0</b>AI sentences</div></div>' +
    '<div class="acts"><a class="btn hm" id="aic-tohuman" href="/ai-to-human-expert" title="Have a human expert rewrite your AI text">Hire AI to Human Expert</a><button class="btn g" id="aic-again" type="button">Check another text</button></div></div></div>' +
    '</div>' +
    '<div class="note">Detection is a statistical estimate, not proof: formal or non-native human writing can be flagged and edited AI text can pass. A human expert can rewrite your text, but no one can guarantee any other detector\'s verdict. Always check facts, quotes and citations in the result, and follow your school\'s or employer\'s rules on AI use.</div>' +
    '</div></div>';
  /* Page mode (/tools/ai-detector): the tool is drawn inside the page, not as a dialog. */
  var pageHost = document.getElementById("aic-page");
  if (pageHost) {
    ov.className = "page on";
    var pcss = document.createElement("style");
    pcss.textContent = "#aic-ov.page{position:static;display:block;padding:0;background:none;backdrop-filter:none;z-index:auto}#aic-ov.page #aic{width:100%;max-height:none;border-radius:20px;box-shadow:0 18px 50px rgba(11,18,32,.14);border:1px solid #e2e8f0}#aic-ov.page .x{display:none}#aic-ov.page .b{overflow:visible}#aic-ov.page textarea{height:min(85px,12.5vh)}";
    document.head.appendChild(pcss);
    pageHost.appendChild(ov);
  } else document.body.appendChild(ov);

  var $ = function (id) { return document.getElementById(id); }, t = $("aic-t"), go = $("aic-go");
  var lastFocus = null;
  function words(s) { return (s.match(/[A-Za-z0-9\u00C0-\u024F][A-Za-z0-9\u00C0-\u024F'\u2019-]*/g) || []).length; }
  function plural(n, w) { return n + " " + w + (n === 1 ? "" : "s"); }
  function count() {
    var n = words(t.value), c = $("aic-c"); c.textContent = plural(n, "word") + (n < MIN ? " (minimum " + MIN + ")" : ""); c.className = "cnt" + (n >= MIN ? " ok" : ""); go.disabled = n < MIN;
  }
  function open() { lastFocus = document.activeElement; ov.classList.add("on"); if (!pageHost) document.body.style.overflow = "hidden"; setTimeout(function () { t.focus(); }, 20); }
  function close() { ov.classList.remove("on"); document.body.style.overflow = ""; if (lastFocus && lastFocus.focus) lastFocus.focus(); }
  function reset() { $("aic-pd").classList.remove("res"); $("aic-m").style.width = "0"; t.focus(); }
  t.addEventListener("input", function () { $("aic-pd").classList.remove("res"); count(); });
  $("aic-clr").onclick = function () { t.value = ""; $("aic-n1").textContent = "or drop a .txt, .docx or .pdf file here, or paste your text below."; $("aic-e").textContent = ""; $("aic-pd").classList.remove("res"); count(); t.focus(); };
  $("aic-again").onclick = reset;
  ov.querySelector(".x").onclick = close;
  ov.addEventListener("mousedown", function (e) { if (e.target === ov) close(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && ov.classList.contains("on")) close(); });
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-ai-detector],[data-ai-checker],#aiChkOpen");
    if (b) {
      e.preventDefault(); var nav = document.getElementById("navmenu"); if (nav) nav.classList.remove("show");
      if (pageHost) open(); else location.href = "/tools/ai-detector";
    }
  });
  if (pageHost) open();
  function post(path, body) {
    return fetch(API + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return { success: false, message: "Something went wrong." }; }); })
      .then(function (j) { if (!j.success) throw new Error(j.message || "Something went wrong."); return j; }, function () { throw new Error("Connection problem. Please try again."); });
  }


  /* ---- upload a file (or drop one) instead of pasting ---- */
  function readFile(file, which) {
    var note = $("aic-n" + which), box = t, max = MAXC, err = $("aic-e");
    if (!file) return;
    if (!/\.(txt|md|docx|pdf)$/i.test(file.name)) { err.textContent = "Please upload a .txt, .docx or .pdf file."; return; }
    if (file.size > 10 * 1048576) { err.textContent = "That file is over 10 MB."; return; }
    err.textContent = ""; note.textContent = "Reading " + file.name + "..."; note.className = "";
    var fd = new FormData(); fd.append("file", file, file.name);
    fetch(API + "/extract", { method: "POST", body: fd })
      .then(function (r) { return r.json().catch(function () { return { success: false, message: "Couldn't read that file." }; }); })
      .then(function (j) {
        if (!j.success) throw new Error(j.message || "Couldn't read that file.");
        box.value = j.text.slice(0, max);
        $("aic-pd").classList.remove("res");
        note.innerHTML = ""; var b = document.createElement("b"); b.className = "fn"; b.textContent = file.name; note.appendChild(b);
        note.appendChild(document.createTextNode(" loaded (" + plural(words(box.value), "word") + ")" + (j.text.length > max ? ". Only the first " + max.toLocaleString() + " characters are used." : ".")));
        count();
      })
      .catch(function (e) { note.textContent = "or drop a .txt, .docx or .pdf file here."; err.textContent = e.message || "Connection problem. Please try again."; });
  }
  [["1", "aic-u1", "aic-f1"]].forEach(function (c) {
    var zone = $(c[1]), inp = $(c[2]);
    zone.querySelector("[data-pick]").onclick = function () { inp.click(); };
    inp.onchange = function () { readFile(inp.files && inp.files[0], c[0]); inp.value = ""; };
    var box = t;
    [zone, box].forEach(function (el) {
      el.addEventListener("dragover", function (e) { if (e.dataTransfer && [].indexOf.call(e.dataTransfer.types || [], "Files") >= 0) { e.preventDefault(); zone.classList.add("drag"); } });
      el.addEventListener("dragleave", function () { zone.classList.remove("drag"); });
      el.addEventListener("drop", function (e) { zone.classList.remove("drag"); var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) { e.preventDefault(); readFile(f, c[0]); } });
    });
  });
  /* "Hire AI to Human Expert" is a plain link to /ai-to-human-expert (see the #aic-cv and #aic-tohuman anchors) */

  /* ---- detector ---- */
  function render(r) {
    var x = $("aic-x"); x.textContent = "";
    r.sentences.forEach(function (s) {
      if (s.p == null || s.p < 0.5) { x.appendChild(document.createTextNode(s.t)); return; }
      var sp = document.createElement("span"); if (s.p < 0.7) sp.className = "l"; sp.title = "AI likelihood: " + Math.round(s.p * 100) + "%"; sp.textContent = s.t; x.appendChild(sp);
    });
    var ai = r.ai_percent, p = $("aic-p");
    p.className = "pct " + (ai >= 70 ? "ai" : ai >= 30 ? "mx" : "hu");
    $("aic-fb").textContent = r.feedback || r.label;
    $("aic-w").textContent = r.words; $("aic-ch").textContent = r.characters || t.value.length; $("aic-f").textContent = r.flagged;
    $("aic-pd").classList.add("res");
    var n = 0, step = Math.max(1, Math.round(ai / 30)); p.textContent = "0%";
    var iv = setInterval(function () { n = Math.min(ai, n + step); p.textContent = n + "%"; if (n >= ai) clearInterval(iv); }, 28);
    var m = $("aic-m"); m.style.width = "0"; m.parentNode.style.background = "#bbf7d0";
    requestAnimationFrame(function () { requestAnimationFrame(function () { m.style.width = ai + "%"; }); });
  }
  go.onclick = function () {
    $("aic-e").textContent = ""; go.disabled = true; go.textContent = "Detecting...";
    post("", { text: t.value }).then(render)
      .catch(function (e) { $("aic-e").textContent = e.message || "Connection problem. Please try again."; })
      .then(function () { go.textContent = "Detect Text"; count(); });
  };

  count();
})();
