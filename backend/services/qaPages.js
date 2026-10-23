"use strict";
/* Server-rendered Q&A pages (real HTML in the first response, so search engines read them without running JavaScript):
 *   /qa            list of questions (indexable)         /qa/ask        the form (not indexed)         /qa/<slug>   one question + its answer
 */
const Q = require("./qaService");

const E = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const day = (d) => new Date(d).toISOString().slice(0, 10);
const jsonLd = (o) => JSON.stringify(o).replace(/</g, "\\u003c");

const ICON_HOME = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>';
/* breadcrumb inside the content box: [[label, href?], ...] after Home */
const crumb = (items) => `<nav class="ah-bc" aria-label="Breadcrumb"><ol><li><a class="ah-bc-ic" href="/" aria-label="Home" title="Home">${ICON_HOME}</a></li>${items.map((it, i) => `<li>${it[1] && i < items.length - 1 ? `<a href="${it[1]}">${E(it[0])}</a>` : `<a href="${it[1] || "#"}" aria-current="page">${E(it[0])}</a>`}</li>`).join("")}</ol></nav>`;
const CSS = `:root{--blue:#0f766e;--blue2:#14b8a6;--ink:#0b1220;--mut:#5b6575;--line:#e3e8ef;--bg:#f4faf9}*{box-sizing:border-box}body{margin:0;font:16px/1.6 Inter,system-ui,Segoe UI,Roboto,sans-serif;color:var(--ink);background:var(--bg)}
a{color:var(--blue)}main.qa{max-width:900px;margin:0 auto;padding:22px 16px 60px}.ah-bc{display:flex;align-items:center;gap:12px;margin:0 0 18px;font:500 15px/1.4 Poppins,Inter,system-ui,sans-serif}.ah-bc-ic{flex:none;width:32px;height:32px;border-radius:10px;display:grid;place-items:center;color:#fff!important;text-decoration:none!important;background:linear-gradient(135deg,var(--blue,#2563eb),var(--blue2,#7c3aed));box-shadow:0 6px 16px rgba(15,118,110,.25);transition:transform .2s,box-shadow .2s}.ah-bc-ic:hover{transform:translateY(-2px) scale(1.05)}.ah-bc ol{list-style:none;display:flex;flex-wrap:wrap;align-items:center;gap:2px 10px;margin:0;padding:5px 12px;min-width:0;flex:1;background:#fff;border:1px solid #e1e8f0;border-radius:12px;box-shadow:0 1px 4px #0000000a}.ah-bc li{display:inline-flex;align-items:center;gap:10px;min-width:0;margin:0}.ah-bc li+li:before{content:"/";color:#94a3b8}.ah-bc a{text-decoration:none;color:#337ab7}.ah-bc a:hover{text-decoration:underline}.ah-bc li:last-child a,.ah-bc li:last-child span{color:#6b7280;overflow-wrap:anywhere}@media(max-width:575px){.ah-bc{gap:8px;font-size:14px}.ah-bc-ic{width:30px;height:30px}.ah-bc ol{padding:4px 10px}}h1{font-size:clamp(1.5rem,3.4vw,2.1rem);line-height:1.25;margin:.2em 0 .4em}
.card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:20px 22px;margin:14px 0;box-shadow:0 1px 4px #0000000a}.meta{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:14px;color:var(--mut)}
.badge{display:inline-block;border-radius:999px;padding:2px 11px;font-size:13px;font-weight:700}.badge.ok{background:#d9f5f1;color:#0b5f59}.badge.wait{background:#fff3cd;color:#8a6100}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:0;border-radius:10px;padding:11px 22px;background:var(--blue);color:#fff;font:700 15px inherit;font-family:inherit;cursor:pointer;text-decoration:none}.btn:hover{background:#0b5f59}.btn.ghost{background:#fff;color:var(--blue);border:2px solid var(--blue)}.btn[disabled]{opacity:.6;cursor:wait}
.pills{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}.pills a{border:1px solid var(--line);background:#fff;border-radius:999px;padding:6px 15px;text-decoration:none;color:var(--ink);font-weight:600;font-size:14px}.pills a.on{background:var(--blue);color:#fff;border-color:var(--blue)}
.ql{list-style:none;margin:0;padding:0}.ql li{background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px 18px;margin:10px 0}.ql a.t{font-weight:700;font-size:1.05rem;color:var(--ink);text-decoration:none}.ql a.t:hover{color:var(--blue)}
.qbody,.ans{white-space:pre-wrap;word-wrap:break-word;overflow-wrap:anywhere}.lab{font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--mut);font-weight:700;margin:0 0 8px}
.ans .bl{filter:blur(5px);-webkit-filter:blur(5px);user-select:none;-webkit-user-select:none;pointer-events:none}.fade{position:relative}.fade:after{content:"";position:absolute;left:0;right:0;bottom:0;height:46%;background:linear-gradient(#fff0,#fff);pointer-events:none}
.gate{margin-top:14px;border-radius:14px;padding:18px 20px;color:#fff;background:linear-gradient(120deg,#0f766e,#7c3aed,#ec4899);background-size:200% 200%;animation:gt 8s ease infinite}.gate h3{margin:0 0 4px;font-size:1.1rem}.gate p{margin:0 0 12px;opacity:.95;font-size:15px}.gate .btn{background:#fff;color:#0b5f59}.gate .btn.ghost{background:transparent;color:#fff;border-color:#fff}@keyframes gt{50%{background-position:100% 50%}}
label{display:block;font-weight:700;margin:14px 0 6px}input[type=text],textarea{width:100%;border:2px solid #d5dcea;border-radius:10px;padding:11px 14px;font:16px/1.5 inherit;font-family:inherit;background:#fff}input:focus,textarea:focus{outline:0;border-color:var(--blue);box-shadow:0 0 0 3px #0f766e22}textarea{min-height:160px;resize:vertical}
.note{font-size:14px;color:var(--mut)}.msg{margin-top:12px;font-weight:600}.msg.err{color:#b42318}.quota{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 0}.quota span{background:#fff;border:1px solid var(--line);border-radius:999px;padding:4px 13px;font-size:14px;font-weight:600}
.exp{border:2px dashed var(--blue);background:#f4fcfb}.pg a{margin-right:14px;font-weight:700}@media(prefers-reduced-motion:reduce){.gate{animation:none}}`;

const SCRIPT = `(function(){var $=function(s){return document.querySelector(s)};
function api(p,o){o=o||{};o.credentials="same-origin";o.headers={"Content-Type":"application/json"};if(o.body&&typeof o.body!=="string")o.body=JSON.stringify(o.body);
return fetch(p,o).then(function(r){return r.json().catch(function(){return{}}).then(function(d){if(r.status===401){location.href="/login?next="+encodeURIComponent(location.pathname+location.search);throw new Error("login")}if(!r.ok){var e=new Error(d.message||"Something went wrong.");e.data=d;throw e}return d})})}
function say(el,t,err){if(!el)return;el.textContent=t||"";el.className="msg"+(err?" err":"")}
function buy(slug,btn,msg){btn.disabled=true;api("/api/qa/pass/checkout",{method:"POST",body:{slug:slug||""}}).then(function(d){location.href=d.url}).catch(function(e){btn.disabled=false;if(e.message!=="login")say(msg,e.message,1)})}
var q=new URLSearchParams(location.search),cs=q.get("qapass");
if(cs){api("/api/qa/pass/confirm",{method:"POST",body:{session_id:cs}}).then(function(){q.delete("qapass");history.replaceState(0,"",location.pathname+(q.toString()?"?"+q:""));location.reload()}).catch(function(e){if(e.message!=="login")alert(e.message)})}
var f=$("#askf");if(f){var qm=$("#quota"),m=$("#msg"),pb=$("#passbox");
 api("/api/qa/me").then(function(d){var x=[];x.push('<span>Free questions left: <b>'+d.free.left+' of '+d.free.limit+'</b></span>');if(d.pass.questions>0)x.push('<span>Membership questions left: <b>'+d.pass.questions+'</b></span>');qm.innerHTML=x.join("");if(d.free.left<1&&d.pass.questions<1)pb.hidden=false}).catch(function(){});
 f.onsubmit=function(e){e.preventDefault();var b=f.querySelector("button[type=submit]");b.disabled=true;say(m,"Posting your question...");
  api("/api/qa/ask",{method:"POST",body:{title:f.title.value,body:f.body.value,subject:f.subject.value}}).then(function(d){say(m,"Your question is live.");location.href=d.url}).catch(function(er){b.disabled=false;if(er.message==="login")return;say(m,er.message,1);if(er.data&&er.data.needPass)pb.hidden=false})};
 var pbtn=$("#buy");if(pbtn)pbtn.onclick=function(){buy("",pbtn,m)}}
var ub=$("#useview");if(ub)ub.onclick=function(){ub.disabled=true;api("/api/qa/"+ub.dataset.id+"/unlock",{method:"POST"}).then(function(){location.reload()}).catch(function(e){ub.disabled=false;if(e.message!=="login")say($("#gmsg"),e.message,1)})};
var bb=$("#buy2");if(bb)bb.onclick=function(){buy(bb.dataset.slug,bb,$("#gmsg"))};
var af=$("#ansf");if(af)af.onsubmit=function(e){e.preventDefault();var b=af.querySelector("button");b.disabled=true;say($("#amsg"),"Saving...");api("/api/qa/"+af.dataset.id+"/answer",{method:"POST",body:{body:af.body.value}}).then(function(){location.reload()}).catch(function(er){b.disabled=false;if(er.message!=="login")say($("#amsg"),er.message,1)})};
var dq=$("#delq");if(dq)dq.onclick=function(){if(!confirm("Delete this question? Its page will disappear."))return;api("/api/qa/"+dq.dataset.id,{method:"DELETE"}).then(function(){location.href="/qa"}).catch(function(e){alert(e.message)})};
})();`;

function shell(req, o) {
  const origin = o.origin, url = origin + o.path, site = process.env.SITE_NAME || "Expert Help";
  const head = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${E(o.title)}</title><meta name="description" content="${E(o.desc)}">`
    + `<meta name="robots" content="${o.noindex ? "noindex, nofollow" : "index, follow"}"><link rel="canonical" href="${E(url)}"><link rel="icon" href="/favicon.png" type="image/png"><meta name="theme-color" content="#0f766e">`
    + `<meta property="og:type" content="website"><meta property="og:site_name" content="${E(site)}"><meta property="og:title" content="${E(o.title)}"><meta property="og:description" content="${E(o.desc)}"><meta property="og:url" content="${E(url)}">`
    + (o.ld ? `<script type="application/ld+json">${jsonLd(o.ld)}</script>` : "") + `<style>${CSS}</style>`;
  return `<!DOCTYPE html><html lang="en"><head>${head}</head><body><div id="site-header"></div><main class="qa">${o.body}</main><script>${SCRIPT}</script><script src="/js/site-header.js?v=20261023h1"></script><script src="/js/study-resources.js"></script><script src="/js/content-enhance.js?v=1n" data-root="main.qa" data-title="expert help"></script><script src="/js/site-footer.js?v=1" defer></script></body></html>`;
}

module.exports = function register(app, { siteOrigin, optionalUser }) {
  const send = (res, req, o, status) => { res.status(status || 200).setHeader("Cache-Control", "no-store"); res.setHeader("X-Robots-Tag", o.noindex ? "noindex, nofollow" : "index, follow"); res.type("html").send(shell(req, { ...o, origin: siteOrigin(req) })); };
  const fail = (res, req) => send(res, req, { title: "Page not found | Q&A", desc: "This question is not available.", path: req.path, noindex: true, body: `<h1>Question not found</h1><p>It may have been removed.</p><p><a class="btn" href="/qa">Browse questions</a></p>` }, 404);

  /* IndexNow key file (only when INDEXNOW_KEY is set) */
  app.get(/^\/([A-Za-z0-9-]{8,128})\.txt$/, (req, res, next) => { const k = String(process.env.INDEXNOW_KEY || "").trim(); if (k && req.params[0] === k) return res.type("text/plain").send(k); next(); });

  /* ---- list ---- */
  app.get("/qa", async (req, res) => {
    try {
      const filter = ["answered", "open"].includes(String(req.query.filter)) ? String(req.query.filter) : "", page = Math.min(500, Math.max(1, parseInt(req.query.page, 10) || 1));
      const { rows, more } = await Q.list({ filter, page });
      const href = (f, p) => "/qa" + (f || p > 1 ? "?" : "") + [f ? "filter=" + f : "", p > 1 ? "page=" + p : ""].filter(Boolean).join("&");
      const li = rows.map((r) => `<li><a class="t" href="/qa/${encodeURIComponent(r.slug)}">${E(r.title)}</a><div class="meta"><span class="badge ${r.status === "answered" ? "ok" : "wait"}">${r.status === "answered" ? "Answered" : "Waiting for an expert"}</span>${r.subject ? `<span>${E(r.subject)}</span>` : ""}<span>${day(r.created_at)}</span></div></li>`).join("");
      const body = `${crumb([["Q&A", "/qa"]])}<h1>Questions &amp; Answers</h1><p class="note">Ask an expert. Every question goes live the moment you post it, and the answer appears on the same page. The first ${Q.FREE_Q()} questions are free.</p>`
        + `<p><a class="btn" href="/qa/ask">Ask a question</a></p><div class="pills"><a href="${href("", 1)}"${!filter ? ' class="on"' : ""}>All</a><a href="${href("answered", 1)}"${filter === "answered" ? ' class="on"' : ""}>Answered</a><a href="${href("open", 1)}"${filter === "open" ? ' class="on"' : ""}>Waiting</a></div>`
        + (li ? `<ul class="ql">${li}</ul>` : `<div class="card">No questions yet. Be the first to ask.</div>`)
        + `<p class="pg">${page > 1 ? `<a href="${href(filter, page - 1)}">‹ Newer</a>` : ""}${more ? `<a href="${href(filter, page + 1)}">Older ›</a>` : ""}</p>`;
      send(res, req, { title: "Questions & Answers" + (page > 1 ? " - page " + page : "") + " | " + (process.env.SITE_NAME || "Expert Help"), desc: "Ask an expert and read answers to student questions. Every question is published instantly.", path: "/qa" + (page > 1 ? "?page=" + page : ""), body, noindex: !!filter || page > 1 });
    } catch (e) { console.warn("[QA] list:", e.message); res.status(500).type("text").send("Something went wrong."); }
  });

  /* ---- ask ---- */
  app.get("/qa/ask", (req, res) => {
    const body = `${crumb([["Q&A", "/qa"], ["Ask a question", "/qa/ask"]])}<h1>Ask a question</h1>
<div class="quota" id="quota" aria-live="polite"></div>
<form id="askf" class="card" autocomplete="off"><label for="title">Your question</label><input type="text" id="title" name="title" maxlength="300" required minlength="10" placeholder="Type the whole question, e.g. Mia had $100 with her. Her father gave her $50 ...">
<label for="body">More details (optional)</label><textarea id="body" name="body" maxlength="8000" placeholder="Options, numbers, what you already tried"></textarea>
<label for="subject">Subject (optional)</label><input type="text" id="subject" name="subject" maxlength="80" placeholder="e.g. Mathematics, Grade 2">
<p class="note">Your question is public and goes live as soon as you post it. Do not include personal or financial details.</p><p><button class="btn" type="submit">Post question</button></p><div class="msg" id="msg" role="status"></div></form>
<div class="gate" id="passbox" hidden><h3>Get the $${Q.PASS_CENTS() / 100} membership</h3><p>${Q.PASS_Q()} questions and ${Q.PASS_V()} answer views, valid for ${Q.PASS_DAYS()} days. You have used your ${Q.FREE_Q()} free questions.</p><button class="btn" id="buy" type="button">Get membership - $${Q.PASS_CENTS() / 100}</button></div>`;
    send(res, req, { title: "Ask a question | " + (process.env.SITE_NAME || "Expert Help"), desc: "Post your question and an expert will answer it.", path: "/qa/ask", body, noindex: true });
  });

  /* ---- one question ---- */
  app.get("/qa/:slug", optionalUser, async (req, res) => {
    try {
      const q = await Q.bySlug(req.params.slug); if (!q) return fail(res, req);
      const user = req.user, owner = !!(user && String(q.owner_id) === String(user.id)), expert = await Q.isExpert(user);
      require("../config/database").query("UPDATE qa_questions SET views=views+1 WHERE id=$1", [q.id]).catch(() => {});
      const a = q.answer, see = !!a && (await Q.canSeeAnswer(q, user)), sp = a ? Q.splitAnswer(a.body) : null;
      const who = `${E(Q.firstName(q.owner_name))} • ${day(q.created_at)}${q.subject ? " • " + E(q.subject) : ""}`;
      let ans = "";
      if (!a) ans = `<p class="note">An expert will answer this question soon. This page updates by itself: the answer will appear here, on this same address.</p>`;
      else if (see) ans = `<div class="ans">${E(a.body)}</div><p class="note">Answered by ${E(Q.firstName(a.expert_name) === "Member" ? "an expert" : Q.firstName(a.expert_name))} • ${day(a.updated_at)}</p>`;
      else {
        const hid = sp.b ? ` <span class="bl"${Q.hiddenPart && process.env.QA_CRAWL_FULL === "1" ? "" : ' aria-hidden="true"'}>${E(Q.hiddenPart(sp.b))}</span>` : "";
        let gate;
        if (!user) gate = `<h3>Want the full answer?</h3><p>You are reading the first ${Math.round(Q.CLEAR() * 100)}% of the answer. Log in to unlock the rest.</p><a class="btn" href="/login?next=${encodeURIComponent("/qa/" + q.slug)}">Log in</a> <a class="btn ghost" href="/signup?next=${encodeURIComponent("/qa/" + q.slug)}">Sign up</a>`;
        else {
          const ps = await Q.passStatus(user.id);
          gate = `<h3>Want the full answer?</h3><p>You are reading the first ${Math.round(Q.CLEAR() * 100)}% of the answer. The person who asked sees all of it.</p>` + (ps.views > 0
            ? `<button class="btn" id="useview" data-id="${q.id}" type="button">Use 1 of your ${ps.views} answer views</button>`
            : `<button class="btn" id="buy2" data-slug="${E(q.slug)}" type="button">Membership $${Q.PASS_CENTS() / 100}: ${Q.PASS_Q()} questions + ${Q.PASS_V()} answer views</button>`) + ` <span class="msg" id="gmsg" role="status"></span>`;
        }
        ans = `<div class="fade"><div class="ans"><span>${E(sp.a)}</span>${hid}</div></div><aside class="gate" aria-label="Unlock the answer">${gate}</aside>`;
      }
      const form = expert ? `<form id="ansf" class="card exp" data-id="${q.id}"><label for="abody">${a ? "Edit the answer" : "Post the answer (expert)"}</label><textarea id="abody" name="body" required minlength="20" maxlength="20000">${a ? E(a.body) : ""}</textarea><p><button class="btn" type="submit">${a ? "Update answer" : "Post answer"}</button></p><div class="msg" id="amsg" role="status"></div></form>` : "";
      const vis = a ? sp.a : "", desc = (q.body || q.title).replace(/\s+/g, " ").slice(0, 155);
      const ld = { "@context": "https://schema.org", "@type": "QAPage", mainEntity: { "@type": "Question", name: q.title, text: q.body || q.title, answerCount: a ? 1 : 0, dateCreated: q.created_at, author: { "@type": "Person", name: Q.firstName(q.owner_name) },
        ...(a ? { acceptedAnswer: { "@type": "Answer", text: vis, dateCreated: a.created_at, dateModified: a.updated_at, author: { "@type": "Person", name: "Expert" } } } : {}) } };   /* only the part everybody can read */
      const body = `${crumb([["Q&A", "/qa"], [q.title.slice(0, 60), "/qa/" + encodeURIComponent(q.slug)]])}<article>
<h1>${E(q.title)}</h1><div class="meta"><span class="badge ${a ? "ok" : "wait"}">${a ? "Answered" : "Waiting for an expert"}</span><span>${who}</span></div>
<section class="card" aria-label="Question"><p class="lab">Question</p><div class="qbody">${E(q.body || q.title)}</div></section>
<section class="card" aria-label="Answer"><p class="lab">Answer</p>${ans}</section>${form}</article>`
        + (owner ? `<p class="note"><button class="btn ghost" id="delq" data-id="${q.id}" type="button">Delete my question</button></p>` : "") + `<p><a href="/qa">‹ All questions</a> &nbsp; <a href="/qa/ask">Ask your own question</a></p>`;
      send(res, req, { title: `${q.title.slice(0, 110)} | Q&A | ${process.env.SITE_NAME || "Expert Help"}`, desc, path: "/qa/" + encodeURIComponent(q.slug), body, ld, noindex: q.noindex });
    } catch (e) { console.warn("[QA] page:", e.message); res.status(500).type("text").send("Something went wrong."); }
  });
};
