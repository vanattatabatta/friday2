/* Lets the site work when index.html is opened straight from disk (file://...).
   The pages call relative URLs like "/api/livechat"; on file:// those would point at the disk, so they are sent
   to your local server instead (default http://localhost:3000, start it with "npm start" in /backend).
   Another port: set window.AH_API_BASE = "http://localhost:4000" before this script, or
   localStorage.setItem("ah_api_base", "http://localhost:4000") once. Does nothing on http(s). */
(function () {
  if (location.protocol !== "file:") return;
  var BASE;
  try { BASE = window.AH_API_BASE || localStorage.getItem("ah_api_base"); } catch (e) {}
  BASE = String(BASE || "http://localhost:3000").replace(/\/+$/, "");
  function fix(u) { return typeof u === "string" && /^\/api(\/|\?|$)/.test(u) ? BASE + u : u; }

  var _fetch = window.fetch;
  if (_fetch) window.fetch = function (u, o) {
    if (u && typeof u === "object" && u.url && /^file:\/\/\/api(\/|\?|$)/.test(u.url)) u = new Request(BASE + u.url.slice(7), u);
    return _fetch.call(this, fix(u), o);
  };

  if (window.EventSource) {
    var ES = window.EventSource;
    var NES = function (u, c) { return new ES(fix(u), c); };
    NES.prototype = ES.prototype; NES.CONNECTING = 0; NES.OPEN = 1; NES.CLOSED = 2;
    window.EventSource = NES;
  }

  var open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (m, u) { var a = [].slice.call(arguments); a[1] = fix(u); return open.apply(this, a); };

  if (navigator.sendBeacon) {
    var sb = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (u, d) { return sb(fix(u), d); };
  }
})();
