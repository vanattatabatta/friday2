/* Country-code phone field (flag + dial code + search list) for the request form.
   - Country is picked automatically on load from the visitor's IP (GET /api/submissions/geo), with an instant first guess
     from the browser time zone / language so the flag never starts empty.
   - The visible box only holds the national number; the real value sent is "+<dial> <number>" (set in the `formdata` event,
     so it works with the existing submit.js and the short mobile form). */
(function () {
  "use strict";
  var f = document.getElementById("assignment-form"); if (!f) return;
  var inp = f.querySelector('input[name="phone"]'); if (!inp) return;
  var field = inp.closest(".live-field") || inp.parentNode;

  var RAW = "IN:91,US:1,GB:44,CA:1,AU:61,NZ:64,AE:971,SA:966,PK:92,BD:880,LK:94,NP:977,SG:65,MY:60,PH:63,ID:62,TH:66,VN:84,CN:86,HK:852,JP:81,KR:82,TW:886,DE:49,FR:33,IT:39,ES:34,PT:351,NL:31,BE:32,CH:41,AT:43,IE:353,SE:46,NO:47,DK:45,FI:358,PL:48,CZ:420,SK:421,HU:36,RO:40,BG:359,GR:30,TR:90,RU:7,UA:380,BY:375,LT:370,LV:371,EE:372,HR:385,SI:386,RS:381,BA:387,MK:389,AL:355,ME:382,XK:383,MD:373,GE:995,AM:374,AZ:994,KZ:7,UZ:998,IL:972,JO:962,LB:961,KW:965,QA:974,BH:973,OM:968,IQ:964,IR:98,EG:20,ZA:27,NG:234,KE:254,GH:233,ET:251,TZ:255,UG:256,ZM:260,ZW:263,MA:212,DZ:213,TN:216,LY:218,SD:249,SN:221,CI:225,CM:237,AO:244,MZ:258,MU:230,MX:52,BR:55,AR:54,CL:56,CO:57,PE:51,VE:58,EC:593,UY:598,PY:595,BO:591,CR:506,PA:507,GT:502,SV:503,HN:504,NI:505,DO:1809,PR:1787,JM:1876,TT:1868,BS:1242,BB:1246,CU:53,HT:509,LU:352,MT:356,CY:357,IS:354,MM:95,KH:855,LA:856,MN:976,AF:93,BT:975,MV:960,BN:673,MO:853,FJ:679,PG:675,AD:376,MC:377,LI:423,SM:378,GI:350,JE:44,GG:44,IM:44,KY:1345,BM:1441,GU:1671";
  var C = RAW.split(",").map(function (s) { var p = s.split(":"); return { c: p[0], d: p[1] }; });
  var DN; try { DN = new Intl.DisplayNames(["en"], { type: "region" }); } catch (e) {}
  C.forEach(function (x) { try { x.n = (DN && DN.of(x.c)) || x.c; } catch (e) { x.n = x.c; } });
  C.sort(function (a, b) { return a.n < b.n ? -1 : 1; });
  var byC = {}; C.forEach(function (x) { byC[x.c] = x; });

  var TZ = { "Asia/Calcutta": "IN", "Asia/Kolkata": "IN", "America/New_York": "US", "America/Chicago": "US", "America/Denver": "US", "America/Los_Angeles": "US", "Europe/London": "GB", "Australia/Sydney": "AU", "Australia/Melbourne": "AU", "Asia/Dubai": "AE", "Asia/Karachi": "PK", "Asia/Dhaka": "BD", "Asia/Singapore": "SG", "Asia/Manila": "PH", "America/Toronto": "CA", "America/Vancouver": "CA", "Africa/Lagos": "NG", "Africa/Nairobi": "KE", "Africa/Johannesburg": "ZA", "Asia/Riyadh": "SA", "Asia/Kathmandu": "NP", "Asia/Colombo": "LK", "Pacific/Auckland": "NZ", "Europe/Berlin": "DE", "Europe/Paris": "FR" };
  function guess() {
    try { var z = Intl.DateTimeFormat().resolvedOptions().timeZone; if (TZ[z]) return TZ[z]; } catch (e) {}
    var m = /[-_]([A-Za-z]{2})$/.exec(navigator.language || ""); return m && byC[m[1].toUpperCase()] ? m[1].toUpperCase() : "US";
  }
  function flagSrc(c) {
    var l = c.toLowerCase();
    return (window.AHFlags && window.AHFlags.uri && window.AHFlags.uri(l)) || "https://flagcdn.com/w40/" + l + ".png";
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (m) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]; }); }
  function dialTxt(x) { return "+" + (x.d.length > 3 && x.d[0] === "1" ? "1 " + x.d.slice(1) : x.d); }

  /* ---- build ---- */
  var icon = field.querySelector(".field-icon"); if (icon) icon.style.display = "none";
  var oldFlag = field.querySelector(".country-flag"); if (oldFlag) oldFlag.style.display = "none";
  field.classList.add("cc-field");
  var btn = document.createElement("button"); btn.type = "button"; btn.className = "cc-btn"; btn.setAttribute("aria-haspopup", "listbox"); btn.setAttribute("aria-expanded", "false"); btn.setAttribute("aria-label", "Country code");
  btn.innerHTML = '<img class="cc-fl" alt="" width="22" height="15"><span class="cc-dial"></span><svg class="cc-car" viewBox="0 0 10 6" width="8" height="5" aria-hidden="true"><path d="M0 0l5 6 5-6z" fill="currentColor"/></svg>';
  field.insertBefore(btn, field.firstChild);
  var list = document.createElement("div"); list.className = "cc-list"; list.hidden = true;
  list.innerHTML = '<ul role="listbox"></ul>';
  field.appendChild(list);
  var ul = list.querySelector("ul"), fl = btn.querySelector(".cc-fl"), dl = btn.querySelector(".cc-dial");
  inp.placeholder = "Contact number"; inp.setAttribute("inputmode", "tel"); inp.setAttribute("autocomplete", "tel-national");
  var hid = document.createElement("input"); hid.type = "hidden"; hid.name = "phone_country"; f.appendChild(hid);

  var cur = null, touched = false;
  function set(code, byUser) {
    var x = byC[code]; if (!x) return; cur = x; if (byUser) touched = true;
    fl.src = flagSrc(code); fl.alt = x.n; dl.textContent = dialTxt(x); hid.value = code; btn.title = x.n + " (" + dialTxt(x) + ")";
  }
  function render(filter) {
    var t = (filter || "").toLowerCase().replace(/^\+/, ""), h = "";
    C.forEach(function (x) {
      if (t && x.n.toLowerCase().indexOf(t) < 0 && x.d.indexOf(t) !== 0 && x.c.toLowerCase() !== t) return;
      h += '<li role="option" data-c="' + x.c + '"' + (cur && cur.c === x.c ? ' aria-selected="true"' : "") + '><img alt="" loading="lazy" width="22" height="15" src="' + flagSrc(x.c) + '"><span class="cc-n">' + esc(x.n) + '</span><span class="cc-d">' + dialTxt(x) + "</span></li>";
    });
    ul.innerHTML = h || '<li class="cc-none">No match</li>';
  }
  function open() { render("");  list.hidden = false; btn.setAttribute("aria-expanded", "true"); setTimeout(function () { var s = ul.querySelector("[aria-selected]"); if (s && s.scrollIntoView) s.scrollIntoView({ block: "center" }); }, 0); }
  function close() { list.hidden = true; btn.setAttribute("aria-expanded", "false"); }
  btn.addEventListener("click", function (e) { e.preventDefault(); list.hidden ? open() : close(); });
  ul.addEventListener("click", function (e) { var li = e.target.closest("li[data-c]"); if (!li) return; set(li.getAttribute("data-c"), true); close(); inp.focus(); });
  document.addEventListener("click", function (e) { if (!list.hidden && !field.contains(e.target)) close(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !list.hidden) { close(); btn.focus(); } });

  /* typing "+91 ..." or "0091 ..." in the number box switches the country */
  inp.addEventListener("input", function () {
    var v = inp.value; var m = /^\s*(?:\+|00)\s*(\d{1,4})/.exec(v); if (!m) return;
    var digits = m[1], best = null;
    for (var n = digits.length; n >= 1 && !best; n--) { var pre = digits.slice(0, n); for (var i = 0; i < C.length; i++) if (C[i].d === pre) { best = C[i]; break; } }
    if (best) { set(best.c, true); inp.value = v.replace(/^\s*(?:\+|00)\s*\d{1,4}\s*/, function (s) { return s.slice(0, s.length - (digits.length - best.d.length)).replace(/.*/, ""); }); }
  });

  /* the value that is really sent: "+<dial> <number>" */
  f.addEventListener("formdata", function (e) {
    if (!cur) return; var n = String(inp.value || "").replace(/^\s*0+(?=\d)/, "").trim();
    e.formData.set("phone", n ? "+" + cur.d + " " + n : "");
  });

  /* ---- country from the visitor's IP ---- */
  set(guess(), false);
  var cached = null; try { cached = sessionStorage.getItem("ah_cc"); } catch (e) {}
  if (cached && byC[cached]) set(cached, false);
  else {
    fetch("/api/submissions/geo", { headers: { Accept: "application/json" }, credentials: "same-origin" })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (j && j.code && byC[j.code] && !touched) { set(j.code, false); try { sessionStorage.setItem("ah_cc", j.code); } catch (e) {} } })
      .catch(function () {});
  }
  setTimeout(function () { if (cur) fl.src = flagSrc(cur.c); }, 2500); /* use the built-in flag once flags.js has loaded */
})();
