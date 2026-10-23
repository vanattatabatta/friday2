/* Navbar unlock balance: "N unlocks" next to the account button (members and visitors; a visitor sees the unlocks earned by uploads and uses them after signing up).
   Counts earned upload unlocks + unlocks left in the paid 30-pack. Every unlock that is spent is debited automatically on the server,
   so the number is simply read again. Clicking it opens My documents in the account. window.AHUnlocks.refresh() re-reads it. */
(function () {
  if (window.AHUnlocks) return;
  var css = '.ukc{display:inline-flex;align-items:center;gap:6px;flex:none;white-space:nowrap;text-decoration:none;font:700 14px system-ui,sans-serif;color:#fff!important;background:linear-gradient(90deg,#a21caf,#e11d74,#f97316,#a21caf);background-size:250% 100%;animation:ukg 6s linear infinite;border-radius:999px;padding:8px 13px;box-shadow:0 5px 14px #a21caf40;transition:transform .2s}'
    + '.ukc:hover{transform:translateY(-2px)}.ukc b{background:#fff;color:#a21caf;border-radius:999px;min-width:22px;height:22px;display:inline-grid;place-items:center;padding:0 6px;font-size:13px}.ukc.zero{background:#eef1f5;color:#5b6575!important;box-shadow:none;animation:none}.ukc.zero b{background:#d5dcea;color:#5b6575}.ukc.bump b{animation:ukb .6s ease}'
    + '@keyframes ukg{to{background-position:-250% 0}}@keyframes ukb{40%{transform:scale(1.5)}}@media(max-width:1500px){.ukc .ukt{display:none}.ukc{padding:7px 10px}}@media(prefers-reduced-motion:reduce){.ukc,.ukc b{animation:none!important}}';
  var ucss = 'a.utu.utb{display:inline-flex;align-items:center;gap:7px;text-decoration:none;font:700 14px system-ui,sans-serif;white-space:nowrap}html .nv a.nl.utu,html .sh .nv a.nl.utu,a.utu.utb{position:relative;overflow:hidden;color:#fff!important;border-radius:999px;padding:9px 16px;background:linear-gradient(90deg,#a21caf,#e11d74,#f97316,#a21caf);background-size:250% 100%;animation:utg 4s linear infinite,utp 2.4s ease-in-out infinite;box-shadow:0 6px 16px #a21caf40;transition:transform .2s}'
    + 'html .nv a.nl.utu:hover,html .sh .nv a.nl.utu:hover,a.utu.utb:hover{background:linear-gradient(90deg,#a21caf,#e11d74,#f97316,#a21caf);background-size:250% 100%;transform:translateY(-2px) scale(1.05)}'
    + 'a.utu::after{content:"";position:absolute;top:0;left:-70%;width:40%;height:100%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.6),transparent);transform:skewX(-20deg);animation:uts 2.8s ease-in-out infinite;pointer-events:none}'
    + 'a.utu svg{animation:utw 2s ease-in-out infinite;transform-origin:50% 80%}a.utu:hover svg{animation-duration:.5s}'
    + '@keyframes utg{to{background-position:-250% 0}}@keyframes uts{55%,100%{left:130%}}@keyframes utw{0%,60%,100%{transform:rotate(0)}70%{transform:rotate(-14deg)}80%{transform:rotate(12deg)}90%{transform:rotate(-6deg)}}'
    + '@keyframes utp{0%,100%{box-shadow:0 6px 16px #a21caf40,0 0 0 0 #e11d7466}50%{box-shadow:0 6px 16px #a21caf40,0 0 0 8px #e11d7400}}@media(prefers-reduced-motion:reduce){a.utu,a.utu::after,a.utu svg{animation:none!important}}';
  (function () { var st = document.createElement("style"); st.textContent = ucss; document.head.appendChild(st); })();
  var chip = null, last = null;
  function host() { return document.getElementById("acc") || document.getElementById("shacc") || document.querySelector("[data-unlock-host]"); }
  function paint(b) {
    var h = host(); if (!h || !b) return;
    if (b.guest) { if (chip) { chip.remove(); chip = null; } return; } /* the unlocks balance is shown only inside a signed-in account */
    if (!chip) {
      var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
      chip = document.createElement("a"); chip.className = "ukc"; chip.href = b.guest ? "/signup?next=/doc" : "/account#docs";
      h.parentNode.insertBefore(chip, h);
    }
    var n = b.total || 0, tip = n + " unlock" + (n === 1 ? "" : "s") + " left: " + (b.upload || 0) + " from uploads, " + (b.pack || 0) + " from your 30-unlock pack"
      + (b.pack && b.packExpires ? " (valid until " + new Date(b.packExpires).toLocaleDateString() + ")" : "") + ". An unlock is used automatically when you open a document.";
    if (b.guest) tip = n + " unlock" + (n === 1 ? "" : "s") + " earned from uploads. Sign up (free) to use them to view or download documents.";
    chip.title = tip; chip.setAttribute("aria-label", tip);
    chip.className = "ukc" + (n ? "" : " zero") + (last !== null && last !== n ? " bump" : "");
    chip.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 11V8a5 5 0 0 1 9.6-2"/><rect x="4" y="11" width="16" height="10" rx="2"/></svg><b>' + n + '</b><span class="ukt">unlock' + (n === 1 ? "" : "s") + '</span>';
    last = n;
  }
  function refresh() {
    return fetch("/api/docs/balance", { credentials: "same-origin" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) { if (d && d.success) paint(d); }).catch(function () {});
  }
  window.AHUnlocks = { refresh: refresh };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", refresh); else refresh();
})();
