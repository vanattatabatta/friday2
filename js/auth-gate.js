/* Login gate for Ask AI, AI Detector, CiteMe and every tool.

   A visitor who is not logged in is sent to /login?next=<page they wanted>. After logging in (or signing up) the
   login/sign-up page sends them straight back to that page (see safeNext() in account.js).

   - Tool pages (/ask-ai, /ai-detector, /citation-generator, /tools/...): sent to log in as soon as the page opens.
   - Links and buttons anywhere on the site (header, hero chat bar, mobile bar, footer): intercepted on click, so the
     visitor goes to log in without loading the tool first. Overlay buttons on the home page come back to the page
     they were on.
   - Any tool API that answers "401 / needsLogin" (an expired session) also sends the visitor to log in.
   - The server enforces the same rule on the APIs, so this script is only the friendly front door.

   The ah_in cookie (set at login, readable by JS, carries no secret) is the quick "probably logged in" hint; the
   session itself is checked with /api/account/me. Search-engine crawlers are not redirected, so tool pages stay indexable. */
(function () {
  "use strict";
  if (window.__ahGate) return;
  window.__ahGate = 1;

  var TOOL_PATH = /^\/(?:ask-ai|ask|ai-detector|citation-generator|citegenie|tools(?:\/[^?#]*)?)\/?$/i;
  var TOOL_API = /\/api\/(?:chat\/?(?:\?|$)|aicheck|citation-generator|tools\/(?!access))/i;
  var DRAFT = "ah_gate_draft";

  /* click targets that open a tool without being a link (home page overlays and chat bar) */
  var BUTTONS = [
    { sel: ".top-ask,.tb-ask,[data-ask-ai]", tool: "ask" },
    { sel: "#aiChkOpen,[data-ai-detector],[data-ai-checker]", tool: "detector" },
    { sel: "#ah-cb-send,#ah-cb-attach,#ah-cb-mic,.ah-cb-quick button,#ah-cb-menu button", tool: "ask" }
  ];
  var TOOL_OF_PATH = [[/^\/(?:ask-ai|ask)/i, "ask"], [/^\/(?:ai-detector|tools\/ai-detector)/i, "detector"], [/^\/(?:citation-generator|citegenie)/i, "cite"], [/^\/tools/i, "tools"]];

  function loggedHint() { return /(?:^|;\s*)ah_in=1(?:;|$)/.test(document.cookie); }
  function here() { return location.pathname + location.search; }
  function toolOf(path) { for (var i = 0; i < TOOL_OF_PATH.length; i++) if (TOOL_OF_PATH[i][0].test(path)) return TOOL_OF_PATH[i][1]; return ""; }
  function loginUrl(next, tool) {
    return "/login?next=" + encodeURIComponent(next || "/") + (tool ? "&tool=" + tool : "");
  }
  function toLogin(next, tool) {
    if (/^\/(?:login|signup)/i.test(location.pathname)) return;
    location.assign(loginUrl(next || here(), tool || toolOf(location.pathname)));
  }
  var isBot = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|lighthouse|headless/i.test(navigator.userAgent || "");

  /* ---- 1. a tool page opened by someone who is not logged in ---- */
  if (TOOL_PATH.test(location.pathname) && !isBot) {
    if (!loggedHint()) toLogin(here());                       // no session cookie: leave before anything is shown
    else fetch("/api/account/me", { credentials: "same-origin" }).then(function (r) {
      if (r.status === 401) toLogin(here());                  // the cookie was stale
    }).catch(function () { /* offline: the server still refuses the tool APIs */ });
  }

  /* ---- 2. clicks on links and buttons that open a tool ---- */
  function plain(e) { return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey; }
  document.addEventListener("click", function (e) {
    if (loggedHint() || !e.target || !e.target.closest) return;
    var a = e.target.closest("a[href]");
    if (a && plain(e)) {
      var u; try { u = new URL(a.getAttribute("href"), location.href); } catch (x) { u = null; }
      if (u && u.origin === location.origin && TOOL_PATH.test(u.pathname)) {
        e.preventDefault(); e.stopImmediatePropagation();
        toLogin(u.pathname + u.search, toolOf(u.pathname));
        return;
      }
    }
    for (var i = 0; i < BUTTONS.length; i++) {
      if (e.target.closest(BUTTONS[i].sel)) {
        e.preventDefault(); e.stopImmediatePropagation();
        saveDraft();
        toLogin(here(), BUTTONS[i].tool);
        return;
      }
    }
  }, true);

  /* the hero chat bar: pressing Enter or submitting asks a question, which needs an account */
  document.addEventListener("keydown", function (e) {
    if (loggedHint() || e.key !== "Enter" || e.shiftKey || !e.target || e.target.id !== "ah-cb-input") return;
    e.preventDefault(); e.stopImmediatePropagation(); saveDraft(); toLogin(here(), "ask");
  }, true);
  document.addEventListener("submit", function (e) {
    if (loggedHint() || !e.target || e.target.id !== "ah-cb-form") return;
    e.preventDefault(); e.stopImmediatePropagation(); saveDraft(); toLogin(here(), "ask");
  }, true);

  /* what was typed in the chat bar survives the trip to the login page */
  function saveDraft() {
    var t = document.getElementById("ah-cb-input");
    try { if (t && t.value.trim()) sessionStorage.setItem(DRAFT, t.value.slice(0, 2000)); } catch (x) { /* private mode */ }
  }
  function restoreDraft() {
    var t = document.getElementById("ah-cb-input"), v = null;
    try { v = sessionStorage.getItem(DRAFT); } catch (x) { /* ignore */ }
    if (!t || !v || t.value) return;
    t.value = v; try { sessionStorage.removeItem(DRAFT); } catch (x) { /* ignore */ }
    t.dispatchEvent(new Event("input", { bubbles: true }));
  }
  if (loggedHint()) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", restoreDraft); else restoreDraft();
  }

  /* ---- 3. a tool API that says "log in" (expired session): go to log in, then come back here ---- */
  var nativeFetch = window.fetch;
  if (nativeFetch) window.fetch = function (input) {
    var url = typeof input === "string" ? input : (input && input.url) || "";
    return nativeFetch.apply(this, arguments).then(function (r) {
      if (r.status === 401 && TOOL_API.test(url)) {
        r.clone().json().then(function (d) { if (d && d.needsLogin) toLogin(here()); }).catch(function () { /* not JSON */ });
      }
      return r;
    });
  };

  window.AHGate = { loginUrl: loginUrl, toLogin: toLogin, loggedIn: loggedHint };
})();
