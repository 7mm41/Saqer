/* ============================================================================
   صقر ستور — Saqer Store · Shared data + UI helpers (no dependencies)
   A local-first data layer: apps, certificates and signing requests live in
   localStorage so the store, the admin panel and the iPhone client all read
   and write the same catalog. Replace SaqerAPI.* with real network calls to
   go live (see README).
   ========================================================================== */
window.Saqer = (function () {
  "use strict";

  var KEY = "saqer.store.v1";
  var THEME_KEY = "saqer.theme";

  /* ---------- Icon set (Lucide-style strokes, no emoji) ------------------ */
  var P = {
    store:'<path d="M3 9 5 3h14l2 6"/><path d="M4 9v11h16V9"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/><path d="M9 20v-6h6v6"/>',
    shield:'<path d="M12 3 20 6v6c0 5-3.5 7.7-8 9-4.5-1.3-8-4-8-9V6z"/><path d="m9 12 2 2 4-4"/>',
    download:'<path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M5 21h14"/>',
    search:'<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    star:'<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17l-5.2 2.6 1-5.8-4.3-4.1 5.9-.9z"/>',
    check:'<path d="m5 12 5 5L20 7"/>',
    checkCircle:'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    x:'<path d="M18 6 6 18M6 6l12 12"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    edit:'<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    trash:'<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
    grid:'<rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/>',
    cert:'<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/><circle cx="12" cy="10" r="2.4"/>',
    signature:'<path d="M3 17c3 0 3-9 6-9s3 12 6 12"/><path d="M15 15h6"/>',
    key:'<circle cx="8" cy="14" r="4"/><path d="m11 11 8-8 2 2M17 5l2 2"/>',
    device:'<rect x="7" y="2" width="10" height="20" rx="2.5"/><path d="M11 18h2"/>',
    chart:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    users:'<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-5 6-5s6 1.7 6 5"/><path d="M16 5.2A3 3 0 0 1 16 11M21 20c0-2.6-1.5-4.2-4-4.8"/>',
    logout:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
    menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
    sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"/>',
    moon:'<path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z"/>',
    bolt:'<path d="M13 2 4 14h6l-1 8 9-12h-6z"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    upload:'<path d="M12 21V9"/><path d="m7 13 5-5 5 5"/><path d="M5 3h14"/>',
    link:'<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    heart:'<path d="M12 20s-7-4.3-9.3-9C1 7.5 3 4 6.5 4 9 4 12 7 12 7s3-3 5.5-3C21 4 23 7.5 21.3 11 19 15.7 12 20 12 20z"/>',
    arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>',
    apps:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/>',
    layers:'<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/>',
    globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/>',
    lock:'<rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    settings:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
    verified:'<path d="m12 2 2.4 1.8 3-.2 1 2.8 2.6 1.4-.6 2.9L23 14l-2 2.1.2 3-2.9.7L16.8 22 14 20.7 12 22l-2-1.3L7.2 22 6 19.5l-2.9-.7.2-3L1 14l1.6-2.5-.6-2.9L4.6 6.4l1-2.8 3 .2z"/><path d="m8.5 12 2.5 2.5 5-5.5"/>',
    play:'<path d="M6 4v16l14-8z"/>',
    box:'<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/>',
    inbox:'<path d="M4 13h4l2 3h4l2-3h4"/><path d="M4 13V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7"/><path d="M4 13v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/>',
    refresh:'<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
    copy:'<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>'
  };
  function icon(name, cls){
    return '<svg class="'+(cls||'')+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" '+
      'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(P[name]||'')+'</svg>';
  }

  /* ---------- Utilities -------------------------------------------------- */
  function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
  function uid(p){return (p||"id")+"_"+Math.random().toString(36).slice(2,9);}
  function nowISO(){return new Date().toISOString();}
  function fmtDate(iso){try{return new Date(iso).toLocaleDateString("ar",{year:"numeric",month:"short",day:"numeric"});}catch(e){return iso;}}
  function daysLeft(iso){return Math.ceil((new Date(iso)-Date.now())/864e5);}
  function nfmt(n){n=Number(n)||0;return n>=1e6?(n/1e6).toFixed(1)+"M":n>=1e3?(n/1e3).toFixed(1)+"K":String(n);}
  function initials(s){s=String(s||"").trim();return s?s.slice(0,2):"?";}

  var GRADS=["linear-gradient(160deg,#a16207,#3f2d12)","linear-gradient(160deg,#0f766e,#134e4a)",
    "linear-gradient(160deg,#7c3aed,#3b0764)","linear-gradient(160deg,#be123c,#4c0519)",
    "linear-gradient(160deg,#1d4ed8,#172554)","linear-gradient(160deg,#c2410c,#431407)",
    "linear-gradient(160deg,#0369a1,#082f49)","linear-gradient(160deg,#4d7c0f,#1a2e05)"];
  function grad(seed){var s=String(seed||"");var h=0;for(var i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))>>>0;return GRADS[h%GRADS.length];}

  /* ---------- Seed catalog ---------------------------------------------- */
  function seed(){
    var addDays=function(d){return new Date(Date.now()+d*864e5).toISOString();};
    return {
      apps:[
        {id:"app_saqer",name:"صقر ستور",dev:"Saqer",cat:"أدوات",ver:"3.2.0",size:"48 MB",bundle:"com.saqer.store",
         rating:4.9,downloads:128400,color:"linear-gradient(160deg,#a16207,#3f2d12)",featured:true,
         tagline:"متجر التطبيقات الأول",desc:"حمّل تطبيقاتك المفضّلة بنقرة واحدة، مع توقيع فوري وتحديثات تلقائية عبر الهواء.",
         ipa:"", signed:true, updated:nowISO()},
        {id:"app_wardah",name:"وردة",dev:"Wardah Labs",cat:"تواصل",ver:"5.1.2",size:"132 MB",bundle:"com.wardah.app",
         rating:4.7,downloads:86200,color:"linear-gradient(160deg,#be123c,#4c0519)",featured:true,
         tagline:"محادثات أنيقة وخاصة",desc:"تطبيق تواصل مشفّر بالكامل بتصميم عربي أصيل، مكالمات فيديو عالية الجودة ورسائل تختفي.",
         ipa:"",signed:true,updated:nowISO()},
        {id:"app_mizan",name:"ميزان",dev:"Fintech KSA",cat:"مالية",ver:"2.4.0",size:"74 MB",bundle:"com.mizan.finance",
         rating:4.8,downloads:54100,color:"linear-gradient(160deg,#0f766e,#134e4a)",featured:true,
         tagline:"محفظتك بين يديك",desc:"إدارة نفقاتك واستثماراتك بلوحة تحكم ذكية، تقارير لحظية وتنبيهات مخصصة.",
         ipa:"",signed:true,updated:nowISO()},
        {id:"app_sahra",name:"سهرة",dev:"Nova Media",cat:"ترفيه",ver:"4.0.7",size:"210 MB",bundle:"com.sahra.tv",
         rating:4.6,downloads:41800,color:"linear-gradient(160deg,#7c3aed,#3b0764)",featured:false,
         tagline:"سينما في جيبك",desc:"بث الأفلام والمسلسلات العربية بجودة 4K مع تنزيل للمشاهدة دون اتصال.",
         ipa:"",signed:true,updated:nowISO()},
        {id:"app_riyada",name:"رياضة+",dev:"FitArabia",cat:"صحة",ver:"1.9.3",size:"96 MB",bundle:"com.riyada.fit",
         rating:4.5,downloads:33250,color:"linear-gradient(160deg,#4d7c0f,#1a2e05)",featured:false,
         tagline:"مدرّبك الشخصي",desc:"برامج تمارين مخصّصة، تتبّع للسعرات والنوم، وتحديات جماعية تحفّزك يوميًا.",
         ipa:"",signed:true,updated:nowISO()},
        {id:"app_qamus",name:"قاموس",dev:"Lexi",cat:"تعليم",ver:"6.2.1",size:"58 MB",bundle:"com.qamus.dict",
         rating:4.9,downloads:71900,color:"linear-gradient(160deg,#1d4ed8,#172554)",featured:false,
         tagline:"لغتك بلا حدود",desc:"ترجمة فورية بين 40 لغة، نطق صوتي أصيل ووضع دون اتصال للسفر.",
         ipa:"",signed:true,updated:nowISO()},
        {id:"app_matjar",name:"متجري",dev:"Souq Cloud",cat:"أعمال",ver:"3.5.0",size:"88 MB",bundle:"com.matjari.pos",
         rating:4.4,downloads:22600,color:"linear-gradient(160deg,#c2410c,#431407)",featured:false,
         tagline:"إدارة متجرك بالكامل",desc:"نقطة بيع، مخزون، فواتير وتحليلات — كل ما يحتاجه متجرك في تطبيق واحد.",
         ipa:"",signed:true,updated:nowISO()},
        {id:"app_noor",name:"نور",dev:"Barakah",cat:"أسلوب حياة",ver:"2.1.0",size:"64 MB",bundle:"com.noor.app",
         rating:4.8,downloads:98700,color:"linear-gradient(160deg,#0369a1,#082f49)",featured:false,
         tagline:"يومك أجمل",desc:"مواقيت، أذكار، تلاوات وخطة عادات يومية بتصميم هادئ ومريح للعين.",
         ipa:"",signed:false,updated:nowISO()}
      ],
      certs:[
        {id:"cert_ent1",name:"Saqer Enterprise 2026",type:"Enterprise",team:"9F2KQ7XR44",
         status:"active",expires:addDays(214),devices:"غير محدود",created:nowISO()},
        {id:"cert_dev1",name:"Saqer Developer",type:"Development",team:"9F2KQ7XR44",
         status:"active",expires:addDays(96),devices:"100 / 100",created:nowISO()},
        {id:"cert_adhoc",name:"Ad-Hoc Distribution",type:"Ad-Hoc",team:"9F2KQ7XR44",
         status:"expiring",expires:addDays(21),devices:"142 / 200",created:nowISO()}
      ],
      requests:[
        {id:uid("req"),app:"وردة",udid:"00008120-000A1C...E402",cert:"Saqer Enterprise 2026",
         status:"signed",created:nowISO()},
        {id:uid("req"),app:"سهرة",udid:"00008030-001D5D...11AA",cert:"Ad-Hoc Distribution",
         status:"signing",created:nowISO()},
        {id:uid("req"),app:"نور",udid:"00008101-000E44...93FF",cert:"Saqer Developer",
         status:"queued",created:nowISO()}
      ]
    };
  }

  /* ---------- Persistence ------------------------------------------------ */
  function load(){
    try{var raw=localStorage.getItem(KEY);if(raw)return JSON.parse(raw);}catch(e){}
    var s=seed();save(s);return s;
  }
  function save(db){try{localStorage.setItem(KEY,JSON.stringify(db));}catch(e){}
    window.dispatchEvent(new CustomEvent("saqer:change",{detail:db}));return db;}
  var _db=null;
  function db(){return _db||(_db=load());}
  function reset(){_db=save(seed());return _db;}
  function commit(){return save(_db);}

  var API={
    apps:function(){return db().apps.slice();},
    app:function(id){return db().apps.filter(function(a){return a.id===id;})[0];},
    cats:function(){var m={};db().apps.forEach(function(a){m[a.cat]=(m[a.cat]||0)+1;});return m;},
    saveApp:function(a){var d=db();if(a.id){for(var i=0;i<d.apps.length;i++)if(d.apps[i].id===a.id){d.apps[i]=Object.assign(d.apps[i],a);commit();return d.apps[i];}}
      a.id=uid("app");a.created=nowISO();a.updated=nowISO();a.color=a.color||grad(a.name);
      a.downloads=a.downloads||0;a.rating=a.rating||0;d.apps.unshift(a);commit();return a;},
    delApp:function(id){var d=db();d.apps=d.apps.filter(function(a){return a.id!==id;});commit();},
    bumpDownload:function(id){var a=API.app(id);if(a){a.downloads=(a.downloads||0)+1;commit();}},

    certs:function(){return db().certs.slice();},
    saveCert:function(c){var d=db();if(c.id){for(var i=0;i<d.certs.length;i++)if(d.certs[i].id===c.id){d.certs[i]=Object.assign(d.certs[i],c);commit();return d.certs[i];}}
      c.id=uid("cert");c.created=nowISO();c.status=c.status||"active";d.certs.unshift(c);commit();return c;},
    delCert:function(id){var d=db();d.certs=d.certs.filter(function(c){return c.id!==id;});commit();},

    requests:function(){return db().requests.slice();},
    addRequest:function(r){var d=db();r.id=uid("req");r.created=nowISO();r.status=r.status||"queued";
      d.requests.unshift(r);commit();return r;},
    setRequest:function(id,status){var d=db();d.requests.forEach(function(r){if(r.id===id)r.status=status;});commit();},
    delRequest:function(id){var d=db();d.requests=d.requests.filter(function(r){return r.id!==id;});commit();},

    reset:reset
  };

  /* ---------- Theme ------------------------------------------------------ */
  function applyTheme(t){document.documentElement.setAttribute("data-theme",t);
    try{localStorage.setItem(THEME_KEY,t);}catch(e){}
    var m=document.querySelector('meta[name="theme-color"]');if(m)m.content=t==="dark"?"#0c0a09":"#faf9f7";}
  function initTheme(){var t;try{t=localStorage.getItem(THEME_KEY);}catch(e){}
    if(!t)t=matchMedia("(prefers-color-scheme:dark)").matches?"dark":"light";applyTheme(t);return t;}
  function toggleTheme(){var cur=document.documentElement.getAttribute("data-theme")==="dark"?"dark":"light";
    applyTheme(cur==="dark"?"light":"dark");}

  /* ---------- Toast ------------------------------------------------------ */
  function toast(msg,kind){
    var host=document.querySelector(".toast-host");
    if(!host){host=document.createElement("div");host.className="toast-host";document.body.appendChild(host);}
    var el=document.createElement("div");el.className="toast";
    var ic=kind==="err"?"x":kind==="warn"?"clock":"checkCircle";
    el.innerHTML=icon(ic)+"<span>"+esc(msg)+"</span>";
    host.appendChild(el);requestAnimationFrame(function(){el.classList.add("in");});
    setTimeout(function(){el.classList.remove("in");setTimeout(function(){el.remove();},300);},2600);
  }

  /* ---------- Scroll reveal --------------------------------------------- */
  function reveals(){
    var els=document.querySelectorAll(".reveal");if(!("IntersectionObserver" in window)){
      els.forEach(function(e){e.classList.add("in");});return;}
    var io=new IntersectionObserver(function(es){es.forEach(function(en){
      if(en.isIntersecting){en.target.classList.add("in");io.unobserve(en.target);}});},{threshold:.12});
    els.forEach(function(e){io.observe(e);});
  }

  return {icon:icon,esc:esc,uid:uid,fmtDate:fmtDate,daysLeft:daysLeft,nfmt:nfmt,initials:initials,
    grad:grad,api:API,db:db,initTheme:initTheme,toggleTheme:toggleTheme,applyTheme:applyTheme,
    toast:toast,reveals:reveals,nowISO:nowISO};
})();
