(() => {
  "use strict";

  let token = localStorage.getItem("aht_admin_token") || "";
  let allSubmissions = [];
  let orderTab = ""; /* "" = all, "expert" = Expert Help, "ai" = AI to Human */
  const isAi = s => /^AI/i.test(String(s?.Id ?? ""));
  const inTab = s => !orderTab || (orderTab === "ai" ? isAi(s) : !isAi(s));
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const auth = (extra={}) => ({...extra, Authorization:`Bearer ${token}`});

  async function readJson(r){
    const t=await r.text(); let d={};
    try{d=t?JSON.parse(t):{}}catch{}
    if(!r.ok) throw new Error(d.message||t||`HTTP ${r.status}`);
    return d;
  }

  function toast(message){
    const t=$("toast"); if(!t)return;
    t.textContent=message; t.classList.add("show");
    clearTimeout(window.__toastTimer);
    window.__toastTimer=setTimeout(()=>t.classList.remove("show"),2600);
  }

  function loginMessage(message,type="error"){
    const e=$("loginMessage"); if(!e)return;
    e.textContent=message||""; e.className=`message ${type}`;
  }

  function logout(){
    token=""; localStorage.removeItem("aht_admin_token");
    {const f=$("lcFrame"),w=$("lcFull");if(f)f.removeAttribute("src");if(w){w.classList.add("hidden");document.body.style.overflow="";}}
    $("app").classList.add("hidden"); $("login").classList.remove("hidden");
    if($("password"))$("password").value="";
  }

  async function login(e){
    if(e)e.preventDefault();
    const btn=$("loginBtn"), username=$("username").value.trim(), password=$("password").value;
    if(!username||!password){loginMessage("Enter your username and password.");return;}
    btn.disabled=true; btn.innerHTML="Signing in…"; loginMessage("Connecting…","info");
    try{
      const r=await fetch("/api/admin/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username,password})});
      const d=await readJson(r); if(!d.token)throw new Error("No session token was returned.");
      token=d.token; localStorage.setItem("aht_admin_token",token);
      $("login").classList.add("hidden"); $("app").classList.remove("hidden");
      $("loggedUser").textContent=`${d.username||username}`;
      loginMessage("Login successful.","success");
      if(window.admAfterAuth&&window.admAfterAuth({adminRole:d.adminRole,mustChange:d.mustChange}))return;
      await load();
    }catch(err){console.error(err);loginMessage(err.message||"Unable to log in.");}
    finally{btn.disabled=false;btn.innerHTML="<span>Sign in</span><span>→</span>";}
  }

  function formatDate(v){
    if(!v)return "—"; const d=new Date(v); return Number.isNaN(d.getTime())?String(v):d.toLocaleString("en-IN",{dateStyle:"medium",timeStyle:"short"});
  }
  function bytes(n){n=Number(n||0);if(!n)return "0 B";const u=["B","KB","MB","GB"];const i=Math.min(Math.floor(Math.log(n)/Math.log(1024)),3);return `${(n/Math.pow(1024,i)).toFixed(i?1:0)} ${u[i]}`;}

  // Convert an ISO 3166-1 alpha-2 code to the native country flag emoji.
  // New submissions receive CountryCode directly from the IP geolocation API.
  const countryNameCodes={
    "india":"IN","united states":"US","united states of america":"US","usa":"US",
    "united kingdom":"GB","uk":"GB","canada":"CA","australia":"AU","new zealand":"NZ",
    "singapore":"SG","united arab emirates":"AE","uae":"AE","saudi arabia":"SA",
    "qatar":"QA","kuwait":"KW","oman":"OM","bahrain":"BH","pakistan":"PK",
    "bangladesh":"BD","nepal":"NP","sri lanka":"LK","china":"CN","japan":"JP",
    "south korea":"KR","republic of korea":"KR","germany":"DE","france":"FR",
    "italy":"IT","spain":"ES","netherlands":"NL","switzerland":"CH","sweden":"SE",
    "norway":"NO","denmark":"DK","finland":"FI","ireland":"IE","russia":"RU",
    "ukraine":"UA","brazil":"BR","mexico":"MX","south africa":"ZA","nigeria":"NG"
  };
  let fullNameCodes=null;
  function nameToCode(name){
    const key=String(name||"").trim().toLowerCase();
    if(!key)return "";
    if(countryNameCodes[key])return countryNameCodes[key];
    if(!fullNameCodes){
      fullNameCodes={};
      try{
        const dn=new Intl.DisplayNames(["en"],{type:"region"});
        for(let a=65;a<=90;a++)for(let b=65;b<=90;b++){
          const c=String.fromCharCode(a,b);
          try{const l=dn.of(c);if(l&&l!==c&&!fullNameCodes[l.toLowerCase()])fullNameCodes[l.toLowerCase()]=c;}catch{}
        }
      }catch{}
    }
    return fullNameCodes[key]||"";
  }
  function countryCode(s){
    const direct=String(s?.CountryCode||"").trim().toUpperCase();
    if(/^[A-Z]{2}$/.test(direct))return direct;
    return nameToCode(s?.Country);
  }
  // "🇮🇳 IN India" - flag, 2-letter country code, then the country name.
  function countryLabel(s){
    const code=countryCode(s);
    const name=s?.Country||"Unknown";
    return `${countryFlag(s)} ${code?`<b>${esc(code)}</b> `:""}${esc(name)}`;
  }
  // Flag: built-in inline SVG (js/flags.js, no external request, works on Windows).
  // Countries without a built-in flag try flagcdn, and if that is blocked/offline show a small code badge.
  function countryFlag(s){
    const code=countryCode(s), name=s?.Country||"Country";
    if(!code)return `<span class="country-flag-fallback" aria-hidden="true">🌐</span>`;
    const own=window.AHFlags&&window.AHFlags.svg(code,22,15,name);
    if(own)return `<span class="country-flag-icon" title="${esc(name)}">${own}</span>`;
    return `<span class="country-flag-icon" title="${esc(name)}"><img src="https://flagcdn.com/w40/${code.toLowerCase()}.png" alt="" width="22" height="15" loading="lazy" style="object-fit:cover;border-radius:2px;vertical-align:-3px;box-shadow:0 0 0 1px rgba(0,0,0,.18)" onerror="this.outerHTML='<span class=&quot;flag-badge&quot;>${code}</span>'"></span>`;
  }

  function updateStats(all){
    const rows=all.filter(inTab);
    $("statTotal").textContent=rows.length;
    $("statNew").textContent=rows.filter(x=>(x.Status||"New")==="New").length;
    $("statProgress").textContent=rows.filter(x=>x.Status==="In Progress").length;
    $("statCompleted").textContent=rows.filter(x=>x.Status==="Completed").length;
    const ai=all.filter(isAi).length;
    if($("tabAll"))$("tabAll").textContent=all.length;
    if($("tabExpert"))$("tabExpert").textContent=all.length-ai;
    if($("tabAi"))$("tabAi").textContent=ai;
  }

  function render(){
    const q=($("search").value||"").trim().toLowerCase(), filter=$("statusFilter").value;
    const rows=allSubmissions.filter(s=>{
      const hay=[s.Id,s.Name,s.Email,s.Phone,s.Subject,s.Country,s.ClientIP,s.AssignmentDetails].join(" ").toLowerCase();
      return inTab(s)&&(!q||hay.includes(q))&&(!filter||s.Status===filter);
    });
    const list=$("list");
    if(!rows.length){list.innerHTML=`<div class="empty">${orderTab==="ai"&&!allSubmissions.some(isAi)?"No AI to Human orders yet.":"No matching submissions found."}</div>`;return;}
    list.innerHTML=`<div class="table-wrap"><table><thead><tr><th>Order</th><th>Customer</th><th>Subject</th><th>Deadline</th><th>Country</th><th>Files</th><th>Status</th><th>Created</th></tr></thead><tbody>${rows.map(row).join("")}</tbody></table></div>`;
  }

  function row(s){
    const id=Number(s.SubmissionId), status=s.Status||"New";
    const deadline=s.Deadline||[s.DeadlineDate,s.DeadlineTime].filter(Boolean).join(" ")||"—";
    const statuses=["New","In Progress","Completed","Cancelled"];
    return `<tr>
      <td><button class="order-btn" type="button" onclick="window.adminDetails(${id})">${esc(s.Id)}</button>${isAi(s)?`<br><span class="ai-badge">AI to Human</span>`:""}</td>
      <td><b>${esc(s.Name)}</b><br><span class="small">${esc(s.Email)}</span>${s.Phone?`<br><span class="small">${esc(s.Phone)}</span>`:""}</td>
      <td><b>${esc(s.Subject)}</b>${s.AssignmentDetails?`<br><span class="small">${esc(String(s.AssignmentDetails).slice(0,110))}${String(s.AssignmentDetails).length>110?"…":""}</span>`:""}</td>
      <td><b>${esc(deadline)}</b></td>
      <td>${countryLabel(s)}</td>
      <td>${Number(s.AttachmentCount||0)?`<button class="file-count" type="button" onclick="window.adminDetails(${id})">📎 ${Number(s.AttachmentCount)} Files</button>`:"—"}</td>
      <td><select class="status-select" onchange="window.adminChangeStatus(${id},this.value)">${statuses.map(x=>`<option ${x===status?"selected":""}>${esc(x)}</option>`).join("")}</select></td>
      <td><span class="small">${esc(formatDate(s.CreatedAt))}</span></td>
    </tr>`;
  }

  async function load({silent=false}={}){
    if(!silent) $("list").innerHTML=`<div class="loading"><span class="spinner"></span>Loading submissions…</div>`;
    try{
      const r=await fetch("/api/submissions",{headers:auth(),cache:"no-store"});
      if(r.status===401){logout();loginMessage("Session expired. Please log in again.");return;}
      const d=await readJson(r); allSubmissions=Array.isArray(d.submissions)?d.submissions:[]; updateStats(allSubmissions); render();
    }catch(err){console.error("Load submissions:",err);if(!silent) $("list").innerHTML=`<div class="error-box"><b>Unable to load submissions.</b><br>${esc(err.message)}<br><br><button class="primary" type="button" onclick="window.loadSubmissions()">Try again</button></div>`;}
  }

  async function details(id){
    try{
      const r=await fetch(`/api/submissions/${encodeURIComponent(id)}`,{headers:auth(),cache:"no-store"});
      if(r.status===401){logout();return;}
      const d=await readJson(r), s=d.submission||{}, files=d.attachments||[];
      $("modalTitle").textContent=s.Id||`#${id}`;
      $("modalBody").innerHTML=`<div class="detail-body">
        <div class="detail-grid">
          ${detail("Customer",s.Name)}${detail("Email",s.Email)}${detail("Phone",s.Phone||"—")}${detail("Subject",s.Subject)}
          ${detail("Deadline",s.Deadline||[s.DeadlineDate,s.DeadlineTime].filter(Boolean).join(" "))}${detailHtml("Country",countryLabel(s))}
          ${detail("Customer IP",s.ClientIP||"Unknown")}${detail("Status",s.Status||"New")}${detail("Submitted",formatDate(s.CreatedAt))}
        </div>
      </div>
      <div class="detail-section"><h3>Expert Requirements</h3><div class="requirements">${esc(s.AssignmentDetails||"No details provided.")}</div></div>
      <div class="detail-section"><h3>📎 Attachments (${files.length})</h3>${files.length?files.map(file).join(""):`<p class="small">No attachments were uploaded.</p>`}</div>`;
      $("modal").classList.remove("hidden"); $("modal").setAttribute("aria-hidden","false");
    }catch(err){console.error(err);toast(err.message||"Unable to load submission.");}
  }
  function detail(label,value){return `<div class="detail-item"><small>${esc(label)}</small><div>${esc(value??"—")}</div></div>`;}
  function detailHtml(label,value){return `<div class="detail-item"><small>${esc(label)}</small><div>${value??"—"}</div></div>`;}
  function file(f){return `<div class="file-row"><div class="file-info"><div class="file-name">📄 ${esc(f.OriginalFileName||"Attachment")}</div><div class="file-meta">${bytes(f.FileSize)} • ${esc(f.MimeType||"application/octet-stream")}</div></div><div class="file-actions"><button type="button" onclick="window.adminViewFile(${Number(f.Id)})">👁 View</button><button class="download" type="button" onclick="window.adminDownloadFile(${Number(f.Id)})">⬇ Download</button></div></div>`;}

  async function attachment(id,download){
    const endpoint=`/api/submissions/attachments/${encodeURIComponent(id)}/${download?"download":"view"}`;
    const r=await fetch(endpoint,{headers:auth(),cache:"no-store"});
    if(r.status===401){logout();throw new Error("Session expired. Please log in again.");}
    if(!r.ok)throw new Error(await r.text()||`Attachment HTTP ${r.status}`); return r;
  }
  async function viewFile(id){
    try{
      const r=await attachment(id,false), blob=await r.blob(), url=URL.createObjectURL(blob), w=window.open("","_blank");
      if(!w){URL.revokeObjectURL(url);throw new Error("Please allow pop-ups for the admin panel.");}
      const type=r.headers.get("Content-Type")||blob.type||"application/octet-stream", cd=r.headers.get("Content-Disposition")||"", m=cd.match(/filename="([^"]+)"/i),name=m?m[1]:"Attachment";
      if(type.startsWith("image/")||type==="application/pdf"||type.startsWith("text/")){
        w.document.write(`<title>${esc(name)}</title><style>html,body{margin:0;height:100%;background:#111}iframe,img{width:100%;height:100%;border:0;object-fit:contain}</style>${type.startsWith("image/")?`<img src="${url}">`:`<iframe src="${url}"></iframe>`}`);w.document.close();
      }else{w.document.write(`<body style="font-family:system-ui;padding:40px"><h2>${esc(name)}</h2><p>This file type cannot be previewed in the browser.</p><button onclick="location.href='${url}'">Open / Download</button></body>`);w.document.close();}
      setTimeout(()=>URL.revokeObjectURL(url),120000);
    }catch(err){console.error(err);toast(err.message||"Unable to view file.");}
  }
  async function downloadFile(id){
    try{
      const r=await attachment(id,true), blob=await r.blob(), cd=r.headers.get("Content-Disposition")||"", m=cd.match(/filename="([^"]+)"/i), name=m?m[1]:"attachment", url=URL.createObjectURL(blob), a=document.createElement("a");
      a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);toast("Download started");
    }catch(err){console.error(err);toast(err.message||"Unable to download file.");}
  }

  async function changeStatus(id,status){
    try{
      const r=await fetch(`/api/submissions/${encodeURIComponent(id)}/status`,{method:"PATCH",headers:auth({"Content-Type":"application/json"}),body:JSON.stringify({status})});
      if(r.status===401){logout();return;} await readJson(r); const item=allSubmissions.find(x=>Number(x.SubmissionId)===Number(id)); if(item)item.Status=status; updateStats(allSubmissions); render(); toast("Status updated");
    }catch(err){console.error(err);toast(err.message||"Could not update status.");load();}
  }

  function closeModal(){$("modal").classList.add("hidden");$("modal").setAttribute("aria-hidden","true");}

  async function session(){
    if(!token)return;
    try{const r=await fetch("/api/admin/me",{headers:auth(),cache:"no-store"});if(!r.ok)throw 0;const d=await readJson(r);$("login").classList.add("hidden");$("app").classList.remove("hidden");$("loggedUser").textContent=d.admin?.username||"Administrator";if(window.admAfterAuth&&window.admAfterAuth({adminRole:d.admin?.adminRole,mustChange:d.admin?.mustChange}))return;await load();}catch{logout();}
  }

  function initAdmin(){
    if(window.__ahAdminInitialized)return;
    window.__ahAdminInitialized=true;
    $("loginForm").addEventListener("submit",login);
    fetch("/api/admin/setup-status").then(r=>r.json()).then(d=>{if(d&&d.needed)$("setupForm").classList.remove("hidden");}).catch(()=>{});
    $("setupForm").addEventListener("submit",async e=>{e.preventDefault();const m=$("suMsg"),b=$("suBtn");b.disabled=true;m.textContent="Creating…";
      try{const r=await fetch("/api/admin/first-setup",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:$("suToken").value,username:$("suUser").value.trim(),password:$("suPass").value})});
        const d=await r.json().catch(()=>({}));if(!r.ok||!d.success)throw new Error(d.message||"Setup failed.");
        $("username").value=$("suUser").value.trim();$("password").value=$("suPass").value;$("setupForm").classList.add("hidden");await login();
      }catch(err){m.textContent=err.message;}finally{b.disabled=false;}});
    $("logout").addEventListener("click",logout);
    $("refresh").addEventListener("click",load);
    $("close").addEventListener("click",closeModal);
    $("search").addEventListener("input",render);
    $("ordTabs")?.addEventListener("click",e=>{
      const b=e.target.closest(".ord-tab"); if(!b)return;
      orderTab=b.dataset.t||"";
      document.querySelectorAll("#ordTabs .ord-tab").forEach(x=>{const on=x===b;x.classList.toggle("on",on);x.setAttribute("aria-selected",on?"true":"false");});
      updateStats(allSubmissions); render();
    });
    $("statusFilter").addEventListener("change",render);
    $("togglePassword").addEventListener("click",()=>{const p=$("password");p.type=p.type==="password"?"text":"password";});
    $("modal").addEventListener("click",e=>{if(e.target===$("modal"))closeModal();});
    document.addEventListener("keydown",e=>{if(e.key==="Escape")closeModal();});
    window.adminDetails=details;window.adminChangeStatus=changeStatus;window.adminViewFile=viewFile;window.adminDownloadFile=downloadFile;window.loadSubmissions=load;
    /* ---- small pop-ups for the header tools (humanizer, WhatsApp number) ---- */
    let lastTool=null;
    const openTool=(id,focusId)=>{const m=$(id);m.classList.remove("hidden");m.setAttribute("aria-hidden","false");lastTool=document.activeElement;if(focusId)setTimeout(()=>$(focusId)&&$(focusId).focus(),30);};
    const closeTools=()=>{if(window.__mustChangePw)return;clearInterval(window.__grTimer);clearInterval(window.__visTimer);["hzModal","waModal","docModal","userModal","pageModal","grModal","bkModal","visModal","admModal"].forEach(id=>{const m=$(id);if(m&&!m.classList.contains("hidden")){m.classList.add("hidden");m.setAttribute("aria-hidden","true");}});if(lastTool&&lastTool.focus)lastTool.focus();lastTool=null;};
    ["hzModal","waModal","docModal","userModal","pageModal","grModal","bkModal","visModal","admModal"].forEach(id=>{const m=$(id);m.addEventListener("click",e=>{if(e.target===m||e.target.closest("[data-close]"))closeTools();});});
    document.addEventListener("keydown",e=>{if(e.key==="Escape")closeTools();});
    $("hzOpen").addEventListener("click",()=>openTool("hzModal","hzIn"));

    /* Document library: the only place a document can be deleted. */
    const fmtKind=k=>({pdf:"PDF",doc:"Word",text:"Text",sheet:"Sheet",image:"Image"}[k]||k);
    async function loadDocs(){
      const box=$("docList"),m=$("docMsg");m.textContent="Loading…";
      try{
        const d=await readJson(await fetch("/api/admin/docs?q="+encodeURIComponent($("docQ").value.trim()),{headers:auth(),cache:"no-store"}));
        m.textContent=d.docs.length+" document"+(d.docs.length===1?"":"s");
        box.innerHTML=d.docs.length?`<div class="table-wrap"><table><thead><tr><th style="width:34px"><input type="checkbox" id="docAllChk" aria-label="Select all documents on this list"></th><th>Title / link</th><th>Owner</th><th>Course</th><th>Type</th><th>Pages</th><th>Views</th><th>Uploaded</th><th></th></tr></thead><tbody>${d.docs.map(x=>`<tr>
          <td><input type="checkbox" class="docChk" value="${Number(x.id)}" data-t="${esc(x.title)}" aria-label="Select ${esc(x.title)}"></td>
          <td><b>${esc(x.title)}</b>${x.removed?' <span class="small">(hidden)</span>':""}<br><a class="small" href="/doc/${encodeURIComponent(x.slug||"")}" target="_blank" rel="nofollow noopener noreferrer">/doc/${esc(x.slug||"—")}</a></td>
          <td><span class="small">${esc(x.owner_name||"—")}<br>${esc(x.owner_email||"")}<br>IP ${esc(x.upload_ip||"—")}</span></td>
          <td><span class="small">${esc([x.course,x.school].filter(Boolean).join(" · "))}</span></td>
          <td>${esc(fmtKind(x.kind))}</td><td>${Number(x.page_count)}</td><td>${Number(x.views)}</td>
          <td><span class="small">${esc(formatDate(x.created_at))}</span></td>
          <td><button type="button" class="ghost" data-deldoc="${Number(x.id)}" data-t="${esc(x.title)}" style="color:#b42318;border:1.5px solid #b42318;font-weight:700;white-space:nowrap">🗑 Delete</button></td></tr>`).join("")}</tbody></table></div>`:'<div class="empty">No documents found.</div>';
      }catch(e){m.textContent=e.message||"Could not load documents.";}
      syncSel();
    }
    $("docOpen").addEventListener("click",()=>{openTool("docModal","docQ");loadDocs();
      fetch("/api/admin/docs/status",{headers:auth(),cache:"no-store"}).then(r=>r.json()).then(st=>{const w=$("docWarn");w.classList.toggle("hidden",!!(st.sharp&&st.pdftoppm&&st.tesseract));w.textContent="Server tools missing — sharp: "+(st.sharp?"ok":"MISSING")+", poppler (page images): "+(st.pdftoppm?"ok":"MISSING")+", tesseract (OCR text for Google): "+(st.tesseract?"ok":"MISSING")+". Deploy with the included Dockerfile to install them.";}).catch(()=>{});});
    /* select one or several documents, then delete only those */
    function picked(){return [...document.querySelectorAll("#docList .docChk:checked")];}
    function syncSel(){const n=picked().length,b=$("docSel"),all=$("docAllChk"),tot=document.querySelectorAll("#docList .docChk").length;b.textContent="🗑 Delete selected ("+n+")";b.disabled=!n;if(all){all.checked=!!tot&&n===tot;all.indeterminate=n>0&&n<tot;}}
    $("docList").addEventListener("change",e=>{
      if(e.target.id==="docAllChk"){document.querySelectorAll("#docList .docChk").forEach(c=>{c.checked=e.target.checked;});}
      if(e.target.id==="docAllChk"||e.target.classList.contains("docChk"))syncSel();
    });
    $("docSel").addEventListener("click",async()=>{
      const sel=picked();if(!sel.length)return;
      const names=sel.slice(0,8).map(c=>"• "+c.dataset.t).join("\n")+(sel.length>8?"\n… and "+(sel.length-8)+" more":"");
      if(!confirm("Permanently delete "+sel.length+" selected document"+(sel.length===1?"":"s")+"?\n\n"+names+"\n\nThe files, pages and links are removed. This cannot be undone."))return;
      const b=$("docSel");b.disabled=true;
      try{const d=await readJson(await fetch("/api/admin/docs/delete-selected",{method:"POST",headers:auth({"Content-Type":"application/json"}),body:JSON.stringify({ids:sel.map(c=>Number(c.value))})}));toast(d.message||"Deleted.");}
      catch(err){toast(err.message||"Could not delete the selected documents.");}
      loadDocs();
    });
    $("docGo").addEventListener("click",loadDocs);
    $("docQ").addEventListener("keydown",e=>{if(e.key==="Enter")loadDocs();});
    $("docList").addEventListener("click",async e=>{
      const b=e.target.closest("[data-deldoc]");if(!b)return;
      if(!confirm('Permanently delete "'+b.dataset.t+'"?\n\nThe file, its pages and its link are removed and this cannot be undone.'))return;
      b.disabled=true;
      try{await readJson(await fetch("/api/admin/docs/"+encodeURIComponent(b.dataset.deldoc),{method:"DELETE",headers:auth()}));toast("Document deleted");loadDocs();}
      catch(err){b.disabled=false;toast(err.message||"Could not delete.");}
    });
    /* Customer accounts: block, unblock or delete. */
    async function loadUsers(){
      const box=$("userList"),m=$("userMsg");m.textContent="Loading…";
      try{
        const d=await readJson(await fetch("/api/admin/users?q="+encodeURIComponent($("userQ").value.trim()),{headers:auth(),cache:"no-store"}));
        m.textContent=d.users.length+" user"+(d.users.length===1?"":"s");
        const tag=s=>s==="blocked"?'<span style="color:#b42318;font-weight:700">Blocked</span>':s==="suspended"?'<span style="color:#b54708;font-weight:700">Suspended</span>':'<span style="color:#067647;font-weight:700">Active</span>';
        box.innerHTML=d.users.length?`<div class="table-wrap"><table><thead><tr><th>User</th><th>ID</th><th>Status</th><th>Docs</th><th>Joined</th><th>Last login</th><th></th></tr></thead><tbody>${d.users.map(x=>`<tr>
          <td><b>${esc(x.name)}</b><br><span class="small">${esc(x.email)}</span></td><td><span class="small">${esc(x.user_code)}</span></td><td>${tag(x.status)}</td><td>${Number(x.docs)}</td>
          <td><span class="small">${esc(formatDate(x.created_at))}</span></td><td><span class="small">${x.last_login_at?esc(formatDate(x.last_login_at)):"—"}</span></td>
          <td style="white-space:nowrap">${x.status==="blocked"?`<button type="button" class="ghost" data-uact="unblock" data-id="${Number(x.id)}">✔ Unblock</button>`:`<button type="button" class="ghost" data-uact="block" data-id="${Number(x.id)}" style="color:#b54708">⛔ Block</button>`} <button type="button" class="ghost" data-uact="delete" data-id="${Number(x.id)}" data-t="${esc(x.email)}" style="color:#b42318">🗑 Delete</button></td></tr>`).join("")}</tbody></table></div>`:'<div class="empty">No users found.</div>';
      }catch(e){m.textContent=e.message||"Could not load users.";}
    }
    $("userOpen").addEventListener("click",()=>{openTool("userModal","userQ");loadUsers();});
    /* Groq keys: live status of the key pool (which key is in use, calls used this minute, keys that are used up or resting). */
    const grLabel={in_use:["● In use now","ok"],standby:["Ready (standby)","idle"],exhausted:["Used up","warn"],rate_limited:["Groq rate limit","warn"],rejected:["Rejected by Groq","bad"]};
    const grAgo=iso=>{if(!iso)return "never";const s=Math.max(0,Math.round((Date.now()-new Date(iso))/1000));return s<60?s+"s ago":s<3600?Math.floor(s/60)+" min ago":Math.floor(s/3600)+" h ago";};
    const grWait=s=>s>=120?Math.ceil(s/60)+" min":s+"s";
    let grTests={};
    function grBadge(sum){
      const b=$("grBadge"),box=$("grOpen");if(!b)return;
      let t,off=false;
      if(!sum.configured){t="(no key set)";off=true;}
      else if(sum.allBusy){t="(all keys busy)";off=true;}
      else t=`(${sum.ready}/${sum.configured} ready · key ${sum.inUse} in use)`;
      b.textContent=t;box.classList.toggle("off",off);
    }
    function grRender(d){
      const sum=d.summary,keys=d.keys;
      const el=$("grSum");
      if(!sum.configured){el.className="gr-sum bad";el.textContent="⚠ No Groq key is configured. Add GROQ_API_KEY (or GROQ_API_KEYS=key1,key2,… up to "+sum.maxKeys+" keys) in backend/.env and restart the server.";}
      else if(sum.allBusy){el.className="gr-sum bad";el.textContent="⚠ Every key is used up or resting right now. New requests wait about "+grWait(sum.nextFreeInSeconds)+" for the first key to free up.";}
      else{el.className="gr-sum ok";el.textContent=`✔ ${sum.configured} key${sum.configured===1?"":"s"} configured · key ${sum.inUse} is in use now · ${sum.totalCalls} call${sum.totalCalls===1?"":"s"} since the server started`;}
      $("grNote").textContent=`The site uses key 1 until it has made ${sum.limit} calls within a minute, then moves to the next key by itself (and returns to key 1 as soon as its minute has freed up). If Groq itself answers "rate limit" for a key, that key rests and the next one takes over. Keys are shown masked. This list refreshes every 5 seconds; counters start at 0 when the server restarts.`;
      $("grList").innerHTML=keys.length?`<div class="table-wrap"><table><thead><tr><th>#</th><th>Key</th><th>Status</th><th>Calls this minute</th><th>Total calls</th><th>Groq limit hits</th><th>Last used</th><th>Test</th></tr></thead><tbody>${keys.map(k=>{
        const L=grLabel[k.status]||[k.status,"idle"],pct=Math.min(100,Math.round(k.callsLastMinute/Math.max(1,k.limit)*100)),t=grTests[k.key];
        return `<tr><td><b>${k.key}</b></td><td><code>${esc(k.id)}</code></td>
          <td><span class="gr-pill ${L[1]}">${esc(L[0])}</span>${k.waitSeconds?`<div class="small">free again in ${esc(grWait(k.waitSeconds))}</div>`:""}</td>
          <td style="min-width:150px"><div class="gr-bar${pct>=90?" hot":""}"><i style="width:${pct}%"></i></div><span class="small">${k.callsLastMinute} / ${k.limit}</span></td>
          <td>${Number(k.totalCalls)}</td><td>${Number(k.rateLimited)}</td><td><span class="small">${esc(grAgo(k.lastUsed))}${k.lastStatus?` · HTTP ${Number(k.lastStatus)}`:""}</span></td>
          <td style="max-width:230px;white-space:normal">${t?`<span class="small" style="color:${t.ok?"#067647":"#b42318"};font-weight:700">${t.ok?"✔":"✖"} ${esc(t.message)}</span><div class="small">${Number(t.ms)} ms</div>`:"—"}</td></tr>`;}).join("")}</tbody></table></div>`:"";
    }
    /* Current visitors: IP address + country flag of everyone on the site right now (from the presence heartbeat). */
    const onSince=t=>{const m=Math.max(0,Math.round((Date.now()-t)/60000));return m<1?"just now":m<60?m+" min":Math.floor(m/60)+" h "+(m%60)+" min";};
    function onTable(v){
      return v.length?`<div class="table-wrap"><table><thead><tr><th>Country</th><th>IP address</th><th>Page</th><th>Device</th><th>On site</th></tr></thead><tbody>${v.map(x=>`<tr><td style="white-space:nowrap">${countryLabel({Country:x.country,CountryCode:x.country_code})}</td><td><code>${esc(x.ip||"")}</code></td><td><span class="small">${esc(x.page||"/")}</span></td><td>${esc(x.device||"")}${x.chatting?' <span class="gr-pill ok">chatting</span>':""}</td><td><span class="small">${esc(onSince(x.first_seen))}</span></td></tr>`).join("")}</tbody></table></div>`:'<div class="empty">Nobody is on the site right now.</div>';
    }
    function onRender(d){
      const v=d.visitors||[];$("onCount").textContent=v.length;$("onList").innerHTML=onTable(v);
      $("visBadge").textContent="("+v.length+" online now)";
      if(!$("visModal").classList.contains("hidden")){
        $("visCount").textContent=v.length;$("visList").innerHTML=onTable(v);
        $("visCountries").innerHTML=(d.countries||[]).length?(d.countries||[]).map(c=>`<span class="gr-pill ok" style="margin:2px 4px 2px 0">${countryLabel({Country:c.name,CountryCode:c.code})} · ${c.count}</span>`).join(""):"No visitors right now.";
        $("visMsg").textContent="Updated "+new Date().toLocaleTimeString();
      }
    }
    async function onLoad(){try{onRender(await readJson(await fetch("/api/admin/online",{headers:auth(),cache:"no-store"})));}catch(e){const t='<div class="empty">'+esc(e.message||"Could not load current visitors.")+'</div>';$("onList").innerHTML=t;$("visList").innerHTML=t;}}
    async function grLoad(){
      try{
        const d=await readJson(await fetch("/api/admin/groq-keys",{headers:auth(),cache:"no-store"}));
        grBadge(d.summary);
        if(!$("grModal").classList.contains("hidden")){onLoad();grRender(d);$("grMsg").textContent="Updated "+new Date().toLocaleTimeString();}
      }catch(e){if(!$("grModal").classList.contains("hidden"))$("grMsg").textContent=e.message||"Could not load the key status.";}
    }
    /* Live chat + Visitors are ONE tool: a full-screen panel (the agent console with its Chats / Live visitors tabs). It stays loaded after the first open so new chats still beep. */
    const lcFull=$("lcFull"),lcFrame=$("lcFrame");
    const lcOpen=()=>{if(!lcFrame.getAttribute("src"))lcFrame.setAttribute("src",lcFrame.dataset.src);lcFull.classList.remove("hidden");lcFull.setAttribute("aria-hidden","false");document.body.style.overflow="hidden";lastTool=document.activeElement;};
    const lcClose=()=>{lcFull.classList.add("hidden");lcFull.setAttribute("aria-hidden","true");document.body.style.overflow="";if(lastTool&&lastTool.focus)lastTool.focus();};
    $("visOpen").addEventListener("click",lcOpen);$("lcFullClose").addEventListener("click",lcClose);
    document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!lcFull.classList.contains("hidden"))lcClose();});
    $("visRefresh").addEventListener("click",onLoad);
    setInterval(()=>{if(!document.hidden&&$("visModal").classList.contains("hidden")&&!$("app").classList.contains("hidden"))onLoad();},20000);setTimeout(()=>{if(!$("app").classList.contains("hidden"))onLoad();},1500);
    $("grOpen").addEventListener("click",()=>{openTool("grModal","grTest");$("grMsg").textContent="Loading…";grLoad();clearInterval(window.__grTimer);window.__grTimer=setInterval(grLoad,5000);});
    $("grRefresh").addEventListener("click",grLoad);
    /* Backup: email / download the website + database; automatic schedule. Main admin only. */
    const bkSize=n=>n>1048576?(n/1048576).toFixed(1)+" MB":Math.max(1,Math.round(n/1024))+" KB";
    function bkRender(d){
      const s=d.settings,m=d.mail||{};
      $("bkEmails").value=s.emails||"";$("bkEnabled").checked=!!s.enabled;$("bkHours").value=String(s.hours);if($("bkHours").value!==String(s.hours))$("bkHours").insertAdjacentHTML("beforeend",`<option value="${s.hours}">${s.hours} hours</option>`),$("bkHours").value=String(s.hours);
      $("bkChanged").checked=!!s.onlyChanged;$("bkCode").checked=!!s.includeCode;
      const warn=[];if(!m.configured)warn.push("No email sender is configured on the server (set MAIL_PROVIDER=relay with MAIL_RELAY_URL and MAIL_RELAY_TOKEN, or SMTP_*).");if(!s.emails)warn.push("No email address saved yet.");
      const el=$("bkSum");el.className="gr-sum "+(warn.length?"bad":"ok");
      el.innerHTML=(warn.length?"⚠ "+esc(warn.join(" ")):"✔ Backups go by email ("+esc(m.provider)+")"+(d.telegram?" and Telegram":"")+(d.encrypted?", encrypted":", not encrypted"))+
        "<br><small>Last: "+esc(s.lastStatus||"no backup yet")+(s.lastRun?" · "+esc(new Date(s.lastRun).toLocaleString()):"")+(d.next&&s.enabled?" · next check after "+esc(new Date(d.next).toLocaleString()):"")+" · files over "+d.maxEmailMB+" MB are not attached</small>";
      $("bkBadge").textContent=s.enabled?"(auto: every "+(s.hours>=24?(s.hours/24)+" d":s.hours+" h")+")":"(auto is off)";
      $("bkFiles").innerHTML=d.files.length?d.files.map(f=>`<div><a href="#" data-bkf="${esc(f.name)}">${esc(f.name)}</a> · ${bkSize(f.size)}</div>`).join(""):"None yet.";
    }
    async function bkLoad(){try{bkRender(await readJson(await fetch("/api/admin/backup",{headers:auth(),cache:"no-store"})));$("bkMsg").textContent="";}catch(e){$("bkSum").className="gr-sum bad";$("bkSum").textContent=e.message||"Could not load the backup settings.";}}
    async function bkDownload(url,name){const r=await fetch(url,{headers:auth()});if(!r.ok){let m="Download failed.";try{m=(await r.json()).message||m;}catch{}throw new Error(m);}const cd=r.headers.get("Content-Disposition")||"",fn=(/filename="?([^";]+)/.exec(cd)||[])[1]||name||"backup.zip",u=URL.createObjectURL(await r.blob()),a=document.createElement("a");a.href=u;a.download=fn;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),10000);}
    async function bkBusy(btn,label,fn){const old=btn.textContent;btn.disabled=true;btn.textContent=label;$("bkMsg").textContent="";try{await fn();}catch(e){$("bkMsg").textContent=e.message||"Failed.";toast($("bkMsg").textContent);}finally{btn.disabled=false;btn.textContent=old;}}
    /* Database panel: download of the live database. */
    async function foBusy(btn,label,fn){const old=btn.textContent;btn.disabled=true;btn.textContent=label;$("foMsg").textContent="";try{await fn();}catch(e){$("foMsg").textContent=e.message||"Failed.";toast($("foMsg").textContent);}finally{btn.disabled=false;btn.textContent=old;}}
    /* Live database backup panel (every minute, kept on the server) */
    function lvRender(d){
      const el=$("lvSum"),m=d.latest,bad=/^(ERROR|BLOCKED)/.test(d.lastStatus||"");
      el.className="gr-sum "+(bad?"bad":m?"ok":"bad");
      el.innerHTML=(bad?"⚠ ":m?"✔ ":"⚠ ")+(m?"Latest backup: <b>"+esc(new Date(m.created).toLocaleString())+"</b> · "+m.total+" rows · "+bkSize(m.bytes||0)+(m.encrypted?" · encrypted":" · <b>not encrypted</b> (set BACKUP_PASSPHRASE)"):"No backup yet (the first one is made within a minute of the server starting).")+
        "<br><small>Checks every "+d.everySec+" s and saves when something changed · folder: "+esc(d.dir)+(d.lastStatus?" · "+esc(d.lastStatus):"")+"</small>";
      $("lvFiles").innerHTML=d.files.length?d.files.map(f=>`<div><a href="#" data-lvf="${esc(f.name)}">${esc(f.name)}</a> · ${bkSize(f.size)} · ${esc(new Date(f.modified).toLocaleString())}</div>`).join(""):"No copies yet.";
    }
    async function lvLoad(){try{lvRender(await readJson(await fetch("/api/admin/live-backup",{headers:auth(),cache:"no-store"})));}catch(e){$("lvSum").className="gr-sum bad";$("lvSum").textContent=e.message||"Could not load the live backup status.";}}
    async function lvBusy(btn,label,fn){const old=btn.textContent;btn.disabled=true;btn.textContent=label;$("lvMsg").textContent="";try{await fn();}catch(e){$("lvMsg").textContent=e.message||"Failed.";toast($("lvMsg").textContent);}finally{btn.disabled=false;btn.textContent=old;}}
    $("lvDl").addEventListener("click",()=>lvBusy($("lvDl"),"Preparing…",async()=>{await bkDownload("/api/admin/live-backup/download","db-latest.tar.gz");$("lvMsg").textContent="Download started.";}));
    $("lvRun").addEventListener("click",()=>lvBusy($("lvRun"),"Backing up…",async()=>{const d=await readJson(await fetch("/api/admin/live-backup/run",{method:"POST",headers:auth()}));lvRender(d);$("lvMsg").textContent=d.message||"Done.";toast("Database backed up");}));
    $("lvFiles").addEventListener("click",e=>{const a=e.target.closest("[data-lvf]");if(!a)return;e.preventDefault();lvBusy($("lvDl"),"Preparing…",()=>bkDownload("/api/admin/live-backup/download?name="+encodeURIComponent(a.dataset.lvf),a.dataset.lvf));});
    $("lvRestore").addEventListener("click",async()=>{
      const f=$("lvFile").files[0],m=$("lvRMsg"),b=$("lvRestore");
      if(!f){m.textContent="Choose a backup file first.";return;}
      if($("lvConfirm").value.trim()!=="RESTORE"){m.textContent="Type RESTORE in the box to confirm.";return;}
      if(!confirm("Replace ALL current data (documents, users, orders...) with this backup? The current data is saved first, then the site restarts."))return;
      b.disabled=true;m.textContent="Uploading and checking…";
      try{const fd=new FormData();fd.append("file",f);fd.append("confirm","RESTORE");const d=await readJson(await fetch("/api/admin/live-backup/restore",{method:"POST",headers:auth(),body:fd}));m.textContent=d.message;toast("Restore started");}
      catch(e){m.textContent=e.message||"Restore failed.";toast(m.textContent);b.disabled=false;}
    });
    $("foDl").addEventListener("click",()=>foBusy($("foDl"),"Preparing…",async()=>{await bkDownload("/api/admin/db-export","database.zip");$("foMsg").textContent="Download started.";}));
    $("bkOpen").addEventListener("click",()=>{openTool("bkModal","bkEmails");$("bkMsg").textContent="Loading…";bkLoad();lvLoad();});
    $("bkSave").addEventListener("click",()=>bkBusy($("bkSave"),"Saving…",async()=>{const d=await readJson(await fetch("/api/admin/backup/settings",{method:"PUT",headers:auth({"Content-Type":"application/json"}),body:JSON.stringify({emails:$("bkEmails").value,enabled:$("bkEnabled").checked,hours:$("bkHours").value,onlyChanged:$("bkChanged").checked,includeCode:$("bkCode").checked})}));bkRender(d);$("bkMsg").textContent="Saved.";toast("Backup settings saved");}));
    $("bkRun").addEventListener("click",()=>bkBusy($("bkRun"),"Backing up…",async()=>{const d=await readJson(await fetch("/api/admin/backup/run",{method:"POST",headers:auth()}));bkRender(d);$("bkMsg").textContent="Done: "+d.result.name+" ("+bkSize(d.result.size)+"), email "+d.result.email+(d.result.telegram?", telegram "+d.result.telegram:"");toast("Backup finished");}));
    $("bkDl").addEventListener("click",()=>bkBusy($("bkDl"),"Preparing…",async()=>{await bkDownload("/api/admin/backup/download");$("bkMsg").textContent="Download started.";}));
    $("bkTest").addEventListener("click",()=>bkBusy($("bkTest"),"Sending…",async()=>{const d=await readJson(await fetch("/api/admin/backup/test-mail",{method:"POST",headers:auth()}));$("bkMsg").textContent=d.message;toast("Test email sent");}));
    $("bkFiles").addEventListener("click",e=>{const a=e.target.closest("[data-bkf]");if(!a)return;e.preventDefault();bkBusy($("bkDl"),"Preparing…",()=>bkDownload("/api/admin/backup/files/"+encodeURIComponent(a.dataset.bkf)));});

    $("grTest").addEventListener("click",async()=>{
      const b=$("grTest"),m=$("grMsg");b.disabled=true;b.textContent="Testing…";m.textContent="Asking Groq about each key…";
      try{
        const d=await readJson(await fetch("/api/admin/groq-keys/test",{method:"POST",headers:auth(),cache:"no-store"}));
        grTests={};d.results.forEach(r=>{grTests[r.key]=r;});
        grBadge(d.summary);grRender(d);
        const ok=d.results.filter(r=>r.ok).length;m.textContent=ok+" of "+d.results.length+" key"+(d.results.length===1?"":"s")+" accepted by Groq.";toast(m.textContent);
      }catch(e){m.textContent=e.message||"Could not test the keys.";}
      finally{b.disabled=false;b.textContent="Test keys";}
    });
    window.__grPollTimer=setInterval(()=>{if(token&&!document.hidden)grLoad();},30000);setTimeout(()=>{if(token)grLoad();},2500);
    /* Static pages: upload an .html file; it is served at /<url-name> and listed in /sitemap.xml automatically. */
    const slugOf=n=>String(n||"").toLowerCase().replace(/\.(html?|docx?|pdf|xlsx?|csv|tsv|txt|rtf|odt|ods|md)$/,"").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,100);
    let pgOrigin=location.origin,pgSlugTouched=false;
    function pgClear(){["pgFile","pgSlug","pgTitle","pgDesc","pgH1","pgH1Text","pgHtml"].forEach(i=>{$(i).value="";});$("pgNoindex").checked=false;$("pgPlain").checked=false;$("pgFileName").textContent="";$("pgMsg").textContent="";pgSlugTouched=false;}
    async function loadPages(){
      const box=$("pgList");box.innerHTML='<div class="loading"><span class="spinner"></span>Loading…</div>';
      try{
        const d=await readJson(await fetch("/api/admin/pages",{headers:auth(),cache:"no-store"}));pgOrigin=d.origin||location.origin;
        box.innerHTML=d.pages.length?`<div class="table-wrap"><table style="min-width:760px"><thead><tr><th>URL</th><th>Title</th><th>Status</th><th>Updated</th><th></th></tr></thead><tbody>${d.pages.map(x=>{
          const live=x.published,idx=live&&!x.noindex;
          return `<tr><td><a href="/${encodeURIComponent(x.slug)}" target="_blank" rel="noopener">/${esc(x.slug)}</a><div class="small">${bytes(x.size)}</div></td><td>${esc(x.title||"")}</td>
          <td>${live?'<span style="color:#067647;font-weight:700">Live</span>':'<span style="color:#b54708;font-weight:700">Hidden</span>'}<div class="small">${idx?"In sitemap":"Not in sitemap"}</div></td><td>${esc(formatDate(x.updated_at))}</td>
          <td style="white-space:nowrap"><button type="button" class="ghost" data-pgedit="${esc(x.slug)}">✎ Edit</button> <button type="button" class="ghost" data-pgflag="${esc(x.slug)}" data-k="published" data-v="${live?0:1}">${live?"Hide":"Publish"}</button> <button type="button" class="ghost" data-pgflag="${esc(x.slug)}" data-k="noindex" data-v="${x.noindex?0:1}">${x.noindex?"Allow index":"No-index"}</button> <button type="button" class="ghost" data-pgdel="${esc(x.slug)}" style="color:#b42318;border:1.5px solid #b42318;font-weight:700">🗑 Delete</button></td></tr>`;}).join("")}</tbody></table></div>`:'<div class="empty">No static pages yet. Upload your first one above.</div>';
      }catch(e){box.innerHTML='<div class="error-box">'+esc(e.message||"Could not load pages.")+'</div>';}
    }
    $("pageOpen").addEventListener("click",()=>{openTool("pageModal","pgFile");loadPages();});
    $("pgClear").addEventListener("click",pgClear);
    $("pgSlug").addEventListener("input",()=>{pgSlugTouched=true;});
    $("pgFile").addEventListener("change",async e=>{
      const f=e.target.files[0];if(!f)return;
      const m=$("pgMsg");
      if(f.size>25*1024*1024){m.textContent="That file is larger than 25 MB.";e.target.value="";return;}
      $("pgFileName").textContent=f.name+" ("+bytes(f.size)+")";
      m.textContent="Converting to HTML and publishing…";$("pgSave").disabled=true;
      try{
        /* the server converts ANY supported file to HTML and publishes it; a URL name typed by hand is kept, otherwise it comes from the file name */
        const fd=new FormData();fd.append("file",f);fd.append("save","1");fd.append("noindex",$("pgNoindex").checked?"1":"0");fd.append("plain",$("pgPlain").checked?"1":"0");
        if(pgSlugTouched&&$("pgSlug").value.trim())fd.append("slug",slugOf($("pgSlug").value));
        if($("pgTitle").value.trim())fd.append("title",$("pgTitle").value.trim());
        if($("pgDesc").value.trim())fd.append("description",$("pgDesc").value.trim());
        if($("pgH1").value.trim())fd.append("hero_h1",$("pgH1").value.trim());
        if($("pgH1Text").value.trim())fd.append("hero_text",$("pgH1Text").value.trim());
        const res=await fetch("/api/admin/pages/convert",{method:"POST",headers:auth(),body:fd});
        const d=await res.json().catch(()=>({}));
        if(d.html)$("pgHtml").value=d.html;
        if(!res.ok||d.success===false)throw new Error(d.message||"Could not convert the file.");
        $("pgSlug").value=d.slug;$("pgTitle").value=d.title||"";$("pgDesc").value=d.description||"";pgSlugTouched=false;
        m.innerHTML="✔ "+esc(d.message);toast(d.created?"Page uploaded":"Page updated");loadPages();
      }catch(err){m.textContent=err.message||"Could not convert the file.";}
      finally{$("pgSave").disabled=false;e.target.value="";}
    });
    $("pgSave").addEventListener("click",async()=>{
      const m=$("pgMsg"),b=$("pgSave"),slug=slugOf($("pgSlug").value);
      if(!$("pgHtml").value.trim()){m.textContent="Choose an .html file or paste the page HTML first.";return;}
      if(!slug){m.textContent="Enter the URL name, e.g. database-expert-help.";return;}
      b.disabled=true;m.textContent="Uploading…";
      try{
        const d=await readJson(await fetch("/api/admin/pages",{method:"POST",headers:auth({"Content-Type":"application/json"}),body:JSON.stringify({slug,title:$("pgTitle").value,description:$("pgDesc").value,hero_h1:$("pgH1").value,hero_text:$("pgH1Text").value,html:$("pgHtml").value,noindex:$("pgNoindex").checked,plain:$("pgPlain").checked})}));
        m.innerHTML='✔ '+esc(d.message);toast(d.created?"Page uploaded":"Page updated");$("pgSlug").value=d.slug;loadPages();
      }catch(err){m.textContent=err.message||"Could not upload.";}
      finally{b.disabled=false;}
    });
    $("pgList").addEventListener("click",async e=>{
      const ed=e.target.closest("[data-pgedit]"),fl=e.target.closest("[data-pgflag]"),dl=e.target.closest("[data-pgdel]");
      try{
        if(ed){const d=await readJson(await fetch("/api/admin/pages/"+encodeURIComponent(ed.dataset.pgedit),{headers:auth(),cache:"no-store"}));const p=d.page;
          $("pgSlug").value=p.slug;pgSlugTouched=true;$("pgTitle").value=p.title||"";$("pgDesc").value=p.description||"";$("pgH1").value=p.hero_h1||"";$("pgH1Text").value=p.hero_text||"";$("pgHtml").value=p.html||"";$("pgNoindex").checked=!!p.noindex;$("pgPlain").checked=!!p.plain;$("pgFileName").textContent="Editing /"+p.slug;$("pgMsg").textContent="Loaded. Change the HTML, then press Upload page to replace it.";$("pgHtml").scrollIntoView({block:"center"});}
        else if(fl){const body={};body[fl.dataset.k]=fl.dataset.v==="1";await readJson(await fetch("/api/admin/pages/"+encodeURIComponent(fl.dataset.pgflag),{method:"PUT",headers:auth({"Content-Type":"application/json"}),body:JSON.stringify(body)}));toast("Saved");loadPages();}
        else if(dl){if(!confirm('Permanently delete /'+dl.dataset.pgdel+'?\n\nThe page and its sitemap entry are removed and this cannot be undone.'))return;await readJson(await fetch("/api/admin/pages/"+encodeURIComponent(dl.dataset.pgdel),{method:"DELETE",headers:auth()}));toast("Page deleted");loadPages();}
      }catch(err){toast(err.message||"Action failed.");}
    });

    $("userGo").addEventListener("click",loadUsers);
    $("userQ").addEventListener("keydown",e=>{if(e.key==="Enter")loadUsers();});
    $("userList").addEventListener("click",async e=>{
      const b=e.target.closest("[data-uact]");if(!b)return;const act=b.dataset.uact,id=encodeURIComponent(b.dataset.id);
      if(act==="delete"&&!confirm("Permanently delete "+b.dataset.t+"?\n\nTheir account is removed and this cannot be undone."))return;
      if(act==="block"&&!confirm("Block this user? They will be signed out and cannot log in until unblocked."))return;
      b.disabled=true;
      try{await readJson(await fetch("/api/admin/users/"+id+(act==="delete"?"":"/"+act),{method:act==="delete"?"DELETE":"POST",headers:auth()}));toast(act==="delete"?"User deleted":act==="block"?"User blocked":"User unblocked");loadUsers();}
      catch(err){b.disabled=false;toast(err.message||"Action failed.");}
    });

    /* Admin accounts: everyone changes their own password; the main admin creates / edits / deletes admins and managers. */
    const admMsg=(id,t,bad)=>{const e=$(id);e.textContent=t||"";e.style.color=bad?"#b42318":"#067647";};
    window.admAfterAuth=info=>{
      info=info||{};window.__admRole=info.adminRole||"admin";window.__mustChangePw=!!info.mustChange;
      document.querySelectorAll("#app .tool-box").forEach(b=>{if(window.__admRole==="manager"&&b.id!=="visOpen")b.classList.add("hidden");});
      if(window.__admRole==="main"||window.__admRole==="admin")$("adminOpen").classList.remove("hidden");
      if(window.__admRole==="manager")$("adminOpen").classList.remove("hidden");   // managers also need "Change my password"
      if(window.__mustChangePw){$("pwWarn").classList.remove("hidden");$("admModal").querySelector(".close").classList.add("hidden");openTool("admModal","pwCur");loadAdmins();return true;}
      return false;
    };
    async function loadAdmins(){
      const main=window.__admRole==="main";$("admMain").classList.toggle("hidden",!main);if(!main)return;
      const box=$("admList");
      try{
        const d=await readJson(await fetch("/api/admin/admins",{headers:auth(),cache:"no-store"}));
        $("admMail").classList.toggle("hidden",d.mailReady);if(!d.mailReady)$("admMail").textContent="Email is not set up on this server (MAIL_PROVIDER=relay + MAIL_RELAY_URL + MAIL_RELAY_TOKEN + MAIL_FROM, or SMTP_*). Accounts are still created and the password is shown here so you can share it yourself.";
        const role=a=>a.role==="main"?"Main admin":a.role==="manager"?"Manager":"Admin";
        box.innerHTML=`<div class="table-wrap"><table><thead><tr><th>Username</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>${d.admins.map(a=>`<tr>
          <td><b>${esc(a.username)}</b></td><td><span class="small">${esc(a.email||"—")}</span></td><td>${role(a)}</td>
          <td>${a.is_active?'<span style="color:#067647;font-weight:700">Active</span>':'<span style="color:#b42318;font-weight:700">Disabled</span>'}${a.must_change_password?' <span class="small">(must change password)</span>':""}</td>
          <td style="white-space:nowrap">${a.role==="main"?'<span class="small">cannot be removed</span>':`<button type="button" class="ghost" data-aact="edit" data-id="${Number(a.id)}" data-u="${esc(a.username)}" data-e="${esc(a.email||"")}" data-r="${esc(a.role)}">✎ Edit</button> <button type="button" class="ghost" data-aact="reset" data-id="${Number(a.id)}" data-u="${esc(a.username)}">🔑 Reset &amp; email</button> <button type="button" class="ghost" data-aact="${a.is_active?"disable":"enable"}" data-id="${Number(a.id)}" style="color:#b54708">${a.is_active?"⛔ Disable":"✔ Enable"}</button> <button type="button" class="ghost" data-aact="delete" data-id="${Number(a.id)}" data-u="${esc(a.username)}" style="color:#b42318">🗑 Delete</button>`}</td></tr>`).join("")}</tbody></table></div>`;
      }catch(e){box.innerHTML='<div class="empty">'+esc(e.message||"Could not load admins.")+"</div>";}
    }
    $("adminOpen").addEventListener("click",()=>{openTool("admModal","pwCur");loadAdmins();});
    $("pwSave").addEventListener("click",async()=>{
      const cur=$("pwCur").value,n1=$("pwNew").value,n2=$("pwNew2").value;
      if(n1!==n2)return admMsg("pwMsg","The two new passwords do not match.",1);
      const b=$("pwSave");b.disabled=true;admMsg("pwMsg","Saving…");
      try{await readJson(await fetch("/api/admin/change-password",{method:"POST",headers:auth({"Content-Type":"application/json"}),body:JSON.stringify({current:cur,password:n1})}));
        admMsg("pwMsg","Password changed.");$("pwCur").value=$("pwNew").value=$("pwNew2").value="";
        if(window.__mustChangePw){window.__mustChangePw=false;location.reload();}
      }catch(e){admMsg("pwMsg",e.message||"Could not change the password.",1);}finally{b.disabled=false;}
    });
    const showPw=(r,who)=>{ if(r.password)prompt((r.emailed?"":"Email was NOT sent"+(r.emailError?" ("+r.emailError+")":"")+".\n")+"Copy these details and share them privately.\n\nUser: "+who+"\nPassword:",r.password);
      else if(r.emailed)toast("Sign-in details emailed to "+who); };
    $("admCreate").addEventListener("click",async()=>{
      const b=$("admCreate");b.disabled=true;admMsg("admMsg","Creating…");
      const body={username:$("admUser").value.trim(),email:$("admEmail").value.trim(),role:$("admRole").value,password:$("admPass").value,sendEmail:$("admSend").checked};
      try{const r=await readJson(await fetch("/api/admin/admins",{method:"POST",headers:auth({"Content-Type":"application/json"}),body:JSON.stringify(body)}));
        admMsg("admMsg",r.emailed?"Created and emailed.":"Created.");$("admUser").value=$("admEmail").value=$("admPass").value="";showPw(r,body.username);loadAdmins();
      }catch(e){admMsg("admMsg",e.message||"Could not create the account.",1);}finally{b.disabled=false;}
    });
    $("admList").addEventListener("click",async e=>{
      const b=e.target.closest("[data-aact]");if(!b)return;const act=b.dataset.aact,id=encodeURIComponent(b.dataset.id),who=b.dataset.u||"";
      try{
        if(act==="delete"){if(!confirm("Permanently delete "+who+"?\n\nThey are signed out at once and can no longer log in. This cannot be undone."))return;
          await readJson(await fetch("/api/admin/admins/"+id,{method:"DELETE",headers:auth()}));toast("Deleted "+who);}
        else if(act==="disable"||act==="enable"){await readJson(await fetch("/api/admin/admins/"+id+"/active",{method:"POST",headers:auth({"Content-Type":"application/json"}),body:JSON.stringify({active:act==="enable"})}));toast(act==="enable"?"Enabled":"Disabled");}
        else if(act==="reset"){if(!confirm("Create a new password for "+who+" and email it to them?\n\nTheir old password stops working."))return;
          const r=await readJson(await fetch("/api/admin/admins/"+id+"/reset",{method:"POST",headers:auth({"Content-Type":"application/json"}),body:"{}"}));showPw(r,who);}
        else if(act==="edit"){const u=prompt("Username:",who);if(u===null)return;const em=prompt("Email:",b.dataset.e||"");if(em===null)return;const ro=prompt("Role (admin or manager):",b.dataset.r||"admin");if(ro===null)return;
          await readJson(await fetch("/api/admin/admins/"+id,{method:"PATCH",headers:auth({"Content-Type":"application/json"}),body:JSON.stringify({username:u.trim(),email:em.trim(),role:ro.trim().toLowerCase()})}));toast("Saved");}
        loadAdmins();
      }catch(err){toast(err.message||"Action failed.");}
    });
    $("waOpen").addEventListener("click",()=>openTool("waModal","waNum"));

    /* WhatsApp number (public site icon). The pop-up opens by itself until a number is saved. */
    const waState=(cfg)=>{
      const on=!!cfg.whatsapp,e=$("waState");
      if(e)e.textContent=on?`Active: +${cfg.whatsapp}`:"No number set";
      $("waOpen").classList.toggle("off",!on);
      $("waHelp").innerHTML=on?`Active: <b>+${esc(cfg.whatsapp)}</b>. Visitors who tap the WhatsApp icon chat with this number.`:`<b style="color:#dc2626">No number set.</b> Enter your WhatsApp number to start WhatsApp chat (until then the icon opens live chat instead).`;
    };
    async function loadWa(){
      try{
        const d=await readJson(await fetch("/api/livechat/agent/settings",{headers:auth(),cache:"no-store"}));
        $("waNum").value=d.settings.whatsapp_number||"";$("waTxt").value=d.settings.whatsapp_text||"";
        waState({whatsapp:d.settings.whatsapp_number});
        if(!d.settings.whatsapp_number&&!window.__waPrompted){window.__waPrompted=true;openTool("waModal","waNum");}
      }catch(e){$("waState").textContent="Could not load";$("waHelp").textContent="Could not load WhatsApp settings.";}
    }
    $("waSave").addEventListener("click",async()=>{
      const m=$("waMsg");m.textContent="Saving…";
      try{
        const d=await readJson(await fetch("/api/livechat/agent/whatsapp",{method:"PUT",headers:auth({"Content-Type":"application/json"}),body:JSON.stringify({whatsapp_number:$("waNum").value,whatsapp_text:$("waTxt").value})}));
        waState(d);m.textContent="";toast(d.whatsapp?"WhatsApp number saved":"WhatsApp number cleared");if(d.whatsapp)closeTools();
      }catch(e){m.textContent=e.message||"Could not save.";}
    });
    new MutationObserver(()=>{if(token&&!$("app").classList.contains("hidden"))loadWa();}).observe($("app"),{attributes:true,attributeFilter:["class"]});

    /* Humanizer (admin only; the public site does not have it) */
    const chip=(t,c)=>`<span class="chip${c?" "+c:""}">${esc(t)}</span>`;
    $("hzGo").addEventListener("click",async()=>{
      const src=$("hzIn").value.trim(),m=$("hzMsg"),b=$("hzGo"),sc=$("hzScore");
      if(!src){m.textContent="Paste some text first.";return;}
      b.disabled=true;b.textContent="Rewriting…";m.textContent="This takes 20 to 60 seconds…";sc.classList.add("hidden");
      try{
        const d=await readJson(await fetch("/api/aicheck/humanize",{method:"POST",headers:auth({"Content-Type":"application/json"}),body:JSON.stringify({text:src,tone:$("hzTone").value})}));
        $("hzOut").value=d.text||"";m.textContent="Done.";
        let html="";
        if(d.before&&d.after){const good=d.after.ai_percent<=d.before.ai_percent;html+=chip(`AI score ${d.before.ai_percent}% → ${d.after.ai_percent}%`,good?"good":"bad")+chip(`Human ${d.after.human_percent}%`)+(d.rounds?chip(`${d.rounds} repair pass${d.rounds>1?"es":""}`):"");}
        else if(d.after){html+=chip(`AI score ${d.after.ai_percent}%`)+chip(`Human ${d.after.human_percent}%`);}
        (d.warnings||[]).forEach(w=>{html+=`<div class="hz-warn">${esc(w)}</div>`;});
        sc.innerHTML=html;sc.classList.toggle("hidden",!html);
      }catch(e){m.textContent=e.message||"Could not humanize.";}
      finally{b.disabled=false;b.textContent="Humanize";}
    });
    $("hzCopy").addEventListener("click",async()=>{const v=$("hzOut").value;if(!v)return;try{await navigator.clipboard.writeText(v);}catch{$("hzOut").select();document.execCommand("copy");}toast("Copied");});
    $("hzClear").addEventListener("click",()=>{$("hzIn").value="";$("hzOut").value="";$("hzMsg").textContent="";$("hzScore").classList.add("hidden");});
    session();
    window.__adminRefreshTimer = setInterval(() => {
      if (document.hidden) return;   // background tab: do not poll 
      if (token && !$('modal').classList.contains("hidden")) return;
      if (token) load({silent:true});
    }, 30000);
  }
  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",initAdmin,{once:true});
  }else{
    initAdmin();
  }
})();
