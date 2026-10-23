const bcrypt=require("bcrypt"),jwt=require("jsonwebtoken");
const {query}=require("../config/database");
async function login(req,res){
 try{
  const username=String(req.body?.username||"").trim(),password=String(req.body?.password||"");
  if(!username||!password)return res.status(400).json({success:false,message:"Username and password are required."});
  const r=await query("SELECT id,username,password_hash,is_active,role,must_change_password FROM admin_users WHERE username=$1 LIMIT 1",[username]);
  const a=r.rows[0];
  if(!a||!a.is_active||!(await bcrypt.compare(password,a.password_hash)))return res.status(401).json({success:false,message:"Invalid username or password."});
  const token=jwt.sign({id:Number(a.id),username:a.username,role:"admin"},process.env.JWT_SECRET,{expiresIn:"12h"});
  res.json({success:true,token,username:a.username,adminRole:a.role,mustChange:!!a.must_change_password});
 }catch(e){console.error("ADMIN LOGIN ERROR:",e);res.status(500).json({success:false,message:"Unable to log in."});}
}
/* One-time first admin for a host with no shell (e.g. a fresh deploy that came up empty). Works ONLY while there is no admin at all
   AND the host has the secret variable ADMIN_SETUP_TOKEN (12+ characters). Remove that variable afterwards. */
const crypto=require("crypto");let setupFails=[];
const setupToken=()=>String(process.env.ADMIN_SETUP_TOKEN||"").trim();
async function noAdmin(){return !(await query("SELECT 1 FROM admin_users LIMIT 1")).rows.length;}
async function setupStatus(req,res){try{res.set("Cache-Control","no-store");res.json({success:true,needed:setupToken().length>=12&&await noAdmin()});}catch(e){res.json({success:true,needed:false});}}
async function firstSetup(req,res){
 try{
  const now=Date.now();setupFails=setupFails.filter(t=>now-t<15*60000);
  if(setupFails.length>=8)return res.status(429).json({success:false,message:"Too many attempts. Try again in 15 minutes."});
  const tk=setupToken();
  if(tk.length<12||!(await noAdmin()))return res.status(404).json({success:false,message:"Not available."});
  const given=Buffer.from(String(req.body?.token||"")),want=Buffer.from(tk);
  if(given.length!==want.length||!crypto.timingSafeEqual(given,want)){setupFails.push(now);return res.status(403).json({success:false,message:"The setup token is wrong."});}
  const username=String(req.body?.username||"").trim(),password=String(req.body?.password||"");
  if(!/^[A-Za-z0-9._@-]{3,60}$/.test(username))return res.status(400).json({success:false,message:"Username: 3-60 letters, numbers or . _ @ -"});
  if(password.length<10)return res.status(400).json({success:false,message:"Password must be at least 10 characters."});
  const h=await bcrypt.hash(password,12);
  await query("INSERT INTO admin_users(username,password_hash,is_active,role) VALUES($1,$2,TRUE,'main')",[username,h]);
  res.json({success:true,message:"Main admin created. Sign in now, then remove ADMIN_SETUP_TOKEN from the host variables."});
 }catch(e){console.error("ADMIN SETUP ERROR:",e);res.status(500).json({success:false,message:"Could not create the admin."});}
}
function me(req,res){res.json({success:true,admin:req.admin});}
module.exports={login,me,setupStatus,firstSetup};
