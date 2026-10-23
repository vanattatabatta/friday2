/* Phones: a floating "Get help" button that scrolls to the request form. It is shown after the visitor scrolls past the top,
   and hidden while the form is on screen or being filled in (so it never covers the fields or the chat widgets). */
(function () {
  var f = document.getElementById("assignment-form"); if (!f || !window.IntersectionObserver) return;
  var b = document.createElement("button"); b.type = "button"; b.className = "mob-cta"; b.setAttribute("aria-label", "Go to the expert help form");
  b.innerHTML = '<i class="fas fa-paper-plane" aria-hidden="true"></i><span>Get help</span>'; document.body.appendChild(b);
  var visible = false, used = false;
  function sync() { b.classList.toggle("on", !visible && !used && window.scrollY > 500); }
  new IntersectionObserver(function (e) { visible = e[0].isIntersecting; sync(); }, { threshold: 0.05 }).observe(f);
  window.addEventListener("scroll", sync, { passive: true });
  window.addEventListener("ah-form-active", function () { used = true; sync(); });
  b.addEventListener("click", function () { location.href = "/order-now"; });
})();
