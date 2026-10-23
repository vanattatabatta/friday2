/* Offline country flags (inline SVG, no external requests, works on Windows where emoji flags do not render).
 *   AHFlags.has("IN")            -> true if a built-in flag exists
 *   AHFlags.svg("IN", 22, 15)    -> <svg> markup string ("" when there is no built-in flag)
 *   AHFlags.uri("in")            -> data: URI usable as <img src> ("" when there is no built-in flag)
 * Covers US, UK, Canada, Australia, New Zealand, India, every European country (+ a few extras).
 * Simplified artwork for flags with detailed emblems. Flags are 3:2. */
(function () {
  "use strict";
  var W = 30, H = 20, uid = 0;

  function r(x, y, w, h, f) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + f + '"/>'; }
  function poly(pts, f, extra) { return '<polygon points="' + pts + '" fill="' + f + '"' + (extra || "") + "/>"; }
  function circ(cx, cy, rad, f, extra) { return '<circle cx="' + cx + '" cy="' + cy + '" r="' + rad + '" fill="' + f + '"' + (extra || "") + "/>"; }
  function sum(a) { return a.reduce(function (x, y) { return x + y; }, 0); }
  function hs(cols, wts) {
    wts = wts || cols.map(function () { return 1; });
    var t = sum(wts), y = 0, o = "";
    cols.forEach(function (c, i) { var h = H * wts[i] / t; o += r(0, y, W, h + 0.03, c); y += h; });
    return o;
  }
  function vs(cols, wts) {
    wts = wts || cols.map(function () { return 1; });
    var t = sum(wts), x = 0, o = "";
    cols.forEach(function (c, i) { var w = W * wts[i] / t; o += r(x, 0, w + 0.03, H, c); x += w; });
    return o;
  }
  function star(cx, cy, R, fill, n, rot, ratio, extra) {
    n = n || 5; ratio = ratio || (n === 5 ? 0.382 : 0.5); rot = (rot == null ? -90 : rot);
    var pts = [], i, a, rad;
    for (i = 0; i < n * 2; i++) {
      a = (rot + i * 180 / n) * Math.PI / 180; rad = i % 2 ? R * ratio : R;
      pts.push((cx + rad * Math.cos(a)).toFixed(2) + "," + (cy + rad * Math.sin(a)).toFixed(2));
    }
    return poly(pts.join(" "), fill, extra);
  }
  /* Nordic cross: background + outer cross (+ optional inner cross), cross centre at x = cx. */
  function nordic(bg, outer, inner, ow, iw, cx) {
    cx = cx || 10.5; ow = ow || 4; iw = iw || 2;
    var o = r(0, 0, W, H, bg);
    o += r(cx - ow / 2, 0, ow, H, outer) + r(0, 10 - ow / 2, W, ow, outer);
    if (inner) o += r(cx - iw / 2, 0, iw, H, inner) + r(0, 10 - iw / 2, W, iw, inner);
    return o;
  }
  /* Union Jack (scaled into x,y,w,h). */
  function jack(x, y, w, h) {
    var id = "uj" + (++uid);
    return '<svg x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" viewBox="0 0 60 30" preserveAspectRatio="none">' +
      '<clipPath id="' + id + '"><path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z"/></clipPath>' +
      '<rect width="60" height="30" fill="#012169"/>' +
      '<path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" stroke-width="6"/>' +
      '<path d="M0,0 L60,30 M60,0 L0,30" clip-path="url(#' + id + ')" stroke="#c8102e" stroke-width="4"/>' +
      '<path d="M30,0 v30 M0,15 h60" stroke="#fff" stroke-width="10"/>' +
      '<path d="M30,0 v30 M0,15 h60" stroke="#c8102e" stroke-width="6"/></svg>';
  }
  function mapleLeaf(cx, cy, s, fill) {
    var half = [[0, -50], [9, -31], [16, -36], [17, -15], [35, -27], [30, -6], [47, -11], [38, 10], [43, 15], [10, 24], [10, 37], [2, 35], [2, 50]];
    var pts = half.map(function (p) { return p; });
    for (var i = half.length - 2; i >= 1; i--) pts.push([-half[i][0], half[i][1]]);
    return poly(pts.map(function (p) { return (cx + p[0] * s).toFixed(2) + "," + (cy + p[1] * s).toFixed(2); }).join(" "), fill);
  }
  function eagle(fill) {
    return '<path d="M15,6 L6,7.5 L8.5,11.5 L12,10.5 L11,16 L15,13.5 L19,16 L18,10.5 L21.5,11.5 L24,7.5 Z" fill="' + fill + '"/>' +
      circ(12.8, 5, 1.5, fill) + circ(17.2, 5, 1.5, fill);
  }
  function checker(x, y, cols, rows, s, c1, c2) {
    var o = "", i, j;
    for (i = 0; i < rows; i++) for (j = 0; j < cols; j++) o += r(x + j * s, y + i * s, s, s, (i + j) % 2 ? c2 : c1);
    return o;
  }

  var F = {
    /* ---- English-speaking ---- */
    US: function () {
      var o = "", i, j, ch = H * 7 / 13, sx = 12, sy = ch;
      for (i = 0; i < 13; i++) o += r(0, i * H / 13, W, H / 13 + 0.03, i % 2 ? "#fff" : "#b22234");
      o += r(0, 0, sx, sy, "#3c3b6e");
      for (i = 0; i < 9; i++) for (j = 0; j < (i % 2 ? 5 : 6); j++) o += circ((i % 2 ? 2 : 1) + j * 2, (i + 1) * sy / 10, 0.45, "#fff");
      return o;
    },
    GB: function () { return jack(0, 0, W, H); },
    CA: function () { return vs(["#d52b1e", "#fff", "#d52b1e"], [1, 2, 1]) + mapleLeaf(15, 10, 0.17, "#d52b1e"); },
    AU: function () {
      return r(0, 0, W, H, "#00247d") + jack(0, 0, 15, 10) + star(7.5, 15.2, 3.1, "#fff", 7, -90, 0.5) +
        star(22.5, 3.2, 1.5, "#fff", 7, -90, 0.5) + star(18.8, 8.4, 1.5, "#fff", 7, -90, 0.5) + star(26.4, 6.8, 1.5, "#fff", 7, -90, 0.5) +
        star(22.5, 16.4, 1.5, "#fff", 7, -90, 0.5) + star(24.4, 11, 0.8, "#fff", 5);
    },
    NZ: function () {
      var st = ' stroke="#fff" stroke-width="0.45"', c = "#cc142b";
      return r(0, 0, W, H, "#012169") + jack(0, 0, 15, 10) + star(22.6, 3.6, 1.7, c, 5, -90, 0.4, st) + star(18.6, 8.2, 1.7, c, 5, -90, 0.4, st) +
        star(26.6, 7.4, 1.7, c, 5, -90, 0.4, st) + star(22.6, 16.4, 1.9, c, 5, -90, 0.4, st);
    },
    IN: function () {
      var o = hs(["#ff9933", "#fff", "#138808"]) + circ(15, 10, 2.7, "none", ' stroke="#000080" stroke-width="0.45"'), i, a;
      for (i = 0; i < 12; i++) { a = i * Math.PI / 12; o += '<line x1="' + (15 - 2.7 * Math.cos(a)).toFixed(2) + '" y1="' + (10 - 2.7 * Math.sin(a)).toFixed(2) + '" x2="' + (15 + 2.7 * Math.cos(a)).toFixed(2) + '" y2="' + (10 + 2.7 * Math.sin(a)).toFixed(2) + '" stroke="#000080" stroke-width="0.25"/>'; }
      return o + circ(15, 10, 0.55, "#000080");
    },
    /* ---- Europe ---- */
    AD: function () { return vs(["#10069f", "#fedd00", "#d50032"], [1, 1.2, 1]) + r(13.2, 8, 3.6, 4, "#c7b37f"); },
    AL: function () { return r(0, 0, W, H, "#e41e20") + eagle("#000"); },
    AT: function () { return hs(["#ed2939", "#fff", "#ed2939"]); },
    BA: function () {
      var o = r(0, 0, W, H, "#002395") + poly("8,0 23,0 23,15", "#fecb00"), i;
      for (i = 0; i < 7; i++) o += star(9.2 + i * 2.1, 1.2 + i * 2.1, 0.9, "#fff", 5);
      return o;
    },
    BE: function () { return vs(["#000", "#fae042", "#ed2939"]); },
    BG: function () { return hs(["#fff", "#00966e", "#d62612"]); },
    BY: function () { return hs(["#cf101a", "#007c30"], [2, 1]) + r(0, 0, 3.2, H, "#fff") + poly("1.6,2 2.6,3.4 1.6,4.8 0.6,3.4", "#cf101a") + poly("1.6,8 2.6,9.4 1.6,10.8 0.6,9.4", "#cf101a") + poly("1.6,14 2.6,15.4 1.6,16.8 0.6,15.4", "#cf101a"); },
    CH: function () { return r(0, 0, W, H, "#da291c") + r(13.1, 3.75, 3.8, 12.5, "#fff") + r(8.75, 8.1, 12.5, 3.8, "#fff"); },
    CY: function () {
      return r(0, 0, W, H, "#fff") + poly("8,10.5 11,8.4 14,7.3 17,6 20,5 22,6.6 21,8.4 19,9.4 16.5,10.4 13.5,11.4 10,12", "#d57800") +
        '<path d="M9.5,14 Q15,17.8 20.5,14" fill="none" stroke="#4e5b31" stroke-width="0.9"/>';
    },
    CZ: function () { return hs(["#fff", "#d7141a"]) + poly("0,0 15,10 0,20", "#11457e"); },
    DE: function () { return hs(["#000", "#d00", "#ffce00"]); },
    DK: function () { return nordic("#c8102e", "#fff", null, 4); },
    EE: function () { return hs(["#0072ce", "#000", "#fff"]); },
    ES: function () { return hs(["#aa151b", "#f1bf00", "#aa151b"], [1, 2, 1]) + r(7, 8, 3.2, 4, "#aa151b") + r(7.6, 8.6, 2, 2.8, "#d6b432"); },
    FI: function () { return nordic("#fff", "#003580", null, 4); },
    FR: function () { return vs(["#0055a4", "#fff", "#ef4135"]); },
    GR: function () {
      var o = "", i, ch = H / 9;
      for (i = 0; i < 9; i++) o += r(0, i * ch, W, ch + 0.03, i % 2 ? "#fff" : "#0d5eaf");
      return o + r(0, 0, ch * 5, ch * 5, "#0d5eaf") + r(ch * 2, 0, ch, ch * 5, "#fff") + r(0, ch * 2, ch * 5, ch, "#fff");
    },
    HR: function () { return hs(["#f00", "#fff", "#171796"]) + r(12.4, 5.6, 5.2, 1.4, "#ffd700") + checker(12.4, 7, 4, 4, 1.3, "#f00", "#fff") + '<rect x="12.4" y="7" width="5.2" height="5.2" fill="none" stroke="#f00" stroke-width="0.3"/>'; },
    HU: function () { return hs(["#ce2939", "#fff", "#477050"]); },
    IE: function () { return vs(["#169b62", "#fff", "#ff883e"]); },
    IS: function () { return nordic("#02529c", "#fff", "#dc1e35", 5.4, 2.6, 10); },
    IT: function () { return vs(["#009246", "#fff", "#ce2b37"]); },
    LI: function () { return hs(["#002b7f", "#ce1126"]) + poly("3.4,6.8 3.4,3.4 5.1,5 6.6,3 8.1,5 9.8,3.4 9.8,6.8", "#ffd83d"); },
    LT: function () { return hs(["#fdb913", "#006a44", "#c1272d"]); },
    LU: function () { return hs(["#ed2939", "#fff", "#00a1de"]); },
    LV: function () { return hs(["#9e3039", "#fff", "#9e3039"], [2, 1, 2]); },
    MC: function () { return hs(["#ce1126", "#fff"]); },
    MD: function () { return vs(["#0046ae", "#ffd200", "#cc092f"]) + '<ellipse cx="15" cy="10" rx="2.2" ry="2.8" fill="#9a5b13"/>'; },
    ME: function () { return r(0, 0, W, H, "#d4af37") + r(1.1, 1.1, W - 2.2, H - 2.2, "#c40308") + eagle("#d4af37"); },
    MK: function () {
      var o = r(0, 0, W, H, "#d20000"), i, a;
      for (i = 0; i < 8; i++) {
        a = i * Math.PI / 4;
        o += poly("15,10 " + (15 + 40 * Math.cos(a - 0.1)).toFixed(1) + "," + (10 + 40 * Math.sin(a - 0.1)).toFixed(1) + " " + (15 + 40 * Math.cos(a + 0.1)).toFixed(1) + "," + (10 + 40 * Math.sin(a + 0.1)).toFixed(1), "#ffe600");
      }
      return o + circ(15, 10, 3.3, "#ffe600", ' stroke="#d20000" stroke-width="0.8"');
    },
    MT: function () { return vs(["#fff", "#cf142b"]) + r(2.2, 0.7, 1, 3.4, "#8e8e8e") + r(1, 1.9, 3.4, 1, "#8e8e8e"); },
    NL: function () { return hs(["#ae1c28", "#fff", "#21468b"]); },
    NO: function () { return nordic("#ba0c2f", "#fff", "#00205b", 5.4, 2.6, 10); },
    PL: function () { return hs(["#fff", "#dc143c"]); },
    PT: function () { return vs(["#060", "#f00"], [2, 3]) + circ(12, 10, 3.1, "#ffe000") + r(10.7, 8.2, 2.6, 3.6, "#fff") + r(11.3, 8.8, 1.4, 2.4, "#d00"); },
    RO: function () { return vs(["#002b7f", "#fcd116", "#ce1126"]); },
    RS: function () { return hs(["#c6363c", "#0c4076", "#fff"]) + r(6.4, 5.4, 5.2, 8.2, "#fff") + r(7, 6, 4, 7, "#c6363c"); },
    RU: function () { return hs(["#fff", "#0039a6", "#d52b1e"]); },
    SE: function () { return nordic("#006aa7", "#fecc00", null, 4); },
    SI: function () { return hs(["#fff", "#005da4", "#ed1c24"]) + poly("4,3 10,3 10,9 7,11.6 4,9", "#005da4", ' stroke="#ed1c24" stroke-width="0.5"') + poly("5,8.2 6.5,5.6 7.1,6.6 8,5 9,8.2", "#fff"); },
    SK: function () { return hs(["#fff", "#0b4ea2", "#ee1c25"]) + poly("6,4 14,4 14,11 10,14.6 6,11", "#ee1c25", ' stroke="#fff" stroke-width="0.6"') + r(9.5, 5.4, 1, 7, "#fff") + r(8.2, 6.8, 3.6, 0.9, "#fff") + r(8.4, 8.8, 3.2, 0.9, "#fff") + poly("6.4,11.2 8,10 10,11.4 12,10 13.6,11.2 10,14.3", "#0b4ea2"); },
    SM: function () { return hs(["#fff", "#5eb6e4"]); },
    UA: function () { return hs(["#0057b8", "#ffd700"]); },
    VA: function () { return vs(["#ffe000", "#fff"]) + circ(22, 10, 2.1, "#c9a227"); },
    XK: function () { return r(0, 0, W, H, "#244aa5") + poly("8.5,13 10.5,10.6 13,9.6 15.5,8.4 18.5,8.8 20.8,10.4 19.4,12.6 15,14", "#d0a650") + star(8.5, 4.6, 0.9, "#fff") + star(11.5, 3.4, 0.9, "#fff") + star(14.8, 2.9, 0.9, "#fff") + star(18, 3.1, 0.9, "#fff") + star(21, 3.8, 0.9, "#fff") + star(23.2, 5.2, 0.9, "#fff"); },
    TR: function () { return r(0, 0, W, H, "#e30a17") + circ(11.4, 10, 5, "#fff") + circ(12.9, 10, 4, "#e30a17") + star(17.2, 10, 2, "#fff"); },
    /* ---- used by the language picker ---- */
    CN: function () { return r(0, 0, W, H, "#de2910") + star(5.5, 5.4, 3.2, "#ffde00") + star(11, 2, 1, "#ffde00", 5, -20) + star(13, 4.3, 1, "#ffde00", 5, -50) + star(13, 7.3, 1, "#ffde00", 5, -80) + star(11, 9.6, 1, "#ffde00", 5, -110); },
    AE: function () { return r(0, 0, W, H, "#fff") + r(7.5, 0, 22.5, H / 3 + 0.03, "#00732f") + r(7.5, H * 2 / 3, 22.5, H / 3, "#000") + r(0, 0, 7.5, H, "#f00"); },
    VN: function () { return r(0, 0, W, H, "#da251d") + star(15, 10.4, 6.2, "#ff0") }
  };

  function code2(c) { c = String(c || "").trim().toUpperCase(); return /^[A-Z]{2}$/.test(c) ? c : ""; }
  function svg(c, w, h, title) {
    c = code2(c); if (!c || !F[c]) return "";
    w = w || 22; h = h || Math.round(w * 2 / 3);
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + " " + H + '" width="' + w + '" height="' + h + '"' +
      (title ? ' role="img" aria-label="' + String(title).replace(/"/g, "&quot;") + '"' : ' aria-hidden="true"') +
      ' style="display:inline-block;vertical-align:-3px;border-radius:2px;box-shadow:0 0 0 1px rgba(0,0,0,.18);overflow:hidden">' +
      F[c]() + "</svg>";
  }
  function uri(c) {
    var s = svg(c, 30, 20); if (!s) return "";
    s = s.replace(/ style="[^"]*"/, "");
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s);
  }
  window.AHFlags = { has: function (c) { c = code2(c); return !!(c && F[c]); }, svg: svg, uri: uri, codes: Object.keys(F) };
})();
