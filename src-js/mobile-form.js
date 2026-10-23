/* Phone version of the homepage request form: ONLY email, mobile number, subject, description, attachment and the submit button.
   Every other field is hidden and disabled on screens up to 767px (disabled fields are neither validated nor sent) and a hidden quick=1
   tells the server to fill the rest. On larger screens the full form is unchanged. */
(function () {
  var f = document.getElementById("assignment-form"); if (!f) return;
  var mq = window.matchMedia("(max-width:767px)");
  var KEEP = { email: 1, phone: 1, subject: 1, message: 1, deadline_date: 1, deadline_time: 1, assignmentFiles: 1, assignmentFile: 1, assignmentFilePicker: 1, form_subject: 1, order_id: 1, quick: 1 };
  var h3 = f.querySelector(".form-header h2"), hp = f.querySelector(".form-header p"), btn = document.getElementById("ctcBtn");
  var orig = { h3: h3 && h3.textContent, p: hp && hp.textContent };
  var flag = document.createElement("input"); flag.type = "hidden"; flag.name = "quick"; flag.value = "1"; f.appendChild(flag);
  var reqOrig = {};
  var phone = f.querySelector('input[name="phone"]'), phoneReq = phone && phone.required;
  function apply() {
    var q = mq.matches; f.classList.toggle("quick", q); flag.disabled = !q;
    Array.prototype.forEach.call(f.querySelectorAll("input[name],select[name],textarea[name]"), function (el) {
      if (KEEP[el.name] || el.type === "file" || el.type === "hidden") return;
      el.disabled = q;
      var col = el.closest('[class*="col-"]'); if (col) col.classList.toggle("qh", q);
    });
    if (phone) phone.required = q || phoneReq;
    /* subject + description stay visible on the phone but are optional there (the server fills a fallback) */
    ["subject", "message", "deadline_date", "deadline_time"].forEach(function (n) { var el = f.querySelector('[name="' + n + '"]'); if (!el) return; if (!(n in reqOrig)) reqOrig[n] = el.required; el.required = q ? false : reqOrig[n]; });
    if (h3) h3.textContent = orig.h3;
    if (hp) hp.textContent = orig.p;
    var ta = f.querySelector('textarea[name="message"]'); if (ta) { if (!orig.ph) orig.ph = ta.placeholder; ta.placeholder = q ? "Description: Submit your requirements, subject, deadline" : orig.ph; }
  }
  /* Deadline picker for the phone: one tap opens the calendar (day + hour); shown as DD:HH. It fills the real deadline_date / deadline_time fields. */
  var subj = f.querySelector('select[name="subject"]'), subjCol = subj && subj.closest('[class*="col-"]');
  var dDate = f.querySelector('input[name="deadline_date"]'), dTime = f.querySelector('select[name="deadline_time"]');
  if (subjCol && dDate && dTime) {
    subjCol.classList.add("mdl-subj");
    [dDate, dTime].forEach(function (el) { var c = el.closest('[class*="col-"]'); if (c) c.classList.add("mdl-hide"); });
    var col = f.querySelector(".mdl-col");
    if (!col) {
      col = document.createElement("div"); col.className = "col-sm-6 mdl-col";
      col.innerHTML = '<div class="live-field"><span class="field-icon"><i class="fas fa-calendar-alt"></i></span>' +
        '<input type="text" readonly class="fctrl live-input" id="mDeadline" placeholder="Due DD:HH" aria-label="Deadline (day and hour)">' +
        '<input type="datetime-local" id="mDlNative" step="3600" aria-label="Pick deadline date and hour"></div>';
      subjCol.parentNode.insertBefore(col, subjCol.nextSibling);
    }
    var nat = col.querySelector("#mDlNative"), shown = col.querySelector("#mDeadline");
    function pad(n) { return (n < 10 ? "0" : "") + n; }
    var now = new Date(); nat.min = now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate()) + "T" + pad(now.getHours()) + ":00";
    nat.addEventListener("change", function () {
      var v = nat.value; if (!v) { shown.value = ""; dDate.value = ""; dTime.value = ""; return; }
      var d = v.slice(0, 10), hh = v.slice(11, 13);
      dDate.value = d; dTime.value = hh + ":00";
      shown.value = d.slice(8, 10) + ":" + hh;
      shown.title = d + " " + hh + ":00";
    });
  }
  apply();
  if (mq.addEventListener) mq.addEventListener("change", apply); else mq.addListener(apply);
})();
