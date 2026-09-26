const AI_MODEL = "@cf/zai-org/glm-4.7-flash";

const MIN_AGE = 2 * 60 * 1000;
const MAX_AGE = 60 * 60 * 1000;

const BOT_ENABLED_KEY = "BOT:ENABLED";
const DEFAULT_BOT_ENABLED = false;

const FEED_TIMEOUT = 8000;
const ARTICLE_TIMEOUT = 9000;

const FEED_BATCH = 6;
const MAX_ARTICLE = 9000;

const TG_TEXT_LIMIT = 4000;
const TG_CAPTION_LIMIT = 1000;

const ADMIN_ID = "8885912152";
const FOOTER = "@Zarathushtra_ir";

const FEEDS = [
  ["Iran","BBC Persian","https://feeds.bbci.co.uk/persian/rss.xml","fa","bbc.com"],
  ["Iran","Iran International","https://www.iranintl.com/en/rss","en","iranintl.com"],
  ["Iran","Radio Farda","https://www.radiofarda.com/api/z-pqpiev-qpp","fa","radiofarda.com"],
  ["Iran","DW Farsi","https://rss.dw.com/xml/rss-fa-all","fa","dw.com"],
  ["Iran","ISNA","https://www.isna.ir/rss","fa","isna.ir"],
  ["Iran","Tasnim","https://www.tasnimnews.com/fa/rss/feed/0/8/0/%D8%A2%D8%AE%D8%B1%DB%8C%D9%86-%D8%AE%D8%A8%D8%B1","fa","tasnimnews.com"],
  ["Iran","Tabnak","https://www.tabnak.ir/fa/rss/allnews","fa","tabnak.ir"],
  ["Iran","Mehr","https://www.mehrnews.com/rss","fa","mehrnews.com"],
  ["Iran","Khabar Online","https://www.khabaronline.ir/rss","fa","khabaronline.ir"],
  ["Iran","YJC","https://www.yjc.ir/fa/rss/allnews","fa","yjc.ir"],
  ["Iran","Asriran","https://www.asriran.com/fa/rss/allnews","fa","asriran.com"],
  ["Iran","Fars","https://www.farsnews.ir/rss","fa","farsnews.ir"],
  ["Iran","IRNA","https://www.irna.ir/rss","fa","irna.ir"],
  ["Iran","ILNA","https://www.ilna.ir/rss","fa","ilna.ir"],
  ["Iran","France 24","https://www.france24.com/en/rss","en","france24.com"],

  ["Middle_East","Al Jazeera","https://www.aljazeera.com/xml/rss/all.xml","en","aljazeera.com"],
  ["Middle_East","BBC Middle East","https://feeds.bbci.co.uk/news/world/middle_east/rss.xml","en","bbc.com"],
  ["Middle_East","The Guardian","https://www.theguardian.com/world/middleeast/rss","en","theguardian.com"],
  ["Middle_East","The New York Times","https://rss.nytimes.com/services/xml/rss/nyt/MiddleEast.xml","en","nytimes.com"],
  ["Middle_East","CNN","https://rss.cnn.com/rss/edition_meast.rss","en","cnn.com"],
  ["Middle_East","Fox News","https://moxie.foxnews.com/google-publisher/world.xml","en","foxnews.com"],
  ["Middle_East","The Washington Post","https://feeds.washingtonpost.com/rss/world","en","washingtonpost.com"],
  ["Middle_East","The National","https://www.thenationalnews.com/rss","en","thenationalnews.com"],
  ["Middle_East","France 24","https://www.france24.com/en/rss","en","france24.com"],
  ["Middle_East","DW","https://rss.dw.com/xml/rss-en-all","en","dw.com"],
  ["Middle_East","Euronews","https://www.euronews.com/rss","en","euronews.com"],

  ["World","BBC World","https://feeds.bbci.co.uk/news/world/rss.xml","en","bbc.com"],
  ["World","The Guardian","https://www.theguardian.com/world/rss","en","theguardian.com"],
  ["World","The New York Times","https://rss.nytimes.com/services/xml/rss/nyt/World.xml","en","nytimes.com"],
  ["World","CNN","https://rss.cnn.com/rss/edition.rss","en","cnn.com"],
  ["World","Fox News","https://moxie.foxnews.com/google-publisher/latest.xml","en","foxnews.com"],
  ["World","The Washington Post","https://feeds.washingtonpost.com/rss/world","en","washingtonpost.com"],
  ["World","DW","https://rss.dw.com/xml/rss-en-all","en","dw.com"],
  ["World","France 24","https://www.france24.com/en/rss","en","france24.com"],
  ["World","Euronews","https://www.euronews.com/rss","en","euronews.com"],
  ["World","TASS","https://tass.com/rss/v2.xml","ru","tass.com"],
  ["World","RIA Novosti","https://ria.ru/export/rss2/archive/index.xml","ru","ria.ru"],
  ["World","Sputnik","https://sputnikglobe.com/export/rss2/archive/index.xml","en","sputnikglobe.com"],
  ["World","RT","https://www.rt.com/rss/","en","rt.com"],
  ["World","ANSA","https://www.ansa.it/sito/ansait_rss.xml","it","ansa.it"],
  ["World","Politico Europe","https://www.politico.eu/feed/","en","politico.eu"],
  ["World","Al Jazeera","https://www.aljazeera.com/xml/rss/all.xml","en","aljazeera.com"]
].map(([category,source,url,lang,domain]) => ({
  category,
  source,
  url,
  lang,
  domain
}));

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/telegram") {
      try {
        ctx.waitUntil(handleUpdate(await request.json(), env));
      } catch (e) {
        console.error("WEBHOOK_ERROR", e?.message || String(e));
      }

      return new Response("OK");
    }

    if (url.pathname === "/") {
      return json({
        ok: true,
        service: "Nabz",
        time: new Date().toISOString()
      });
    }

    if (url.pathname === "/health") {
      return json(await health(url, env));
    }

    if (url.pathname === "/test-telegram") {
      try {
        return json(await tgApi("getMe", {}, env));
      } catch (e) {
        return json({
          ok: false,
          error: e?.message || String(e)
        }, 500);
      }
    }

    return new Response("Nabz Worker is running.");
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(run(env, controller));
  }
};

async function health(url, env) {
  const result = {
    ok: true,
    service: "Nabz",
    botToken: !!env.BOT_TOKEN,
    ai: !!env.AI,
    kv: !!env.SEEN,
    workerUrl: url.origin,
    telegram: null,
    webhook: null
  };

  try {
    result.telegram = await tgApi("getMe", {}, env);

    if (result.telegram?.ok) {
      result.webhook = await ensureWebhook(url.origin, env);
    }
  } catch (e) {
    result.telegram = {
      ok: false,
      error: e?.message || String(e)
    };
  }

  return result;
}

async function run(env, controller) {
  console.log(
    "CRON_START",
    JSON.stringify({
      cron: controller?.cron,
      time: controller?.scheduledTime
    })
  );

  if (!env.BOT_TOKEN || !env.SEEN || !env.AI) {
    console.error("MISSING_BINDING_OR_SECRET");
    return;
  }

  try {
    await ensureWebhook(
      "https://nabz.z-e-u-s-u7mwk9.workers.dev",
      env
    );
  } catch (e) {
    console.error(
      "WEBHOOK_SETUP_ERROR",
      e?.message || String(e)
    );
  }

  const lock = "LOCK:RUN";

  if (await env.SEEN.get(lock)) {
    return;
  }

  await env.SEEN.put(lock, "1", {
    expirationTtl: 90
  });

  try {
    const groups = split(FEEDS, 2);

    const group =
      groups[Math.floor(Date.now() / 60000) % 2];

    const fresh = [];

    for (let i = 0; i < group.length; i += FEED_BATCH) {
      const batch = group.slice(i, i + FEED_BATCH);

      const results = await Promise.all(
        batch.map(async feed => {
          try {
            const items = await fetchFeed(feed);

            console.log(
              "RSS_OK",
              feed.source,
              items.length
            );

            return {
              feed,
              items
            };
          } catch (e) {
            console.error(
              "RSS_ERROR",
              feed.source,
              e?.message || String(e)
            );

            return {
              feed,
              items: []
            };
          }
        })
      );

      for (const { feed, items } of results) {
        for (const item of items) {
          const age =
            Date.now() - item.publishedAt;

          if (
            age >= MIN_AGE &&
            age <= MAX_AGE
          ) {
            fresh.push({
              feed,
              item
            });
          }
        }
      }
    }

    fresh.sort(
      (a, b) =>
        a.item.publishedAt -
        b.item.publishedAt
    );

    let published = 0;

    const maxPublish = Math.max(
      1,
      Number(env.MAX_PUBLISH_PER_RUN || 3)
    );

    for (const x of fresh) {
      if (published >= maxPublish) {
        break;
      }

      try {
        if (
          await publish(
            x.item,
            x.feed,
            env
          )
        ) {
          published++;
        }
      } catch (e) {
        console.error(
          "ITEM_ERROR",
          x.feed.source,
          e?.message || String(e)
        );
      }
    }

    console.log(
      "CRON_END",
      JSON.stringify({
        feeds: group.length,
        fresh: fresh.length,
        published
      })
    );
  } finally {
    await env.SEEN
      .delete(lock)
      .catch(() => {});
  }
}

async function publish(item, feed, env) {
  const key = await sha256(
    [
      feed.category,
      feed.source,
      normUrl(item.link),
      normTitle(item.title)
    ].join("|")
  );

  if (
    await env.SEEN.get(`NEWS:${key}`) ||
    await env.SEEN.get(`CLAIM:${key}`)
  ) {
    return false;
  }

  await env.SEEN.put(
    `CLAIM:${key}`,
    "1",
    {
      expirationTtl: 300
    }
  );

  try {
    const article =
      await enrichArticle(item);

    const tr = await translate(
      {
        ...item,
        description:
          article.text ||
          item.description
      },
      feed,
      env
    );

    const imageUrl =
      article.imageUrl ||
      item.imageUrl ||
      "";

    const sent =
      await sendPost(
        env,
        env.GROUP_CHAT_ID,
        tr,
        item,
        feed,
        thread(
          feed.category,
          env
        ),
        imageUrl
      );

    await env.SEEN.put(
      `NEWS:${key}`,
      JSON.stringify({
        source: feed.source,
        title: item.title,
        link: item.link,
        telegramMessageId:
          sent.result?.message_id ||
          null
      }),
      {
        expirationTtl: 2592000
      }
    );

    const count =
      Number(
        await env.SEEN.get(
          "STATS:PUBLISHED"
        ) || 0
      );

    await env.SEEN.put(
      "STATS:PUBLISHED",
      String(count + 1)
    );

    return true;
  } finally {
    await env.SEEN
      .delete(`CLAIM:${key}`)
      .catch(() => {});
  }
}

async function translate(item, feed, env) {
  const title =
    clean(item.title).slice(0, 1600);

  const text =
    clean(item.description || "")
      .slice(0, MAX_ARTICLE);

  if (feed.lang === "fa") {
    return {
      title,
      description: text
    };
  }

  return {
    title:
      await translateText(
        title,
        feed.lang,
        env,
        true
      ),

    description:
      text
        ? await translateText(
            text,
            feed.lang,
            env,
            false
          )
        : ""
  };
}

async function translateText(
  text,
  source,
  env,
  isTitle
) {
  const r =
    await env.AI.run(
      AI_MODEL,
      {
        messages: [
          {
            role: "system",
            content:
              "تو مترجم حرفه‌ای خبر به فارسی هستی. فقط ترجمه کن. خلاصه نکن. هیچ جمله‌ای را حذف نکن. هیچ اطلاعاتی اضافه نکن. تحلیل یا نظر نده. نام اشخاص، مکان‌ها، سازمان‌ها، اعداد و نقل‌قول‌ها را دقیق حفظ کن. ساختار پاراگراف‌ها را تا حد ممکن حفظ کن. فارسی طبیعی و لحن خبری رسمی باشد. خروجی فقط ترجمه باشد."
          },
          {
            role: "user",
            content:
              `زبان مبدأ: ${source}\n` +
              `نوع متن: ${
                isTitle
                  ? "عنوان خبر"
                  : "متن کامل خبر"
              }\n\n${text}`
          }
        ],

        temperature: 0.1,

        max_completion_tokens:
          isTitle ? 300 : 7000
      }
    );

  const out = clean(
    r?.response ||
    r?.choices?.[0]?.message?.content ||
    ""
  );

  if (!out) {
    throw new Error(
      "AI returned empty translation"
    );
  }

  return out;
}

async function sendPost(
  env,
  chat,
  tr,
  item,
  feed,
  threadId,
  imageUrl
) {
  const tag =
    feed.category === "Iran"
      ? "#Iran"
      : feed.category === "Middle_East"
        ? "#Middle_East"
        : "#World";

  const title =
    `<b>${esc(
      trimText(tr.title, 700)
    )}</b>`;

  const footer =
    `🌐 منبع: ${esc(feed.source)}\n` +
    `🔗 <a href="${esc(item.link)}">مشاهده گزارش اصلی</a>\n` +
    `${tag}\n\n` +
    FOOTER;

  const full =
    `${title}` +
    `${tr.description
      ? `\n\n${esc(tr.description)}`
      : ""}` +
    `\n\n${footer}`;

  if (imageUrl) {
    try {
      const caption =
        `${title}\n\n${footer}`;

      const photoPayload = {
        chat_id: normChat(chat),
        photo: imageUrl,
        caption: trimText(
          caption,
          TG_CAPTION_LIMIT
        ),
        parse_mode: "HTML"
      };

      if (
        threadId != null &&
        String(threadId) !== ""
      ) {
        photoPayload.message_thread_id =
          Number(threadId);
      }

      const photo =
        await tgApi(
          "sendPhoto",
          photoPayload,
          env
        );

      if (tr.description) {
        await send(
          env,
          chat,
          trimText(
            esc(tr.description),
            TG_TEXT_LIMIT
          ),
          threadId
        );
      }

      return photo;
    } catch (e) {
      console.error(
        "PHOTO_SEND_FAILED",
        e?.message || String(e)
      );
    }
  }

  return send(
    env,
    chat,
    trimText(full, TG_TEXT_LIMIT),
    threadId
  );
}

async function send(
  env,
  chat,
  text,
  threadId
) {
  const p = {
    chat_id: normChat(chat),
    text: trimText(
      text,
      TG_TEXT_LIMIT
    ),
    parse_mode: "HTML",
    disable_web_page_preview: true
  };

  if (
    threadId != null &&
    String(threadId) !== ""
  ) {
    p.message_thread_id =
      Number(threadId);
  }

  return tgApi(
    "sendMessage",
    p,
    env
  );
}

async function tgApi(
  method,
  payload,
  env
) {
  if (!env.BOT_TOKEN) {
    throw new Error(
      "BOT_TOKEN missing"
    );
  }

  const r = await fetch(
    `https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: {
        "content-type":
          "application/json"
      },
      body: JSON.stringify(payload)
    }
  );

  const raw = await r.text();

  let d;

  try {
    d = JSON.parse(raw);
  } catch {
    throw new Error(
      `Telegram HTTP ${r.status}: ${raw.slice(
        0,
        300
      )}`
    );
  }

  if (!r.ok || !d.ok) {
    throw new Error(
      `Telegram HTTP ${r.status}: ${
        d.description || "unknown"
      }`
    );
  }

  return d;
}

async function fetchFeed(feed) {
  const urls = [
    feed.url,
    googleFallback(feed)
  ];

  let lastError;

  for (
    let i = 0;
    i < urls.length;
    i++
  ) {
    try {
      const xml =
        await fetchText(
          urls[i],
          FEED_TIMEOUT
        );

      const items = parse(xml);

      const hasRecent =
        items.some(
          x =>
            Date.now() -
              x.publishedAt <=
            60 * 60 * 1000
        );

      if (
        items.length &&
        (
          i === urls.length - 1 ||
          hasRecent
        )
      ) {
        return items;
      }

      lastError =
        new Error("feed stale");
    } catch (e) {
      lastError = e;
    }
  }

  throw (
    lastError ||
    new Error(
      "feed unavailable"
    )
  );
}

function googleFallback(feed) {
  const q =
    `site:${feed.domain} when:1h`;

  return (
    `https://news.google.com/rss/search?q=` +
    `${encodeURIComponent(q)}` +
    `&hl=en-US&gl=US&ceid=US:en`
  );
}

async function fetchText(
  url,
  timeout
) {
  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () => controller.abort(),
      timeout
    );

  try {
    const r =
      await fetch(
        url,
        {
          redirect: "follow",

          headers: {
            "User-Agent":
              "Mozilla/5.0 (compatible; Nabz/5.0)",

            "Accept":
              "application/rss+xml,application/atom+xml,application/xml,text/xml,text/html,*/*"
          },

          cf: {
            cacheTtl: 0,
            cacheEverything: false
          },

          signal: controller.signal
        }
      );

    if (!r.ok) {
      throw new Error(
        `HTTP ${r.status}`
      );
    }

    const text =
      await r.text();

    if (text.length < 50) {
      throw new Error(
        "empty response"
      );
    }

    return text;
  } catch (e) {
    if (
      e?.name ===
      "AbortError"
    ) {
      throw new Error(
        `timeout after ${timeout}ms`
      );
    }

    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function parse(xml) {
  const out = [];

  for (
    const block of
      xml.match(
        /<item\b[\s\S]*?<\/item>/gi
      ) || []
  ) {
    const title =
      tag(block, ["title"]);

    const description =
      tag(block, [
        "content:encoded",
        "content",
        "description"
      ]);

    const link =
      cleanUrl(
        tag(block, ["link"]) ||
        tag(block, ["guid"])
      );

    const guid =
      clean(
        tag(block, ["guid"]) ||
        link
      );

    const date =
      tag(block, [
        "pubDate",
        "dc:date",
        "published",
        "updated"
      ]);

    const publishedAt =
      Date.parse(
        clean(date)
      );

    const imageUrl =
      extractImage(block);

    if (
      title &&
      Number.isFinite(
        publishedAt
      ) &&
      publishedAt &&
      link
    ) {
      out.push({
        title: clean(title),
        description:
          clean(
            description || ""
          ),
        link,
        guid,
        publishedAt,
        imageUrl
      });
    }
  }

  if (!out.length) {
    for (
      const block of
        xml.match(
          /<entry\b[\s\S]*?<\/entry>/gi
        ) || []
    ) {
      const title =
        tag(block, ["title"]);

      const description =
        tag(block, [
          "content",
          "summary"
        ]);

      const date =
        tag(block, [
          "published",
          "updated"
        ]);

      const publishedAt =
        Date.parse(
          clean(date)
        );

      const link =
        cleanUrl(
          atomLink(block)
        );

      const guid =
        clean(
          tag(block, ["id"]) ||
          link
        );

      const imageUrl =
        extractImage(block);

      if (
        title &&
        Number.isFinite(
          publishedAt
        ) &&
        publishedAt &&
        link
      ) {
        out.push({
          title: clean(title),
          description:
            clean(
              description || ""
            ),
          link,
          guid,
          publishedAt,
          imageUrl
        });
      }
    }
  }

  return out
    .sort(
      (a, b) =>
        b.publishedAt -
        a.publishedAt
    )
    .slice(0, 20);
}

async function enrichArticle(item) {
  let imageUrl =
    item.imageUrl || "";

  let text =
    clean(
      item.description || ""
    );

  try {
    const html =
      await fetchText(
        item.link,
        ARTICLE_TIMEOUT
      );

    imageUrl =
      imageUrl ||
      extractImage(html);

    const articleText =
      clean(
        extractArticleHtml(
          html
        )
      );

    if (
      articleText.length > 500 &&
      articleText.length >
        text.length * 1.25
    ) {
      text =
        articleText;
    }
  } catch (e) {
    console.log(
      "ARTICLE_FETCH_FAILED",
      e?.message || String(e)
    );
  }

  return {
    text: text.slice(
      0,
      MAX_ARTICLE
    ),
    imageUrl
  };
}

function extractArticleHtml(html) {
  const cleaned =
    html.replace(
      /<(script|style|noscript|nav|header|footer|aside|form|svg)[^>]*>[\s\S]*?<\/\1>/gi,
      " "
    );

  const candidates = [];

  for (
    const re of [
      /<article\b[^>]*>([\s\S]*?)<\/article>/gi,
      /<main\b[^>]*>([\s\S]*?)<\/main>/gi
    ]
  ) {
    for (
      const m of
        cleaned.matchAll(re)
    ) {
      candidates.push(
        m[1]
      );
    }
  }

  for (
    const m of
      cleaned.matchAll(
        /<(?:div|section)\b[^>]*(?:id|class)=["'][^"']*(?:article|story|content|post|entry)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|section)>/gi
      )
  ) {
    candidates.push(
      m[1]
    );
  }

  candidates.sort(
    (a, b) =>
      scoreHtml(b) -
      scoreHtml(a)
  );

  return (
    candidates[0] || ""
  );
}

function scoreHtml(html) {
  return (
    (
      html.match(
        /<p\b/gi
      ) || []
    ).length * 250 +
    clean(html).length
  );
}

function extractImage(block) {
  const patterns = [
    /<media:content\b[^>]*url=["']([^"']+)["']/i,
    /<media:thumbnail\b[^>]*url=["']([^"']+)["']/i,
    /<enclosure\b[^>]*url=["']([^"']+)["'][^>]*>/i,
    /<image\b[^>]*>[\s\S]*?<url[^>]*>([\s\S]*?)<\/url>[\s\S]*?<\/image>/i,
    /<meta\b[^>]*(?:property|name)=["']og:image["'][^>]*content=["']([^"']+)["']/i,
    /<meta\b[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']og:image["']/i,
    /<meta\b[^>]*(?:property|name)=["']twitter:image["'][^>]*content=["']([^"']+)["']/i,
    /<img\b[^>]*src=["']([^"']+)["']/i
  ];

  for (
    const re of patterns
  ) {
    const m =
      block.match(re);

    if (m?.[1]) {
      const u =
        cleanUrl(m[1]);

      if (
        /^https?:\/\//i.test(
          u
        )
      ) {
        return u;
      }
    }
  }

  return "";
}

function tag(block, tags) {
  for (
    const t of tags
  ) {
    const safe =
      t.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );

    const m =
      block.match(
        new RegExp(
          `<${safe}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${safe}>`,
          "i"
        )
      );

    if (m?.[1]) {
      return decode(
        m[1]
      );
    }
  }

  return "";
}

function atomLink(block) {
  for (
    const t of
      block.match(
        /<link\b[^>]*>/gi
      ) || []
  ) {
    const href =
      attr(t, "href");

    const rel =
      attr(t, "rel");

    if (
      href &&
      (!rel ||
        rel === "alternate")
    ) {
      return href;
    }
  }

  return "";
}

function attr(
  text,
  name
) {
  return (
    text.match(
      new RegExp(
        `${name}\\s*=\\s*["']([^"']+)["']`,
        "i"
      )
    )?.[1] || ""
  );
}

function split(
  array,
  n
) {
  const g =
    Array.from(
      { length: n },
      () => []
    );

  array.forEach(
    (x, i) =>
      g[i % n].push(x)
  );

  return g;
}

function thread(
  category,
  env
) {
  return category === "Iran"
    ? env.TOPIC_IRAN
    : category === "Middle_East"
      ? env.TOPIC_MIDDLE_EAST
      : env.TOPIC_WORLD;
}

function normChat(value) {
  const s =
    String(
      value || ""
    ).trim();

  if (
    /^-\d+$/.test(s)
  ) {
    return s;
  }

  if (
    /^\d+$/.test(s)
  ) {
    return `-100${s}`;
  }

  return s;
}

function normUrl(value) {
  try {
    const u =
      new URL(value);

    u.hash = "";

    for (
      const p of [
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_term",
        "utm_content",
        "fbclid",
        "gclid"
      ]
    ) {
      u.searchParams.delete(
        p
      );
    }

    return u
      .toString()
      .replace(/\/$/, "")
      .toLowerCase();
  } catch {
    return String(
      value || ""
    )
      .trim()
      .toLowerCase();
  }
}

function normTitle(value) {
  return String(
    value || ""
  )
    .toLowerCase()
    .replace(
      /https?:\/\/\S+/g,
      ""
    )
    .replace(
      /[^\p{L}\p{N}]+/gu,
      " "
    )
    .trim()
    .replace(
      /\s+/g,
      " "
    );
}

function clean(value) {
  return decode(
    String(value || "")
      .replace(
        /<!\[CDATA\[([\s\S]*?)\]\]>/gi,
        "$1"
      )
      .replace(
        /<script[\s\S]*?<\/script>/gi,
        ""
      )
      .replace(
        /<style[\s\S]*?<\/style>/gi,
        ""
      )
      .replace(
        /<br\s*\/?>/gi,
        "\n"
      )
      .replace(
        /<\/p>/gi,
        "\n"
      )
      .replace(
        /<[^>]+>/g,
        " "
      )
      .replace(
        /\r/g,
        ""
      )
      .replace(
        /[ \t]+/g,
        " "
      )
      .replace(
        /\n{3,}/g,
        "\n\n"
      )
      .trim()
  );
}

function decode(value) {
  return String(
    value || ""
  )
    .replace(
      /&nbsp;/gi,
      " "
    )
    .replace(
      /&amp;/gi,
      "&"
    )
    .replace(
      /&quot;/gi,
      '"'
    )
    .replace(
      /&#39;/gi,
      "'"
    )
    .replace(
      /&apos;/gi,
      "'"
    )
    .replace(
      /&lt;/gi,
      "<"
    )
    .replace(
      /&gt;/gi,
      ">"
    )
    .replace(
      /&#(\d+);/g,
      (_, n) =>
        String.fromCodePoint(
          Number(n)
        )
    )
    .replace(
      /&#x([0-9a-f]+);/gi,
      (_, n) =>
        String.fromCodePoint(
          parseInt(n, 16)
        )
    );
}

function trimText(
  value,
  max
) {
  const s =
    String(
      value || ""
    ).trim();

  if (
    s.length <= max
  ) {
    return s;
  }

  return (
    s
      .slice(0, max - 1)
      .trim() + "…"
  );
}

function esc(value) {
  return String(
    value || ""
  )
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    );
}

function cleanUrl(value) {
  return decode(
    String(value || "")
      .trim()
      .replace(
        /^<|>$/g,
        ""
      )
      .trim()
  );
}

async function sha256(
  value
) {
  const bytes =
    new TextEncoder()
      .encode(value);

  const hash =
    await crypto.subtle.digest(
      "SHA-256",
      bytes
    );

  return [
    ...new Uint8Array(hash)
  ]
    .map(x =>
      x.toString(16)
        .padStart(2, "0")
    )
    .join("");
}

async function handleUpdate(
  update,
  env
) {
  const message =
    update?.message;

  if (
    !message?.text ||
    !message.chat?.id
  ) {
    return;
  }

  const command =
    String(
      message.text
    )
      .trim()
      .split(/\s+/)[0]
      .split("@")[0]
      .toLowerCase();

  if (
    command === "/start"
  ) {
    return send(
      env,
      message.chat.id,
      "📰 <b>Nabz</b>\n\nربات خبررسان فعال است.",
      null
    );
  }

  if (
    command === "/status" ||
    command === "/stats"
  ) {
    if (
      String(
        message.from?.id || ""
      ) !== ADMIN_ID
    ) {
      return send(
        env,
        message.chat.id,
        "⛔ این دستور فقط برای مدیر ربات فعال است."
      );
    }

    const count =
      Number(
        await env.SEEN.get(
          "STATS:PUBLISHED"
        ) || 0
      );

    return send(
      env,
      message.chat.id,
      `📊 <b>Nabz</b>\n\n` +
      `🟢 Worker: فعال\n` +
      `🤖 Telegram: متصل\n` +
      `🧠 AI: فعال\n` +
      `📡 منابع: ${FEEDS.length}\n` +
      `📰 منتشرشده: ${count}`
    );
  }
}

async function ensureWebhook(
  origin,
  env
) {
  const info =
    await tgApi(
      "getWebhookInfo",
      {},
      env
    );

  const target =
    `${origin}/telegram`;

  if (
    (info?.result?.url || "") !==
    target
  ) {
    return tgApi(
      "setWebhook",
      {
        url: target,
        allowed_updates: [
          "message"
        ]
      },
      env
    );
  }

  return info;
}

function json(
  value,
  status = 200
) {
  return new Response(
    JSON.stringify(
      value,
      null,
      2
    ),
    {
      status,
      headers: {
        "content-type":
          "application/json;charset=UTF-8"
      }
    }
  );
}
