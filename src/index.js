const FEEDS = [
{ name:"BBC Persian",category:"iran",url:"https://feeds.bbci.co.uk/persian/rss.xml" },
{ name:"Iran International",category:"iran",url:"https://news.google.com/rss/search?q=site%3Airanintl.com+when%3A1h&hl=en-US&gl=US&ceid=US%3Aen" },
{ name:"Radio Farda",category:"iran",url:"https://www.radiofarda.com/api/z-pqpiev-qpp" },
{ name:"DW Farsi",category:"iran",url:"https://rss.dw.com/xml/rss-fa-all" },
{ name:"ISNA",category:"iran",url:"https://www.isna.ir/rss" },
{ name:"Tasnim",category:"iran",url:"https://www.tasnimnews.com/fa/rss/feed/0/8/0/%D9%85%D9%87%D9%85%D8%AA%D8%B1%DB%8C%D9%86-%D8%A7%D8%AE%D8%A8%D8%A7%D8%B1-%D8%AA%D8%B3%D9%86%DB%8C%D9%85" },
{ name:"Tabnak",category:"iran",url:"https://www.tabnak.ir/fa/rss/allnews" },
{ name:"Mehr",category:"iran",url:"https://www.mehrnews.com/rss" },
{ name:"Khabar Online",category:"iran",url:"https://www.khabaronline.ir/rss" },
{ name:"YJC",category:"iran",url:"https://www.yjc.ir/fa/rss/allnews" },
{ name:"Asriran",category:"iran",url:"https://www.asriran.com/fa/rss/allnews" },
{ name:"Fars",category:"iran",url:"https://news.google.com/rss/search?q=site%3Afarsnews.ir+when%3A1h&hl=en-US&gl=US&ceid=US%3Aen" },
{ name:"IRNA",category:"iran",url:"https://en.irna.ir/rss" },
{ name:"ILNA",category:"iran",url:"https://news.google.com/rss/search?q=site%3Ailna.ir+when%3A1h&hl=en-US&gl=US&ceid=US%3Aen" },
{ name:"France 24",category:"iran",url:"https://www.france24.com/en/rss" },

{ name:"Al Jazeera",category:"middle_east",url:"https://www.aljazeera.com/xml/rss/all.xml" },
{ name:"BBC Middle East",category:"middle_east",url:"https://feeds.bbci.co.uk/news/world/middle_east/rss.xml" },
{ name:"The Guardian",category:"middle_east",url:"https://www.theguardian.com/world/middleeast/rss" },
{ name:"The New York Times",category:"middle_east",url:"https://rss.nytimes.com/services/xml/rss/nyt/MiddleEast.xml" },
{ name:"CNN",category:"middle_east",url:"http://rss.cnn.com/rss/edition_meast.rss" },
{ name:"Fox News",category:"middle_east",url:"https://moxie.foxnews.com/google-publisher/world.xml" },
{ name:"The Washington Post",category:"middle_east",url:"https://feeds.washingtonpost.com/rss/world" },
{ name:"The National",category:"middle_east",url:"https://www.thenationalnews.com/rss" },
{ name:"France 24",category:"middle_east",url:"https://www.france24.com/en/rss" },
{ name:"DW",category:"middle_east",url:"https://rss.dw.com/xml/rss-en-all" },
{ name:"Euronews",category:"middle_east",url:"https://www.euronews.com/rss" },

{ name:"BBC World",category:"world",url:"https://feeds.bbci.co.uk/news/world/rss.xml" },
{ name:"The Guardian",category:"world",url:"https://www.theguardian.com/world/rss" },
{ name:"The New York Times",category:"world",url:"https://rss.nytimes.com/services/xml/rss/nyt/World.xml" },
{ name:"CNN",category:"world",url:"http://rss.cnn.com/rss/edition.rss" },
{ name:"Fox News",category:"world",url:"https://moxie.foxnews.com/google-publisher/latest.xml" },
{ name:"The Washington Post",category:"world",url:"https://feeds.washingtonpost.com/rss/world" },
{ name:"DW",category:"world",url:"https://rss.dw.com/xml/rss-en-all" },
{ name:"France 24",category:"world",url:"https://www.france24.com/en/rss" },
{ name:"Euronews",category:"world",url:"https://www.euronews.com/rss" },
{ name:"TASS",category:"world",url:"https://tass.com/rss/v2.xml" },
{ name:"RIA Novosti",category:"world",url:"https://ria.ru/export/rss2/archive/index.xml" },
{ name:"Sputnik",category:"world",url:"https://sputnikglobe.com/export/rss2/archive/index.xml" },
{ name:"RT",category:"world",url:"https://www.rt.com/rss/" },
{ name:"ANSA",category:"world",url:"https://www.ansa.it/sito/ansait_rss.xml" },
{ name:"Politico Europe",category:"world",url:"https://www.politico.eu/feed/" },
{ name:"Al Jazeera",category:"world",url:"https://www.aljazeera.com/xml/rss/all.xml" }
];

const ADMIN_USER_ID="8885912152";
const ADMIN_USERNAME="clearviolet";
const MIN_AGE=2*60*1000, MAX_AGE=5*60*1000;
const MODEL="gemini-3.5-flash-lite";

export default {
 async fetch(request,env){
  try{
   const u=new URL(request.url);
   if(request.method==="POST"&&u.pathname==="/telegram") return await handleTelegram(request,env);
   if(request.method==="GET") return new Response("Nabz is running.");
   return new Response("Method Not Allowed",{status:405});
  }catch(e){console.error("FETCH_ERROR",e?.stack||String(e));return new Response("Internal error",{status:500});}
 },
 async scheduled(event,env,ctx){ctx.waitUntil(run(env));}
};

async function run(env){
 const started=new Date();
 await initStats(env);
 await put(env,"stats:last_run",started.toISOString());

 // Free Workers allow 50 external subrequests/invocation.
 // Split feeds into 3 rotating groups so each minute stays safely below that limit.
 const minute=Math.floor(Date.now()/60000);
 const group=minute%3;
 const feeds=FEEDS.filter((_,i)=>i%3===group);
 console.log("FEED_GROUP",group,"count="+feeds.length);

 const rs=await Promise.allSettled(feeds.map(f=>fetchFeed(f)));
 let fresh=[];
 let ok=0,fail=0;
 for(let i=0;i<rs.length;i++){
  if(rs[i].status==="fulfilled"){ok++;fresh.push(...rs[i].value);console.log("RSS_OK",feeds[i].name,rs[i].value.length);}
  else{fail++;console.error("RSS_ERROR",feeds[i].name,rs[i].reason?.message||String(rs[i].reason));}
 }
 await put(env,"stats:last_feed_success",ok);
 await put(env,"stats:last_feed_failed",fail);
 fresh.sort((a,b)=>new Date(a.publishedAt)-new Date(b.publishedAt));

 // Keep publication requests comfortably under the free-plan subrequest limit.
 const max=Number(env.MAX_PUBLISH_PER_RUN||4);
 let sent=0;
 for(const item of fresh){
  if(sent>=max)break;
  const key="seen:"+await sha256(item.link+"|"+item.title);
  if(await env.SEEN.get(key))continue;
  await env.SEEN.put(key,"1",{expirationTtl:172800});
  try{
   console.log("PROCESSING",item.feedName,item.title);
   const tr=await translate(item,env);
   console.log("GEMINI_OK",item.feedName);
   const tg=await send(item,tr,env);
   if(!tg?.ok)throw new Error("Telegram: "+(tg?.description||"unknown"));
   const now=new Date(), src=new Date(item.publishedAt);
   const latency=Math.max(0,Math.round((now-src)/1000));
   await inc(env,"stats:total"); await inc(env,"stats:"+item.category);
   await inc(env,"stats:source:"+sanitize(item.feedName));
   await put(env,"stats:last_published_at",now.toISOString());
   await put(env,"stats:last_latency_seconds",latency);
   sent++;
   console.log("PUBLISHED",JSON.stringify({source:item.feedName,category:item.category,title:item.title,latencySeconds:latency}));
  }catch(e){
   console.error("ITEM_ERROR",item.feedName,e?.message||String(e));
   await env.SEEN.delete(key);
  }
 }
 console.log("NABZ_CRON_END",JSON.stringify({group,feeds:feeds.length,fresh:fresh.length,publishedThisRun:sent}));
}

async function fetchFeed(feed){
 const r=await fetch(feed.url,{headers:{"User-Agent":"Nabz-News-Bot/3.0"}});
 if(!r.ok)throw new Error("HTTP "+r.status);
 const xml=await r.text(), items=parse(xml), now=Date.now();
 return items.filter(x=>{
  const age=now-new Date(x.publishedAt).getTime();
  return age>=MIN_AGE&&age<=MAX_AGE;
 }).map(x=>({...x,feedName:feed.name,category:feed.category}));
}

function parse(xml){
 const out=[];
 for(const b of xml.match(/<item\b[\s\S]*?<\/item>/gi)||[]){
  const title=clean(get(b,"title")),link=cleanUrl(get(b,"link"));
  const description=clean(get(b,"description")||get(b,"summary"));
  const d=get(b,"pubDate")||get(b,"published")||get(b,"updated")||get(b,"dc:date");
  const dt=new Date(d);
  if(title&&link&&!isNaN(dt))out.push({title,link,description,publishedAt:dt.toISOString()});
 }
 for(const b of xml.match(/<entry\b[\s\S]*?<\/entry>/gi)||[]){
  const title=clean(get(b,"title")),description=clean(get(b,"summary")||get(b,"content"));
  const d=get(b,"published")||get(b,"updated"); let link="";
  const m=b.match(/<link\b[^>]*href=["']([^"']+)["']/i); if(m)link=decodeXml(m[1]); if(!link)link=cleanUrl(get(b,"link"));
  const dt=new Date(d); if(title&&link&&!isNaN(dt))out.push({title,link,description,publishedAt:dt.toISOString()});
 }
 return out;
}
function get(b,t){const m=b.match(new RegExp(`<${t}\\b[^>]*>([\\s\\S]*?)<\\/${t}>`,"i"));return m?m[1]:"";}
function clean(v){return decodeXml(String(v||"").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi,"$1").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim());}
function cleanUrl(v){return decodeXml(String(v||"").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi,"$1").trim());}
function decodeXml(v){return String(v).replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;/g,"'");}

async function translate(item,env){
 if(!env.GEMINI_API_KEY)throw new Error("GEMINI_API_KEY missing");
 const url=`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;
 const prompt=`Translate this news item into natural Persian. Do not summarize, add, remove, or invent information. Preserve names, organizations, places, numbers and dates. Translate only title and supplied description. Return ONLY JSON: {"title":"...","description":"..."}\nTITLE:\n${item.title}\nDESCRIPTION:\n${item.description||""}`;
 const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{temperature:0.1,responseMimeType:"application/json"}})});
 const body=await r.text();
 if(!r.ok)throw new Error("Gemini HTTP "+r.status+": "+body.slice(0,300));
 let j; try{j=JSON.parse(body);}catch{throw new Error("Gemini invalid response");}
 const t=j?.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("").trim();
 if(!t)throw new Error("Gemini empty response");
 let p; try{p=JSON.parse(t);}catch{const m=t.match(/\{[\s\S]*\}/);if(!m)throw new Error("Gemini invalid JSON");p=JSON.parse(m[0]);}
 return {title:String(p.title||"").trim(),description:String(p.description||"").trim()};
}

async function send(item,tr,env){
 const tag={iran:"#Iran",middle_east:"#Middle_East",world:"#World"}[item.category];
 const thread={iran:env.TOPIC_IRAN,middle_east:env.TOPIC_MIDDLE_EAST,world:env.TOPIC_WORLD}[item.category];
 const text=[`<b>${esc(tr.title)}</b>`,tr.description?esc(tr.description):"",`🌐 منبع: ${esc(item.feedName)}`,`🔗 <a href="${escAttr(item.link)}">مشاهده گزارش اصلی</a>`,tag,"","@Zarathushtra_ir"].filter(Boolean).join("\n");
 const p={chat_id:normalize(env.GROUP_CHAT_ID),text,parse_mode:"HTML",disable_web_page_preview:false};
 if(thread)p.message_thread_id=Number(thread);
 return tg(env.BOT_TOKEN,"sendMessage",p);
}

async function handleTelegram(req,env){
 try{
  const u=await req.json(),m=u?.message;if(!m)return new Response("OK");
  if(!String(m.text||"").trim().toLowerCase().startsWith("/start"))return new Response("OK");
  const id=String(m.from?.id||"");
  if(id!==ADMIN_USER_ID){await tg(env.BOT_TOKEN,"sendMessage",{chat_id:m.chat.id,text:"سلام 👋\n\nبه نبض خوش آمدید.\nاین ربات برای دریافت و انتشار اخبار تازه طراحی شده است."});return new Response("OK");}
  await tg(env.BOT_TOKEN,"sendMessage",{chat_id:m.chat.id,text:buildStats(await stats(env)),parse_mode:"HTML",disable_web_page_preview:true});
  return new Response("OK");
 }catch(e){console.error("TELEGRAM_WEBHOOK_ERROR",e?.message||String(e));return new Response("OK");}
}

async function tg(token,method,payload){
 const r=await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
 return await r.json();
}
async function initStats(env){if(!(await env.SEEN.get("stats:started_at")))await put(env,"stats:started_at",new Date().toISOString());}
async function put(env,k,v){await env.SEEN.put(k,String(v),{expirationTtl:315360000});}
async function inc(env,k){await put(env,k,Number(await env.SEEN.get(k)||0)+1);}
async function stats(env){const a=await Promise.all(["total","iran","middle_east","world","started_at","last_run","last_published_at","last_latency_seconds"].map(k=>env.SEEN.get("stats:"+k)));return {total:+(a[0]||0),iran:+(a[1]||0),middle:+(a[2]||0),world:+(a[3]||0),started:a[4],run:a[5],pub:a[6],lat:+(a[7]||0)};}
function buildStats(s){return ["<b>📊 آمار ربات نبض</b>","",`👤 مدیر: @${ADMIN_USERNAME}`,"",`<b>📰 کل اخبار ارسال‌شده:</b> ${s.total}`,"",`🇮🇷 ایران: ${s.iran}`,`🌍 خاورمیانه: ${s.middle}`,`🌎 جهان: ${s.world}`,"",`<b>⏱ آخرین تأخیر:</b> ${s.lat?s.lat+" ثانیه":"هنوز خبری ارسال نشده"}`,s.started?`🟢 شروع ثبت آمار: ${fmt(s.started)}`:"🟢 شروع ثبت آمار: نامشخص",s.pub?`📰 آخرین انتشار: ${fmt(s.pub)}`:"📰 آخرین انتشار: هنوز انجام نشده",s.run?`⚙️ آخرین اجرای ربات: ${fmt(s.run)}`:"⚙️ آخرین اجرای ربات: نامشخص"].join("\n");}
function normalize(v){const x=String(v||"").trim();return /^\d+$/.test(x)?"-100"+x:x;}
function esc(v){return String(v||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
function escAttr(v){return esc(v).replace(/'/g,"&#39;");}
function fmt(v){const d=new Date(v);return isNaN(d)?"نامشخص":d.toISOString().replace("T"," ").replace(/\.\d{3}Z$/," UTC");}
function sanitize(v){return String(v||"").toLowerCase().replace(/[^a-z0-9_-]+/g,"_").slice(0,100);}
async function sha256(t){const h=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(t));return [...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,"0")).join("");}
