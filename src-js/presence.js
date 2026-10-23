/* Tells the server "this visitor is on the site" so the support console can show who is online.
 * Sends a tiny heartbeat every 20s while the tab is visible and a "left" beacon on close.
 * Only an anonymous random id, the page path and the connection's IP (seen by the server) are involved. */
(function () {
  "use strict";
  var K = "ah_vid", vid = "", URL = "/api/livechat/presence";
  try { vid = localStorage.getItem(K) || ""; } catch (e) {}
  if (!/^[A-Za-z0-9]{8,40}$/.test(vid)) {
    vid = (window.crypto && crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "") : Math.random().toString(36).slice(2) + Date.now().toString(36)).slice(0, 32);
    try { localStorage.setItem(K, vid); } catch (e) {}
  }
  window.AH_VID = vid;
  var T0 = "";
  function pageTitle() {
    var t = (document.title || "").trim();
    if (t && t.indexOf("\uD83D\uDCAC") !== 0) T0 = t;   /* ignore the flashing "new message" title of the chat box */
    return T0;
  }
  window.AH_PAGE = function () { return { page_url: location.href.replace(/#.*$/, ""), page_title: pageTitle() }; };
  function body() { return JSON.stringify({ vid: vid, page: location.pathname, href: location.href.replace(/#.*$/, ""), title: pageTitle() }); }
  function beat() {
    if (document.visibilityState === "hidden") return;
    try { fetch(URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: body(), keepalive: true }).catch(function () {}); } catch (e) {}
  }
  beat();
  setInterval(beat, 20000);
  document.addEventListener("visibilitychange", beat);
  window.addEventListener("pagehide", function () {
    try { navigator.sendBeacon && navigator.sendBeacon(URL + "/leave", new Blob([body()], { type: "application/json" })); } catch (e) {}
  });
})();
