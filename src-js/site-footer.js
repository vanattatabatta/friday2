/* Legal bar at the very bottom of every public page: Privacy Policy, Service Terms, Copyright Protection, Community Guidelines,
   Academic Integrity, Honor Code, Content Management and Attributions. Loads its own CSS and adds itself once. */
(function () {
  if (window.__ahFoot || document.querySelector(".lgf")) return; window.__ahFoot = 1;
  var L = [["Privacy Policy", "privacy-policy"], ["Service Terms", "service-terms"], ["Copyright Protection", "copyright-protection"], ["Community Guidelines", "community-guidelines"],
    ["Academic Integrity", "academic-integrity"], ["Honor Code", "honor-code"], ["Content Management", "content-management"], ["Attributions", "attributions"]];
  function build() {
    if (!document.getElementById("lgf-css")) { var c = document.createElement("link"); c.id = "lgf-css"; c.rel = "stylesheet"; c.href = "/css/legal.css?v=1"; document.head.appendChild(c); }
    var cur = location.pathname.replace(/\/+$/, "");
    var f = document.createElement("footer"); f.className = "lgf"; f.setAttribute("aria-label", "Legal");
    f.innerHTML = '<div class="lgf-in"><nav aria-label="Legal pages">' + L.map(function (x) { return '<a href="/legal/' + x[1] + '"' + (cur === "/legal/" + x[1] ? ' aria-current="page"' : "") + ">" + x[0] + "</a>"; }).join("") + '</nav><p>\u00A9 ' + new Date().getFullYear() + ' Expert Help. Not sponsored or endorsed by any college or university.</p></div>';
    document.body.appendChild(f);
  }
  if (document.body) build(); else document.addEventListener("DOMContentLoaded", build);
})();
