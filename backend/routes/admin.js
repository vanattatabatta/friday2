const express=require("express");
const {login,me,setupStatus,firstSetup}=require("../controllers/adminController");
const {requireAdmin,requireMainAdmin,clearAdminCache}=require("../middleware/auth");
const {query}=require("../config/database");
const r=express.Router();
r.post("/login",login);
r.get("/setup-status",setupStatus);
r.post("/first-setup",firstSetup);
r.get("/me",requireAdmin,me);
/* Live state of the Groq key pool (keys are masked): which key is in use, calls in the last minute, keys that are resting. */
const groqState=()=>{const g=require("../services/groqKeys");return {summary:g.poolSummary(),keys:g.keyStatus()};};
r.get("/groq-keys",requireAdmin,(req,res)=>{res.set("Cache-Control","no-store");res.json({success:true,...groqState()});});
/* Everyone on the website right now: IP address, country (with code for the flag), page and device. Shown in the Groq tab. */
r.get("/online",requireAdmin,async(req,res)=>{
  try{res.set("Cache-Control","no-store");const d=await require("../services/presenceService").snapshot();res.json({success:true,online:d.online,countries:d.countries,visitors:d.visitors.map(v=>({id:v.id,ip:v.ip,country:v.country,country_code:v.country_code,page:v.page,device:v.device,first_seen:v.first_seen,last_seen:v.last_seen,chatting:v.chatting}))});}
  catch(e){console.error("[ADMIN] online:",e.message);res.status(500).json({success:false,message:"Could not load current visitors."});}
});
/* "Test keys" button: asks Groq whether every key is accepted (does not use up chat calls). */
r.post("/groq-keys/test",requireAdmin,async(req,res)=>{
  try{res.set("Cache-Control","no-store");const results=await require("../services/groqKeys").checkKeys();res.json({success:true,results,...groqState()});}
  catch(e){console.error("[ADMIN] groq key test:",e.message);res.status(500).json({success:false,message:"Could not test the Groq keys."});}
});

/* Document library moderation. Only an admin can remove an uploaded document; owners cannot. */
r.get("/docs/status",requireAdmin,async(req,res)=>res.json({success:true,...(await require("../services/docService").renderStatus())}));
r.get("/docs",requireAdmin,async(req,res)=>{
  try{
    const q=String(req.query.q||"").trim().slice(0,100);
    const {rows}=await query(`SELECT d.id,d.title,d.slug,d.school,d.course,d.kind,d.page_count,d.views,d.created_at,d.removed,
        u.email AS owner_email,u.name AS owner_name,(SELECT ip FROM doc_upload_log l WHERE l.doc_id=d.id ORDER BY l.id DESC LIMIT 1) AS upload_ip,(SELECT COUNT(*)::int FROM doc_unlocks k WHERE k.doc_id=d.id) AS unlocks
      FROM docs d LEFT JOIN users u ON u.id=d.owner_id
      WHERE ($1='' OR d.title ILIKE $2 OR d.course ILIKE $2 OR d.school ILIKE $2 OR u.email ILIKE $2 OR d.id IN (SELECT doc_id FROM doc_upload_log WHERE ip ILIKE $2))
      ORDER BY d.created_at DESC LIMIT 500`,[q,"%"+q.replace(/[\\%_]/g,"\\$&")+"%"]);
    res.json({success:true,docs:rows});
  }catch(e){console.error("[ADMIN] docs list:",e.message);res.status(500).json({success:false,message:"Could not load documents."});}
});
r.delete("/docs/:id",requireAdmin,async(req,res)=>{
  if(!/^\d{1,18}$/.test(req.params.id))return res.status(400).json({success:false,message:"Bad id."});
  try{
    /* Permanent: pages, the stored file and unlock records go with it (ON DELETE CASCADE) and the link becomes free again. */
    const d=await query("DELETE FROM docs WHERE id=$1",[req.params.id]);
    res.status(d.rowCount?200:404).json({success:!!d.rowCount,message:d.rowCount?"Document deleted.":"Document not found."});
  }catch(e){console.error("[ADMIN] doc delete:",e.message);res.status(500).json({success:false,message:"Could not delete the document."});}
});

/* Deletes ONLY the documents that were ticked in the admin list (never the whole library). Body: {"ids":[12,15,...]}, at most 200 per request. */
r.post("/docs/delete-selected",requireAdmin,async(req,res)=>{
  const ids=[...new Set([].concat((req.body||{}).ids||[]).map(String).filter(v=>/^\d{1,18}$/.test(v)))].slice(0,200);
  if(!ids.length)return res.status(400).json({success:false,message:"Select at least one document."});
  try{
    const d=await query("DELETE FROM docs WHERE id = ANY($1::bigint[])",[ids]);
    console.warn("[ADMIN] selected documents deleted:",d.rowCount);
    res.json({success:true,deleted:d.rowCount,message:d.rowCount+" document"+(d.rowCount===1?"":"s")+" deleted."});
  }catch(e){console.error("[ADMIN] delete-selected:",e.message);res.status(500).json({success:false,message:"Could not delete the selected documents."});}
});

/* Static pages: upload an .html file (or paste HTML) and it is live at /<url-name> and listed in /sitemap.xml at once. */
const SP=require("../services/staticPages");
const spOrigin=req=>String(process.env.SITE_URL||"").trim().replace(/\/+$/,"")||`${String(req.get("x-forwarded-proto")||req.protocol||"https").split(",")[0]}://${req.get("host")}`;
r.get("/pages",requireAdmin,async(req,res)=>{try{res.json({success:true,pages:await SP.list(),origin:spOrigin(req)});}catch(e){console.error("[ADMIN] pages list:",e.message);res.status(500).json({success:false,message:"Could not load pages."});}});
const spUpload=require("multer")({storage:require("multer").memoryStorage(),limits:{fileSize:25*1048576,files:1}});
/* Any file (html, docx, doc, pdf, xlsx, csv, txt ...) -> HTML. With save=1 the page is also published at once (and listed in the sitemap). */
r.post("/pages/convert",requireAdmin,spUpload.single("file"),async(req,res)=>{
  let out=null;
  try{
    if(!req.file)return res.status(400).json({success:false,message:"Choose a file."});
    out=await SP.convertFile(req.file.buffer,Buffer.from(req.file.originalname,"latin1").toString("utf8"));
    const b=req.body||{};
    if(!(b.save==="1"||b.save==="true"))return res.json({success:true,...out,slug:SP.cleanSlug(out.title)});
    const slug=SP.cleanSlug(b.slug)||SP.cleanSlug(Buffer.from(req.file.originalname,"latin1").toString("utf8"))||SP.cleanSlug(out.title);
    const saved=await SP.save({slug,title:b.title||out.title,description:b.description||out.description,html:out.html,noindex:b.noindex==="true"||b.noindex==="1",plain:b.plain==="true"||b.plain==="1",hero_h1:b.hero_h1,hero_text:b.hero_text});
    const url=spOrigin(req)+"/"+saved.slug;
    if(saved.indexed){try{require("../services/qaService").indexNow([url],req.get("host"));}catch{}}
    res.json({success:true,...saved,html:out.html,description:out.description,url,message:(saved.created?"Page uploaded":"Page updated")+": "+url+(saved.indexed?" (added to the sitemap)":" (not in the sitemap)")});
  }catch(e){if(!e.status)console.error("[ADMIN] file convert:",e.message);res.status(e.status||500).json({success:false,message:e.status?e.message:"Could not convert the file.",html:out?out.html:undefined});}
});
r.get("/pages/:slug",requireAdmin,async(req,res)=>{try{const p=await SP.get(req.params.slug);res.status(p?200:404).json(p?{success:true,page:p}:{success:false,message:"Page not found."});}catch(e){res.status(500).json({success:false,message:"Could not load the page."});}});
r.post("/pages",requireAdmin,async(req,res)=>{
  try{
    const out=await SP.save(req.body||{}),url=spOrigin(req)+"/"+out.slug;
    if(out.indexed){try{const Q=require("../services/qaService");Q.indexNow([url],req.get("host"));}catch{}}
    res.json({success:true,...out,url,message:(out.created?"Page uploaded":"Page updated")+": "+url+(out.indexed?" (added to /sitemap.xml)":" (not in the sitemap)")});
  }catch(e){if(!e.status)console.error("[ADMIN] page save:",e.message);res.status(e.status||500).json({success:false,message:e.status?e.message:"Could not save the page."});}
});
r.put("/pages/:slug",requireAdmin,async(req,res)=>{try{const ok=await SP.setFlags(req.params.slug,req.body||{});res.status(ok?200:404).json({success:ok,message:ok?"Saved.":"Page not found."});}catch(e){res.status(500).json({success:false,message:"Could not save."});}});
r.delete("/pages/:slug",requireAdmin,async(req,res)=>{try{const ok=await SP.remove(req.params.slug);res.status(ok?200:404).json({success:ok,message:ok?"Page deleted.":"Page not found."});}catch(e){res.status(500).json({success:false,message:"Could not delete."});}});

/* Customer account moderation: an admin can block, unblock or delete any user. */
const ustore=require("../services/userStore");
r.get("/users",requireAdmin,async(req,res)=>{
  try{
    const q=String(req.query.q||"").trim().slice(0,100),like="%"+q.replace(/[\\%_]/g,"\\$&")+"%";
    const d=await query(`SELECT id,user_code,name,email,status,auth_provider,created_at,last_login_at,(SELECT COUNT(*) FROM docs WHERE owner_id=users.id) AS docs FROM users WHERE ($1='' OR name ILIKE $2 OR email ILIKE $2 OR user_code ILIKE $2) ORDER BY created_at DESC LIMIT 200`,[q,like]);
    res.json({success:true,users:d.rows});
  }catch(e){console.error("[ADMIN] users:",e.message);res.status(500).json({success:false,message:"Could not load users."});}
});
const uid=(req,res)=>{if(!/^\d{1,18}$/.test(req.params.id)){res.status(400).json({success:false,message:"Bad id."});return null;}return req.params.id;};
r.post("/users/:id/block",requireAdmin,async(req,res)=>{const id=uid(req,res);if(!id)return;try{await ustore.setStatus(id,"blocked");res.json({success:true,message:"User blocked."});}catch(e){res.status(500).json({success:false,message:"Could not block the user."});}});
r.post("/users/:id/unblock",requireAdmin,async(req,res)=>{const id=uid(req,res);if(!id)return;try{await ustore.setStatus(id,"active");res.json({success:true,message:"User unblocked."});}catch(e){res.status(500).json({success:false,message:"Could not unblock the user."});}});
r.delete("/users/:id",requireAdmin,async(req,res)=>{const id=uid(req,res);if(!id)return;try{await ustore.deleteUser(id);res.json({success:true,message:"User deleted."});}catch(e){console.error("[ADMIN] user delete:",e.message);res.status(500).json({success:false,message:"Could not delete the user."});}});

/* ---------------- Admin accounts (roles: main, admin, manager) ---------------- */
const bcrypt=require("bcrypt"),crypto=require("crypto");
const adminMail=require("../services/adminEmailService");
const okUser=u=>/^[A-Za-z0-9._-]{3,40}$/.test(u),okEmail=e=>e.length<=255&&/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
const genPw=()=>crypto.randomBytes(9).toString("base64url");
const pwProblem=(p,u)=>!p||p.length<8?"Password must be at least 8 characters.":p.length>100?"Password is too long.":(u&&p.toLowerCase()===String(u).toLowerCase())?"Password must differ from the username.":"";
const ROLES=["admin","manager"];
const aid=(req,res)=>{if(!/^\d{1,18}$/.test(req.params.id)){res.status(400).json({success:false,message:"Bad id."});return null;}return req.params.id;};
const loadAdmin=async id=>(await query("SELECT id,username,email,role,is_active FROM admin_users WHERE id=$1",[id])).rows[0]||null;

/* Every admin / manager: change MY OWN password (needs the current one). */
r.post("/change-password",requireAdmin,async(req,res)=>{
  try{
    const cur=String(req.body?.current||""),pw=String(req.body?.password||"");
    const a=(await query("SELECT username,password_hash FROM admin_users WHERE id=$1",[req.admin.id])).rows[0];
    if(!a||!(await bcrypt.compare(cur,a.password_hash)))return res.status(400).json({success:false,message:"Current password is wrong."});
    const bad=pwProblem(pw,a.username);if(bad)return res.status(400).json({success:false,message:bad});
    if(pw===cur)return res.status(400).json({success:false,message:"The new password must be different from the current one."});
    await query("UPDATE admin_users SET password_hash=$1,must_change_password=FALSE WHERE id=$2",[await bcrypt.hash(pw,12),req.admin.id]);
    clearAdminCache(req.admin.id);
    res.json({success:true,message:"Password changed."});
  }catch(e){console.error("[ADMIN] change-password:",e.message);res.status(500).json({success:false,message:"Could not change the password."});}
});

/* Main admin only: list, create, edit, reset password, activate / deactivate, delete. */
r.get("/admins",requireMainAdmin,async(req,res)=>{
  try{res.set("Cache-Control","no-store");res.json({success:true,admins:(await query("SELECT id,username,email,role,is_active,must_change_password,created_at FROM admin_users ORDER BY id")).rows,mailReady:require("../services/mailer").isConfigured()});}
  catch(e){console.error("[ADMIN] admins list:",e.message);res.status(500).json({success:false,message:"Could not load admins."});}
});
r.post("/admins",requireMainAdmin,async(req,res)=>{
  try{
    const b=req.body||{},username=String(b.username||"").trim(),email=String(b.email||"").trim(),role=ROLES.includes(b.role)?b.role:"admin",send=b.sendEmail!==false;
    if(!okUser(username))return res.status(400).json({success:false,message:"Username: 3-40 letters, numbers, dot, dash or underscore."});
    if(email&&!okEmail(email))return res.status(400).json({success:false,message:"Enter a valid email address."});
    if(send&&!email)return res.status(400).json({success:false,message:"Enter an email address to send the sign-in details to (or untick the email box)."});
    let password=String(b.password||""),generated=false;
    if(!password){password=genPw();generated=true;}else{const bad=pwProblem(password,username);if(bad)return res.status(400).json({success:false,message:bad});}
    if((await query("SELECT 1 FROM admin_users WHERE lower(username)=lower($1)",[username])).rows.length)return res.status(409).json({success:false,message:"That username is already taken."});
    const ins=await query("INSERT INTO admin_users(username,password_hash,is_active,email,role,must_change_password,created_by) VALUES($1,$2,TRUE,$3,$4,TRUE,$5) RETURNING id",[username,await bcrypt.hash(password,12),email||null,role,req.admin.id]);
    let emailed=false,emailError="";
    if(send){try{await adminMail.sendCredentials({username,email,password,role,reason:"created"});emailed=true;}catch(e){emailError=e.message||"Email failed.";}}
    console.log("[ADMIN]",req.admin.username,"created",role,username,emailed?"(emailed)":"");
    res.json({success:true,id:ins.rows[0].id,emailed,emailError,password:emailed?undefined:password,generated});
  }catch(e){console.error("[ADMIN] create admin:",e.message);res.status(500).json({success:false,message:"Could not create the account."});}
});
r.patch("/admins/:id",requireMainAdmin,async(req,res)=>{
  const id=aid(req,res);if(!id)return;
  try{
    const a=await loadAdmin(id);if(!a)return res.status(404).json({success:false,message:"Not found."});
    const b=req.body||{},username=b.username===undefined?a.username:String(b.username).trim(),email=b.email===undefined?(a.email||""):String(b.email).trim();
    const role=b.role===undefined?a.role:b.role;
    if(!okUser(username))return res.status(400).json({success:false,message:"Username: 3-40 letters, numbers, dot, dash or underscore."});
    if(email&&!okEmail(email))return res.status(400).json({success:false,message:"Enter a valid email address."});
    if(a.role==="main"?role!=="main":!ROLES.includes(role))return res.status(400).json({success:false,message:"Invalid role."});
    if((await query("SELECT 1 FROM admin_users WHERE lower(username)=lower($1) AND id<>$2",[username,id])).rows.length)return res.status(409).json({success:false,message:"That username is already taken."});
    await query("UPDATE admin_users SET username=$1,email=$2,role=$3 WHERE id=$4",[username,email||null,role,id]);
    clearAdminCache(id);res.json({success:true,message:"Saved."});
  }catch(e){console.error("[ADMIN] edit admin:",e.message);res.status(500).json({success:false,message:"Could not save."});}
});
r.post("/admins/:id/reset",requireMainAdmin,async(req,res)=>{
  const id=aid(req,res);if(!id)return;
  try{
    const a=await loadAdmin(id);if(!a)return res.status(404).json({success:false,message:"Not found."});
    if(String(id)===String(req.admin.id))return res.status(400).json({success:false,message:"Use \"Change my password\" for your own account."});
    const b=req.body||{};let password=String(b.password||"");
    if(!password)password=genPw();else{const bad=pwProblem(password,a.username);if(bad)return res.status(400).json({success:false,message:bad});}
    const send=b.sendEmail!==false;
    if(send&&!a.email)return res.status(400).json({success:false,message:"This account has no email. Add one with Edit first, or untick the email box."});
    await query("UPDATE admin_users SET password_hash=$1,must_change_password=TRUE WHERE id=$2",[await bcrypt.hash(password,12),id]);
    clearAdminCache(id);
    let emailed=false,emailError="";
    if(send){try{await adminMail.sendCredentials({username:a.username,email:a.email,password,role:a.role,reason:"reset"});emailed=true;}catch(e){emailError=e.message||"Email failed.";}}
    res.json({success:true,emailed,emailError,password:emailed?undefined:password});
  }catch(e){console.error("[ADMIN] reset admin:",e.message);res.status(500).json({success:false,message:"Could not reset the password."});}
});
r.post("/admins/:id/active",requireMainAdmin,async(req,res)=>{
  const id=aid(req,res);if(!id)return;
  try{
    const a=await loadAdmin(id);if(!a)return res.status(404).json({success:false,message:"Not found."});
    if(a.role==="main"||String(id)===String(req.admin.id))return res.status(400).json({success:false,message:"The main admin cannot be disabled."});
    await query("UPDATE admin_users SET is_active=$1 WHERE id=$2",[!!req.body?.active,id]);
    clearAdminCache(id);res.json({success:true});
  }catch(e){console.error("[ADMIN] active admin:",e.message);res.status(500).json({success:false,message:"Could not update."});}
});
r.delete("/admins/:id",requireMainAdmin,async(req,res)=>{
  const id=aid(req,res);if(!id)return;
  try{
    const a=await loadAdmin(id);if(!a)return res.status(404).json({success:false,message:"Not found."});
    if(a.role==="main"||String(id)===String(req.admin.id))return res.status(400).json({success:false,message:"The main admin cannot be deleted."});
    await query("DELETE FROM admin_users WHERE id=$1",[id]);
    clearAdminCache(id);console.warn("[ADMIN]",req.admin.username,"deleted",a.role,a.username);
    res.json({success:true,message:"Deleted "+a.username+"."});
  }catch(e){console.error("[ADMIN] delete admin:",e.message);res.status(500).json({success:false,message:"Could not delete."});}
});

/* Database size vs the plan limit (Neon free: 1 GB). Main admin only. */
r.get("/db-usage",requireMainAdmin,async(req,res)=>{try{res.set("Cache-Control","no-store");res.json({success:true,...(await require("../services/dbUsage").report())});}catch(e){res.status(500).json({success:false,message:"Could not read the database size."});}});
/* Backups (main admin only: the file contains user data). Settings, run now, download, test email. */
/* Download every database table (JSON inside a .zip). Main admin only. */
r.get("/db-export",requireMainAdmin,async(req,res)=>{try{const b=await bk().buildBackup({settings:{includeCode:false},full:true});res.set({"Content-Type":"application/octet-stream","Content-Disposition":`attachment; filename="${b.name.replace(/^backup-/,"database-")}"`,"Cache-Control":"no-store"});res.send(b.buf);}catch(e){bkErr(res,e,"Could not export the database.");}});
const bk=()=>require("../services/backupService");
const bkErr=(res,e,msg)=>{console.error("[ADMIN] backup:",e.message);res.status(e.status||500).json({success:false,message:e.status?e.message:msg});};
r.get("/backup",requireMainAdmin,async(req,res)=>{try{res.set("Cache-Control","no-store");res.json({success:true,...(await bk().status())});}catch(e){bkErr(res,e,"Could not load the backup settings.");}});
r.put("/backup/settings",requireMainAdmin,async(req,res)=>{try{await bk().saveSettings(req.body||{});res.json({success:true,message:"Backup settings saved.",...(await bk().status())});}catch(e){bkErr(res,e,"Could not save the settings.");}});
r.post("/backup/run",requireMainAdmin,async(req,res)=>{try{const out=await bk().runBackup({reason:"manual by "+(req.admin&&req.admin.username||"admin"),force:true});res.json({success:true,result:out,...(await bk().status())});}catch(e){bkErr(res,e,"The backup failed.");}});
/* Live database backup (every minute, kept on the server). Main admin only: the file contains user data. */
const lvb=()=>require("../services/liveBackup");
r.get("/live-backup",requireMainAdmin,async(req,res)=>{try{res.set("Cache-Control","no-store");res.json({success:true,...(await lvb().status())});}catch(e){bkErr(res,e,"Could not load the live backup status.");}});
r.post("/live-backup/run",requireMainAdmin,async(req,res)=>{try{const out=await lvb().snapshot({reason:"manual by "+(req.admin&&req.admin.username||"admin"),force:true});res.json({success:true,message:out.status,...(await lvb().status())});}catch(e){bkErr(res,e,"Could not make the backup.");}});
r.get("/live-backup/download",requireMainAdmin,(req,res)=>{try{const fs=require("fs"),name=req.query.name||(lvb().listFiles().find(f=>f.name.startsWith("db-latest"))||{}).name,f=lvb().fileFor(name);if(!f||!fs.existsSync(f))return res.status(404).json({success:false,message:"There is no backup file yet. Click \"Back up now\" first."});res.set({"Content-Type":"application/octet-stream","Content-Disposition":`attachment; filename="${name}"`,"Cache-Control":"no-store"});fs.createReadStream(f).on("error",()=>res.destroy()).pipe(res);}catch(e){bkErr(res,e,"Could not download the backup.");}});
const restoreUpload=require("multer")({storage:require("multer").memoryStorage(),limits:{fileSize:Number(process.env.LIVE_RESTORE_MAX_MB||500)*1048576,files:1}});
r.post("/live-backup/restore",requireMainAdmin,restoreUpload.single("file"),async(req,res)=>{
  try{
    if(!req.file||!req.file.buffer.length)return res.status(400).json({success:false,message:"Choose a backup file (db-latest.tar.gz) first."});
    if(String(req.body&&req.body.confirm||"")!=="RESTORE")return res.status(400).json({success:false,message:"Type RESTORE to confirm."});
    lvb().toPlain(req.file.buffer);                         /* refuse a wrong file / wrong passphrase BEFORE anything is changed */
    await lvb().safetyCopy();                               /* the current data is saved first (Admin > Backup > Copies: db-before-restore-...) */
    lvb().queueRestore(req.file.buffer);
    res.json({success:true,message:"Backup accepted. The server is restarting now to load it (about 30 seconds). Reload this page, then sign in again."});
    setTimeout(()=>process.kill(process.pid,"SIGTERM"),800);   /* the host restarts the site; on a PC run  npm start  again */
  }catch(e){console.error("[ADMIN] restore:",e.message);res.status(400).json({success:false,message:e.message||"Could not restore the backup."});}
});
r.get("/backup/download",requireMainAdmin,async(req,res)=>{try{const b=await bk().buildBackup();res.set({"Content-Type":"application/octet-stream","Content-Disposition":`attachment; filename="${b.name}"`,"Cache-Control":"no-store"});res.send(b.buf);}catch(e){bkErr(res,e,"Could not build the backup.");}});
r.get("/backup/files/:name",requireMainAdmin,(req,res)=>{const f=bk().localPath(req.params.name);if(!f||!require("fs").existsSync(f))return res.status(404).json({success:false,message:"That backup is no longer on the server."});res.download(f);});
r.post("/backup/test-mail",requireMainAdmin,async(req,res)=>{
  try{const s=await bk().getSettings(),mailer=require("../services/mailer");if(!s.emails)return res.status(400).json({success:false,message:"Add an email address first."});
    const v=await mailer.verify();if(!v.configured)return res.status(400).json({success:false,message:"No email sender is configured on the server."});
    await mailer.send({to:s.emails,subject:"Backup email test",html:"<p>This is a test from the admin Backup tool. Backups will be sent to this address.</p>",text:"This is a test from the admin Backup tool."});
    res.json({success:true,message:"Test email sent via "+v.provider+" to "+s.emails+"."+(v.verified?"":" (sender check: "+v.error+")")});}
  catch(e){bkErr(res,e,"The test email could not be sent.");}
});

module.exports=r;
