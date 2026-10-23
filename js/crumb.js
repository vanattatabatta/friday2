/* Breadcrumb inside the content box (Home / page). Used by the Doc Library (library, categories, upload, document pages), the tool pages and the Citation Generator.
   Load it at the END of the page. It builds the trail from the URL, sits at the top of the content (.wrap, or just above #app on the Doc Library),
   and keeps the last item in step with the page title when the page script changes it. */
(function () {
  if (window.__ahBc) return; window.__ahBc = 1;
  var path = location.pathname.replace(/\/+$/, "") || "/", parts = path.split("/").filter(Boolean);
  var CATS = { school: "School", solutions: "Textbook Solutions", literature: "Literature Title", guides: "Study Guides" };
  var trail = null;   /* [[label, href]]; a null label = take it from the page */
  if (parts[0] === "docs") trail = parts.length === 1 ? [["Doc Library", "/doc"]] : parts[1] === "upload" ? [["Doc Library", "/doc"], ["Upload to Unlock", path]] : CATS[parts[1]] ? [["Doc Library", "/doc"], [CATS[parts[1]], path]] : null;
  else if (parts[0] === "doc" && parts[1]) trail = [["Doc Library", "/doc"], [null, path]];
  else if (parts[0] === "tools" && parts[1]) trail = [[null, path]];
  else if (parts[0] === "citation-generator") trail = [["Citation Generator", path]];
  if (!trail) return;
  var esc = function (t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var st = document.createElement("style");
  st.textContent = '.ah-bc{display:flex;align-items:center;gap:12px;margin:0 0 18px;font:500 15px/1.4 Poppins,Inter,system-ui,sans-serif}.ah-bc-ic{flex:none;width:32px;height:32px;border-radius:10px;display:grid;place-items:center;color:#fff!important;text-decoration:none!important;background:linear-gradient(135deg,var(--blue,#2563eb),var(--blue2,#7c3aed));box-shadow:0 6px 16px rgba(15,118,110,.25);transition:transform .2s,box-shadow .2s}.ah-bc-ic:hover{transform:translateY(-2px) scale(1.05)}.ah-bc ol{list-style:none;display:flex;flex-wrap:wrap;align-items:center;gap:2px 10px;margin:0;padding:5px 12px;min-width:0;flex:1;background:#fff;border:1px solid #e1e8f0;border-radius:12px;box-shadow:0 1px 4px #0000000a}.ah-bc li{display:inline-flex;align-items:center;gap:10px;min-width:0;margin:0}.ah-bc li+li:before{content:"/";color:#94a3b8}.ah-bc a{text-decoration:none;color:#337ab7}.ah-bc a:hover{text-decoration:underline}.ah-bc li:last-child a,.ah-bc li:last-child span{color:#6b7280;overflow-wrap:anywhere}@media(max-width:575px){.ah-bc{gap:8px;font-size:14px}.ah-bc-ic{width:30px;height:30px}.ah-bc ol{padding:4px 10px}}.ah-bc-wrap{max-width:1280px;margin:0 auto;padding:18px 28px 0;box-sizing:border-box}@media(max-width:900px){.ah-bc-wrap{padding:14px 16px 0}}.wrap>.ah-bc{margin-bottom:20px}';
  document.head.appendChild(st);
  function pageName() {
    var h = document.getElementById("h1") || document.querySelector(".wrap h1") || document.querySelector("h1");
    var t = (h && h.textContent.trim()) || document.title.split(" | ")[0].trim();
    return t || "Page";
  }
  function build() {
    var last = trail.length - 1;
    return '<ol><li><a class="ah-bc-ic" href="/" aria-label="Home" title="Home"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg></a></li>' + trail.map(function (t, i) {
      var lab = t[0] === null ? pageName() : t[0];
      return '<li><a href="' + esc(t[1]) + '"' + (i === last ? ' aria-current="page"' : "") + (t[0] === null ? ' data-bc-title' : "") + '>' + esc(lab) + '</a></li>';
    }).join("") + '</ol>';
  }
  var nav = document.createElement("nav"); nav.className = "ah-bc"; nav.id = "ah-bc"; nav.setAttribute("aria-label", "Breadcrumb"); nav.innerHTML = build();
  var wrap = document.querySelector(".wrap"), app = document.getElementById("app");
  if (wrap) wrap.insertBefore(nav, wrap.firstChild);
  else if (app && app.parentNode) { var box = document.createElement("div"); box.className = "ah-bc-wrap"; box.appendChild(nav); app.parentNode.insertBefore(box, app); }
  else return;
  function sync() { var a = nav.querySelector("[data-bc-title]"); if (a) { var n = pageName(); if (a.textContent !== n) a.textContent = n; } }
  var tt = document.querySelector("title"); if (tt && window.MutationObserver) new MutationObserver(sync).observe(tt, { childList: true, characterData: true, subtree: true });
  var h1 = document.getElementById("h1"); if (h1 && window.MutationObserver) new MutationObserver(sync).observe(h1, { childList: true, characterData: true, subtree: true });
  document.addEventListener("DOMContentLoaded", sync); setTimeout(sync, 1200);
})();
