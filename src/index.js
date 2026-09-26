const MODEL = "@cf/meta/m2m100-1.2b";
const MIN_AGE = 2 * 60 * 1000;
const MAX_AGE = 5 * 60 * 1000;
const ADMIN_ID = "8885912152";
const FOOTER = "@Zarathushtra_ir";

const FEEDS = [
  ["Iran","BBC Persian","https://feeds.bbci.co.uk/persian/rss.xml","fa"],
  ["Iran","Iran International","https://news.google.com/rss/search?q=site%3Airanintl.com&hl=en-US&gl=US&ceid=US%3Aen","en"],
  ["Iran","Radio Farda","https://www.radiofarda.com/api/z-pqpiev-qpp","fa"],
  ["Iran","DW Farsi","https://rss.dw.com/xml/rss-fa-all","fa"],
  ["Iran","ISNA","https://www.isna.ir/rss","fa"],
  ["Iran","Tasnim","https://www.tasnimnews.com/fa/rss/feed/0/8/0/%D8%A2%D8%AE%D8%B1%DB%8C%D9%86-%D8%A7%D8%AE%D8%A8%D8%A7%D8%B1","fa"],
  ["Iran","Tabnak","https://www.tabnak.ir/fa/rss/allnews","fa"],
  ["Iran","Mehr","https://www.mehrnews.com/rss","fa"],
  ["Iran","Khabar Online","https://www.khabaronline.ir/rss","fa"],
  ["Iran","YJC","https://www.yjc.ir/fa/rss/allnews","fa"],
  ["Iran","Asriran","https://www.asriran.com/fa/rss/allnews","fa"],
  ["Iran","Fars","https://news.google.com/rss/search?q=site%3Afarsnews.ir&hl=en-US&gl=US&ceid=US%3Aen","fa"],
  ["Iran","IRNA","https://en.irna.ir/rss","en"],
  ["Iran","ILNA","https://news.google.com/rss/search?q=site%3Ailna.ir&hl=en-US&gl=US&ceid=US%3Aen","fa"],
  ["Iran","France 24","https://www.france24.com/en/rss","en"],
  ["Middle_East","Al Jazeera","https://www.aljazeera.com/xml/rss/all.xml","en"],
  ["Middle_East","BBC Middle East","https://feeds.bbci.co.uk/news/world/middle_east/rss.xml","en"],
  ["Middle_East","The Guardian","https://www.theguardian.com/world/middleeast/rss","en"],
  ["Middle_East","The New York Times","https://rss.nytimes.com/services/xml/rss/nyt/MiddleEast.xml","en"],
  ["Middle_East","CNN","http://rss.cnn.com/rss/edition_meast.rss","en"],
  ["Middle_East","Fox News","https://moxie.foxnews.com/google-publisher/world.xml","en"],
  ["Middle_East","The Washington Post","https://feeds.washingtonpost.com/rss/world","en"],
  ["Middle_East","The National","https://www.thenationalnews.com/rss","en"],
  ["Middle_East","France 24","https://www.france24.com/en/rss","en"],
  ["Middle_East","DW","https://rss.dw.com/xml/rss-en-all","en"],
  ["Middle_East","Euronews","https://www.euronews.com/rss","en"],
  ["World","BBC World","https://feeds.bbci.co.uk/news/world/rss.xml","en"],
  ["World","The Guardian","https://www.theguardian.com/world/rss","en"],
  ["World","The New York Times","https://rss.nytimes.com/services/xml/rss/nyt/World.xml","en"],
  ["World","CNN","http://rss.cnn.com/rss/edition.rss","en"],
  ["World","Fox News","https://moxie.foxnews.com/google-publisher/latest.xml","en"],
  ["World","The Washington Post","https://feeds.washingtonpost.com/rss/world","en"],
  ["World","DW","https://rss.dw.com/xml/rss-en-all","en"],
  ["World","France 24","https://www.france24.com/en/rss","en"],
  ["World","Euronews","https://www.euronews.com/rss","en"],
  ["World","TASS","https://tass.com/rss/v2.xml","ru"],
  ["World","RIA Novosti","https://ria.ru/export/rss2/archive/index.xml","ru"],
  ["World","Sputnik","https://sputnikglobe.com/export/rss2/archive/index.xml","en"],
  ["World","RT","https://www.rt.com/rss/","en"],
  ["World","ANSA","https://www.ansa.it/sito/ansait_rss.xml","it"],
  ["World","Politico Europe","https://www.politico.eu/feed/","en"],
  ["World","Al Jazeera","https://www.aljazeera.com/xml/rss/all.xml","en"]
].map(([category,source,url,lang]) => ({category,source,url,lang}));

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/telegram") {
      try {
        const update = await request.json();
        ctx.waitUntil(handleUpdate(update, env));
      } catch (e) { console.error("WEBHOOK_ERROR", e.message || String(e)); }
      return new Response("OK");
    }
    if (url.pathname === "/") return json({ok:true,service:"Nabz",time:new Date().toISOString()});
    if (url.pathname === "/health") {
      const tg = await tgApi("getMe",{},env).catch(e=>({ok:false,error:e.message}));
      let webhook = null;
      if (tg.ok) {
        const target = `${url.origin}/telegram`;
        webhook = await tgApi("setWebhook", {
          url: target,
          allowed_updates: ["message"]
        }, env).catch(e=>({ok:false,error:e.message}));
      }
      return json({ok:true,botToken:!!env.BOT_TOKEN,ai:!!env.AI,kv:!!env.SEEN,telegram:tg,webhook});
    }
    if (url.pathname === "/test-telegram") return json(await tgApi("getMe",{},env));
    return new Response("Nabz Worker is running.");
  },
  async scheduled(controller, env, ctx) { ctx.waitUntil(run(env,controller)); }
};

async function run(env, controller) {
  console.log("CRON_START", JSON.stringify({cron:controller?.cron,time:controller?.scheduledTime}));
  if (!env.BOT_TOKEN || !env.SEEN || !env.AI) { console.error("MISSING_BINDING_OR_SECRET",JSON.stringify({bot:!!env.BOT_TOKEN,kv:!!env.SEEN,ai:!!env.AI})); return; }

  const lock="LOCK:RUN";
  if (await env.SEEN.get(lock)) return;
  await env.SEEN.put(lock,"1",{expirationTtl:90});
  try {
    const group = split(FEEDS,2)[Math.floor(Date.now()/60000)%2];
    let fresh=[];
    for (const feed of group) {
      try {
        const items=await fetchFeed(feed);
        console.log("RSS_OK",feed.source,items.length);
        for(const item of items){const age=Date.now()-item.publishedAt;if(age>=MIN_AGE&&age<=MAX_AGE)fresh.push({feed,item});}
      } catch(e) { console.error("RSS_ERROR",feed.source,e.message||String(e)); }
    }
    fresh.sort((a,b)=>a.item.publishedAt-b.item.publishedAt);
    let published=0;
    for(const x of fresh){
      if(published>=Number(env.MAX_PUBLISH_PER_RUN||3)) break;
      try { if(await publish(x.item,x.feed,env)) published++; }
      catch(e){console.error("ITEM_ERROR",x.feed.source,JSON.stringify({title:x.item.title,error:e.message||String(e)}));}
    }
    console.log("CRON_END",JSON.stringify({feeds:group.length,fresh:fresh.length,published}));
  } finally { await env.SEEN.delete(lock).catch(()=>{}); }
}

async function handleUpdate(update,env){
  const m=update?.message;if(!m?.text||!m.chat?.id)return;
  const cmd=String(m.text).trim().split(/\s+/)[0].split("@")[0].toLowerCase();
  if(cmd==="/start") { await send(env,m.chat.id,"📰 <b>Nabz</b>\n\nربات خبررسان فعال است.\n\nاخبار تازه از منابع مختلف دریافت، ترجمه و منتشر می‌شوند."); return; }
  if(cmd==="/status"||cmd==="/stats"){
    if(String(m.from?.id||"")!==ADMIN_ID){await send(env,m.chat.id,"⛔ این دستور فقط برای مدیر ربات فعال است.");return;}
    const n=Number(await env.SEEN.get("STATS:PUBLISHED")||0);
    await send(env,m.chat.id,`📊 <b>Nabz</b>\n\n🟢 Worker: فعال\n🤖 Telegram: متصل\n🧠 AI: فعال\n📡 منابع: ${FEEDS.length}\n📰 منتشرشده: ${n}`);
  }
}

async function publish(item,feed,env){
  const key=await sha256([feed.category,feed.source,normUrl(item.link),normTitle(item.title)].join("|"));
  if(await env.SEEN.get(`NEWS:${key}`)||await env.SEEN.get(`CLAIM:${key}`))return false;
  await env.SEEN.put(`CLAIM:${key}`,"1",{expirationTtl:300});
  try{
    console.log("PROCESSING",feed.source,JSON.stringify({title:item.title,age:Math.round((Date.now()-item.publishedAt)/1000)}));
    const tr=await translate(item,feed,env);
    const msg=buildMessage(tr,item,feed);
    const sent=await send(env,env.GROUP_CHAT_ID,msg,thread(feed.category,env));
    await env.SEEN.put(`NEWS:${key}`,JSON.stringify({source:feed.source,title:item.title,link:item.link,telegramMessageId:sent.result?.message_id||null}),{expirationTtl:2592000});
    const count=Number(await env.SEEN.get("STATS:PUBLISHED")||0);await env.SEEN.put("STATS:PUBLISHED",String(count+1));
    console.log("PUBLISHED",feed.source,item.title);return true;
  } finally {await env.SEEN.delete(`CLAIM:${key}`).catch(()=>{});}
}

async function translate(item,feed,env){
  if(feed.lang==="fa")return {title:clean(item.title),description:clean(item.description||"")};
  const title=await translateText(item.title,feed.lang,env);
  const description=item.description?.trim()?await translateText(item.description,feed.lang,env):"";
  return {title,description};
}

async function translateText(text,source,env){
  const r=await env.AI.run(MODEL,{text:clean(text),source_lang:source,target_lang:"fa"});
  const out=clean(r?.translated_text||"");
  if(!out)throw new Error("AI returned empty translation");
  return out;
}

function buildMessage(tr,item,feed){
  const tag=feed.category==="Iran"?"#Iran":feed.category==="Middle_East"?"#Middle_East":"#World";
  let s=`<b>${esc(tr.title)}</b>`;
  if(tr.description)s+=`\n\n${esc(tr.description)}`;
  s+=`\n\n🌐 منبع: ${esc(feed.source)}`;
  s+=`\n🔗 <a href="${esc(item.link)}">مشاهده گزارش اصلی</a>`;
  s+=`\n${tag}\n\n${FOOTER}`;
  return s;
}

async function send(env,chat,text,threadId){
  const p={chat_id:normChat(chat),text,parse_mode:"HTML",disable_web_page_preview:true};
  if(threadId!=null&&String(threadId)!=="")p.message_thread_id=Number(threadId);
  return tgApi("sendMessage",p,env);
}

async function tgApi(method,payload,env){
  if(!env.BOT_TOKEN)throw new Error("BOT_TOKEN missing");
  const r=await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
  const raw=await r.text();let d;try{d=JSON.parse(raw)}catch{throw new Error(`Telegram HTTP ${r.status}: ${raw.slice(0,300)}`)}
  if(!r.ok||!d.ok)throw new Error(`Telegram HTTP ${r.status}: ${d.description||"unknown"}`);
  return d;
}

async function fetchFeed(feed){
  const r=await fetch(feed.url,{headers:{"User-Agent":"Mozilla/5.0 (compatible; Nabz/1.0)",Accept:"application/rss+xml,application/atom+xml,application/xml,text/xml,*/*"},cf:{cacheTtl:0,cacheEverything:false}});
  if(!r.ok)throw new Error(`HTTP ${r.status}`);const xml=await r.text();if(xml.length<50)throw new Error("empty response");return parse(xml);
}

function parse(xml){
  const out=[];const blocks=xml.match(/<item\b[\s\S]*?<\/item>/gi)||[];
  for(const b of blocks){const title=tag(b,["title"]),description=tag(b,["description","content:encoded"]),link=tag(b,["link"]),guid=tag(b,["guid"]),date=tag(b,["pubDate","dc:date","published","updated"]),publishedAt=Date.parse(clean(date)),url=cleanUrl(link||guid);if(title&&Number.isFinite(publishedAt)&&publishedAt&&url)out.push({title:clean(title),description:clean(description||""),link:url,guid:clean(guid||url),publishedAt});}
  if(!out.length){for(const b of xml.match(/<entry\b[\s\S]*?<\/entry>/gi)||[]){const title=tag(b,["title"]),description=tag(b,["summary","content"]),date=tag(b,["published","updated"]),publishedAt=Date.parse(clean(date)),link=atomLink(b),guid=tag(b,["id"]);if(title&&Number.isFinite(publishedAt)&&publishedAt&&link)out.push({title:clean(title),description:clean(description||""),link:cleanUrl(link),guid:clean(guid||link),publishedAt});}}
  return out.filter(x=>x.publishedAt).sort((a,b)=>b.publishedAt-a.publishedAt).slice(0,30);
}

function tag(block,tags){for(const t of tags){const s=t.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");const m=block.match(new RegExp(`<${s}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${s}>`,"i"));if(m?.[1])return decode(m[1]);}return "";}
function atomLink(block){for(const t of block.match(/<link\b[^>]*>/gi)||[]){const h=attr(t,"href"),r=attr(t,"rel");if(h&&(!r||r==="alternate"))return h;}return "";}
function attr(t,n){return t.match(new RegExp(`${n}\\s*=\\s*["']([^"']+)["']`,`i`))?.[1]||"";}
function split(a,n){const g=Array.from({length:n},()=>[]);a.forEach((x,i)=>g[i%n].push(x));return g;}
function thread(c,e){return c==="Iran"?e.TOPIC_IRAN:c==="Middle_East"?e.TOPIC_MIDDLE_EAST:e.TOPIC_WORLD;}
function normChat(v){const s=String(v||"").trim();return /^-\d+$/.test(s)?s:/^\d+$/.test(s)?`-100${s}`:s;}
function normUrl(v){try{const u=new URL(v);u.hash="";for(const p of ["utm_source","utm_medium","utm_campaign","utm_term","utm_content","fbclid","gclid"])u.searchParams.delete(p);return u.toString().replace(/\/$/,"").toLowerCase()}catch{return String(v||"").trim().toLowerCase()}}
function normTitle(v){return String(v||"").toLowerCase().replace(/https?:\/\/\S+/g,"").replace(/[^\p{L}\p{N}]+/gu," ").trim().replace(/\s+/g," ")}
function clean(v){return decode(String(v||"").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi,"$1").replace(/<script[\s\S]*?<\/script>/gi,"").replace(/<style[\s\S]*?<\/style>/gi,"").replace(/<br\s*\/?>(?=.)/gi,"\n").replace(/<\/p>/gi,"\n").replace(/<[^>]+>/g," ").replace(/\r/g,"").replace(/[ \t]+/g," ").replace(/\n{3,}/g,"\n\n").trim());}
function decode(v){return String(v||"").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/&apos;/gi,"'").replace(/&lt;/gi,"<").replace(/&gt;/gi,">").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)));}
function cleanUrl(v){const s=decode(v).trim();return /^https?:\/\//i.test(s)?s:"";}
function esc(v){return String(v||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
async function sha256(v){const h=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return [...new Uint8Array(h)].map(b=>b.toString(16).padStart(2,"0")).join("");}
function json(x,s=200){return new Response(JSON.stringify(x,null,2),{status:s,headers:{"content-type":"application/json;charset=utf-8"}});}
