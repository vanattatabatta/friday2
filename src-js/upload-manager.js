/* Background document uploads that survive a refresh or a move to another page.
   - Files chosen on the upload page are stored in IndexedDB (database "ah-upq"), so they are still there after the page is gone.
   - Each file is sent to the server in 1 MB pieces (POST /api/docs/upload/session, PUT .../:sid?offset=N, POST .../:sid/finish).
     The server keeps the pieces and, after "finish", reads the pages and saves the document by itself.
   - Every page that loads this script resumes the queue: it asks the server how many bytes already arrived and continues from there.
     Web Locks make sure only one open page uploads at a time; when that page closes, the next page takes over.
   - On pages other than /doc/upload a small progress chip shows the upload is still running.
   API (window.AHUp): add(files) -> Promise<[id]>, list() -> Promise<[item]>, subscribe(fn) -> unsubscribe, remove(id), kick()
   item = { id, name, size, state: queued|uploading|processing|done|error, pct, msg, result, error } */
(function () {
  "use strict";
  if (window.AHUp) return;

  var DB = "ah-upq", ST = "q", CH = 1048576, API = "/api/docs/upload/session", MARK = "ah_upq";
  var MEM = {};            /* fallback when IndexedDB cannot hold files (private mode): works for this page only */
  var subs = [], running = false, again = false, dbp = null;

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function mark(on) { try { if (on) localStorage.setItem(MARK, "1"); else localStorage.removeItem(MARK); } catch (e) {} }

  /* ---------- storage ---------- */
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      if (!window.indexedDB) return rej(new Error("no indexedDB"));
      var r = indexedDB.open(DB, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore(ST, { keyPath: "id" }); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
    dbp.catch(function () { dbp = null; });
    return dbp;
  }
  function tx(mode, fn) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction(ST, mode), out = fn(t.objectStore(ST));
        t.oncomplete = function () { res(out && out.result); };
        t.onerror = t.onabort = function () { rej(t.error); };
      });
    });
  }
  function put(it) {
    return tx("readwrite", function (s) { return s.put(it); }).catch(function () { MEM[it.id] = it; });
  }
  function all() {
    return tx("readonly", function (s) { return s.getAll(); }).catch(function () { return []; }).then(function (rows) {
      rows = rows || [];
      Object.keys(MEM).forEach(function (k) { if (!rows.some(function (r) { return r.id === k; })) rows.push(MEM[k]); });
      rows.sort(function (a, b) { return a.at - b.at; });
      return rows;
    });
  }
  function del(id) { delete MEM[id]; return tx("readwrite", function (s) { return s.delete(id); }).catch(function () {}); }

  var active = function (it) { return it.state === "queued" || it.state === "uploading" || it.state === "processing"; };
  function pub(it) { return { id: it.id, name: it.name, size: it.size, state: it.state, pct: it.pct || 0, msg: it.msg || "", result: it.result || null, error: it.error || "" }; }

  /* ---------- events + chip ---------- */
  function emit() {
    return all().then(function (rows) {
      var items = rows.map(pub);
      subs.slice().forEach(function (fn) { try { fn(items); } catch (e) {} });
      chip(items);
      var pending = rows.some(function (r) { return active(r) || !r.seen; });
      mark(pending);
      return items;
    });
  }
  var chipEl = null;
  function css() {
    if (document.getElementById("upq-css")) return;
    var st = document.createElement("style"); st.id = "upq-css";
    st.textContent = ".upq{position:fixed;left:14px;bottom:14px;z-index:100001;display:flex;align-items:center;gap:10px;max-width:min(340px,calc(100vw - 28px));padding:10px 12px;border-radius:14px;background:#0f172a;color:#fff;box-shadow:0 14px 34px rgba(2,6,23,.35);font:13px/1.35 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;text-decoration:none;cursor:pointer}"
      + ".upq b{display:block;font-size:13px}.upq small{display:block;opacity:.8;font-size:11.5px}.upq .bar{height:4px;margin-top:6px;border-radius:99px;background:rgba(255,255,255,.2);overflow:hidden}.upq .bar i{display:block;height:100%;background:linear-gradient(90deg,#38bdf8,#a78bfa);transition:width .3s}"
      + ".upq .ic{flex:none;width:30px;height:30px;border-radius:9px;display:grid;place-items:center;background:rgba(255,255,255,.14)}.upq.ok .ic{background:#16a34a}.upq .x{flex:none;border:0;background:none;color:#cbd5e1;font-size:18px;line-height:1;cursor:pointer;padding:0 2px}"
      + ".upq .sp{width:16px;height:16px;border-radius:50%;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;animation:upqs .8s linear infinite}@keyframes upqs{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.upq .sp{animation:none}}";
    document.head.appendChild(st);
  }
  function chip(items) {
    var onUpload = /^\/doc\/upload/.test(location.pathname);
    var act = items.filter(function (i) { return i.state === "queued" || i.state === "uploading" || i.state === "processing"; });
    var fin = items.filter(function (i) { return i.state === "done" || i.state === "error"; });
    if (onUpload || (!act.length && !fin.length)) { if (chipEl) { chipEl.remove(); chipEl = null; } return; }
    css();
    if (!chipEl) {
      chipEl = document.createElement("a"); chipEl.className = "upq"; chipEl.href = "/doc/upload"; chipEl.setAttribute("role", "status");
      document.body.appendChild(chipEl);
      chipEl.addEventListener("click", function (e) { if (e.target.closest && e.target.closest(".x")) { e.preventDefault(); e.stopPropagation(); fin.forEach(function (i) { remove(i.id); }); } });
    }
    if (act.length) {
      var pct = Math.round(act.reduce(function (a, i) { return a + (i.pct || 0); }, 0) / act.length);
      chipEl.className = "upq";
      chipEl.innerHTML = '<span class="ic"><span class="sp"></span></span><span style="min-width:0;flex:1"><b>Uploading ' + act.length + " document" + (act.length > 1 ? "s" : "") + '…</b><small>Keeps going in the background · ' + pct + '%</small><span class="bar"><i style="width:' + pct + '%"></i></span></span>';
    } else {
      var n = fin.filter(function (i) { return i.state === "done" && i.result && i.result.docs && i.result.docs.length; }).length;
      chipEl.className = "upq ok";
      chipEl.innerHTML = '<span class="ic">&#10003;</span><span style="min-width:0;flex:1"><b>' + (n ? n + " document" + (n > 1 ? "s" : "") + " uploaded" : "Upload finished") + "</b><small>Tap to see the result</small></span>" + '<button type="button" class="x" aria-label="Dismiss">&times;</button>';
    }
  }

  /* ---------- network ---------- */
  function call(method, url, body, headers) {
    var o = { method: method, credentials: "same-origin", headers: headers || {} };
    if (body !== undefined) o.body = body;
    return fetch(url, o).then(function (r) {
      return r.text().then(function (t) {
        var d = {}; try { d = t ? JSON.parse(t) : {}; } catch (e) {}
        if (!r.ok) { var er = new Error(d.message || ("HTTP " + r.status)); er.status = r.status; er.data = d; throw er; }
        return d;
      });
    });
  }
  var transient = function (e) { return !e.status || e.status >= 500 || e.status === 429 || e.status === 408; };
  async function retry(fn, tries, onWait) {
    var last;
    for (var t = 0; t < tries; t++) {
      try { return await fn(); } catch (e) {
        last = e; if (!transient(e)) throw e;
        if (onWait) onWait(t + 1);
        await sleep(Math.min(15000, 1500 * (t + 1)));
      }
    }
    throw last;
  }

  /* ---------- one file, start to finish (also used to resume) ---------- */
  async function save(it, patch) { Object.assign(it, patch); await put(it); await emit(); }
  async function finishItem(it, st) {
    var r = st.result || {};
    await save(it, { state: "done", pct: 100, result: r, blob: null, msg: "" });
  }
  async function run(it) {
    /* 1) is there a session on the server already? (we are resuming after a refresh or page change) */
    if (it.sid) {
      try {
        var st = await retry(function () { return call("GET", API + "/" + it.sid); }, 4);
        if (st.state === "done") return finishItem(it, st);
        if (st.state === "error") return save(it, { state: "error", error: st.error || "Upload failed", blob: null });
        it.sent = st.received; if (st.state === "processing") it.state = "processing";
      } catch (e) {
        if (e.status === 404) { it.sid = ""; it.sent = 0; it.state = "queued"; }   /* the server restarted: start this file again */
        else throw e;
      }
    }
    /* 2) open a session */
    if (!it.sid) {
      var s = await retry(function () { return call("POST", API, JSON.stringify({ name: it.name, size: it.size, type: it.type, title: it.title || "" }), { "Content-Type": "application/json" }); }, 5);
      it.sid = s.id; it.sent = 0; await save(it, { state: "uploading", msg: "Uploading…" });
    }
    /* 3) send the missing pieces */
    if (it.state !== "processing") {
      if (!it.blob) return save(it, { state: "error", error: "The file is no longer available. Please choose it again.", blob: null });
      var size = it.size;
      while (it.sent < size) {
        var end = Math.min(size, it.sent + CH), piece = it.blob.slice(it.sent, end);
        try {
          var j = await retry(function () { return call("PUT", API + "/" + it.sid + "?offset=" + it.sent, piece, { "Content-Type": "application/octet-stream" }); }, 6,
            function () { it.msg = "Connection lost, retrying…"; emit(); });
          it.sent = j.received;
        } catch (e) {
          if (e.status === 409 && e.data && typeof e.data.received === "number") { it.sent = e.data.received; continue; }   /* re-sync with the server */
          if (e.status === 404) { it.sid = ""; it.sent = 0; await save(it, { state: "queued" }); return run(it); }
          throw e;
        }
        it.state = "uploading"; it.pct = Math.min(85, it.sent / size * 85); it.msg = "Uploading…"; await put(it); await emit();
      }
      await retry(function () { return call("POST", API + "/" + it.sid + "/finish"); }, 5);
      await save(it, { state: "processing", pct: Math.max(85, it.pct || 85), msg: "Reading the pages & checking…" });
    }
    /* 4) the server now reads and saves the document on its own; wait for the answer */
    for (var k = 0; ; k++) {
      var p;
      try { p = await call("GET", API + "/" + it.sid); } catch (e) {
        if (e.status === 404) return save(it, { state: "error", error: "The server restarted while reading this file. Please upload it again.", blob: null });
        await sleep(3000); continue;
      }
      if (p.state === "done") return finishItem(it, p);
      if (p.state === "error") return save(it, { state: "error", error: p.error || "Upload failed", blob: null });
      await sleep(k < 10 ? 1500 : 3000);
    }
  }

  /* ---------- the loop: one open page at a time ---------- */
  async function loop() {
    var skipped = {};
    do {
      again = false;
      var items = (await all()).filter(function (i) { return active(i) && !skipped[i.id]; }), n = 0;
      var worker = async function () {
        while (n < items.length) {
          var it = items[n++];
          try { await run(it); }
          catch (e) {
            skipped[it.id] = 1;
            if (e && e.status && !transient(e)) await save(it, { state: "error", error: (e.data && e.data.message) || e.message || "Upload failed", blob: null });
            else await save(it, { state: it.sid ? "uploading" : "queued", msg: "Connection lost. Will continue when you are back online." });
          }
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      if (!again) again = (await all()).some(function (i) { return active(i) && !skipped[i.id]; });
    } while (again);
  }
  function kick() {
    if (running) { again = true; return; }
    running = true;
    var done = function () { running = false; emit(); };
    if (navigator.locks && navigator.locks.request) navigator.locks.request("ah-upload", function () { return loop(); }).then(done, done);
    else loop().then(done, done);
  }
  window.addEventListener("online", kick);

  /* ---------- public API ---------- */
  async function add(files) {
    var ids = [];
    files = Array.prototype.slice.call(files || []);
    for (var i = 0; i < files.length; i++) {
      var f = files[i], id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + i;
      await put({ id: id, name: f.name, size: f.size, type: f.type || "application/octet-stream", blob: f, sid: "", sent: 0, state: "queued", pct: 0, msg: "Waiting…", result: null, error: "", seen: false, at: Date.now() + i });
      ids.push(id);
    }
    mark(true); await emit(); kick();
    return ids;
  }
  function remove(id) { return del(id).then(emit); }
  function list() { return all().then(function (r) { return r.map(pub); }); }
  function subscribe(fn) { subs.push(fn); emit(); return function () { subs = subs.filter(function (x) { return x !== fn; }); }; }

  window.AHUp = { add: add, list: list, subscribe: subscribe, remove: remove, kick: kick };

  /* resume whatever was left unfinished by the previous page */
  function start() { all().then(function (rows) { if (rows.length) { emit(); if (rows.some(active)) kick(); } else mark(false); }); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
