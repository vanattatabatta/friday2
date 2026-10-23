/* "Unlock" button (any element with data-doc-upload): a visitor who is not logged in is asked to log in or sign up first
   (a small dialog), then lands on the upload page /doc/upload. A member goes straight to the upload page.
   window.AHDocs.save/peek/clear keep chosen files in IndexedDB so they survive a login. */
(function () {
  var DB = "ah-docs", ST = "pending";
  var ACCEPT = ".pdf,.docx,.xlsx,.xls,.csv,.txt,.md,image/*";
  function open() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open(DB, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore(ST); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function tx(mode, fn) {
    return open().then(function (db) {
      return new Promise(function (res, rej) {
        var t = db.transaction(ST, mode), out = fn(t.objectStore(ST));
        t.oncomplete = function () { res(out && out.result); };
        t.onerror = function () { rej(t.error); };
      });
    });
  }
  window.AHDocs = {
    save: function (files) { return tx("readwrite", function (s) { return s.put(files, "files"); }); },
    peek: function () { return tx("readonly", function (s) { return s.get("files"); }).then(function (v) { return v || []; }); },
    clear: function () { return tx("readwrite", function (s) { return s.delete("files"); }); }
  };
  var NEXT = "/doc/upload";
  function css() {
    if (document.getElementById("ug-css")) return;
    var st = document.createElement("style"); st.id = "ug-css";
    st.textContent = ".ug{position:fixed;inset:0;z-index:100002;display:grid;place-items:center;padding:16px;background:rgba(8,15,35,.55);backdrop-filter:blur(3px);animation:ugf .2s ease}"
      + ".ug-c{position:relative;width:min(420px,100%);background:#fff;border-radius:22px;padding:30px 26px 24px;box-shadow:0 30px 80px rgba(0,0,0,.35);text-align:center;font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0b1220;animation:ugu .28s cubic-bezier(.2,.8,.2,1)}"
      + ".ug-ic{width:64px;height:64px;margin:0 auto 14px;border-radius:20px;display:grid;place-items:center;color:#fff;background:linear-gradient(135deg,#e11d74,#f97316);box-shadow:0 10px 24px #e11d7440}"
      + ".ug-c h2{margin:0 0 6px;font-size:21px;line-height:1.25}.ug-c p{margin:0 0 18px;color:#5b6575;font-size:14.5px}"
      + ".ug-b{display:flex;flex-direction:column;gap:10px}.ug-b a{display:block;padding:13px 16px;border-radius:12px;font-weight:700;text-decoration:none;font-size:15px;transition:transform .15s}.ug-b a:hover{transform:translateY(-2px)}"
      + ".ug-b .p{background:linear-gradient(135deg,#0f766e,#14b8a6);color:#fff;box-shadow:0 8px 20px #0f766e40}.ug-b .s{background:#eef1f5;color:#0b1220}"
      + ".ug-x{position:absolute;right:12px;top:12px;width:34px;height:34px;border:0;border-radius:50%;background:#f1f4f8;font-size:20px;cursor:pointer;color:#5b6575}.ug-x:hover{background:#e4e9f0}"
      + ".ug-n{margin-top:14px;font-size:12.5px;color:#8a94a6}@keyframes ugf{from{opacity:0}}@keyframes ugu{from{opacity:0;transform:translateY(14px) scale(.97)}}@media(prefers-reduced-motion:reduce){.ug,.ug-c{animation:none}}";
    document.head.appendChild(st);
  }
  function ask() {
    css();
    var q = "?next=" + encodeURIComponent(NEXT), ov = document.createElement("div"); ov.className = "ug";
    ov.innerHTML = '<div class="ug-c" role="dialog" aria-modal="true" aria-labelledby="ug-t"><button type="button" class="ug-x" aria-label="Close">&times;</button>'
      + '<div class="ug-ic"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg></div>'
      + '<h2 id="ug-t">Log in or sign up to unlock</h2><p>Create a free account (or log in) and you can upload your documents and earn free unlocks.</p>'
      + '<div class="ug-b"><a class="p" href="/login' + q + '">Log in</a><a class="s" href="/signup' + q + '">Create a free account</a></div><div class="ug-n">You will come straight back to the upload page.</div></div>';
    var close = function () { ov.remove(); document.removeEventListener("keydown", key); };
    var key = function (e) { if (e.key === "Escape") close(); };
    ov.addEventListener("mousedown", function (e) { if (e.target === ov) close(); });
    ov.querySelector(".ug-x").onclick = close; document.addEventListener("keydown", key);
    document.body.appendChild(ov); ov.querySelector(".p").focus();
  }
  function gate() {
    return fetch("/api/account/me", { credentials: "same-origin" }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && d.user) location.href = NEXT; else ask(); }, ask);
  }
  window.AHDocs.gate = gate;
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("[data-doc-upload]");
    if (!a) return;
    e.preventDefault();
    var m = document.getElementById("navmenu"); if (m) m.classList.remove("show");
    gate();
  });
})();

/* resume background document uploads that were started on another page */
try { if (!window.AHUp && localStorage.getItem("ah_upq")) { var ahu = document.createElement("script"); ahu.src = "/js/upload-manager.js?v=1"; document.head.appendChild(ahu); } } catch (e) {}
