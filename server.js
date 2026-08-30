import express from "express";
import session from "express-session";
import dotenv from "dotenv";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import { google } from "googleapis";
import nodemailer from "nodemailer";
import Razorpay from "razorpay";
import { initDB, readStore, writeStore } from "./db.js";

dotenv.config();
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const app=express();
app.set("trust proxy",1);
const PORT=Number(process.env.PORT||8787);

const defaultStore={
  settings:{businessName:"Demo Realty Group",clientId:"demo-realty",website:"https://example-realty.in",reportEmail:"",clientWhatsApp:"",whatsappCountryCode:"91",reportEnabled:false,hotThreshold:80,warmThreshold:50,assistant:{name:"ASSISTQ Assistant",greeting:"Hi! 👋 What can I help you with today?",tone:"Professional, friendly and concise",knowledge:"",questions:[]},customLeadFields:[],scoring:{name:10,phone:15,email:5,location:{default:6,matchPoints:10,serviceAreas:["Navi Mumbai","Mumbai","Thane","Pune"]},engagement:5,purpose:{default:5,values:{"Buying":10,"Renting":6}},configuration:{default:9,values:{"1BHK":9,"2BHK":12,"3BHK":14,"4BHK":15}},budget:{default:9,values:{"Under ₹50L":9,"₹50L-1Cr":11,"₹1Cr-2Cr":13,"₹2Cr+":15}},timeline:{default:8,values:{"Immediately":15,"1-3 months":11,"3-6 months":8,"Just exploring":4}}}},
  clients:[{id:"demo-realty",name:"Demo Realty Group",website:"https://example-realty.in",reportEmail:"",accessCode:"ASSISTQ-DEMO",plan:"Demo",subscriptionStatus:"active",subscriptionStart:null,subscriptionEnd:null}],
  keywords:[
    {id:"kw1",clientId:"demo-realty",keyword:"2 bhk flats in kharghar",targetUrl:"/2-bhk-kharghar",priority:"High",intent:"Commercial"},
    {id:"kw2",clientId:"demo-realty",keyword:"flats for sale in kharghar",targetUrl:"/flats-sale-kharghar",priority:"High",intent:"Commercial"},
    {id:"kw3",clientId:"demo-realty",keyword:"real estate agents in navi mumbai",targetUrl:"/real-estate-agents",priority:"Medium",intent:"Commercial"}
  ],
  leads:[],conversations:{},utm:{},clientProfiles:{"demo-realty":{assistant:{name:"ASSISTQ Assistant",greeting:"Hi! 👋 What can I help you with today?",tone:"Professional, friendly and concise",knowledge:"",questions:[]},customLeadFields:[]}},
  realEstate:{projects:[],team:[],visits:[],followups:[],activities:[],inventory:[],channelPartners:[],adSpend:[],documents:[],commissions:[],possession:[],testimonials:[],automation:{missedLeadMinutes:10,escalationMinutes:30,autoAssign:true,followups:[{id:"fu1",day:0,stage:"lead",channel:"whatsapp",message:"Thanks for your enquiry. Would you like to schedule a site visit?"},{id:"fu2",day:2,stage:"lead",channel:"whatsapp",message:"Just checking in — would you like the brochure or floor plans?"},{id:"fu3",day:5,stage:"site_visit",channel:"whatsapp",message:"Would you like to schedule another visit or speak with an advisor?"}]}},
  gsc:{connected:false,property:null,rows:[],syncedAt:null,byClient:{}},
  ga4:{connected:false,propertyId:null,metrics:{},rows:[],syncedAt:null,byClient:{}},
  google:{byClient:{}},
  seoAudits:{},reportHistory:[]
};
function ensureStoreShape(s){
  s.settings=s.settings||defaultStore.settings;
  s.realEstate=s.realEstate||defaultStore.realEstate;
  s.realEstate.projects=s.realEstate.projects||[];
  s.realEstate.team=s.realEstate.team||[];
  s.realEstate.visits=s.realEstate.visits||[];
  s.realEstate.followups=s.realEstate.followups||[];
  s.realEstate.activities=s.realEstate.activities||[];
  s.realEstate.inventory=s.realEstate.inventory||[];
  s.realEstate.channelPartners=s.realEstate.channelPartners||[];
  s.realEstate.adSpend=s.realEstate.adSpend||[];
  s.realEstate.documents=s.realEstate.documents||[];
  s.realEstate.commissions=s.realEstate.commissions||[];
  s.realEstate.possession=s.realEstate.possession||[];
  s.realEstate.testimonials=s.realEstate.testimonials||[];
  s.realEstate.automation=s.realEstate.automation||{missedLeadMinutes:10,escalationMinutes:30,autoAssign:true,followups:[]};
  s.realEstate.automation.autoAssign=s.realEstate.automation.autoAssign!==false;
  s.realEstate.automation.followups=Array.isArray(s.realEstate.automation.followups)?s.realEstate.automation.followups:[];
  // Per-client automation config (migrated from one shared global config).
  // s.realEstate.automation above is kept only as the seed template for any
  // client that doesn't have its own config yet — never edit it directly.
  s.realEstate.automationByClient=s.realEstate.automationByClient||{};
 s.clients=s.clients||defaultStore.clients; s.clientProfiles=s.clientProfiles||{}; s.keywords=s.keywords||[]; s.leads=s.leads||[]; s.conversations=s.conversations||{}; s.utm=s.utm||{}; s.gsc=s.gsc||defaultStore.gsc; s.gsc.byClient=s.gsc.byClient||{}; s.ga4=s.ga4||defaultStore.ga4; s.ga4.byClient=s.ga4.byClient||{}; s.google=s.google||defaultStore.google; s.google.byClient=s.google.byClient||{}; s.seoAudits=s.seoAudits||{}; s.reportHistory=s.reportHistory||[]; s.security=s.security||{adminPasswordHash:null}; s.whatsappThreads=s.whatsappThreads||{};
  s.clients=s.clients.map(c=>({...c,accessCode:c.accessCode||crypto.randomBytes(4).toString("hex").toUpperCase(),plan:c.plan||"Starter",subscriptionStatus:c.subscriptionStatus||"active",subscriptionStart:c.subscriptionStart||null,subscriptionEnd:c.subscriptionEnd||null}));
  s.leads=s.leads.map(l=>({...l,pipelineStage:l.pipelineStage||"NEW",assignedTo:l.assignedTo||null,notes:l.notes||"",responseMinutes:l.responseMinutes??null,updatedAt:l.updatedAt||l.date||new Date().toISOString()}));
  return s;
}

// ---------- Password hashing (no external dependency: Node's built-in scrypt) ----------
function hashPassword(password){const salt=crypto.randomBytes(16).toString("hex");const hash=crypto.scryptSync(String(password),salt,64).toString("hex");return `${salt}:${hash}`;}
function verifyPassword(password,stored){try{const [salt,hash]=String(stored).split(":");if(!salt||!hash)return false;const test=crypto.scryptSync(String(password),salt,64);const known=Buffer.from(hash,"hex");return known.length===test.length&&crypto.timingSafeEqual(known,test);}catch{return false;}}
function checkAdminPassword(password,s){const storedHash=s.security?.adminPasswordHash;if(storedHash)return verifyPassword(password,storedHash);return String(password)===String(process.env.ADMIN_PASSWORD||"ChangeMe123!");}

app.use(express.json({limit:"4mb",verify:(req,res,buf)=>{req.rawBody=Buffer.from(buf);}}));app.use(express.urlencoded({extended:true}));
app.use(session({secret:process.env.SESSION_SECRET||"ASSISTQ-local-change-me",resave:false,saveUninitialized:false,cookie:{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:7*24*60*60*1000}}));

// Basic production hardening. Put the app behind HTTPS in production.
// NOTE: /widget.html is the embeddable chat-bubble widget — it is meant to
// be loaded inside an <iframe> on a CLIENT's own website, which is always a
// different origin, so it must be excluded from X-Frame-Options/SAMEORIGIN
// or every client embed would be silently blocked by the browser. Every
// other route (dashboard, admin pages, APIs) keeps the SAMEORIGIN protection.
app.use((req,res,next)=>{res.setHeader("X-Content-Type-Options","nosniff");if(req.path!=="/widget.html")res.setHeader("X-Frame-Options","SAMEORIGIN");res.setHeader("Referrer-Policy","strict-origin-when-cross-origin");res.setHeader("Permissions-Policy","camera=(), microphone=(), geolocation=()");next();});
const rateBuckets=new Map();
function rateLimit(key,limit=30,windowMs=60000){return (req,res,next)=>{const now=Date.now(),ip=req.ip||req.socket.remoteAddress||"unknown",k=key+"|"+ip;const a=rateBuckets.get(k)||[];const fresh=a.filter(t=>now-t<windowMs);if(fresh.length>=limit)return res.status(429).json({error:"Too many requests. Please try again shortly."});fresh.push(now);rateBuckets.set(k,fresh);next();};}
setInterval(()=>{const now=Date.now();for(const [k,a] of rateBuckets)if(!a.some(t=>now-t<60000))rateBuckets.delete(k);},60000);

// Public chatbot bridge. Production deployments should set WEBHOOK_SECRET.
app.use((req,res,next)=>{
  if(req.path.startsWith("/api/bridge")||req.path==="/api/leads"||req.path==="/api/public/client-config"){
    const origin=req.headers.origin;res.setHeader("Access-Control-Allow-Origin",origin||"*");res.setHeader("Vary","Origin");res.setHeader("Access-Control-Allow-Methods","GET,POST,OPTIONS");res.setHeader("Access-Control-Allow-Headers","Content-Type, X-AssistQ-Secret");
    if(req.method==="OPTIONS")return res.sendStatus(204);
  }
  next();
});
app.use(express.static(path.join(__dirname,"public")));

function normaliseClientId(id){return String(id||"demo-realty").toLowerCase().replace(/[^a-z0-9_-]/g,"-").slice(0,60)||"demo-realty";}
function clientSettings(s,id){const c=s.clients.find(x=>x.id===id)||{};return {...s.settings,...c,clientId:id,subscription:subscriptionInfo(c),assistant:c.assistant||s.settings.assistant,customLeadFields:c.customLeadFields||s.settings.customLeadFields,scoring:c.scoring||s.settings.scoring,hotThreshold:c.hotThreshold??s.settings.hotThreshold,warmThreshold:c.warmThreshold??s.settings.warmThreshold,reportEnabled:c.reportEnabled??s.settings.reportEnabled,clientWhatsApp:c.clientWhatsApp||s.settings.clientWhatsApp||"",whatsappCountryCode:c.whatsappCountryCode||s.settings.whatsappCountryCode};}
function requireAuth(req,res,next){if(!req.session.user)return res.status(401).json({error:"Authentication required"});next();}
function requireAdmin(req,res,next){if(!req.session.user||req.session.user.role!=="admin")return res.status(403).json({error:"Admin access required"});next();}
function selectedClient(req,s){return normaliseClientId(req.query.clientId||req.body?.clientId||req.session.user?.clientId||s.settings.clientId);}

// Server-side plan gating — this is the real enforcement boundary (the
// sidebar hiding a page is cosmetic; this is what actually blocks the
// underlying action, regardless of whether it was triggered from the
// dashboard UI, a chatbot's bridge call, or a direct API request).
function clientPlanTier(s, clientId) {
  const c = s.clients.find(x => x.id === clientId);
  const plan = String(c?.plan || "Premium").toLowerCase().trim();
  if (plan === "starter") return "starter";
  if (plan === "growth") return "growth";
  return "premium"; // Premium, and any unrecognised plan name, defaults to full access
}
function planHasFeature(plan, feature) {
  // feature: "visits", "documents", "testimonials" (Growth+); "team",
  // "automation", "commissions", "possession" (Premium only)
  if (plan === "premium") return true;
  if (plan === "growth") return ["visits", "documents", "testimonials"].includes(feature);
  return false; // starter
}
function clientAutomation(s, clientId) {
  if (!s.realEstate.automationByClient[clientId]) {
    // Seed this client's own config from the shared template the first
    // time they need one, so nothing changes for existing data — after
    // this, each client's rules are independent.
    s.realEstate.automationByClient[clientId] = JSON.parse(JSON.stringify(s.realEstate.automation));
  }
  return s.realEstate.automationByClient[clientId];
}

function subscriptionInfo(c={}){
  const status=String(c.subscriptionStatus||"active").toLowerCase();
  const now=Date.now();
  const start=c.subscriptionStart?new Date(c.subscriptionStart).getTime():null;
  const end=c.subscriptionEnd?new Date(c.subscriptionEnd).getTime():null;
  let effective=status;
  if(status==="active" && start && Number.isFinite(start) && now<start) effective="scheduled";
  if(status==="active" && end && Number.isFinite(end) && now>=end) effective="expired";
  if(status==="scheduled" && start && Number.isFinite(start) && now>=start) effective=(end && now>=end)?"expired":"active";
  return {active:effective==="active",status:effective,plan:c.plan||"Starter",start:c.subscriptionStart||null,end:c.subscriptionEnd||null};
}
function requireActiveClient(req,res,next){
  const s=ensureStoreShape(readStore());
  const id=selectedClient(req,s);
  const c=s.clients.find(x=>x.id===id);
  if(!c)return res.status(404).json({error:"Client not found"});
  const sub=subscriptionInfo(c);
  if(!sub.active)return res.status(403).json({error:`Client subscription is ${sub.status}.`,subscription:sub});
  req.assistqClientId=id; next();
}

// A scoring weight for a field is either:
//   - a plain number (flat "answered = N points", used for free-text fields
//     like name/phone/email, and the engagement bonus)
//   - an object { default, values: {"Answer text": points, ...} } for
//     multiple-choice fields — score depends on which option was picked
//   - an object { default, matchPoints, serviceAreas: [...] } for location —
//     bonus points if the typed location contains one of the service areas
function fieldPoints(w,value){
  if(!value)return 0;
  if(typeof w==="number"||typeof w==="string")return Number(w)||0;
  if(w&&Array.isArray(w.serviceAreas)){const matched=w.serviceAreas.some(a=>String(value).toLowerCase().includes(String(a).toLowerCase()));return Number(matched?w.matchPoints:w.default)||0;}
  if(w&&w.values){const v=w.values[value];return Number(v!==undefined?v:w.default)||0;}
  if(w&&typeof w.default!=="undefined")return Number(w.default)||0;
  return 0;
}
function fieldMaxPoints(w){
  if(typeof w==="number"||typeof w==="string")return Number(w)||0;
  if(w&&Array.isArray(w.serviceAreas))return Math.max(Number(w.matchPoints)||0,Number(w.default)||0);
  if(w&&w.values)return Math.max(Number(w.default)||0,...Object.values(w.values).map(v=>Number(v)||0));
  if(w&&typeof w.default!=="undefined")return Number(w.default)||0;
  return 0;
}
const defaultScoring={name:10,phone:15,email:5,location:{default:6,matchPoints:10,serviceAreas:["Navi Mumbai","Mumbai","Thane","Pune"]},engagement:5,purpose:{default:5,values:{"Buying":10,"Renting":6}},configuration:{default:9,values:{"1BHK":9,"2BHK":12,"3BHK":14,"4BHK":15}},budget:{default:9,values:{"Under ₹50L":9,"₹50L-1Cr":11,"₹1Cr-2Cr":13,"₹2Cr+":15}},timeline:{default:8,values:{"Immediately":15,"1-3 months":11,"3-6 months":8,"Just exploring":4}}};
function scoreLead(fields={},messages=[],settings={}){const w={...defaultScoring,...(settings.scoring||{})};let score=0;for(const key of ["name","phone","email","purpose","location","configuration","budget","timeline"])score+=fieldPoints(w[key],fields[key]);if(messages.length>=6)score+=Number(w.engagement)||0;return Math.min(100,Math.max(0,Math.round(score)));}
function statusFor(score,settings={}){const hot=Number(settings.hotThreshold||80),warm=Number(settings.warmThreshold||50);return score>=hot?"HOT":score>=warm?"WARM":"COLD";}
function scoreBreakdown(fields={},messages=[],settings={}){const w={...defaultScoring,...(settings.scoring||{})};const out={};for(const key of ["name","phone","email","purpose","location","configuration","budget","timeline"])out[key]=fieldPoints(w[key],fields[key]);out.engagement=messages.length>=6?(Number(w.engagement)||0):0;return out;}
function normaliseFields(f={}){return {name:String(f.name||"").trim(),phone:String(f.phone||"").trim(),email:String(f.email||"").trim(),purpose:String(f.purpose||"").trim(),location:String(f.location||"").trim(),configuration:String(f.configuration||"").trim(),budget:String(f.budget||"").trim(),timeline:String(f.timeline||"").trim()};}
function cleanUTM(u={}){return {source:String(u.source||u.utm_source||"").trim(),medium:String(u.medium||u.utm_medium||"").trim(),campaign:String(u.campaign||u.utm_campaign||"").trim()};}
function requireWebhookSecret(req,res,next){
  const secret=String(process.env.WEBHOOK_SECRET||"").trim();
  if(secret && req.headers["x-assistq-secret"]!==secret)return res.status(401).json({error:"Invalid webhook secret"});
  if(!secret && process.env.NODE_ENV==="production")return res.status(503).json({error:"WEBHOOK_SECRET is required in production"});
  next();
}
function whatsappUrl(phone,message=""){const digits=String(phone||"").replace(/\D/g,"");if(!digits)return "";const s=readStore();const cc=String(s.settings.whatsappCountryCode||"91");const full=digits.length===10?cc+digits:digits;return `https://wa.me/${full}?text=${encodeURIComponent(message)}`;}

// ---------- Auth ----------
app.get("/api/auth/status",(req,res)=>res.json({authenticated:!!req.session.user,user:req.session.user||null,googleConnected:!!req.session.tokens,googleEmail:req.session.googleEmail||null}));
app.post("/api/auth/login",rateLimit("login",10,60000),(req,res)=>{
  const email=String(req.body.email||"").trim().toLowerCase();const password=String(req.body.password||"");
  const adminEmail=String(process.env.ADMIN_EMAIL||"admin@assistq.local").toLowerCase();
  const s=ensureStoreShape(readStore());
  if(email===adminEmail&&checkAdminPassword(password,s)){req.session.user={role:"admin",email};return res.json({ok:true,user:req.session.user});}
  const c=s.clients.find(x=>x.reportEmail?.toLowerCase()===email&&x.accessCode===password);
  if(c){const sub=subscriptionInfo(c);if(!sub.active)return res.status(403).json({error:`This client account is ${sub.status}. Please contact ASSISTQ to renew the subscription.`,subscription:sub});
    if(String(c.plan||"Starter").toLowerCase().trim()==="starter")return res.status(403).json({error:"Your Starter plan doesn't include dashboard access — your leads are sent to you directly by WhatsApp/email. Upgrade to Growth or Premium to unlock the dashboard.",plan:c.plan});
    req.session.user={role:"client",email,clientId:c.id,name:c.name};return res.json({ok:true,user:req.session.user});}
  res.status(401).json({error:"Invalid email or password"});
});
app.post("/api/auth/logout",(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.post("/api/auth/change-password",requireAuth,rateLimit("change-password",5,60000),(req,res)=>{
  if(req.session.user.role!=="admin")return res.status(403).json({error:"Only the admin account can change its password here. Client access codes are managed from the Clients page."});
  const s=ensureStoreShape(readStore());
  const current=String(req.body.currentPassword||"");const next=String(req.body.newPassword||"");
  if(!checkAdminPassword(current,s))return res.status(401).json({error:"Current password is incorrect."});
  if(next.length<8)return res.status(400).json({error:"New password must be at least 8 characters."});
  s.security.adminPasswordHash=hashPassword(next);
  writeStore(s);
  res.json({ok:true});
});

// Public, non-secret client configuration for embeddable chatbot.
app.get("/api/public/client-config",rateLimit("public-config",120,60000),(req,res)=>{const s=ensureStoreShape(readStore());const id=normaliseClientId(req.query.clientId||s.settings.clientId);const c=s.clients.find(x=>x.id===id);if(!c)return res.status(404).json({error:"Client not found"});const sub=subscriptionInfo(c);if(!sub.active)return res.status(403).json({error:`Client subscription is ${sub.status}.`,subscription:sub});const profile=s.clientProfiles[id]||{};const cs=clientSettings(s,id);res.setHeader("Cache-Control","no-store");res.json({clientId:id,businessName:c.name,website:c.website,reportEmail:c.reportEmail||"",clientWhatsApp:cs.clientWhatsApp||"",whatsappCountryCode:cs.whatsappCountryCode||"91",subscription:sub,assistant:profile.assistant||cs.assistant||defaultStore.settings.assistant,customLeadFields:profile.customLeadFields||cs.customLeadFields||[]});});

// ---------- Billing (Razorpay) ----------
// Pricing lives here in one place so the backend, not the browser, is the
// source of truth for what each plan actually costs — the checkout page
// only ever tells us WHICH plan the customer picked, never the amount.
const PLAN_CATALOG = {
  starter: { razorpayPlanEnv: "RAZORPAY_PLAN_STARTER", setup: 1999, monthly: 999, trial: true, label: "Starter" },
  growth: { razorpayPlanEnv: "RAZORPAY_PLAN_GROWTH", setup: 2999, monthly: 3499, trial: false, label: "Growth" },
  premium: { razorpayPlanEnv: "RAZORPAY_PLAN_PREMIUM", setup: 4999, monthly: 6999, trial: false, label: "Premium" }
};
const WEBSITE_CHARGE = 2999;
const TRIAL_DAYS = 15;
const razorpay = (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) ? new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET }) : null;

app.post("/api/billing/create-subscription", rateLimit("billing-create", 20, 60000), async (req, res) => {
  if (!razorpay) return res.status(501).json({ error: "Payments aren't configured yet — set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET." });
  const planKey = String(req.body.plan || "").toLowerCase();
  const plan = PLAN_CATALOG[planKey];
  if (!plan) return res.status(400).json({ error: "Unknown plan." });
  const razorpayPlanId = process.env[plan.razorpayPlanEnv];
  if (!razorpayPlanId) return res.status(501).json({ error: `Payments aren't fully configured yet — set ${plan.razorpayPlanEnv} to this plan's Razorpay Plan ID.` });
  const customer = req.body.customer || {};
  const fullName = String(customer.fullName || "").trim();
  const email = String(customer.email || "").trim().toLowerCase();
  const phone = String(customer.phone || "").trim();
  const businessName = String(customer.businessName || fullName || "").trim();
  if (!fullName || !email || !phone) return res.status(400).json({ error: "Name, email and phone are required." });
  const noWebsite = !!req.body.noWebsite;
  const isTrial = !!plan.trial; // only Starter is ever a trial — this is decided by the plan, not the browser

  try {
    const addons = [{ item: { name: `${plan.label} — one-time setup`, amount: plan.setup * 100, currency: "INR" } }];
    if (noWebsite) addons.push({ item: { name: "Landing page (no existing website)", amount: WEBSITE_CHARGE * 100, currency: "INR" } });

    const subPayload = {
      plan_id: razorpayPlanId,
      customer_notify: 1,
      total_count: 360, // effectively open-ended monthly billing (30 years); cancel anytime via dashboard/API
      addons,
      notes: { businessName, fullName, email, phone, plan: planKey, noWebsite: String(noWebsite) }
    };
    // TRIAL LOGIC: only Starter defers its first recurring charge. Setting
    // start_at pushes the first plan invoice out by TRIAL_DAYS; the addons
    // above (setup fee, +website charge) still bill immediately regardless,
    // since those aren't part of the trial.
    if (isTrial) subPayload.start_at = Math.floor(Date.now() / 1000) + TRIAL_DAYS * 86400;

    const subscription = await razorpay.subscriptions.create(subPayload);
    res.json({ subscription_id: subscription.id, key_id: process.env.RAZORPAY_KEY_ID });
  } catch (err) {
    res.status(502).json({ error: "Razorpay couldn't create the subscription: " + (err?.error?.description || err.message) });
  }
});

app.post("/api/billing/verify", rateLimit("billing-verify", 20, 60000), async (req, res) => {
  if (!razorpay) return res.status(501).json({ error: "Payments aren't configured yet." });
  const { razorpay_payment_id, razorpay_subscription_id, razorpay_signature } = req.body || {};
  if (!razorpay_payment_id || !razorpay_subscription_id || !razorpay_signature) return res.status(400).json({ error: "Missing payment verification fields." });

  const expected = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update(`${razorpay_payment_id}|${razorpay_subscription_id}`).digest("hex");
  if (expected !== razorpay_signature) return res.status(400).json({ error: "Payment signature didn't match — this payment could not be verified." });

  try {
    const subscription = await razorpay.subscriptions.fetch(razorpay_subscription_id);
    const notes = subscription.notes || {};
    const planKey = String(notes.plan || "").toLowerCase();
    const plan = PLAN_CATALOG[planKey];
    if (!plan) return res.status(400).json({ error: "Subscription has no recognised plan in its notes." });

    const s = ensureStoreShape(readStore());
    let id = normaliseClientId(notes.businessName || notes.fullName || "client");
    if (s.clients.some(x => x.id === id)) id = id + "-" + crypto.randomBytes(2).toString("hex");
    const accessCode = crypto.randomBytes(5).toString("hex").toUpperCase();
    const c = {
      id, name: String(notes.businessName || notes.fullName), website: "",
      reportEmail: String(notes.email || ""), clientWhatsApp: String(notes.phone || ""),
      accessCode, plan: plan.label, subscriptionStatus: "active",
      subscriptionStart: new Date().toISOString(), subscriptionEnd: null,
      razorpaySubscriptionId: razorpay_subscription_id
    };
    s.clients.push(c);
    writeStore(s);

    // Best-effort welcome email — payment is already verified and the
    // account already exists either way, so a failed email here should
    // never fail the checkout for the customer.
    try {
      if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
        const transporter = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: Number(process.env.SMTP_PORT || 587) === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
        const loginUrl = process.env.APP_BASE_URL || "https://app.assistq.in";
        const dashboardLine = plan.label === "Starter" ? "Your plan doesn't include dashboard access — your leads will be sent to you directly by WhatsApp and email." : `You can log in to your dashboard any time at <a href="${loginUrl}">${loginUrl}</a>.`;
        await transporter.sendMail({
          from: process.env.REPORT_FROM || process.env.SMTP_USER, to: c.reportEmail,
          subject: `Welcome to AssistQ — your ${plan.label} plan is live`,
          html: `<h2>Welcome to AssistQ, ${escapeHtml(notes.fullName || "")}!</h2><p>Your <b>${plan.label}</b> plan is now active for <b>${escapeHtml(c.name)}</b>.</p><p>${dashboardLine}</p><p><b>Login email:</b> ${escapeHtml(c.reportEmail)}<br><b>Access code:</b> ${accessCode}</p><p>Keep this email — you'll need the access code to log in.</p>`
        });
      }
    } catch (mailErr) { /* email is best-effort; the account is already created either way */ }

    res.json({ ok: true, clientId: id, accessCode, plan: plan.label });
  } catch (err) {
    res.status(502).json({ error: "Couldn't finish setting up the account: " + (err?.error?.description || err.message) });
  }
});

// ---------- State ----------
app.get("/api/state",requireAuth,(req,res)=>{
  let s=ensureStoreShape(readStore());const clientId=selectedClient(req,s);const allowed=req.session.user.role==="admin"||req.session.user.clientId===clientId;
  if(!allowed)return res.status(403).json({error:"You do not have access to this client workspace"});
  const filter=x=>x.clientId===clientId||(!x.clientId&&clientId===s.settings.clientId);
  const client=clientSettings(s,clientId);
  if(req.session.user.role!=="admin" && !client.subscription.active)return res.status(403).json({error:`Client subscription is ${client.subscription.status}. Please contact ASSISTQ to renew.`,subscription:client.subscription});
  const profile=s.clientProfiles[clientId]||{assistant:client.assistant||defaultStore.settings.assistant,customLeadFields:client.customLeadFields||[]};const gscClient=s.gsc.byClient[clientId]||s.gsc;const gaClient=s.ga4.byClient[clientId]||s.ga4;const out={settings:client,clientId,clients:req.session.user.role==="admin"?s.clients:s.clients.filter(c=>c.id===clientId),leads:s.leads.filter(filter).filter(x=>!x.mergedInto),conversations:Object.fromEntries(Object.entries(s.conversations).filter(([,x])=>filter(x))),keywords:s.keywords.filter(x=>x.clientId===clientId||(!x.clientId&&clientId===s.settings.clientId)),utm:s.utm,gsc:gscClient,ga4:gaClient,seo:s.seoAudits[clientId]||null,reportHistory:s.reportHistory.filter(x=>x.clientId===clientId),profile,googleConnected:!!googleConnection(s,clientId)?.tokens,googleEmail:googleConnection(s,clientId)?.email||null,user:req.session.user};
  writeStore(s);res.json(out);
});

app.post("/api/settings",requireAuth,(req,res)=>{
  const s=ensureStoreShape(readStore());const clientId=normaliseClientId(req.body.clientId||req.session.user.clientId||s.settings.clientId);if(req.session.user.role!=="admin"&&req.session.user.clientId!==clientId)return res.status(403).json({error:"Workspace access denied"});
  const scoring={...defaultScoring,...s.settings.scoring,...(req.body.scoring||{})};const scoringTotal=Object.values(scoring).reduce((a,w)=>a+fieldMaxPoints(w),0);if(scoringTotal!==100)return res.status(400).json({error:`Scoring max points must total 100 (currently ${scoringTotal}). For multiple-choice fields this is the highest single option's points.`});
  s.settings={...s.settings,...req.body,clientId,scoring};const idx=s.clients.findIndex(x=>x.id===clientId);const existing=s.clients[idx]||{};const c={...existing,id:clientId,name:String(req.body.businessName||s.settings.businessName||"Client"),website:String(req.body.website||s.settings.website||""),reportEmail:String(req.body.reportEmail||s.settings.reportEmail||""),clientWhatsApp:String(req.body.clientWhatsApp||existing.clientWhatsApp||s.settings.clientWhatsApp||""),whatsappCountryCode:String(req.body.whatsappCountryCode||existing.whatsappCountryCode||s.settings.whatsappCountryCode||"91"),hotThreshold:Number(req.body.hotThreshold??existing.hotThreshold??s.settings.hotThreshold??80),warmThreshold:Number(req.body.warmThreshold??existing.warmThreshold??s.settings.warmThreshold??50),reportEnabled:req.body.reportEnabled!==undefined?!!req.body.reportEnabled:!!(existing.reportEnabled??s.settings.reportEnabled),scoring,assistant:existing.assistant||s.settings.assistant,customLeadFields:existing.customLeadFields||s.settings.customLeadFields,accessCode:existing.accessCode||crypto.randomBytes(5).toString("hex").toUpperCase(),plan:existing.plan||"Starter",subscriptionStatus:existing.subscriptionStatus||"active",subscriptionStart:existing.subscriptionStart||null,subscriptionEnd:existing.subscriptionEnd||null};if(idx>=0)s.clients[idx]={...s.clients[idx],...c};else s.clients.push(c);writeStore(s);res.json({ok:true,settings:clientSettings(s,clientId),accessCode:c.accessCode});
});
app.get("/api/client/profile",requireAuth,(req,res)=>{const s=ensureStoreShape(readStore());const id=selectedClient(req,s);if(req.session.user.role!=="admin"&&req.session.user.clientId!==id)return res.status(403).json({error:"Workspace access denied"});const cs=clientSettings(s,id);res.json(s.clientProfiles[id]||{assistant:cs.assistant||defaultStore.settings.assistant,customLeadFields:cs.customLeadFields||[]});});
app.post("/api/client/profile",requireAuth,(req,res)=>{const s=ensureStoreShape(readStore());const id=selectedClient(req,s);if(req.session.user.role!=="admin"&&req.session.user.clientId!==id)return res.status(403).json({error:"Workspace access denied"});const assistant={name:String(req.body.assistant?.name||"ASSISTQ Assistant").slice(0,80),greeting:String(req.body.assistant?.greeting||"Hi! 👋 What can I help you with today?").slice(0,300),tone:String(req.body.assistant?.tone||"Professional, friendly and concise").slice(0,300),knowledge:String(req.body.assistant?.knowledge||"").slice(0,12000),questions:Array.isArray(req.body.assistant?.questions)?req.body.assistant.questions.slice(0,20):[]};const customLeadFields=Array.isArray(req.body.customLeadFields)?req.body.customLeadFields.slice(0,30).map(x=>({key:String(x.key||"").trim().toLowerCase().replace(/[^a-z0-9_]/g,"_").slice(0,40),label:String(x.label||"").trim().slice(0,80),required:!!x.required})).filter(x=>x.key&&x.label):[];s.clientProfiles[id]={assistant,customLeadFields};const idx=s.clients.findIndex(x=>x.id===id);if(idx>=0)s.clients[idx]={...s.clients[idx],assistant,customLeadFields};if(id===s.settings.clientId)s.settings={...s.settings,assistant,customLeadFields};writeStore(s);res.json({ok:true,profile:s.clientProfiles[id]});});

app.post("/api/clients",requireAdmin,(req,res)=>{const s=ensureStoreShape(readStore());if(!req.body.name)return res.status(400).json({error:"Client name required"});const id=normaliseClientId(req.body.id||req.body.name);if(s.clients.some(x=>x.id===id))return res.status(409).json({error:"Client already exists"});const c={id,name:String(req.body.name),website:String(req.body.website||""),reportEmail:String(req.body.reportEmail||""),clientWhatsApp:String(req.body.clientWhatsApp||""),accessCode:crypto.randomBytes(5).toString("hex").toUpperCase(),plan:String(req.body.plan||"Starter"),subscriptionStatus:"active",subscriptionStart:req.body.subscriptionStart||new Date().toISOString(),subscriptionEnd:req.body.subscriptionEnd||null};s.clients.push(c);s.settings={...s.settings,clientId:id,businessName:c.name,website:c.website,reportEmail:c.reportEmail};writeStore(s);res.status(201).json(c);});

// ---------- Subscription management ----------
app.post("/api/clients/:id/subscription",requireAdmin,(req,res)=>{
  const s=ensureStoreShape(readStore());
  const id=normaliseClientId(req.params.id);
  const idx=s.clients.findIndex(x=>x.id===id);
  if(idx<0)return res.status(404).json({error:"Client not found"});
  const action=String(req.body.action||"renew").toLowerCase();
  const c={...s.clients[idx]};
  if(action==="suspend"){c.subscriptionStatus="suspended";}
  else if(action==="archive"){c.subscriptionStatus="archived";}
  else if(action==="reactivate"||action==="renew"){
    const start=req.body.subscriptionStart||new Date().toISOString();
    const end=req.body.subscriptionEnd||c.subscriptionEnd||null;
    if(end && !Number.isFinite(new Date(end).getTime()))return res.status(400).json({error:"Invalid subscription end date"});
    c.subscriptionStatus="active"; c.subscriptionStart=start; c.subscriptionEnd=end; c.plan=String(req.body.plan||c.plan||"Starter");
  } else return res.status(400).json({error:"Unknown subscription action"});
  s.clients[idx]=c; writeStore(s); res.json({ok:true,client:{...c,subscription:subscriptionInfo(c)}});
});

// ---------- Google integrations (client-scoped) ----------
function oauthClient(){return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID,process.env.GOOGLE_CLIENT_SECRET,`${process.env.APP_BASE_URL||`http://localhost:${PORT}`}/auth/google/callback`);}
function googleConnection(s,id){return s.google?.byClient?.[id]||null;}
function requireGoogle(req,res,next){const s=ensureStoreShape(readStore());const id=selectedClient(req,s);if(!googleConnection(s,id)?.tokens)return res.status(401).json({error:"Google account is not connected for this client. Connect it from Integrations first."});req.googleClientId=id;next();}
function googleAuthClientFor(req){const s=ensureStoreShape(readStore());const id=req.googleClientId||selectedClient(req,s);const g=googleConnection(s,id);if(!g?.tokens)throw new Error("Google account not connected");const client=oauthClient();client.setCredentials(g.tokens);return {client,id,g};}
app.get("/auth/google",requireAuth,(req,res)=>{if(!process.env.GOOGLE_CLIENT_ID||!process.env.GOOGLE_CLIENT_SECRET)return res.status(500).send("Google OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env first.");const s=ensureStoreShape(readStore());const id=selectedClient(req,s);if(req.session.user.role!=="admin"&&req.session.user.clientId!==id)return res.status(403).send("Workspace access denied");const state=crypto.randomBytes(24).toString("hex");req.session.googleOAuthState={state,clientId:id};const client=oauthClient();res.redirect(client.generateAuthUrl({access_type:"offline",prompt:"consent",include_granted_scopes:true,state,scope:["openid","email","profile","https://www.googleapis.com/auth/webmasters.readonly","https://www.googleapis.com/auth/analytics.readonly","https://www.googleapis.com/auth/gmail.send"]}));});
app.get("/auth/google/callback",async(req,res)=>{try{if(!req.query.code)throw new Error("Google did not return an authorization code.");if(!req.session.googleOAuthState||req.query.state!==req.session.googleOAuthState.state)throw new Error("Invalid OAuth state. Please start the connection again.");const id=req.session.googleOAuthState.clientId;const client=oauthClient();const {tokens}=await client.getToken(req.query.code);client.setCredentials(tokens);const oauth2=google.oauth2({auth:client,version:"v2"});const me=await oauth2.userinfo.get();const s=ensureStoreShape(readStore());s.google.byClient[id]={connected:true,email:me.data.email||null,tokens,connectedAt:new Date().toISOString()};writeStore(s);req.session.googleOAuthState=null;res.redirect("/");}catch(e){res.status(500).send("Google authorization failed: "+e.message+". Return to ASSISTQ and try Connect Google again.");}});
app.post("/auth/google/disconnect",requireAuth,(req,res)=>{const s=ensureStoreShape(readStore());const id=selectedClient(req,s);if(req.session.user.role!=="admin"&&req.session.user.clientId!==id)return res.status(403).json({error:"Workspace access denied"});delete s.google.byClient[id];writeStore(s);res.json({ok:true});});
app.get("/api/google/status",requireAuth,(req,res)=>{const s=ensureStoreShape(readStore());const id=selectedClient(req,s);const g=googleConnection(s,id);res.json({connected:!!g?.tokens,email:g?.email||null,connectedAt:g?.connectedAt||null,clientId:id});});
app.get("/api/gsc/properties",requireAuth,requireGoogle,async(req,res)=>{try{const {client}=googleAuthClientFor(req);const r=await google.webmasters({version:"v3",auth:client}).sites.list();res.json((r.data.siteEntry||[]).map(x=>({url:x.siteUrl,permission:x.permissionLevel})));}catch(e){res.status(500).json({error:e.message});}});
app.post("/api/gsc/sync",requireAuth,requireGoogle,async(req,res)=>{try{const {siteUrl,startDate,endDate}=req.body;if(!siteUrl)return res.status(400).json({error:"siteUrl required"});const {client,id}=googleAuthClientFor(req);const r=await google.webmasters({version:"v3",auth:client}).searchanalytics.query({siteUrl,requestBody:{startDate:startDate||new Date(Date.now()-30*864e5).toISOString().slice(0,10),endDate:endDate||new Date(Date.now()-2*864e5).toISOString().slice(0,10),dimensions:["query"],type:"web",rowLimit:25000}});const rows=(r.data.rows||[]).map(x=>({query:x.keys?.[0]||"",clicks:x.clicks||0,impressions:x.impressions||0,ctr:x.ctr||0,position:x.position||0}));const s=ensureStoreShape(readStore());s.gsc.byClient[id]={connected:true,property:siteUrl,rows,syncedAt:new Date().toISOString()};writeStore(s);res.json(s.gsc.byClient[id]);}catch(e){res.status(500).json({error:e.message});}});
app.get("/api/ga4/properties",requireAuth,requireGoogle,async(req,res)=>{
  try{
    const {client}=googleAuthClientFor(req);
    const admin=google.analyticsadmin({version:"v1beta",auth:client});
    const properties=[];
    let accountToken;

    // Google does not accept parent:accounts/- here. First discover the
    // Analytics accounts the connected Google user can access, then list
    // properties under each real account resource (accounts/123...).
    do{
      const accountsResponse=await admin.accounts.list({pageSize:200,pageToken:accountToken});
      const accounts=accountsResponse.data.accounts||[];
      for(const account of accounts){
        let propertyToken;
        do{
          const r=await admin.properties.list({
            filter:`parent:${account.name}`,
            pageSize:200,
            pageToken:propertyToken
          });
          for(const property of (r.data.properties||[])){
            properties.push({
              name:property.displayName,
              id:property.name?.split("/").pop(),
              resource:property.name,
              accountName:account.displayName||account.name
            });
          }
          propertyToken=r.data.nextPageToken;
        }while(propertyToken);
      }
      accountToken=accountsResponse.data.nextPageToken;
    }while(accountToken);

    res.json(properties);
  }catch(e){
    res.status(500).json({error:`GA4 property discovery failed: ${e.message}`});
  }
});
app.post("/api/ga4/sync",requireAuth,requireGoogle,async(req,res)=>{try{const {propertyId}=req.body;if(!propertyId)return res.status(400).json({error:"propertyId required"});const {client,id}=googleAuthClientFor(req);const r=await google.analyticsdata({version:"v1beta",auth:client}).properties.runReport({property:`properties/${propertyId}`,requestBody:{dateRanges:[{startDate:"30daysAgo",endDate:"today"}],dimensions:[{name:"date"}],metrics:[{name:"activeUsers"},{name:"sessions"},{name:"conversions"}]}});const rows=(r.data.rows||[]).map(x=>({date:x.dimensionValues?.[0]?.value,activeUsers:Number(x.metricValues?.[0]?.value||0),sessions:Number(x.metricValues?.[1]?.value||0),conversions:Number(x.metricValues?.[2]?.value||0)}));const totals=rows.reduce((a,x)=>({users:a.users+x.activeUsers,sessions:a.sessions+x.sessions,conversions:a.conversions+x.conversions}),{users:0,sessions:0,conversions:0});const s=ensureStoreShape(readStore());s.ga4.byClient[id]={connected:true,propertyId,rows,metrics:totals,syncedAt:new Date().toISOString()};writeStore(s);res.json(s.ga4.byClient[id]);}catch(e){res.status(500).json({error:e.message});}});
app.post("/api/google/test-email",requireAuth,requireGoogle,async(req,res)=>{try{const {client,id}=googleAuthClientFor(req);const to=String(req.body.to||clientSettings(ensureStoreShape(readStore()),id).reportEmail||"").trim();if(!to)return res.status(400).json({error:"Enter a test email address first."});const subject="ASSISTQ Google connection test";const body="Your Google account is connected to ASSISTQ. This is a test email.";const raw=Buffer.from([`To: ${to}`,`Subject: ${subject}`,"Content-Type: text/plain; charset=utf-8","",body].join("\r\n")).toString("base64url");await google.gmail({version:"v1",auth:client}).users.messages.send({userId:"me",requestBody:{raw}});res.json({ok:true,to});}catch(e){res.status(500).json({error:e.message});}});

// ---------- Leads / chatbot bridge ----------
function saveConversationEvent(body){const s=ensureStoreShape(readStore());const clientId=normaliseClientId(body.clientId||s.settings.clientId);const id=body.leadId||"lead_"+crypto.randomBytes(6).toString("hex");const now=new Date().toISOString();const existing=s.conversations[id]||{id,clientId,createdAt:now,updatedAt:now,fields:{},utm:{},messages:[],score:0,status:"COLD"};if(body.event?.role&&body.event?.content){const last=existing.messages.at(-1);if(!(last&&last.role===body.event.role&&last.content===body.event.content))existing.messages.push({role:body.event.role,content:String(body.event.content).slice(0,8000),at:body.event.at||now});}existing.fields={...existing.fields,...normaliseFields(body.fields||{})};existing.utm={...existing.utm,...cleanUTM(body.utm||{})};existing.clientId=clientId;existing.updatedAt=now;const cs=clientSettings(s,clientId);existing.score=scoreLead(existing.fields,existing.messages,cs);existing.scoreBreakdown=scoreBreakdown(existing.fields,existing.messages,cs);existing.status=statusFor(existing.score,cs);s.conversations[id]=existing;writeStore(s);return existing;}
function autoAssignLead(s,clientId,l){
  if(!planHasFeature(clientPlanTier(s,clientId),"team")) return null; // salesperson auto-assignment is a Premium feature
  const cfg=clientAutomation(s,clientId); if(cfg.autoAssign===false || l.assignedTo) return null;
  const reps=s.realEstate.team.filter(t=>t.clientId===clientId&&t.active!==false); if(!reps.length) return null;
  const text=String(l.requirement||"").toLowerCase();
  const match=reps.find(t=>(t.areas||[]).some(a=>text.includes(String(a).toLowerCase())))||reps[0];
  l.assignedTo=match.id; l.assignedAt=reNow(); activity(s,clientId,"assignment",`${l.name} automatically assigned to ${match.name}`,{leadId:l.id,repId:match.id}); return match;
}
function seedLeadFollowups(s,clientId,l){
  if(!planHasFeature(clientPlanTier(s,clientId),"automation")) return; // drip follow-up sequences are a Premium feature
  const cfg=clientAutomation(s,clientId).followups||[]; if(!cfg.length) return;
  const existing=s.realEstate.followups.filter(x=>x.clientId===clientId&&x.leadId===l.id);
  for(const rule of cfg){
    const day=Math.max(0,Number(rule.day)||0); const due=new Date(Date.now()+day*864e5).toISOString();
    const key=`${rule.id||rule.day}|${l.id}`; if(existing.some(x=>x.ruleKey===key)) continue;
    s.realEstate.followups.push({id:reId("fu"),clientId,leadId:l.id,channel:String(rule.channel||"whatsapp"),dueAt:due,message:String(rule.message||""),status:"pending",ruleKey:key,createdAt:reNow()});
  }
}
// This used to only mark a follow-up "queued" and stop there — a human
// still had to open WhatsApp and click send by hand, so "Premium: automated
// WhatsApp messaging" was really "Premium: a slightly nicer manual queue".
// Now, if WA_PHONE_NUMBER_ID/WA_ACCESS_TOKEN/WA_FOLLOWUP_TEMPLATE_NAME are
// all configured, the worker actually sends the follow-up through the
// Cloud API the moment it comes due. It only ever attempts a send ONCE per
// follow-up (guarded by autoSendAttempted) — a permanently-failing number
// won't get hammered every 60 seconds. If WhatsApp isn't configured, or the
// send fails (unapproved template, bad number, API error), the follow-up
// simply stays "queued" exactly as before — the dashboard's one-tap
// click-to-chat link is always the fallback, never a dead end.
async function processRealEstateAutomation(){
  try{
    let s=ensureStoreShape(readStore()); let changed=false; const now=Date.now();
    for(const l of s.leads){
      const age=(now-new Date(l.date||now).getTime())/60000;
      if(!l.clientId || !planHasFeature(clientPlanTier(s,l.clientId),"automation")) continue; // missed-lead/escalation alerts are a Premium feature
      const cfg=clientAutomation(s,l.clientId);
      if(l.pipelineStage==="NEW" && age>=Number(cfg.missedLeadMinutes||10) && !l.missedLeadAt){l.missedLeadAt=reNow();activity(s,l.clientId,"alert",`Missed lead alert: ${l.name} has not been contacted`,{leadId:l.id});changed=true;}
      if(l.pipelineStage==="NEW" && age>=Number(cfg.escalationMinutes||30) && !l.escalatedAt){l.escalatedAt=reNow();activity(s,l.clientId,"escalation",`Escalation: ${l.name} is still uncontacted after ${Math.round(age)} minutes`,{leadId:l.id});changed=true;}
    }
    const dueFollowups=s.realEstate.followups.filter(f=>f.status==="pending"&&new Date(f.dueAt).getTime()<=now&&!f.queuedAt&&planHasFeature(clientPlanTier(s,f.clientId),"automation"));
    for(const f of dueFollowups){f.queuedAt=reNow();f.status="queued";activity(s,f.clientId,"followup",`Follow-up queued for lead ${f.leadId}`,{leadId:f.leadId,followupId:f.id,channel:f.channel});changed=true;}
    if(changed) writeStore(s);

    // Attempt automated sends for anything just queued on this pass, one at a time.
    const c=waConfig();
    for(const f of dueFollowups){
      if(f.channel!=="whatsapp"||f.autoSendAttempted)continue;
      s=ensureStoreShape(readStore());
      const fresh=s.realEstate.followups.find(x=>x.id===f.id);
      if(!fresh||fresh.autoSendAttempted)continue;
      fresh.autoSendAttempted=true;
      if(!c.phoneNumberId||!c.accessToken||!c.followupTemplate){writeStore(s);continue;}
      const lead=s.leads.find(x=>x.id===fresh.leadId&&x.clientId===fresh.clientId);
      const phone=lead?.phone;
      if(!phone){activity(s,fresh.clientId,"followup",`Could not auto-send follow-up for lead ${fresh.leadId} — no phone number on file`,{leadId:fresh.leadId,followupId:fresh.id});writeStore(s);continue;}
      try{
        const out=await sendWhatsAppTemplate(phone,c.followupTemplate,c.followupLanguage,[fresh.message]);
        fresh.status="sent";fresh.sentAt=reNow();fresh.messageId=out.messageId;
        activity(s,fresh.clientId,"followup",`Follow-up sent automatically via WhatsApp to ${lead.name||phone}`,{leadId:fresh.leadId,followupId:fresh.id,messageId:out.messageId});
        pushThreadMessage(s,fresh.clientId,phone,{direction:"out",text:fresh.message,at:reNow(),messageId:out.messageId,automated:true});
      }catch(err){
        fresh.lastSendError=err.message;
        activity(s,fresh.clientId,"followup",`Automated WhatsApp send failed for ${lead.name||phone} — left queued for manual send (${err.message})`,{leadId:fresh.leadId,followupId:fresh.id});
      }
      writeStore(s);
    }
  }catch(e){console.error("ASSISTQ automation worker:",e.message)}
}
function normPhone(p){const d=String(p||"").replace(/\D/g,"");return d.length>10?d.slice(-10):d;}
function normEmail(e){return String(e||"").trim().toLowerCase();}
// Cheap but effective duplicate detection: same client, different lead,
// same last-10-digit phone or same email, and not already merged away.
// We never silently drop or auto-merge data (a false-positive merge loses
// a genuine second enquiry) — we flag it and let staff confirm the merge
// from the lead detail panel, which then folds visits/followups/notes
// from the duplicate into the original and hides the duplicate from the
// active lead views.
function findPossibleDuplicate(s,clientId,phone,email,excludeId){
  const p=normPhone(phone),e=normEmail(email);
  if(!p&&!e)return null;
  return s.leads.find(x=>x.clientId===clientId&&x.id!==excludeId&&!x.mergedInto&&((p&&normPhone(x.phone)===p)||(e&&normEmail(x.email)===e)))||null;
}
function saveLeadInternal(body){const s=ensureStoreShape(readStore());const clientId=normaliseClientId(body.clientId||s.settings.clientId);const cs=clientSettings(s,clientId);const fields=normaliseFields(body.fields||{});const messages=Array.isArray(body.messages)?body.messages:[];const score=Number(body.score??scoreLead(fields,messages,cs));const status=statusFor(score,cs);const utm=cleanUTM(body.utm||{});const lead={clientId,id:body.id||body.leadId||"AQ-"+crypto.randomBytes(4).toString("hex").toUpperCase(),name:body.name||fields.name||"Unknown",phone:body.phone||fields.phone||"",email:body.email||fields.email||"",requirement:body.requirement||[fields.purpose,fields.location,fields.configuration].filter(Boolean).join(" · "),budget:body.budget||fields.budget||"",score,scoreBreakdown:scoreBreakdown(fields,messages,cs),status,source:body.utm_source||utm.source||"Direct",medium:body.utm_medium||utm.medium||"",campaign:body.utm_campaign||utm.campaign||"",utm,conversationId:body.conversationId||body.leadId||null,messagesCount:messages.length,date:new Date().toISOString(),pipelineStage:body.pipelineStage||"NEW",assignedTo:body.assignedTo||null,notes:String(body.notes||"").slice(0,5000),responseMinutes:body.responseMinutes==null?null:Number(body.responseMinutes)||0,updatedAt:new Date().toISOString()};const idx=s.leads.findIndex(x=>x.id===lead.id&&x.clientId===clientId);if(idx>=0)s.leads[idx]={...s.leads[idx],...lead};else {const dup=findPossibleDuplicate(s,clientId,lead.phone,lead.email,lead.id);if(dup){lead.possibleDuplicateOf=dup.id;activity(s,clientId,"duplicate",`Possible duplicate: ${lead.name} matches existing lead ${dup.name}`,{leadId:lead.id,matchedLeadId:dup.id});} s.leads.unshift(lead); autoAssignLead(s,clientId,lead); seedLeadFollowups(s,clientId,lead);}const key=`${clientId}|${lead.source}|${lead.medium}|${lead.campaign}`;s.utm[key]=(s.utm[key]||0)+1;if(lead.conversationId&&s.conversations[lead.conversationId])Object.assign(s.conversations[lead.conversationId],{score,status,fields,clientId,utm});writeStore(s);return lead;}
app.post("/api/leads",requireWebhookSecret,(req,res)=>{try{res.status(201).json({ok:true,lead:saveLeadInternal(req.body||{})});}catch(e){res.status(500).json({error:e.message});}});

// Every real-estate CRM comparison names the same #1 requirement: auto-capture
// from every portal you advertise on (99acres, MagicBricks, Housing.com,
// NoBroker, Meta/Instagram Lead Ads) instead of manual CSV exports. Each of
// those sends a differently-shaped payload, so this endpoint accepts a raw
// payload plus a `source` label, normalises the common field-name variants
// portals actually use, and drops it into the exact same scoring/pipeline/
// automation path a chatbot lead goes through. Point a Zapier/Make/Meta
// Lead Ads webhook at this one URL (with the WEBHOOK_SECRET header) and new
// portal leads need zero manual entry.
function normalisePortalLead(raw={},source="Portal"){
  const pick=(...keys)=>{for(const k of keys){const v=raw[k];if(v!==undefined&&v!==null&&String(v).trim())return String(v).trim();}return "";};
  return {
    name:pick("name","full_name","fullName","contact_name","customer_name","Name"),
    phone:pick("phone","mobile","contact_number","contactNumber","mobile_number","phone_number","Phone","Mobile"),
    email:pick("email","email_id","emailId","Email"),
    budget:pick("budget","budget_range","Budget"),
    requirement:pick("locality","location","project_name","property_name","Locality","Project","message","query","remarks","Message"),
    notes:pick("message","query","remarks","comments","Message","Comments"),
    utm_source:source,
    utm_medium:"portal"
  };
}
app.post("/api/leads/import",requireWebhookSecret,rateLimit("leads-import",120,60000),(req,res)=>{
  try{
    const source=String(req.body.source||req.query.source||"Portal").trim()||"Portal";
    const raw=req.body.lead||req.body.data||req.body.entry||req.body;
    const mapped=normalisePortalLead(raw,source);
    if(!mapped.phone&&!mapped.email&&!mapped.name)return res.status(400).json({error:"Could not find a name, phone or email in the payload. Check the field names your source sends."});
    const clientId=String(req.body.clientId||req.query.clientId||"").trim();
    if(!clientId)return res.status(400).json({error:"clientId is required (query param or body field) so ASSISTQ knows which client this portal lead belongs to."});
    const lead=saveLeadInternal({...mapped,clientId});
    res.status(201).json({ok:true,lead});
  }catch(e){res.status(500).json({error:e.message});}
});

// Manual duplicate merge — folds a flagged duplicate's visits, follow-ups,
// documents and commissions into the original lead, fills any fields the
// original was missing, appends notes, and hides the duplicate from active
// views (it stays in the database for audit purposes, just tagged mergedInto).
app.post("/api/realestate/leads/:id/merge",requireAuth,(req,res)=>{
  try{
    const s=ensureStoreShape(readStore()),id=reClient(req,s);
    const dup=leadById(s,req.params.id,id);
    if(!dup)return res.status(404).json({error:"Lead not found"});
    const targetId=req.body.intoId||dup.possibleDuplicateOf;
    const target=targetId?leadById(s,targetId,id):null;
    if(!target)return res.status(400).json({error:"No merge target — provide intoId or use a lead with a detected duplicate match."});
    if(target.id===dup.id)return res.status(400).json({error:"Cannot merge a lead into itself."});
    if(!target.phone&&dup.phone)target.phone=dup.phone;
    if(!target.email&&dup.email)target.email=dup.email;
    if(!target.budget&&dup.budget)target.budget=dup.budget;
    if(!target.requirement&&dup.requirement)target.requirement=dup.requirement;
    if(dup.notes)target.notes=[target.notes,dup.notes].filter(Boolean).join(" | ").slice(0,5000);
    if(dup.score>target.score){target.score=dup.score;target.status=dup.status;target.scoreBreakdown=dup.scoreBreakdown;}
    for(const v of s.realEstate.visits)if(v.clientId===id&&v.leadId===dup.id)v.leadId=target.id;
    for(const f of s.realEstate.followups)if(f.clientId===id&&f.leadId===dup.id)f.leadId=target.id;
    for(const doc of s.realEstate.documents)if(doc.clientId===id&&doc.leadId===dup.id)doc.leadId=target.id;
    for(const c of s.realEstate.commissions)if(c.clientId===id&&c.leadId===dup.id)c.leadId=target.id;
    dup.mergedInto=target.id;
    target.updatedAt=reNow();
    activity(s,id,"duplicate",`${dup.name} merged into ${target.name}`,{leadId:target.id,mergedLeadId:dup.id});
    writeStore(s);
    res.json({ok:true,lead:enrichLead(target,s)});
  }catch(e){res.status(403).json({error:e.message});}
});
// These two routes are called directly from the public, client-side chatbot widget
// (see ASSISTQ_Chatbot_Connected.html), so they intentionally do NOT require
// WEBHOOK_SECRET — a browser-side script can never hold a secret safely, and
// SETUP_FOR_CLIENT.md correctly warns against putting WEBHOOK_SECRET in the chatbot
// HTML. Abuse is bounded by rateLimit() below instead. WEBHOOK_SECRET remains
// required for /api/leads, which is for trusted server-to-server integrations
// (Tally, Zapier, etc.) rather than the public browser widget.
app.post("/api/bridge/conversation",rateLimit("conversation",120,60000),requireActiveClient,(req,res)=>{try{res.json({ok:true,conversation:saveConversationEvent(req.body||{})});}catch(e){res.status(500).json({error:e.message});}});
app.post("/api/bridge/lead",rateLimit("lead",60,60000),requireActiveClient,(req,res)=>{try{const s=readStore();const c=req.body.conversationId?s.conversations[req.body.conversationId]:null;const body={...req.body,fields:normaliseFields(req.body.fields||c?.fields||{}),messages:Array.isArray(req.body.messages)?req.body.messages:(c?.messages||[]),utm:req.body.utm||c?.utm||{}};res.status(201).json({ok:true,lead:saveLeadInternal(body)});}catch(e){res.status(500).json({error:e.message});}});

// ---------- Keywords ----------
app.post("/api/keywords",requireAuth,(req,res)=>{const s=ensureStoreShape(readStore());const clientId=selectedClient(req,s);if(req.session.user.role!=="admin"&&req.session.user.clientId!==clientId)return res.status(403).json({error:"Workspace access denied"});const keyword=String(req.body.keyword||"").trim();if(!keyword)return res.status(400).json({error:"Keyword required"});const x={id:"kw_"+crypto.randomBytes(4).toString("hex"),clientId,keyword,targetUrl:String(req.body.targetUrl||""),priority:String(req.body.priority||"Medium"),intent:String(req.body.intent||"Commercial")};s.keywords.push(x);writeStore(s);res.status(201).json(x);});
app.delete("/api/keywords/:id",requireAuth,(req,res)=>{const s=ensureStoreShape(readStore());s.keywords=s.keywords.filter(x=>x.id!==req.params.id);writeStore(s);res.json({ok:true});});
// Every sync used to just overwrite lastPosition, so a keyword's rank
// movement (the "Pos. 4 ▲3" trend the marketing page shows as a demo) was
// never actually computed anywhere — there was nothing to diff against.
// Now every sync appends a snapshot to a capped history array and computes
// `trend` = previous position minus current position, so a positive trend
// means the keyword moved UP the results (lower position number is better).
app.post("/api/keywords/sync",requireAuth,(req,res)=>{const s=ensureStoreShape(readStore());const clientId=selectedClient(req,s);const clientGsc=s.gsc.byClient[clientId]||s.gsc;const g=clientGsc.rows||[];let count=0;const syncedAt=new Date().toISOString();s.keywords=s.keywords.map(k=>{if(k.clientId!==clientId)return k;const q=g.find(r=>r.query.toLowerCase()===k.keyword.toLowerCase())||g.find(r=>r.query.toLowerCase().includes(k.keyword.toLowerCase())||k.keyword.toLowerCase().includes(r.query.toLowerCase()));if(!q)return k;count++;const prevPosition=k.lastPosition!=null?Number(k.lastPosition):null;const trend=prevPosition!=null?Math.round((prevPosition-Number(q.position))*10)/10:null;const history=[...(Array.isArray(k.history)?k.history:[]),{position:q.position,clicks:q.clicks,impressions:q.impressions,ctr:q.ctr,syncedAt}].slice(-12);return {...k,lastPosition:q.position,lastClicks:q.clicks,lastImpressions:q.impressions,lastCtr:q.ctr,trend,history,rankSource:"Google Search Console",rankSyncedAt:syncedAt};});writeStore(s);res.json({ok:true,matched:count});});

// ---------- SEO crawler ----------
function absolute(base,href){try{return new URL(href,base).toString().split("#")[0];}catch{return null;}}
function sameOrigin(a,b){try{return new URL(a).origin===new URL(b).origin;}catch{return false;}}
function parseHtml(html,url){const title=(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||"").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();const description=(html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["'][^>]*>/i)?.[1]||html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["'][^>]*>/i)?.[1]||"").trim();const h1=(html.match(/<h1\b/gi)||[]).length;const h2=(html.match(/<h2\b/gi)||[]).length;const canonical=html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["'][^>]*>/i)?.[1]||"";const imgs=[...html.matchAll(/<img\b[^>]*>/gi)].map(m=>m[0]);const missingAlt=imgs.filter(x=>!/\balt\s*=\s*["'][^"']*["']/i.test(x)).length;const links=[...html.matchAll(/<a\b[^>]+href=["']([^"']+)["'][^>]*>/gi)].map(m=>absolute(url,m[1])).filter(Boolean);const jsonLd=(html.match(/<script[^>]+type=["']application\/ld\+json["']/gi)||[]).length;return {url,title,description,h1,h2,canonical,missingAlt,images:imgs.length,internalLinks:[...new Set(links.filter(x=>sameOrigin(x,url)))].slice(0,40),structuredData:jsonLd,https:url.startsWith("https://")};}
async function fetchText(url,timeout=8000){const c=new AbortController();const t=setTimeout(()=>c.abort(),timeout);try{const r=await fetch(url,{redirect:"follow",signal:c.signal,headers:{"User-Agent":"ASSISTQ-SEO-Audit/1.0"}});const text=await r.text();return {ok:r.ok,status:r.status,url:r.url,text};}finally{clearTimeout(t);}}
async function runSeoAudit(inputUrl){let url=inputUrl.trim();if(!/^https?:\/\//i.test(url))url="https://"+url;const root=new URL(url);const seen=new Set(),queue=[root.toString()];const pages=[];const broken=[];let robots=false,sitemap=false;try{const rr=await fetchText(new URL("/robots.txt",root).toString(),5000);robots=rr.ok;const sm=rr.text.match(/Sitemap:\s*(\S+)/i)?.[1];if(sm){const sr=await fetchText(sm,5000);sitemap=sr.ok;}}catch{}while(queue.length&&pages.length<10){const u=queue.shift();if(seen.has(u))continue;seen.add(u);try{const r=await fetchText(u,8000);if(!r.ok){broken.push({url:u,status:r.status});continue;}const p=parseHtml(r.text,r.url);pages.push({...p,status:r.status});for(const link of p.internalLinks){if(pages.length+queue.length>=15)break;const nu=new URL(link);nu.hash="";if(!seen.has(nu.toString())&&!queue.includes(nu.toString()))queue.push(nu.toString());}}catch(e){broken.push({url:u,status:e.name==="AbortError"?"timeout":"error"});}}
const checks=[];const add=(name,ok,detail)=>checks.push({name,ok,detail});add("HTTPS",root.protocol==="https:",root.protocol==="https:"?"Secure connection detected":"Use HTTPS for the client website");add("Robots.txt",robots,robots?"Robots file found":"robots.txt not found or unavailable");add("XML sitemap",sitemap,sitemap?"Sitemap found through robots.txt":"No sitemap discovered from robots.txt");const noTitle=pages.filter(p=>!p.title||p.title.length<10).length;const noDesc=pages.filter(p=>!p.description||p.description.length<50).length;const badH1=pages.filter(p=>p.h1!==1).length;const badCanonical=pages.filter(p=>!p.canonical).length;const alt=pages.reduce((n,p)=>n+p.missingAlt,0);add("Title tags",noTitle===0,`${noTitle} of ${pages.length} pages need title attention`);add("Meta descriptions",noDesc===0,`${noDesc} of ${pages.length} pages need description attention`);add("H1 structure",badH1===0,`${badH1} of ${pages.length} pages do not have exactly one H1`);add("Canonical tags",badCanonical===0,`${badCanonical} of ${pages.length} pages have no canonical`);add("Image alt text",alt===0,alt?`${alt} images missing alt text`:`All sampled images have alt text`);add("Structured data",pages.some(p=>p.structuredData>0),pages.some(p=>p.structuredData>0)?"JSON-LD detected":"No JSON-LD detected in sampled pages");add("Broken internal links",broken.length===0,broken.length?`${broken.length} broken/unreachable URLs found`:`No broken URLs found in sampled crawl`);const critical=checks.filter(c=>!c.ok&&["HTTPS","Robots.txt","XML sitemap","Broken internal links"].includes(c.name)).length;const warnings=checks.filter(c=>!c.ok).length-critical;const score=Math.max(0,Math.round(100-(critical*15)-(warnings*7)));return {url,checkedAt:new Date().toISOString(),pagesChecked:pages.length,score,critical,warnings,checks,pages:pages.map(p=>({url:p.url,status:p.status,title:p.title,description:p.description,h1:p.h1,h2:p.h2,missingAlt:p.missingAlt,canonical:p.canonical,structuredData:p.structuredData})),broken};}
app.post("/api/seo/audit",requireAuth,rateLimit("seo",20,60000),async(req,res)=>{try{const s=ensureStoreShape(readStore());const clientId=selectedClient(req,s);const website=String(req.body.url||clientSettings(s,clientId).website||"").trim();if(!website)return res.status(400).json({error:"Website URL required"});const audit=await runSeoAudit(website);s.seoAudits[clientId]=audit;writeStore(s);res.json(audit);}catch(e){res.status(500).json({error:"SEO audit failed: "+e.message});}});


// ---------- Real Estate Conversion Engine ----------
function reClient(req,s){const id=selectedClient(req,s);if(req.session.user?.role!=="admin"&&req.session.user?.clientId!==id)throw new Error("Workspace access denied");return id;}
function reId(prefix){return prefix+"_"+crypto.randomBytes(5).toString("hex");}
function reNow(){return new Date().toISOString();}
function activity(s,clientId,type,text,meta={}){s.realEstate.activities.unshift({id:reId("act"),clientId,type,text,meta,at:reNow()});s.realEstate.activities=s.realEstate.activities.slice(0,500);}
function enrichLead(l,s){const visits=s.realEstate.visits.filter(v=>v.clientId===l.clientId&&v.leadId===l.id);const f=s.realEstate.followups.filter(v=>v.clientId===l.clientId&&v.leadId===l.id);const team=s.realEstate.team.find(t=>t.clientId===l.clientId&&t.id===l.assignedTo);return {...l,visits,followups:f,assignedUser:team||null};}
function leadById(s,id,clientId){return s.leads.find(x=>x.id===id&&x.clientId===clientId);}
app.get("/api/realestate/summary",requireAuth,(req,res)=>{try{const s=ensureStoreShape(readStore()),id=reClient(req,s);const leads=s.leads.filter(x=>x.clientId===id);const visits=s.realEstate.visits.filter(x=>x.clientId===id);const team=s.realEstate.team.filter(x=>x.clientId===id);const bookings=leads.filter(x=>x.pipelineStage==="BOOKING").length;const qualified=leads.filter(x=>x.score>=50).length;const contacted=leads.filter(x=>["CONTACTED","INTERESTED","SITE_VISIT_SCHEDULED","SITE_VISIT_COMPLETED","NEGOTIATION","BOOKING"].includes(x.pipelineStage)).length;const scheduled=visits.filter(x=>x.status==="scheduled").length;const completed=visits.filter(x=>x.status==="completed").length;const negotiation=leads.filter(x=>x.pipelineStage==="NEGOTIATION").length;const bySource={};for(const l of leads){const key=l.source||"Direct";bySource[key]??={leads:0,qualified:0,visits:0,bookings:0};bySource[key].leads++;if(l.score>=50)bySource[key].qualified++;if(visits.some(v=>v.leadId===l.id&&v.status==="completed"))bySource[key].visits++;if(l.pipelineStage==="BOOKING")bySource[key].bookings++;}res.json({clientId:id,counts:{leads:leads.length,qualified,contacted,scheduled,completed,negotiation,bookings},bySource,team:team.map(t=>{const tl=leads.filter(l=>l.assignedTo===t.id);return {...t,leads:tl.length,contacted:tl.filter(l=>l.pipelineStage!=="NEW").length,visits:visits.filter(v=>v.assignedTo===t.id&&v.status==="completed").length,bookings:tl.filter(l=>l.pipelineStage==="BOOKING").length,responseMinutes:tl.length?Math.round(tl.reduce((a,l)=>a+(l.responseMinutes||0),0)/tl.filter(l=>l.responseMinutes!=null).length||0):0};})});}catch(e){res.status(e.message.includes("access")?403:500).json({error:e.message});}});
app.get("/api/realestate/leads",requireAuth,(req,res)=>{try{const s=ensureStoreShape(readStore()),id=reClient(req,s);res.json(s.leads.filter(x=>x.clientId===id&&!x.mergedInto).map(l=>enrichLead(l,s)));}catch(e){res.status(403).json({error:e.message});}});
app.patch("/api/realestate/leads/:id",requireAuth,(req,res)=>{try{const s=ensureStoreShape(readStore()),id=reClient(req,s),l=leadById(s,req.params.id,id);if(!l)return res.status(404).json({error:"Lead not found"});const allowedStage=["NEW","QUALIFIED","CONTACTED","INTERESTED","SITE_VISIT_SCHEDULED","SITE_VISIT_COMPLETED","NEGOTIATION","BOOKING","LOST"];if(req.body.pipelineStage&&allowedStage.includes(req.body.pipelineStage)){const wasBooking=l.pipelineStage==="BOOKING";l.pipelineStage=req.body.pipelineStage;activity(s,id,"stage",`${l.name} moved to ${l.pipelineStage}`,{leadId:l.id});
  // Once a lead is actually booked, automatically start the post-sale/possession
  // tracker for them (Premium feature) instead of requiring a separate manual step.
  if(l.pipelineStage==="BOOKING"&&!wasBooking&&planHasFeature(clientPlanTier(s,id),"possession")&&!s.realEstate.possession.some(p=>p.leadId===l.id)){const poss={id:reId("poss"),clientId:id,leadId:l.id,projectId:null,unit:"",expectedDate:"",stage:"BOOKING_CONFIRMED",notes:"Auto-started when lead reached Booking stage.",createdAt:reNow(),updatedAt:reNow()};s.realEstate.possession.push(poss);activity(s,id,"possession",`Post-sale tracking auto-started for ${l.name}`,{leadId:l.id,possessionId:poss.id});}
}if(req.body.assignedTo!==undefined){l.assignedTo=req.body.assignedTo||null;activity(s,id,"assignment",`${l.name} assigned to ${l.assignedTo||"unassigned"}`,{leadId:l.id});}if(req.body.notes!==undefined)l.notes=String(req.body.notes).slice(0,5000);if(req.body.responseMinutes!==undefined)l.responseMinutes=Math.max(0,Number(req.body.responseMinutes)||0);l.updatedAt=reNow();writeStore(s);res.json(enrichLead(l,s));}catch(e){res.status(403).json({error:e.message});}});
app.get("/api/realestate/team",requireAuth,(req,res)=>{try{const s=ensureStoreShape(readStore()),id=reClient(req,s);if(req.session.user?.role!=="admin"&&!planHasFeature(clientPlanTier(s,id),"team"))return res.status(403).json({error:"Sales team management requires the Premium plan."});res.json(s.realEstate.team.filter(x=>x.clientId===id));}catch(e){res.status(403).json({error:e.message});}});
app.post("/api/realestate/team",requireAuth,(req,res)=>{try{const s=ensureStoreShape(readStore()),id=reClient(req,s);if(req.session.user?.role!=="admin"&&!planHasFeature(clientPlanTier(s,id),"team"))return res.status(403).json({error:"Sales team management requires the Premium plan."});const t={id:reId("rep"),clientId:id,name:String(req.body.name||"").trim(),phone:String(req.body.phone||""),email:String(req.body.email||""),areas:Array.isArray(req.body.areas)?req.body.areas:String(req.body.areas||"").split(",").map(x=>x.trim()).filter(Boolean),minBudget:String(req.body.minBudget||""),maxBudget:String(req.body.maxBudget||""),active:req.body.active!==false};if(!t.name)return res.status(400).json({error:"Salesperson name required"});s.realEstate.team.push(t);writeStore(s);res.status(201).json(t);}catch(e){res.status(403).json({error:e.message});}});
app.delete("/api/realestate/team/:id",requireAuth,(req,res)=>{try{const s=ensureStoreShape(readStore()),id=reClient(req,s);if(req.session.user?.role!=="admin"&&!planHasFeature(clientPlanTier(s,id),"team"))return res.status(403).json({error:"Sales team management requires the Premium plan."});s.realEstate.team=s.realEstate.team.filter(x=>!(x.id===req.params.id&&x.clientId===id));writeStore(s);res.json({ok:true});}catch(e){res.status(403).json({error:e.message});}});
app.post("/api/realestate/assign",requireAuth,(req,res)=>{try{const s=ensureStoreShape(readStore()),id=reClient(req,s);if(req.session.user?.role!=="admin"&&!planHasFeature(clientPlanTier(s,id),"team"))return res.status(403).json({error:"Salesperson assignment requires the Premium plan."});const l=leadById(s,req.body.leadId,id);if(!l)return res.status(404).json({error:"Lead not found"});const reps=s.realEstate.team.filter(t=>t.clientId===id&&t.active!==false);const loc=String(l.requirement||l.location||"").toLowerCase();const match=reps.find(t=>t.areas.some(a=>loc.includes(String(a).toLowerCase())))||reps[0];if(!match)return res.status(400).json({error:"Add at least one active salesperson first"});l.assignedTo=match.id;l.assignedAt=reNow();activity(s,id,"assignment",`${l.name} automatically assigned to ${match.name}`,{leadId:l.id,repId:match.id});writeStore(s);res.json(enrichLead(l,s));}catch(e){res.status(403).json({error:e.message});}});
app.get("/api/realestate/visits",requireAuth,(req,res)=>{try{const s=ensureStoreShape(readStore()),id=reClient(req,s);res.json(s.realEstate.visits.filter(x=>x.clientId===id).sort((a,b)=>new Date(a.date)-new Date(b.date)));}catch(e){res.status(403).json({error:e.message});}});
app.post("/api/realestate/visits",requireAuth,(req,res)=>{try{const s=ensureStoreShape(readStore()),id=reClient(req,s);if(req.session.user?.role!=="admin"&&!planHasFeature(clientPlanTier(s,id),"visits"))return res.status(403).json({error:"Site visit scheduling requires the Growth plan or higher."});const l=leadById(s,req.body.leadId,id);if(!l)return res.status(404).json({error:"Lead not found"});const v={id:reId("visit"),clientId:id,leadId:l.id,projectId:req.body.projectId||null,date:String(req.body.date||""),time:String(req.body.time||""),assignedTo:req.body.assignedTo||l.assignedTo||null,status:"scheduled",notes:String(req.body.notes||"").slice(0,1000),createdAt:reNow()};if(!v.date||!v.time)return res.status(400).json({error:"Date and time are required"});s.realEstate.visits.push(v);l.pipelineStage="SITE_VISIT_SCHEDULED";l.updatedAt=reNow();activity(s,id,"visit",`${l.name} site visit scheduled for ${v.date} ${v.time}`,{leadId:l.id,visitId:v.id});writeStore(s);res.status(201).json(v);}catch(e){res.status(403).json({error:e.message});}});
app.patch("/api/realestate/visits/:id",requireAuth,(req,res)=>{try{const s=ensureStoreShape(readStore()),id=reClient(req,s),v=s.realEstate.visits.find(x=>x.id===req.params.id&&x.clientId===id);if(!v)return res.status(404).json({error:"Visit not found"});if(req.body.status)v.status=req.body.status;const l=leadById(s,v.leadId,id);if(l&&v.status==="completed")l.pipelineStage="SITE_VISIT_COMPLETED";if(l&&v.status==="cancelled")l.pipelineStage="CONTACTED";activity(s,id,"visit",`${l?.name||"Lead"} site visit ${v.status}`,{leadId:v.leadId,visitId:v.id});writeStore(s);res.json(v);}catch(e){res.status(403).json({error:e.message});}});
app.get("/api/realestate/projects",requireAuth,(req,res)=>{try{const s=ensureStoreShape(readStore()),id=reClient(req,s);res.json(s.realEstate.projects.filter(x=>x.clientId===id));}catch(e){res.status(403).json({error:e.message});}});
app.post("/api/realestate/projects",requireAuth,(req,res)=>{try{const s=ensureStoreShape(readStore()),id=reClient(req,s);const p={id:reId("proj"),clientId:id,name:String(req.body.name||"").trim(),location:String(req.body.location||""),configurations:String(req.body.configurations||""),priceFrom:String(req.body.priceFrom||""),priceTo:String(req.body.priceTo||""),rera:String(req.body.rera||""),brochure:String(req.body.brochure||""),description:String(req.body.description||"").slice(0,5000),active:req.body.active!==false};if(!p.name)return res.status(400).json({error:"Project name required"});s.realEstate.projects.push(p);writeStore(s);res.status(201).json(p);}catch(e){res.status(403).json({error:e.message});}});
app.delete("/api/realestate/projects/:id",requireAuth,(req,res)=>{try{const s=ensureStoreShape(readStore()),id=reClient(req,s);s.realEstate.projects=s.realEstate.projects.filter(x=>!(x.id===req.params.id&&x.clientId===id));s.realEstate.inventory=s.realEstate.inventory.filter(x=>!(x.projectId===req.params.id&&x.clientId===id));writeStore(s);res.json({ok:true});}catch(e){res.status(403).json({error:e.message});}});
app.get("/api/realestate/inventory",requireAuth,(req,res)=>{try{const s=ensureStoreShape(readStore()),id=reClient(req,s);res.json(s.realEstate.inventory.filter(x=>x.clientId===id));}catch(e){res.status(403).json({error:e.message});}});
app.post("/api/realestate/inventory",requireAuth,(req,res)=>{try{const s=ensureStoreShape(readStore()),id=reClient(req,s);const x={id:reId("unit"),clientId:id,projectId:String(req.body.projectId||""),unit:String(req.body.unit||""),configuration:String(req.body.configuration||""),price:String(req.body.price||""),status:String(req.body.status||"available"),floor:String(req.body.floor||""),updatedAt:reNow()};if(!x.projectId||!x.unit)return res.status(400).json({error:"Project and unit are required"});s.realEstate.inventory.push(x);writeStore(s);res.status(201).json(x);}catch(e){res.status(403).json({error:e.message});}});
app.patch("/api/realestate/inventory/:id",requireAuth,(req,res)=>{try{const s=ensureStoreShape(readStore()),id=reClient(req,s),x=s.realEstate.inventory.find(x=>x.id===req.params.id&&x.clientId===id);if(!x)return res.status(404).json({error:"Unit not found"});Object.assign(x,{status:req.body.status||x.status,price:req.body.price||x.price,updatedAt:reNow()});writeStore(s);res.json(x);}catch(e){res.status(403).json({error:e.message});}});
app.get("/api/realestate/followups",requireAuth,(req,res)=>{try{const s=ensureStoreShape(readStore()),id=reClient(req,s);res.json(s.realEstate.followups.filter(x=>x.clientId===id).sort((a,b)=>new Date(a.dueAt)-new Date(b.dueAt)));}catch(e){res.status(403).json({error:e.message});}});
app.post("/api/realestate/followups",requireAuth,(req,res)=>{try{const s=ensureStoreShape(readStore()),id=reClient(req,s),l=leadById(s,req.body.leadId,id);if(!l)return res.status(404).json({error:"Lead not found"});const f={id:reId("fu"),clientId:id,leadId:l.id,channel:String(req.body.channel||"whatsapp"),dueAt:String(req.body.dueAt||reNow()),message:String(req.body.message||""),status:"pending",createdAt:reNow()};if(!f.message)return res.status(400).json({error:"Follow-up message required"});s.realEstate.followups.push(f);activity(s,id,"followup",`Follow-up created for ${l.name}`,{leadId:l.id,followupId:f.id});writeStore(s);res.status(201).json(f);}catch(e){res.status(403).json({error:e.message});}});
app.patch("/api/realestate/followups/:id",requireAuth,(req,res)=>{try{const s=ensureStoreShape(readStore()),id=reClient(req,s),f=s.realEstate.followups.find(x=>x.id===req.params.id&&x.clientId===id);if(!f)return res.status(404).json({error:"Follow-up not found"});if(req.body.status)f.status=req.body.status;writeStore(s);res.json(f);}catch(e){res.status(403).json({error:e.message});}});
app.get("/api/realestate/analytics",requireAuth,(req,res)=>{try{const s=ensureStoreShape(readStore()),id=reClient(req,s);const leads=s.leads.filter(x=>x.clientId===id),visits=s.realEstate.visits.filter(x=>x.clientId===id);const sources={};for(const l of leads){const src=l.source||"Direct";sources[src]??={leads:0,qualified:0,siteVisits:0,bookings:0};sources[src].leads++;if(l.score>=50)sources[src].qualified++;if(visits.some(v=>v.leadId===l.id&&v.status==="completed"))sources[src].siteVisits++;if(l.pipelineStage==="BOOKING")sources[src].bookings++;}const stage={};for(const l of leads)stage[l.pipelineStage||"NEW"]=(stage[l.pipelineStage||"NEW"]||0)+1;res.json({sources,stage,avgResponseMinutes:leads.filter(l=>l.responseMinutes!=null).length?Math.round(leads.filter(l=>l.responseMinutes!=null).reduce((a,l)=>a+l.responseMinutes,0)/leads.filter(l=>l.responseMinutes!=null).length):null});}catch(e){res.status(403).json({error:e.message});}});
app.get("/api/realestate/audit",requireAuth,(req,res)=>{try{const s=ensureStoreShape(readStore()),id=reClient(req,s),leads=s.leads.filter(x=>x.clientId===id),visits=s.realEstate.visits.filter(x=>x.clientId===id);const contacted=leads.filter(x=>x.pipelineStage&&x.pipelineStage!=="NEW").length;const completed=visits.filter(x=>x.status==="completed").length;const bookings=leads.filter(x=>x.pipelineStage==="BOOKING").length;const score=Math.round((Math.min(100,leads.length?Math.min(100,contacted/leads.length*100):0)+Math.min(100,leads.length?leads.filter(x=>x.score>=50).length/leads.length*100:0)+Math.min(100,visits.length?completed/visits.length*100:0)+Math.min(100,leads.length?bookings/leads.length*100:0))/4);res.json({score,website: s.seoAudits?.[id]?.score||null,leadHandling:leads.length?Math.round(contacted/leads.length*100):0,qualification:leads.length?Math.round(leads.filter(x=>x.score>=50).length/leads.length*100):0,siteVisitConversion:leads.length?Math.round(completed/leads.length*100):0,bookingConversion:leads.length?Math.round(bookings/leads.length*100):0});}catch(e){res.status(403).json({error:e.message});}});



// ---------- WhatsApp Cloud API bridge ----------
function waConfig(){return {phoneNumberId:process.env.WA_PHONE_NUMBER_ID||"",accessToken:process.env.WA_ACCESS_TOKEN||"",verifyToken:process.env.WA_VERIFY_TOKEN||"",appSecret:process.env.WA_APP_SECRET||"",apiVersion:process.env.WA_API_VERSION||"v23.0",followupTemplate:process.env.WA_FOLLOWUP_TEMPLATE_NAME||"",followupLanguage:process.env.WA_FOLLOWUP_TEMPLATE_LANG||"en_US"};}
// Shared sender used by both the manual "Send template" button AND the
// automation engine below. Throws on failure so callers can decide what to
// do (the HTTP route turns it into a response; the automation worker logs
// it and leaves the follow-up queued for manual click-to-chat instead).
async function sendWhatsAppTemplate(to,template,language,params=[]){
  const c=waConfig();
  if(!c.phoneNumberId||!c.accessToken)throw new Error("WhatsApp Cloud API is not configured (WA_PHONE_NUMBER_ID / WA_ACCESS_TOKEN missing).");
  const digits=String(to||"").replace(/\D/g,"");
  if(!digits||!template)throw new Error("A recipient number and template name are required.");
  const body={messaging_product:"whatsapp",to:digits,type:"template",template:{name:template,language:{code:language||"en_US"},...(params.length?{components:[{type:"body",parameters:params.map(x=>({type:"text",text:String(x)}))}]}:{})}};
  const r=await fetch(`https://graph.facebook.com/${c.apiVersion}/${c.phoneNumberId}/messages`,{method:"POST",headers:{Authorization:`Bearer ${c.accessToken}`,"Content-Type":"application/json"},body:JSON.stringify(body)});
  const j=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(j.error?.message||"WhatsApp API request failed");
  return {messageId:j.messages?.[0]?.id||null,response:j};
}
// Free-form text (not a template) — only legal within Meta's 24h customer
// service window after the contact's last inbound message. Callers are
// expected to check that window themselves (the inbox reply route below
// does); this function just makes the API call.
async function sendWhatsAppText(to,text){
  const c=waConfig();
  if(!c.phoneNumberId||!c.accessToken)throw new Error("WhatsApp Cloud API is not configured (WA_PHONE_NUMBER_ID / WA_ACCESS_TOKEN missing).");
  const digits=String(to||"").replace(/\D/g,"");
  if(!digits||!text)throw new Error("A recipient number and message text are required.");
  const body={messaging_product:"whatsapp",to:digits,type:"text",text:{body:String(text).slice(0,4096)}};
  const r=await fetch(`https://graph.facebook.com/${c.apiVersion}/${c.phoneNumberId}/messages`,{method:"POST",headers:{Authorization:`Bearer ${c.accessToken}`,"Content-Type":"application/json"},body:JSON.stringify(body)});
  const j=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(j.error?.message||"WhatsApp API request failed");
  return {messageId:j.messages?.[0]?.id||null,response:j};
}
// Incoming/outgoing WhatsApp messages used to only ever get flattened into
// the generic activity feed as one-line text — there was no actual
// conversation view, which every real-estate CRM comparison lists as a
// baseline "WhatsApp inbox" requirement. This keeps a proper per-contact
// thread (capped at the last 200 messages) so staff can see and reply to a
// real conversation instead of hunting through the activity log.
function threadKey(phone){return normPhone(phone);}
function pushThreadMessage(s,clientId,phone,message){
  const key=threadKey(phone);
  if(!key)return;
  s.whatsappThreads[clientId]=s.whatsappThreads[clientId]||{};
  const t=s.whatsappThreads[clientId][key]||{phone,leadId:null,messages:[],unread:false};
  t.phone=phone||t.phone;
  t.messages=[...t.messages,message].slice(-200);
  t.lastMessageAt=message.at;
  if(message.direction==="in")t.unread=true;
  if(!t.leadId){const lead=s.leads.find(l=>l.clientId===clientId&&normPhone(l.phone)===key&&!l.mergedInto);if(lead)t.leadId=lead.id;}
  s.whatsappThreads[clientId][key]=t;
}
app.get("/api/whatsapp/status",requireAuth,(req,res)=>{const c=waConfig();res.json({configured:!!(c.phoneNumberId&&c.accessToken),phoneNumberId:c.phoneNumberId?"configured":"missing",verifyToken:c.verifyToken?"configured":"missing",appSecret:c.appSecret?"configured":"missing",apiVersion:c.apiVersion,automatedFollowups:!!(c.phoneNumberId&&c.accessToken&&c.followupTemplate),followupTemplate:c.followupTemplate?"configured":"missing — automation will queue for manual send only"});});
app.post("/api/whatsapp/send-template",requireAuth,async(req,res)=>{try{const s0=ensureStoreShape(readStore());const id=selectedClient(req,s0);const to=String(req.body.to||"");const template=String(req.body.template||"").trim();const language=String(req.body.language||"en_US");const params=Array.isArray(req.body.params)?req.body.params:[];if(!to||!template)return res.status(400).json({error:"to and template are required"});const out=await sendWhatsAppTemplate(to,template,language,params);const s=ensureStoreShape(readStore());pushThreadMessage(s,id,to,{direction:"out",text:params.length?`[${template}] ${params.join(" · ")}`:`[${template}]`,at:reNow(),messageId:out.messageId});writeStore(s);res.json({ok:true,...out});}catch(e){res.status(502).json({error:e.message});}});
app.get("/api/whatsapp/webhook",(req,res)=>{const c=waConfig();if(!c.verifyToken)return res.status(503).send("WhatsApp webhook is not configured");if(req.query["hub.verify_token"]!==c.verifyToken)return res.status(403).send("Invalid verify token");res.status(200).send(String(req.query["hub.challenge"]||""));});
app.post("/api/whatsapp/webhook",(req,res)=>{const c=waConfig();const signature=req.headers["x-hub-signature-256"];if(c.appSecret&&signature){const raw=req.rawBody||JSON.stringify(req.body||{});const expected="sha256="+crypto.createHmac("sha256",c.appSecret).update(raw).digest("hex");const got=Buffer.from(String(signature));const exp=Buffer.from(expected);if(got.length!==exp.length||!crypto.timingSafeEqual(got,exp))return res.status(401).send("Invalid signature");}try{const s=ensureStoreShape(readStore());for(const entry of (req.body?.entry||[])){for(const change of (entry.changes||[])){const value=change.value||{};for(const m of (value.messages||[])){const from=m.from||"";const text=m.text?.body||m.button?.text||m.interactive?.button_reply?.title||"";const client=s.clients.find(x=>x.clientWhatsApp&&String(x.clientWhatsApp).replace(/\D/g,"").endsWith(String(value.metadata?.display_phone_number||"").replace(/\D/g,"")))||s.clients.find(x=>x.clientWhatsApp)||s.clients[0];if(client&&text){activity(s,client.id,"whatsapp",`Incoming WhatsApp message from ${from}: ${text.slice(0,180)}`,{from,text,messageId:m.id||null});pushThreadMessage(s,client.id,from,{direction:"in",text,at:reNow(),messageId:m.id||null});}}}}writeStore(s);res.sendStatus(200);}catch(e){res.status(500).json({error:e.message});}});

app.get("/api/whatsapp/inbox",requireAuth,(req,res)=>{try{const s=ensureStoreShape(readStore()),id=reClient(req,s);const threads=Object.values(s.whatsappThreads[id]||{});const out=threads.map(t=>{const lead=t.leadId?s.leads.find(l=>l.id===t.leadId&&l.clientId===id):null;const last=t.messages[t.messages.length-1];return {phone:t.phone,leadId:t.leadId,leadName:lead?.name||null,lastMessage:last?.text||"",lastDirection:last?.direction||null,lastMessageAt:t.lastMessageAt,unread:!!t.unread};}).sort((a,b)=>new Date(b.lastMessageAt)-new Date(a.lastMessageAt));res.json(out);}catch(e){res.status(403).json({error:e.message});}});
app.get("/api/whatsapp/inbox/:phone",requireAuth,(req,res)=>{try{const s=ensureStoreShape(readStore()),id=reClient(req,s);const key=threadKey(req.params.phone);const t=(s.whatsappThreads[id]||{})[key];if(!t)return res.status(404).json({error:"No conversation found for this number."});if(t.unread){t.unread=false;writeStore(s);}res.json(t);}catch(e){res.status(403).json({error:e.message});}});
app.post("/api/whatsapp/inbox/reply",requireAuth,rateLimit("wa-reply",60,60000),async(req,res)=>{try{const s=ensureStoreShape(readStore()),id=reClient(req,s);const phone=String(req.body.phone||"");const text=String(req.body.text||"").trim();if(!phone||!text)return res.status(400).json({error:"phone and text are required"});const key=threadKey(phone);const t=(s.whatsappThreads[id]||{})[key];const lastInbound=[...(t?.messages||[])].reverse().find(m=>m.direction==="in");const withinWindow=lastInbound&&(Date.now()-new Date(lastInbound.at).getTime())<24*60*60*1000;if(!withinWindow)return res.status(400).json({error:"More than 24 hours since this contact's last message — WhatsApp requires an approved template outside that window. Use Send Template instead."});const out=await sendWhatsAppText(phone,text);const s2=ensureStoreShape(readStore());pushThreadMessage(s2,id,phone,{direction:"out",text,at:reNow(),messageId:out.messageId});writeStore(s2);res.json({ok:true,messageId:out.messageId});}catch(e){res.status(502).json({error:e.message});}});

// ---------- Real Estate Automation / Revenue Intelligence v2 ----------
app.get("/api/realestate/automation",requireAuth,(req,res)=>{try{const s=ensureStoreShape(readStore()),id=reClient(req,s);if(req.session.user?.role!=="admin"&&!planHasFeature(clientPlanTier(s,id),"automation"))return res.status(403).json({error:"The automation engine requires the Premium plan."});const a=clientAutomation(s,id);writeStore(s);const leads=s.leads.filter(x=>x.clientId===id);const follow=s.realEstate.followups.filter(x=>x.clientId===id);const uncontacted=leads.filter(x=>x.pipelineStage==="NEW");const queued=follow.filter(x=>x.status==="queued");const wa=waConfig();res.json({config:a,waAutomatedFollowups:!!(wa.phoneNumberId&&wa.accessToken&&wa.followupTemplate),uncontacted:uncontacted.length,missed:uncontacted.filter(x=>x.missedLeadAt).length,escalated:uncontacted.filter(x=>x.escalatedAt).length,followups:{pending:follow.filter(x=>x.status==="pending").length,queued:queued.length,sent:follow.filter(x=>x.status==="sent").length,completed:follow.filter(x=>x.status==="completed").length,failed:follow.filter(x=>x.status==="queued"&&x.lastSendError).length},queue:queued.slice(0,100)});}catch(e){res.status(403).json({error:e.message});}});
app.post("/api/realestate/automation",requireAuth,(req,res)=>{try{const s=ensureStoreShape(readStore()),id=reClient(req,s);if(req.session.user?.role!=="admin"&&!planHasFeature(clientPlanTier(s,id),"automation"))return res.status(403).json({error:"The automation engine requires the Premium plan."});const a=clientAutomation(s,id);if(req.body.missedLeadMinutes!==undefined)a.missedLeadMinutes=Math.max(1,Number(req.body.missedLeadMinutes)||10);if(req.body.escalationMinutes!==undefined)a.escalationMinutes=Math.max(a.missedLeadMinutes+1,Number(req.body.escalationMinutes)||30);if(req.body.autoAssign!==undefined)a.autoAssign=!!req.body.autoAssign;if(Array.isArray(req.body.followups))a.followups=req.body.followups.slice(0,20).map(x=>({id:String(x.id||reId("rule")),day:Math.max(0,Number(x.day)||0),stage:String(x.stage||"lead"),channel:String(x.channel||"whatsapp"),message:String(x.message||"").slice(0,1000)})).filter(x=>x.message);s.realEstate.automationByClient[id]=a;activity(s,id,"automation","Automation settings updated");writeStore(s);res.json(a);}catch(e){res.status(403).json({error:e.message});}});
app.post("/api/realestate/automation/run",requireAuth,(req,res)=>{try{const s0=ensureStoreShape(readStore()),id0=reClient(req,s0);if(req.session.user?.role!=="admin"&&!planHasFeature(clientPlanTier(s0,id0),"automation"))return res.status(403).json({error:"The automation engine requires the Premium plan."});processRealEstateAutomation();const s=ensureStoreShape(readStore()),id=reClient(req,s);res.json({ok:true,clientId:id,ranAt:reNow()});}catch(e){res.status(403).json({error:e.message});}});
app.get("/api/realestate/activity",requireAuth,(req,res)=>{try{const s=ensureStoreShape(readStore()),id=reClient(req,s);const leadId=req.query.leadId;res.json(s.realEstate.activities.filter(x=>x.clientId===id&&(!leadId||x.meta?.leadId===leadId)).slice(0,200));}catch(e){res.status(403).json({error:e.message});}});
app.get("/api/realestate/team-performance",requireAuth,(req,res)=>{try{const s=ensureStoreShape(readStore()),id=reClient(req,s);if(req.session.user?.role!=="admin"&&!planHasFeature(clientPlanTier(s,id),"team"))return res.status(403).json({error:"Sales team management requires the Premium plan."});const leads=s.leads.filter(x=>x.clientId===id),visits=s.realEstate.visits.filter(x=>x.clientId===id);const rows=s.realEstate.team.filter(x=>x.clientId===id).map(t=>{const ls=leads.filter(l=>l.assignedTo===t.id),rs=ls.filter(l=>l.responseMinutes!=null);return {id:t.id,name:t.name,areas:t.areas||[],leads:ls.length,contacted:ls.filter(l=>l.pipelineStage!=="NEW").length,qualified:ls.filter(l=>l.score>=50).length,visits:visits.filter(v=>v.assignedTo===t.id&&v.status==="completed").length,bookings:ls.filter(l=>l.pipelineStage==="BOOKING").length,avgResponse:rs.length?Math.round(rs.reduce((a,l)=>a+l.responseMinutes,0)/rs.length):null,followupRate:ls.length?Math.round(ls.filter(l=>l.pipelineStage!=="NEW").length/ls.length*100):0};});res.json(rows);}catch(e){res.status(403).json({error:e.message});}});
app.get("/api/realestate/spend",requireAuth,(req,res)=>{try{const s=ensureStoreShape(readStore()),id=reClient(req,s);res.json(s.realEstate.adSpend.filter(x=>x.clientId===id).sort((a,b)=>String(b.date).localeCompare(String(a.date))));}catch(e){res.status(403).json({error:e.message});}});
app.post("/api/realestate/spend",requireAuth,(req,res)=>{try{const s=ensureStoreShape(readStore()),id=reClient(req,s);const x={id:reId("spend"),clientId:id,date:String(req.body.date||new Date().toISOString().slice(0,10)),source:String(req.body.source||"Meta"),campaign:String(req.body.campaign||""),amount:Math.max(0,Number(req.body.amount)||0)};s.realEstate.adSpend.push(x);writeStore(s);res.status(201).json(x);}catch(e){res.status(403).json({error:e.message});}});
app.get("/api/realestate/roi",requireAuth,(req,res)=>{try{const s=ensureStoreShape(readStore()),id=reClient(req,s),leads=s.leads.filter(x=>x.clientId===id),visits=s.realEstate.visits.filter(x=>x.clientId===id),spend=s.realEstate.adSpend.filter(x=>x.clientId===id);const out={};for(const x of spend){const k=x.source||"Other";out[k]??={spend:0,leads:0,qualified:0,visits:0,bookings:0};out[k].spend+=x.amount;}for(const l of leads){const k=l.source||"Direct";out[k]??={spend:0,leads:0,qualified:0,visits:0,bookings:0};out[k].leads++;if(l.score>=50)out[k].qualified++;if(visits.some(v=>v.leadId===l.id&&v.status==="completed"))out[k].visits++;if(l.pipelineStage==="BOOKING")out[k].bookings++;}for(const x of Object.values(out)){x.cpl=x.leads?Math.round(x.spend/x.leads):0;x.cpql=x.qualified?Math.round(x.spend/x.qualified):0;x.cpsv=x.visits?Math.round(x.spend/x.visits):0;x.cpb=x.bookings?Math.round(x.spend/x.bookings):0;}res.json(out);}catch(e){res.status(403).json({error:e.message});}});
app.get("/api/realestate/match/:leadId",requireAuth,(req,res)=>{try{const s=ensureStoreShape(readStore()),id=reClient(req,s),l=leadById(s,req.params.leadId,id);if(!l)return res.status(404).json({error:"Lead not found"});const text=JSON.stringify(l).toLowerCase();const cfg=(l.requirement||"").toLowerCase();const budgetNums=(cfg.match(/₹?\s?([0-9]+(?:\.[0-9]+)?)(?:\s?cr|\s?l)?/gi)||[]);const inv=s.realEstate.inventory.filter(x=>x.clientId===id&&String(x.status).toLowerCase()==="available");const scored=inv.map(x=>{let score=50;const blob=JSON.stringify(x).toLowerCase();if(cfg&&blob.includes(cfg))score+=25;if(text.includes(String(x.configuration||"").toLowerCase()))score+=20;return {...x,match:Math.min(100,score)};}).sort((a,b)=>b.match-a.match).slice(0,10);res.json(scored);}catch(e){res.status(403).json({error:e.message});}});
app.get("/api/realestate/partners",requireAuth,(req,res)=>{try{const s=ensureStoreShape(readStore()),id=reClient(req,s);res.json(s.realEstate.channelPartners.filter(x=>x.clientId===id));}catch(e){res.status(403).json({error:e.message});}});
app.post("/api/realestate/partners",requireAuth,(req,res)=>{try{const s=ensureStoreShape(readStore()),id=reClient(req,s);const x={id:reId("cp"),clientId:id,name:String(req.body.name||"").trim(),phone:String(req.body.phone||""),email:String(req.body.email||""),company:String(req.body.company||""),status:"active",createdAt:reNow()};if(!x.name)return res.status(400).json({error:"Partner name required"});s.realEstate.channelPartners.push(x);writeStore(s);res.status(201).json(x);}catch(e){res.status(403).json({error:e.message});}});
app.delete("/api/realestate/partners/:id",requireAuth,(req,res)=>{try{const s=ensureStoreShape(readStore()),id=reClient(req,s);s.realEstate.channelPartners=s.realEstate.channelPartners.filter(x=>!(x.id===req.params.id&&x.clientId===id));writeStore(s);res.json({ok:true});}catch(e){res.status(403).json({error:e.message});}});

// ---- Document vault (metadata only — this app has no file storage; store a link to wherever the file already lives, e.g. Google Drive/WhatsApp) ----
app.get("/api/realestate/documents",requireAuth,(req,res)=>{try{const s=ensureStoreShape(readStore()),id=reClient(req,s);if(req.session.user?.role!=="admin"&&!planHasFeature(clientPlanTier(s,id),"documents"))return res.status(403).json({error:"This feature requires the Growth plan or higher."});const leadId=req.query.leadId;res.json(s.realEstate.documents.filter(x=>x.clientId===id&&(!leadId||x.leadId===leadId)));}catch(e){res.status(403).json({error:e.message});}});
app.post("/api/realestate/documents",requireAuth,(req,res)=>{try{const s=ensureStoreShape(readStore()),id=reClient(req,s);if(req.session.user?.role!=="admin"&&!planHasFeature(clientPlanTier(s,id),"documents"))return res.status(403).json({error:"This feature requires the Growth plan or higher."});const l=req.body.leadId?leadById(s,req.body.leadId,id):null;const x={id:reId("doc"),clientId:id,leadId:req.body.leadId||null,type:String(req.body.type||"Other").slice(0,60),label:String(req.body.label||"").slice(0,140),url:String(req.body.url||"").slice(0,500),status:String(req.body.status||"received"),createdAt:reNow()};if(!x.label)return res.status(400).json({error:"A label/document name is required"});s.realEstate.documents.push(x);activity(s,id,"document",`${x.type} recorded${l?" for "+l.name:""}`,{leadId:x.leadId,docId:x.id});writeStore(s);res.status(201).json(x);}catch(e){res.status(403).json({error:e.message});}});
app.patch("/api/realestate/documents/:id",requireAuth,(req,res)=>{try{const s=ensureStoreShape(readStore()),id=reClient(req,s);if(req.session.user?.role!=="admin"&&!planHasFeature(clientPlanTier(s,id),"documents"))return res.status(403).json({error:"This feature requires the Growth plan or higher."});const x=s.realEstate.documents.find(d=>d.id===req.params.id&&d.clientId===id);if(!x)return res.status(404).json({error:"Document not found"});if(req.body.status)x.status=String(req.body.status);writeStore(s);res.json(x);}catch(e){res.status(403).json({error:e.message});}});
app.delete("/api/realestate/documents/:id",requireAuth,(req,res)=>{try{const s=ensureStoreShape(readStore()),id=reClient(req,s);if(req.session.user?.role!=="admin"&&!planHasFeature(clientPlanTier(s,id),"documents"))return res.status(403).json({error:"This feature requires the Growth plan or higher."});s.realEstate.documents=s.realEstate.documents.filter(x=>!(x.id===req.params.id&&x.clientId===id));writeStore(s);res.json({ok:true});}catch(e){res.status(403).json({error:e.message});}});

// ---- Broker commission & payout tracker ----
app.get("/api/realestate/commissions",requireAuth,(req,res)=>{try{const s=ensureStoreShape(readStore()),id=reClient(req,s);if(req.session.user?.role!=="admin"&&!planHasFeature(clientPlanTier(s,id),"commissions"))return res.status(403).json({error:"This feature requires the Premium plan or higher."});res.json(s.realEstate.commissions.filter(x=>x.clientId===id).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))));}catch(e){res.status(403).json({error:e.message});}});
app.post("/api/realestate/commissions",requireAuth,(req,res)=>{try{const s=ensureStoreShape(readStore()),id=reClient(req,s);if(req.session.user?.role!=="admin"&&!planHasFeature(clientPlanTier(s,id),"commissions"))return res.status(403).json({error:"This feature requires the Premium plan or higher."});const bookingValue=Math.max(0,Number(req.body.bookingValue)||0),pct=Math.max(0,Number(req.body.commissionPercent)||0);const x={id:reId("comm"),clientId:id,leadId:req.body.leadId||null,partnerId:req.body.partnerId||null,partnerType:String(req.body.partnerType||"channel_partner"),bookingValue,commissionPercent:pct,commissionAmount:Math.round(bookingValue*pct/100),status:"pending",createdAt:reNow(),paidAt:null};s.realEstate.commissions.push(x);activity(s,id,"commission",`Commission of ₹${x.commissionAmount.toLocaleString("en-IN")} recorded`,{commissionId:x.id});writeStore(s);res.status(201).json(x);}catch(e){res.status(403).json({error:e.message});}});
app.patch("/api/realestate/commissions/:id",requireAuth,(req,res)=>{try{const s=ensureStoreShape(readStore()),id=reClient(req,s);if(req.session.user?.role!=="admin"&&!planHasFeature(clientPlanTier(s,id),"commissions"))return res.status(403).json({error:"This feature requires the Premium plan or higher."});const x=s.realEstate.commissions.find(c=>c.id===req.params.id&&c.clientId===id);if(!x)return res.status(404).json({error:"Commission not found"});if(req.body.status){x.status=String(req.body.status);if(x.status==="paid")x.paidAt=reNow();}writeStore(s);res.json(x);}catch(e){res.status(403).json({error:e.message});}});
app.delete("/api/realestate/commissions/:id",requireAuth,(req,res)=>{try{const s=ensureStoreShape(readStore()),id=reClient(req,s);if(req.session.user?.role!=="admin"&&!planHasFeature(clientPlanTier(s,id),"commissions"))return res.status(403).json({error:"This feature requires the Premium plan or higher."});s.realEstate.commissions=s.realEstate.commissions.filter(x=>!(x.id===req.params.id&&x.clientId===id));writeStore(s);res.json({ok:true});}catch(e){res.status(403).json({error:e.message});}});

// ---- Possession / post-sale tracker (from booking through registration to handover) ----
const POSSESSION_STAGES=["BOOKING_CONFIRMED","AGREEMENT_SIGNED","LOAN_DISBURSED","REGISTRATION_DONE","POSSESSION_HANDED_OVER"];
app.get("/api/realestate/possession",requireAuth,(req,res)=>{try{const s=ensureStoreShape(readStore()),id=reClient(req,s);if(req.session.user?.role!=="admin"&&!planHasFeature(clientPlanTier(s,id),"possession"))return res.status(403).json({error:"This feature requires the Premium plan or higher."});res.json(s.realEstate.possession.filter(x=>x.clientId===id));}catch(e){res.status(403).json({error:e.message});}});
app.post("/api/realestate/possession",requireAuth,(req,res)=>{try{const s=ensureStoreShape(readStore()),id=reClient(req,s);if(req.session.user?.role!=="admin"&&!planHasFeature(clientPlanTier(s,id),"possession"))return res.status(403).json({error:"This feature requires the Premium plan or higher."});const l=leadById(s,req.body.leadId,id);if(!l)return res.status(404).json({error:"Lead not found"});const x={id:reId("poss"),clientId:id,leadId:l.id,projectId:req.body.projectId||null,unit:String(req.body.unit||""),expectedDate:String(req.body.expectedDate||""),stage:"BOOKING_CONFIRMED",notes:String(req.body.notes||"").slice(0,1000),createdAt:reNow(),updatedAt:reNow()};s.realEstate.possession.push(x);activity(s,id,"possession",`Post-sale tracking started for ${l.name}`,{leadId:l.id,possessionId:x.id});writeStore(s);res.status(201).json(x);}catch(e){res.status(403).json({error:e.message});}});
app.patch("/api/realestate/possession/:id",requireAuth,(req,res)=>{try{const s=ensureStoreShape(readStore()),id=reClient(req,s);if(req.session.user?.role!=="admin"&&!planHasFeature(clientPlanTier(s,id),"possession"))return res.status(403).json({error:"This feature requires the Premium plan or higher."});const x=s.realEstate.possession.find(p=>p.id===req.params.id&&p.clientId===id);if(!x)return res.status(404).json({error:"Record not found"});if(req.body.stage&&POSSESSION_STAGES.includes(req.body.stage)){x.stage=req.body.stage;activity(s,id,"possession",`Post-sale stage moved to ${x.stage.replaceAll("_"," ")}`,{leadId:x.leadId,possessionId:x.id});}if(req.body.expectedDate!==undefined)x.expectedDate=String(req.body.expectedDate);if(req.body.notes!==undefined)x.notes=String(req.body.notes).slice(0,1000);x.updatedAt=reNow();writeStore(s);res.json(x);}catch(e){res.status(403).json({error:e.message});}});

// ---- Testimonials & reviews ----
app.get("/api/realestate/testimonials",requireAuth,(req,res)=>{try{const s=ensureStoreShape(readStore()),id=reClient(req,s);if(req.session.user?.role!=="admin"&&!planHasFeature(clientPlanTier(s,id),"testimonials"))return res.status(403).json({error:"This feature requires the Growth plan or higher."});res.json(s.realEstate.testimonials.filter(x=>x.clientId===id).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))));}catch(e){res.status(403).json({error:e.message});}});
app.post("/api/realestate/testimonials",requireAuth,(req,res)=>{try{const s=ensureStoreShape(readStore()),id=reClient(req,s);if(req.session.user?.role!=="admin"&&!planHasFeature(clientPlanTier(s,id),"testimonials"))return res.status(403).json({error:"This feature requires the Growth plan or higher."});const x={id:reId("rev"),clientId:id,leadId:req.body.leadId||null,name:String(req.body.name||"").trim().slice(0,80),rating:Math.min(5,Math.max(1,Number(req.body.rating)||5)),text:String(req.body.text||"").slice(0,1000),source:String(req.body.source||"Direct"),approved:false,createdAt:reNow()};if(!x.name||!x.text)return res.status(400).json({error:"Name and review text are required"});s.realEstate.testimonials.push(x);writeStore(s);res.status(201).json(x);}catch(e){res.status(403).json({error:e.message});}});
app.patch("/api/realestate/testimonials/:id",requireAuth,(req,res)=>{try{const s=ensureStoreShape(readStore()),id=reClient(req,s);if(req.session.user?.role!=="admin"&&!planHasFeature(clientPlanTier(s,id),"testimonials"))return res.status(403).json({error:"This feature requires the Growth plan or higher."});const x=s.realEstate.testimonials.find(t=>t.id===req.params.id&&t.clientId===id);if(!x)return res.status(404).json({error:"Review not found"});if(req.body.approved!==undefined)x.approved=!!req.body.approved;writeStore(s);res.json(x);}catch(e){res.status(403).json({error:e.message});}});
app.delete("/api/realestate/testimonials/:id",requireAuth,(req,res)=>{try{const s=ensureStoreShape(readStore()),id=reClient(req,s);if(req.session.user?.role!=="admin"&&!planHasFeature(clientPlanTier(s,id),"testimonials"))return res.status(403).json({error:"This feature requires the Growth plan or higher."});s.realEstate.testimonials=s.realEstate.testimonials.filter(x=>!(x.id===req.params.id&&x.clientId===id));writeStore(s);res.json({ok:true});}catch(e){res.status(403).json({error:e.message});}});
app.get("/api/public/testimonials",rateLimit("public-testimonials",120,60000),(req,res)=>{try{const s=ensureStoreShape(readStore());const id=normaliseClientId(req.query.clientId||"");res.setHeader("Cache-Control","no-store");res.json(s.realEstate.testimonials.filter(x=>x.clientId===id&&x.approved).slice(0,20).map(x=>({name:x.name,rating:x.rating,text:x.text})));}catch(e){res.status(500).json({error:e.message});}});
app.post("/api/realestate/rera-check",requireAuth,async(req,res)=>{try{const id=reClient(req,ensureStoreShape(readStore()));const url=String(req.body.url||"").trim();const text=String(req.body.text||"");let html="";if(url){const r=await fetchText(url,8000);html=r.text||"";}const source=(text+"\n"+html);const hasRera=/MahaRERA|MAHARERA|RERA/i.test(source);const hasNumber=/\bP\d{9,}\b/i.test(source);const hasQr=/QR\s*code|qr-code|qrcode/i.test(source);const hasWebsite=/https?:\/\//i.test(source);const checks=[{name:"MahaRERA registration reference",ok:hasRera||hasNumber,detail:hasRera||hasNumber?"Registration reference detected.":"No obvious MahaRERA registration reference detected."},{name:"QR code reference",ok:hasQr,detail:hasQr?"QR-code reference detected; verify the actual rendered QR code is legible.":"No QR-code reference detected."},{name:"Website address",ok:hasWebsite,detail:hasWebsite?"Website address detected.":"No website URL detected."}];res.json({clientId:id,score:Math.round(checks.filter(x=>x.ok).length/checks.length*100),checks,disclaimer:"Marketing-material QA only. Verify current MahaRERA requirements before publishing; this is not legal advice or a compliance guarantee."});}catch(e){res.status(403).json({error:e.message});}});

app.get("/api/health",(req,res)=>res.json({ok:true,service:"ASSISTQ Growth Platform",version:"v8",time:new Date().toISOString()}));

// Deployment readiness checks. These verify configuration without exposing secrets.
app.get("/api/deployment/check",requireAdmin,(req,res)=>{const checks=[
{name:"SESSION_SECRET",ok:!!process.env.SESSION_SECRET&&process.env.SESSION_SECRET.length>=32,detail:"Use a long random secret in production."},
{name:"ADMIN_PASSWORD",ok:!!process.env.ADMIN_PASSWORD&&process.env.ADMIN_PASSWORD!=="ChangeMe123!",detail:"Replace the demo admin password."},
{name:"WEBHOOK_SECRET",ok:!!process.env.WEBHOOK_SECRET&&process.env.WEBHOOK_SECRET.length>=16,detail:"Protect public lead ingestion."},
{name:"APP_BASE_URL",ok:!!process.env.APP_BASE_URL&&/^https:\/\//i.test(process.env.APP_BASE_URL),detail:"Use an HTTPS public URL in production."},
{name:"Google OAuth credentials",ok:!!process.env.GOOGLE_CLIENT_ID&&!!process.env.GOOGLE_CLIENT_SECRET,detail:"Required to connect client Google accounts."},
{name:"Email delivery",ok:true,detail:"Weekly reports can use connected Gmail; SMTP is an optional fallback."}
];res.json({ready:checks.every(x=>x.ok),checks});});

// ---------- Reports ----------
async function sendWeeklyReport(clientId){const s=ensureStoreShape(readStore());const cs=clientSettings(s,clientId);if(!cs.reportEmail)return {ok:false,reason:"Report email is not configured for this client."};const leads=s.leads.filter(x=>x.clientId===clientId);const conv=Object.values(s.conversations).filter(x=>x.clientId===clientId);const hot=leads.filter(x=>x.status==="HOT").length,warm=leads.filter(x=>x.status==="WARM").length,cold=leads.filter(x=>x.status==="COLD").length;const seo=s.seoAudits[clientId];const top=leads.filter(x=>x.status==="HOT").slice(0,10).map(x=>{const wa=whatsappUrl(x.phone,`Hi ${x.name}, this is ${cs.businessName}. Following up on your enquiry.`);return `<li><b>${escapeHtml(x.name)}</b> — ${x.score}/100 — ${escapeHtml(x.budget||"Budget not provided")} ${wa?`<a href="${wa}">WhatsApp</a>`:""}</li>`}).join("")||"<li>No hot leads.</li>";const html=`<h2>ASSISTQ Weekly Growth Report</h2><p><b>${escapeHtml(cs.businessName)}</b></p><p>Leads: <b>${leads.length}</b> · Hot: <b>${hot}</b> · Warm: <b>${warm}</b> · Cold: <b>${cold}</b></p><p>Conversations: ${conv.length}</p><p>UTM-attributed campaigns: ${Object.keys(s.utm).filter(k=>k.startsWith(clientId+"|")).length}</p><p>SEO health: ${seo?seo.score+"/100":"Not audited"}</p><h3>Priority leads</h3><ul>${top}</ul>`;const g=googleConnection(s,clientId); if(g?.tokens){const client=oauthClient();client.setCredentials(g.tokens);const raw=Buffer.from([`To: ${cs.reportEmail}`,`Subject: ASSISTQ Weekly Growth Report — ${cs.businessName}`,"Content-Type: text/html; charset=utf-8","",html].join("\r\n")).toString("base64url");await google.gmail({version:"v1",auth:client}).users.messages.send({userId:"me",requestBody:{raw}});}else{if(!process.env.SMTP_HOST||!process.env.SMTP_USER||!process.env.SMTP_PASS)return {ok:false,reason:"Connect the client Google account or configure SMTP before sending reports."};const transporter=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:Number(process.env.SMTP_PORT||587)===465,auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}});await transporter.sendMail({from:process.env.REPORT_FROM||process.env.SMTP_USER,to:cs.reportEmail,subject:`ASSISTQ Weekly Growth Report — ${cs.businessName}`,html});}s.reportHistory.unshift({clientId,sentAt:new Date().toISOString(),to:cs.reportEmail});writeStore(s);return {ok:true};}
function escapeHtml(x){return String(x??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}
app.post("/api/reports/send",requireAuth,async(req,res)=>{try{const s=readStore();const id=selectedClient(req,s);res.json(await sendWeeklyReport(id));}catch(e){res.status(500).json({error:e.message});}});

// BUG FIX: this used to also require process.env.SMTP_HOST before even
// attempting a send — but sendWeeklyReport() already prefers the client's
// connected Gmail account (the documented, primary path in
// SETUP_FOR_CLIENT.md) and only falls back to SMTP. That meant any client
// who connected Google (instead of configuring SMTP) had automatic weekly
// reports silently do nothing, forever — "Send report now" worked because
// it calls sendWeeklyReport() directly, but the hourly scheduler never
// reached it. sendWeeklyReport() already returns {ok:false,reason} instead
// of throwing when neither Gmail nor SMTP is available, so it's safe to
// just let it try and check its own result.
setInterval(async()=>{
  try{
    const s=ensureStoreShape(readStore());
    for(const c of s.clients){
      const cs=clientSettings(s,c.id);
      if(!cs.reportEnabled||!cs.reportEmail)continue;
      const last=s.reportHistory.find(x=>x.clientId===c.id);
      if(!last||Date.now()-new Date(last.sentAt).getTime()>=7*864e5){
        const out=await sendWeeklyReport(c.id);
        if(!out.ok)console.error(`ASSISTQ report scheduler: skipped ${c.id} — ${out.reason}`);
      }
    }
  }catch(e){console.error("ASSISTQ report scheduler",e.message);}
},60*60*1000);

// NEW: recurring SEO audits for Growth/Premium clients, so "SEO health...
// monitored every month" (the marketing promise) is actually true instead
// of only updating when someone happens to click "Run audit" in the
// dashboard. Starter has no dashboard, so there's nothing for it to show
// an audit in — skipped on purpose, not an oversight.
setInterval(async()=>{
  try{
    const s=ensureStoreShape(readStore());
    for(const c of s.clients){
      const plan=String(c.plan||"Starter").toLowerCase().trim();
      if(plan==="starter")continue;
      const cs=clientSettings(s,c.id);
      const website=String(cs.website||c.website||"").trim();
      if(!website)continue;
      const existing=s.seoAudits[c.id];
      if(existing&&Date.now()-new Date(existing.checkedAt).getTime()<7*864e5)continue;
      try{
        const audit=await runSeoAudit(website);
        const s2=ensureStoreShape(readStore());
        s2.seoAudits[c.id]=audit;
        writeStore(s2);
        activity(s2,c.id,"seo",`Automatic monthly SEO audit completed — score ${audit.score}/100`,{});
        writeStore(s2);
      }catch(err){console.error(`ASSISTQ auto SEO audit failed for ${c.id}:`,err.message);}
    }
  }catch(e){console.error("ASSISTQ SEO audit scheduler",e.message);}
},6*60*60*1000);

app.use((req,res,next)=>{if(req.method!=="GET")return next();if(req.path.startsWith("/api/")||req.path.startsWith("/auth/"))return res.status(404).end();res.sendFile(path.join(__dirname,"public","index.html"));});

// Load the store from Postgres before accepting any requests, so the very
// first request never sees an empty/uninitialised store.
setInterval(processRealEstateAutomation,60000);
try {
  await initDB(defaultStore);
  app.listen(PORT,()=>console.log(`ASSISTQ Growth Platform running on port ${PORT}`));
} catch (err) {
  console.error("ASSISTQ: failed to start — could not connect to Postgres.");
  console.error(err.message);
  process.exit(1);
}
