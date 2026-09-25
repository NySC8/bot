const FEEDS = [

  // IRAN
  { name:"BBC Persian", category:"iran", url:"https://feeds.bbci.co.uk/persian/rss.xml" },
  { name:"Iran International", category:"iran", url:"https://news.google.com/rss/search?q=site%3Airanintl.com+when%3A1h&hl=en-US&gl=US&ceid=US%3Aen" },
  { name:"Radio Farda", category:"iran", url:"https://www.radiofarda.com/api/z-pqpiev-qpp" },
  { name:"DW Farsi", category:"iran", url:"https://rss.dw.com/xml/rss-fa-all" },
  { name:"ISNA", category:"iran", url:"https://www.isna.ir/rss" },
  { name:"Tasnim", category:"iran", url:"https://www.tasnimnews.com/fa/rss/feed/0/8/0/%D9%85%D9%87%D9%85%D8%AA%D8%B1%DB%8C%D9%86-%D8%A7%D8%AE%D8%A8%D8%A7%D8%B1-%D8%AA%D8%B3%D9%86%DB%8C%D9%85" },
  { name:"Tabnak", category:"iran", url:"https://www.tabnak.ir/fa/rss/allnews" },
  { name:"Mehr", category:"iran", url:"https://www.mehrnews.com/rss" },
  { name:"Khabar Online", category:"iran", url:"https://www.khabaronline.ir/rss" },
  { name:"YJC", category:"iran", url:"https://www.yjc.ir/fa/rss/allnews" },
  { name:"Asriran", category:"iran", url:"https://www.asriran.com/fa/rss/allnews" },
  { name:"Fars", category:"iran", url:"https://news.google.com/rss/search?q=site%3Afarsnews.ir+when%3A1h&hl=en-US&gl=US&ceid=US%3Aen" },
  { name:"IRNA", category:"iran", url:"https://en.irna.ir/rss" },
  { name:"ILNA", category:"iran", url:"https://news.google.com/rss/search?q=site%3Ailna.ir+when%3A1h&hl=en-US&gl=US&ceid=US%3Aen" },
  { name:"France 24", category:"iran", url:"https://www.france24.com/en/rss" },

  // MIDDLE EAST
  { name:"Al Jazeera", category:"middle_east", url:"https://www.aljazeera.com/xml/rss/all.xml" },
  { name:"BBC Middle East", category:"middle_east", url:"https://feeds.bbci.co.uk/news/world/middle_east/rss.xml" },
  { name:"The Guardian", category:"middle_east", url:"https://www.theguardian.com/world/middleeast/rss" },
  { name:"The New York Times", category:"middle_east", url:"https://rss.nytimes.com/services/xml/rss/nyt/MiddleEast.xml" },
  { name:"CNN", category:"middle_east", url:"http://rss.cnn.com/rss/edition_meast.rss" },
  { name:"Fox News", category:"middle_east", url:"https://moxie.foxnews.com/google-publisher/world.xml" },
  { name:"The Washington Post", category:"middle_east", url:"https://feeds.washingtonpost.com/rss/world" },
  { name:"The National", category:"middle_east", url:"https://www.thenationalnews.com/rss" },
  { name:"France 24", category:"middle_east", url:"https://www.france24.com/en/rss" },
  { name:"DW", category:"middle_east", url:"https://rss.dw.com/xml/rss-en-all" },
  { name:"Euronews", category:"middle_east", url:"https://www.euronews.com/rss" },

  // WORLD
  { name:"BBC World", category:"world", url:"https://feeds.bbci.co.uk/news/world/rss.xml" },
  { name:"The Guardian", category:"world", url:"https://www.theguardian.com/world/rss" },
  { name:"The New York Times", category:"world", url:"https://rss.nytimes.com/services/xml/rss/nyt/World.xml" },
  { name:"CNN", category:"world", url:"http://rss.cnn.com/rss/edition.rss" },
  { name:"Fox News", category:"world", url:"https://moxie.foxnews.com/google-publisher/latest.xml" },
  { name:"The Washington Post", category:"world", url:"https://feeds.washingtonpost.com/rss/world" },
  { name:"DW", category:"world", url:"https://rss.dw.com/xml/rss-en-all" },
  { name:"France 24", category:"world", url:"https://www.france24.com/en/rss" },
  { name:"Euronews", category:"world", url:"https://www.euronews.com/rss" },
  { name:"TASS", category:"world", url:"https://tass.com/rss/v2.xml" },
  { name:"RIA Novosti", category:"world", url:"https://ria.ru/export/rss2/archive/index.xml" },
  { name:"Sputnik", category:"world", url:"https://sputnikglobe.com/export/rss2/archive/index.xml" },
  { name:"RT", category:"world", url:"https://www.rt.com/rss/" },
  { name:"ANSA", category:"world", url:"https://www.ansa.it/sito/ansait_rss.xml" },
  { name:"Politico Europe", category:"world", url:"https://www.politico.eu/feed/" },
  { name:"Al Jazeera", category:"world", url:"https://www.aljazeera.com/xml/rss/all.xml" }

];

const ADMIN_USER_ID = "8885912152";
const ADMIN_USERNAME = "clearviolet";

const MIN_AGE = 2 * 60 * 1000;
const MAX_AGE = 5 * 60 * 1000;

const DEFAULT_MODEL = "gemini-3.5-flash-lite";

export default {

  async fetch(request, env) {
    try {

      const u = new URL(request.url);

      if (
        request.method === "POST" &&
        u.pathname === "/telegram"
      ) {
        return await handleTelegram(request, env);
      }

      if (request.method === "GET") {
        return new Response("Nabz is running.");
      }

      return new Response("Method Not Allowed", {
        status: 405
      });

    } catch (e) {

      console.error(
        "FETCH_ERROR",
        e?.stack || String(e)
      );

      return new Response("Internal error", {
        status: 500
      });
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(run(env));
  }

};


// =========================
// MAIN
// =========================

async function run(env) {

  const started = new Date();

  await initStats(env);

  await put(
    env,
    "stats:last_run",
    started.toISOString()
  );

  // تقسیم منابع برای ماندن زیر محدودیت Free Worker
  const minute = Math.floor(Date.now() / 60000);
  const group = minute % 3;

  const feeds = FEEDS.filter(
    (_, i) => i % 3 === group
  );

  console.log(
    "FEED_GROUP",
    group,
    "count=" + feeds.length
  );

  const results = await Promise.allSettled(
    feeds.map(feed => fetchFeed(feed))
  );

  let fresh = [];
  let ok = 0;
  let fail = 0;

  for (let i = 0; i < results.length; i++) {

    const result = results[i];

    if (result.status === "fulfilled") {

      ok++;

      fresh.push(...result.value);

      console.log(
        "RSS_OK",
        feeds[i].name,
        result.value.length
      );

    } else {

      fail++;

      console.error(
        "RSS_ERROR",
        feeds[i].name,
        result.reason?.message ||
        String(result.reason)
      );
    }
  }

  await put(
    env,
    "stats:last_feed_success",
    ok
  );

  await put(
    env,
    "stats:last_feed_failed",
    fail
  );

  // قدیمی‌ترین خبر تازه اول
  fresh.sort(
    (a, b) =>
      new Date(a.publishedAt) -
      new Date(b.publishedAt)
  );

  const max = Number(
    env.MAX_PUBLISH_PER_RUN || 4
  );

  let sent = 0;

  for (const item of fresh) {

    if (sent >= max) break;

    const key =
      "seen:" +
      await sha256(
        item.link + "|" + item.title
      );

    if (await env.SEEN.get(key)) {
      continue;
    }

    // موقتاً رزرو می‌کنیم
    await env.SEEN.put(
      key,
      "1",
      {
        expirationTtl: 172800
      }
    );

    try {

      console.log(
        "PROCESSING",
        item.feedName,
        item.title
      );

      // ترجمه
      const translated =
        await translate(item, env);

      console.log(
        "GEMINI_OK",
        item.feedName
      );

      // ارسال تلگرام
      const telegram =
        await send(
          item,
          translated,
          env
        );

      if (!telegram?.ok) {

        throw new Error(
          "Telegram HTTP " +
          (telegram?.httpStatus || "unknown") +
          ": " +
          (telegram?.description ||
            telegram?.raw ||
            "unknown Telegram error")
        );
      }

      const now = new Date();
      const sourceDate =
        new Date(item.publishedAt);

      const latency =
        Math.max(
          0,
          Math.round(
            (now - sourceDate) / 1000
          )
        );

      await inc(
        env,
        "stats:total"
      );

      await inc(
        env,
        "stats:" + item.category
      );

      await inc(
        env,
        "stats:source:" +
        sanitize(item.feedName)
      );

      await put(
        env,
        "stats:last_published_at",
        now.toISOString()
      );

      await put(
        env,
        "stats:last_latency_seconds",
        latency
      );

      sent++;

      console.log(
        "PUBLISHED",
        JSON.stringify({
          source: item.feedName,
          category: item.category,
          title: item.title,
          latencySeconds: latency
        })
      );

    } catch (e) {

      console.error(
        "ITEM_ERROR",
        item.feedName,
        e?.message || String(e)
      );

      // چون ارسال موفق نشده، دوباره قابل پردازش باشد
      await env.SEEN.delete(key);
    }
  }

  console.log(
    "NABZ_CRON_END",
    JSON.stringify({
      group,
      feeds: feeds.length,
      fresh: fresh.length,
      publishedThisRun: sent
    })
  );
}


// =========================
// RSS
// =========================

async function fetchFeed(feed) {

  const response = await fetch(
    feed.url,
    {
      headers: {
        "User-Agent":
          "Nabz-News-Bot/4.0"
      }
    }
  );

  if (!response.ok) {
    throw new Error(
      "HTTP " + response.status
    );
  }

  const xml =
    await response.text();

  const items = parse(xml);
  const now = Date.now();

  return items
    .filter(item => {

      const age =
        now -
        new Date(
          item.publishedAt
        ).getTime();

      return (
        age >= MIN_AGE &&
        age <= MAX_AGE
      );

    })
    .map(item => ({
      ...item,
      feedName: feed.name,
      category: feed.category
    }));
}


function parse(xml) {

  const output = [];

  // RSS
  for (
    const block of
    xml.match(
      /<item\b[\s\S]*?<\/item>/gi
    ) || []
  ) {

    const title =
      clean(get(block, "title"));

    const link =
      cleanUrl(get(block, "link"));

    const description =
      clean(
        get(block, "description") ||
        get(block, "summary")
      );

    const date =
      get(block, "pubDate") ||
      get(block, "published") ||
      get(block, "updated") ||
      get(block, "dc:date");

    const dt = new Date(date);

    if (
      title &&
      link &&
      !isNaN(dt)
    ) {

      output.push({
        title,
        link,
        description,
        publishedAt:
          dt.toISOString()
      });
    }
  }

  // Atom
  for (
    const block of
    xml.match(
      /<entry\b[\s\S]*?<\/entry>/gi
    ) || []
  ) {

    const title =
      clean(get(block, "title"));

    const description =
      clean(
        get(block, "summary") ||
        get(block, "content")
      );

    const date =
      get(block, "published") ||
      get(block, "updated");

    let link = "";

    const match =
      block.match(
        /<link\b[^>]*href=["']([^"']+)["']/i
      );

    if (match) {
      link = decodeXml(match[1]);
    }

    if (!link) {
      link =
        cleanUrl(get(block, "link"));
    }

    const dt = new Date(date);

    if (
      title &&
      link &&
      !isNaN(dt)
    ) {

      output.push({
        title,
        link,
        description,
        publishedAt:
          dt.toISOString()
      });
    }
  }

  return output;
}


function get(block, tag) {

  const match =
    block.match(
      new RegExp(
        `<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`,
        "i"
      )
    );

  return match
    ? match[1]
    : "";
}


function clean(value) {

  return decodeXml(
    String(value || "")
      .replace(
        /<!\[CDATA\[([\s\S]*?)\]\]>/gi,
        "$1"
      )
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}


function cleanUrl(value) {

  return decodeXml(
    String(value || "")
      .replace(
        /<!\[CDATA\[([\s\S]*?)\]\]>/gi,
        "$1"
      )
      .trim()
  );
}


function decodeXml(value) {

  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}


// =========================
// GEMINI
// =========================

async function translate(item, env) {

  if (!env.GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY missing"
    );
  }

  const model =
    env.GEMINI_MODEL ||
    DEFAULT_MODEL;

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;

  const prompt =
    `Translate this news item into natural Persian.

Do not summarize.
Do not add information.
Do not remove information.
Do not invent information.

Preserve:
- names
- organizations
- places
- numbers
- dates
- quotations
- facts

Translate ONLY the original title and supplied description.

Return ONLY valid JSON:
{"title":"...","description":"..."}

TITLE:
${item.title}

DESCRIPTION:
${item.description || ""}`;

  const body = {
    contents: [
      {
        parts: [
          {
            text: prompt
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType:
        "application/json"
    }
  };

  // Retry برای 503 / 429
  const retryDelays = [
    1500,
    3500,
    7000
  ];

  let lastError = "";

  for (
    let attempt = 0;
    attempt <= retryDelays.length;
    attempt++
  ) {

    try {

      const response =
        await fetch(
          url,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json"
            },
            body:
              JSON.stringify(body)
          }
        );

      const text =
        await response.text();

      if (response.ok) {

        let json;

        try {
          json =
            JSON.parse(text);
        } catch {
          throw new Error(
            "Gemini invalid response"
          );
        }

        const generated =
          json?.candidates?.[0]
            ?.content?.parts
            ?.map(
              p => p.text || ""
            )
            .join("")
            .trim();

        if (!generated) {
          throw new Error(
            "Gemini empty response"
          );
        }

        let parsed;

        try {

          parsed =
            JSON.parse(generated);

        } catch {

          const match =
            generated.match(
              /\{[\s\S]*\}/
            );

          if (!match) {
            throw new Error(
              "Gemini invalid JSON"
            );
          }

          parsed =
            JSON.parse(match[0]);
        }

        return {
          title:
            String(
              parsed.title || ""
            ).trim(),

          description:
            String(
              parsed.description || ""
            ).trim()
        };
      }

      lastError =
        "Gemini HTTP " +
        response.status +
        ": " +
        text.slice(0, 500);

      // فقط خطاهای موقتی Retry شوند
      if (
        response.status !== 503 &&
        response.status !== 429 &&
        response.status !== 500
      ) {
        throw new Error(lastError);
      }

      console.warn(
        "GEMINI_RETRY",
        item.feedName,
        "attempt=" +
          (attempt + 1),
        "status=" +
          response.status
      );

    } catch (e) {

      lastError =
        e?.message ||
        String(e);

      // اگر خطای HTTP غیرقابل retry بود
      if (
        !lastError.includes(
          "Gemini HTTP 503"
        ) &&
        !lastError.includes(
          "Gemini HTTP 429"
        ) &&
        !lastError.includes(
          "Gemini HTTP 500"
        )
      ) {
        throw e;
      }
    }

    if (
      attempt <
      retryDelays.length
    ) {

      await sleep(
        retryDelays[attempt]
      );
    }
  }

  throw new Error(lastError);
}


// =========================
// TELEGRAM
// =========================

async function send(item, translated, env) {

  const tag = {
    iran: "#Iran",
    middle_east: "#Middle_East",
    world: "#World"
  }[item.category];

  const thread = {
    iran: env.TOPIC_IRAN,
    middle_east:
      env.TOPIC_MIDDLE_EAST,
    world: env.TOPIC_WORLD
  }[item.category];

  const text = [
    `<b>${esc(translated.title)}</b>`,

    translated.description
      ? esc(translated.description)
      : "",

    `🌐 منبع: ${esc(item.feedName)}`,

    `🔗 <a href="${escAttr(item.link)}">مشاهده گزارش اصلی</a>`,

    tag,

    "",

    "@Zarathushtra_ir"

  ]
    .filter(Boolean)
    .join("\n");

  const payload = {

    chat_id:
      normalize(env.GROUP_CHAT_ID),

    text,

    parse_mode: "HTML",

    disable_web_page_preview:
      false
  };

  if (thread) {

    payload.message_thread_id =
      Number(thread);
  }

  return tg(
    env.BOT_TOKEN,
    "sendMessage",
    payload
  );
}


async function tg(
  token,
  method,
  payload
) {

  if (!token) {

    return {
      ok: false,
      httpStatus: 0,
      description:
        "BOT_TOKEN missing"
    };
  }

  const url =
    `https://api.telegram.org/bot${token}/${method}`;

  try {

    const response =
      await fetch(
        url,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify(payload)
        }
      );

    const raw =
      await response.text();

    let data;

    try {
      data =
        JSON.parse(raw);
    } catch {
      data = {
        ok: false,
        description: raw
      };
    }

    // برای تشخیص دقیق مشکل
    if (!response.ok || !data.ok) {

      console.error(
        "TELEGRAM_API_ERROR",
        JSON.stringify({
          httpStatus:
            response.status,

          ok:
            data.ok,

          error_code:
            data.error_code,

          description:
            data.description,

          chat_id:
            payload?.chat_id,

          message_thread_id:
            payload?.message_thread_id
        })
      );
    }

    return {
      ...data,
      httpStatus:
        response.status,
      raw:
        raw.slice(0, 1000)
    };

  } catch (e) {

    return {
      ok: false,
      httpStatus: 0,
      description:
        e?.message ||
        String(e)
    };
  }
}


// =========================
// TELEGRAM WEBHOOK
// =========================

async function handleTelegram(
  request,
  env
) {

  try {

    const update =
      await request.json();

    const message =
      update?.message;

    if (!message) {
      return new Response("OK");
    }

    const text =
      String(
        message.text || ""
      )
      .trim()
      .toLowerCase();

    if (!text.startsWith("/start")) {
      return new Response("OK");
    }

    const userId =
      String(
        message.from?.id || ""
      );

    // کاربران عادی
    if (
      userId !==
      ADMIN_USER_ID
    ) {

      await tg(
        env.BOT_TOKEN,
        "sendMessage",
        {
          chat_id:
            message.chat.id,

          text:
            "سلام 👋\n\n" +
            "به نبض خوش آمدید.\n" +
            "این ربات برای دریافت و انتشار اخبار تازه طراحی شده است."
        }
      );

      return new Response("OK");
    }

    // مدیر
    await tg(
      env.BOT_TOKEN,
      "sendMessage",
      {
        chat_id:
          message.chat.id,

        text:
          buildStats(
            await stats(env)
          ),

        parse_mode:
          "HTML",

        disable_web_page_preview:
          true
      }
    );

    return new Response("OK");

  } catch (e) {

    console.error(
      "TELEGRAM_WEBHOOK_ERROR",
      e?.message ||
      String(e)
    );

    return new Response("OK");
  }
}


// =========================
// STATS
// =========================

async function initStats(env) {

  if (
    !(await env.SEEN.get(
      "stats:started_at"
    ))
  ) {

    await put(
      env,
      "stats:started_at",
      new Date().toISOString()
    );
  }
}


async function put(env, key, value) {

  await env.SEEN.put(
    key,
    String(value),
    {
      expirationTtl:
        315360000
    }
  );
}


async function inc(env, key) {

  await put(
    env,
    key,
    Number(
      await env.SEEN.get(key) || 0
    ) + 1
  );
}


async function stats(env) {

  const values =
    await Promise.all([
      env.SEEN.get(
        "stats:total"
      ),

      env.SEEN.get(
        "stats:iran"
      ),

      env.SEEN.get(
        "stats:middle_east"
      ),

      env.SEEN.get(
        "stats:world"
      ),

      env.SEEN.get(
        "stats:started_at"
      ),

      env.SEEN.get(
        "stats:last_run"
      ),

      env.SEEN.get(
        "stats:last_published_at"
      ),

      env.SEEN.get(
        "stats:last_latency_seconds"
      )
    ]);

  return {

    total:
      +(values[0] || 0),

    iran:
      +(values[1] || 0),

    middle:
      +(values[2] || 0),

    world:
      +(values[3] || 0),

    started:
      values[4],

    run:
      values[5],

    pub:
      values[6],

    lat:
      +(values[7] || 0)
  };
}


function buildStats(s) {

  return [

    "<b>📊 آمار ربات نبض</b>",

    "",

    `👤 مدیر: @${ADMIN_USERNAME}`,

    "",

    `<b>📰 کل اخبار ارسال‌شده:</b> ${s.total}`,

    "",

    `🇮🇷 ایران: ${s.iran}`,

    `🌍 خاورمیانه: ${s.middle}`,

    `🌎 جهان: ${s.world}`,

    "",

    `<b>⏱ آخرین تأخیر:</b> ${
      s.lat
        ? s.lat + " ثانیه"
        : "هنوز خبری ارسال نشده"
    }`,

    s.started
      ? `🟢 شروع ثبت آمار: ${fmt(s.started)}`
      : "🟢 شروع ثبت آمار: نامشخص",

    s.pub
      ? `📰 آخرین انتشار: ${fmt(s.pub)}`
      : "📰 آخرین انتشار: هنوز انجام نشده",

    s.run
      ? `⚙️ آخرین اجرای ربات: ${fmt(s.run)}`
      : "⚙️ آخرین اجرای ربات: نامشخص"

  ].join("\n");
}


// =========================
// HELPERS
// =========================

function normalize(value) {

  const x =
    String(value || "")
      .trim();

  // اگر 4352824876 باشد
  // تبدیل می‌شود به -1004352824876
  if (/^\d+$/.test(x)) {
    return "-100" + x;
  }

  return x;
}


function esc(value) {

  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}


function escAttr(value) {

  return esc(value)
    .replace(/'/g, "&#39;");
}


function fmt(value) {

  const d =
    new Date(value);

  if (isNaN(d)) {
    return "نامشخص";
  }

  return d
    .toISOString()
    .replace("T", " ")
    .replace(
      /\.\d{3}Z$/,
      " UTC"
    );
}


function sanitize(value) {

  return String(value || "")
    .toLowerCase()
    .replace(
      /[^a-z0-9_-]+/g,
      "_"
    )
    .slice(0, 100);
}


async function sha256(text) {

  const hash =
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(text)
    );

  return [
    ...new Uint8Array(hash)
  ]
    .map(
      x =>
        x.toString(16)
          .padStart(2, "0")
    )
    .join("");
}


function sleep(ms) {

  return new Promise(
    resolve =>
      setTimeout(resolve, ms)
  );
}
