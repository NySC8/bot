const FEEDS = [
  {
    name: "BBC Persian",
    category: "iran",
    url: "https://feeds.bbci.co.uk/persian/rss.xml"
  },
  {
    name: "Iran International",
    category: "iran",
    url: "https://www.iranintl.com/en/rss"
  },
  {
    name: "Radio Farda",
    category: "iran",
    url: "https://www.radiofarda.com/api/z-pqpiev-qpp"
  },
  {
    name: "DW Persian",
    category: "iran",
    url: "https://rss.dw.com/xml/rss-fa-all"
  },

  {
    name: "Al Jazeera",
    category: "middle_east",
    url: "https://www.aljazeera.com/xml/rss/all.xml"
  },
  {
    name: "BBC Middle East",
    category: "middle_east",
    url: "https://feeds.bbci.co.uk/news/world/middle_east/rss.xml"
  },
  {
    name: "The Guardian Middle East",
    category: "middle_east",
    url: "https://www.theguardian.com/world/middleeast/rss"
  },

  {
    name: "BBC World",
    category: "world",
    url: "https://feeds.bbci.co.uk/news/world/rss.xml"
  },
  {
    name: "DW English",
    category: "world",
    url: "https://rss.dw.com/xml/rss-en-all"
  },
  {
    name: "The Guardian World",
    category: "world",
    url: "https://www.theguardian.com/world/rss"
  }
];

const ADMIN_USERNAMES = new Set([
  "mathphobis",
  "clearviolet"
]);

const CATEGORY_NAMES = {
  iran: "ایران",
  middle_east: "خاورمیانه",
  world: "جهان"
};

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      /*
       * Telegram Webhook
       */
      if (request.method === "POST" && url.pathname === "/telegram") {
        return await handleTelegramUpdate(request, env);
      }

      /*
       * Simple health check
       */
      if (request.method === "GET") {
        return new Response(
          "Nabz is running.",
          {
            status: 200,
            headers: {
              "content-type": "text/plain; charset=UTF-8"
            }
          }
        );
      }

      return new Response("Method Not Allowed", { status: 405 });

    } catch (error) {
      console.error("FETCH_ERROR", error?.stack || error?.message || String(error));

      return new Response("Internal error", {
        status: 500
      });
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runNewsWorker(env));
  }
};


/* =========================================================
   MAIN NEWS WORKER
   ========================================================= */

async function runNewsWorker(env) {
  const runStartedAt = new Date();

  console.log("NABZ_CRON_START", runStartedAt.toISOString());

  try {
    await initializeStats(env);

    await env.SEEN.put(
      "stats:last_run",
      runStartedAt.toISOString(),
      {
        expirationTtl: 60 * 60 * 24 * 30
      }
    );

    let successfulFeeds = 0;
    let failedFeeds = 0;
    let freshItems = [];

    /*
     * Fetch all RSS feeds simultaneously
     */
    const results = await Promise.allSettled(
      FEEDS.map(feed => fetchFeed(feed))
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const feed = FEEDS[i];

      if (result.status === "fulfilled") {
        successfulFeeds++;

        console.log(
          "RSS_OK",
          feed.name,
          "items=" + result.value.length
        );

        freshItems.push(...result.value);
      } else {
        failedFeeds++;

        console.error(
          "RSS_ERROR",
          feed.name,
          result.reason?.message || String(result.reason)
        );
      }
    }

    console.log(
      "RSS_SUMMARY",
      JSON.stringify({
        successfulFeeds,
        failedFeeds,
        items: freshItems.length
      })
    );

    await env.SEEN.put(
      "stats:last_feed_success",
      String(successfulFeeds),
      {
        expirationTtl: 60 * 60 * 24 * 30
      }
    );

    await env.SEEN.put(
      "stats:last_feed_failed",
      String(failedFeeds),
      {
        expirationTtl: 60 * 60 * 24 * 30
      }
    );

    /*
     * Sort newest first
     */
    freshItems.sort(
      (a, b) =>
        new Date(a.publishedAt).getTime() -
        new Date(b.publishedAt).getTime()
    );

    /*
     * Maximum number of news items per execution
     */
    const maxPublish = Number(
      env.MAX_PUBLISH_PER_RUN || 8
    );

    let publishedThisRun = 0;

    for (const item of freshItems) {
      if (publishedThisRun >= maxPublish) {
        break;
      }

      try {
        const fingerprint = await sha256(
          `${item.feedName}|${item.link}|${item.title}`
        );

        /*
         * Duplicate protection
         */
        const alreadySeen = await env.SEEN.get(
          `seen:${fingerprint}`
        );

        if (alreadySeen) {
          console.log(
            "DUPLICATE_SKIP",
            item.feedName,
            item.title
          );

          continue;
        }

        /*
         * Mark only temporarily before processing.
         * If something fails, we delete it below.
         */
        await env.SEEN.put(
          `seen:${fingerprint}`,
          JSON.stringify({
            feed: item.feedName,
            title: item.title,
            link: item.link,
            detectedAt: new Date().toISOString()
          }),
          {
            expirationTtl: 60 * 60 * 48
          }
        );

        console.log(
          "PROCESSING",
          item.feedName,
          item.title
        );

        /*
         * Gemini translation
         */
        const translated = await translateWithGemini(
          item,
          env
        );

        if (!translated || !translated.title) {
          throw new Error("Gemini returned no translated title");
        }

        console.log(
          "GEMINI_OK",
          item.feedName
        );

        /*
         * Telegram publication
         */
        const telegramResult = await sendNewsToTelegram(
          item,
          translated,
          env
        );

        if (!telegramResult.ok) {
          throw new Error(
            `Telegram error: ${telegramResult.description || "unknown"}`
          );
        }

        console.log(
          "TELEGRAM_OK",
          item.feedName,
          item.title
        );

        /*
         * Only after successful Telegram publication:
         * update statistics.
         */
        await incrementStat(
          env,
          "stats:total"
        );

        await incrementStat(
          env,
          `stats:${item.category}`
        );

        await incrementStat(
          env,
          "stats:source:" + sanitizeKey(item.feedName)
        );

        const publishedAt = new Date();
        const originalPublishedAt = new Date(item.publishedAt);

        const latencySeconds =
          Math.max(
            0,
            Math.round(
              (publishedAt.getTime() -
                originalPublishedAt.getTime()) /
                1000
            )
          );

        await env.SEEN.put(
          "stats:last_published_at",
          publishedAt.toISOString(),
          {
            expirationTtl: 60 * 60 * 24 * 30
          }
        );

        await env.SEEN.put(
          "stats:last_latency_seconds",
          String(latencySeconds),
          {
            expirationTtl: 60 * 60 * 24 * 30
          }
        );

        publishedThisRun++;

        console.log(
          "PUBLISHED",
          JSON.stringify({
            source: item.feedName,
            category: item.category,
            title: item.title,
            publishedAt: item.publishedAt,
            detectedAt: new Date().toISOString(),
            latencySeconds
          })
        );

      } catch (error) {
        console.error(
          "ITEM_ERROR",
          item.feedName,
          item.title,
          error?.stack || error?.message || String(error)
        );

        /*
         * If publication failed, remove temporary dedupe key
         * so the item can be tried again later.
         */
        try {
          const fingerprint = await sha256(
            `${item.feedName}|${item.link}|${item.title}`
          );

          await env.SEEN.delete(
            `seen:${fingerprint}`
          );
        } catch (cleanupError) {
          console.error(
            "CLEANUP_ERROR",
            cleanupError?.message || String(cleanupError)
          );
        }
      }
    }

    console.log(
      "NABZ_CRON_END",
      JSON.stringify({
        freshItems: freshItems.length,
        publishedThisRun,
        finishedAt: new Date().toISOString()
      })
    );

  } catch (error) {
    console.error(
      "CRON_FATAL",
      error?.stack || error?.message || String(error)
    );
  }
}


/* =========================================================
   RSS
   ========================================================= */

async function fetchFeed(feed) {
  const response = await fetch(feed.url, {
    headers: {
      "User-Agent": "Nabz-News-Bot/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status} from ${feed.name}`
    );
  }

  const xml = await response.text();

  const items = parseFeed(xml);

  const now = Date.now();

  const maxAgeMinutes = Number(
    globalThis.__NABZ_MAX_AGE_MINUTES || 5
  );

  /*
   * These values are overwritten by fetchFeedWithLimits
   * through environment-independent defaults.
   */
  const maxAgeMs = 5 * 60 * 1000;
  const maxFutureMs = 2 * 60 * 1000;

  const fresh = [];

  for (const item of items) {
    if (!item.title || !item.link || !item.publishedAt) {
      continue;
    }

    const timestamp =
      new Date(item.publishedAt).getTime();

    if (!Number.isFinite(timestamp)) {
      continue;
    }

    const age = now - timestamp;

    /*
     * Ignore old stories.
     */
    if (age > maxAgeMs) {
      continue;
    }

    /*
     * Ignore stories whose source clock is too far ahead.
     */
    if (age < -maxFutureMs) {
      continue;
    }

    fresh.push({
      ...item,
      feedName: feed.name,
      category: feed.category
    });
  }

  return fresh;
}


/* =========================================================
   RSS PARSER
   ========================================================= */

function parseFeed(xml) {
  const results = [];

  /*
   * RSS <item>
   */
  const rssItems = xml.match(
    /<item\b[\s\S]*?<\/item>/gi
  ) || [];

  for (const block of rssItems) {
    const title =
      cleanText(
        getXmlValue(block, "title")
      );

    const link =
      cleanUrl(
        getXmlValue(block, "link")
      );

    const description =
      cleanText(
        getXmlValue(block, "description")
      );

    const pubDate =
      getXmlValue(block, "pubDate") ||
      getXmlValue(block, "published") ||
      getXmlValue(block, "updated");

    if (title && link && pubDate) {
      results.push({
        title,
        link,
        description,
        publishedAt: new Date(pubDate).toISOString()
      });
    }
  }

  /*
   * Atom <entry>
   */
  const atomEntries = xml.match(
    /<entry\b[\s\S]*?<\/entry>/gi
  ) || [];

  for (const block of atomEntries) {
    const title =
      cleanText(
        getXmlValue(block, "title")
      );

    const description =
      cleanText(
        getXmlValue(block, "summary") ||
        getXmlValue(block, "content")
      );

    const pubDate =
      getXmlValue(block, "published") ||
      getXmlValue(block, "updated");

    let link = "";

    const linkMatch =
      block.match(
        /<link\b[^>]*href=["']([^"']+)["'][^>]*\/?>/i
      );

    if (linkMatch) {
      link = decodeXml(linkMatch[1]);
    }

    if (!link) {
      link = cleanUrl(
        getXmlValue(block, "link")
      );
    }

    if (title && link && pubDate) {
      results.push({
        title,
        link,
        description,
        publishedAt: new Date(pubDate).toISOString()
      });
    }
  }

  return results;
}


function getXmlValue(block, tag) {
  const regex = new RegExp(
    `<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`,
    "i"
  );

  const match = block.match(regex);

  return match ? match[1] : "";
}


function cleanText(value) {
  if (!value) return "";

  return decodeXml(
    value
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}


function cleanUrl(value) {
  if (!value) return "";

  return decodeXml(
    value
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
      .trim()
  );
}


function decodeXml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'");
}


/* =========================================================
   GEMINI
   ========================================================= */

async function translateWithGemini(item, env) {
  if (!env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is missing");
  }

  const model =
    env.GEMINI_MODEL ||
    "gemini-3.8-flash";

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;

  const prompt = `
Translate the following news item into natural Persian.

IMPORTANT:
- Do NOT summarize.
- Do NOT add information.
- Do NOT remove information.
- Do NOT invent facts.
- Preserve names, organizations, locations, numbers and dates accurately.
- Translate the title.
- Translate the provided description only.
- If the description is empty, return an empty description.
- Return ONLY valid JSON.
- JSON format:
{
  "title": "...",
  "description": "..."
}

TITLE:
${item.title}

DESCRIPTION:
${item.description || ""}
`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
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
        responseMimeType: "application/json"
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `Gemini HTTP ${response.status}: ${errorText.slice(0, 500)}`
    );
  }

  const data = await response.json();

  const text =
    data?.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("")
      .trim();

  if (!text) {
    throw new Error("Gemini returned empty response");
  }

  let parsed;

  try {
    parsed = JSON.parse(text);
  } catch {
    /*
     * Sometimes models wrap JSON in markdown.
     */
    const match =
      text.match(/\{[\s\S]*\}/);

    if (!match) {
      throw new Error(
        "Gemini returned invalid JSON"
      );
    }

    parsed = JSON.parse(match[0]);
  }

  return {
    title:
      String(parsed.title || "").trim(),

    description:
      String(parsed.description || "").trim()
  };
}


/* =========================================================
   TELEGRAM NEWS
   ========================================================= */

async function sendNewsToTelegram(
  item,
  translated,
  env
) {
  const categoryThreadMap = {
    iran: env.TOPIC_IRAN,
    middle_east: env.TOPIC_MIDDLE_EAST,
    world: env.TOPIC_WORLD
  };

  const threadId =
    categoryThreadMap[item.category];

  const sourceTime =
    formatUtc(item.publishedAt);

  const text = [
    `<b>${escapeHtml(translated.title)}</b>`,
    translated.description
      ? escapeHtml(translated.description)
      : "",
    "",
    `📰 ${escapeHtml(item.feedName)}`,
    `🕐 ${sourceTime}`,
    "",
    `🔗 <a href="${escapeAttribute(item.link)}">منبع خبر</a>`
  ]
    .filter(Boolean)
    .join("\n");

  const payload = {
    chat_id: normalizeChatId(
      env.GROUP_CHAT_ID
    ),
    text,
    parse_mode: "HTML",
    disable_web_page_preview: false
  };

  if (threadId) {
    payload.message_thread_id =
      Number(threadId);
  }

  return telegramApi(
    env.BOT_TOKEN,
    "sendMessage",
    payload
  );
}


/* =========================================================
   TELEGRAM WEBHOOK / START
   ========================================================= */

async function handleTelegramUpdate(
  request,
  env
) {
  let update;

  try {
    update = await request.json();
  } catch {
    return new Response("Bad JSON", {
      status: 400
    });
  }

  try {
    const message =
      update?.message;

    if (!message) {
      return new Response("OK");
    }

    const text =
      String(message.text || "").trim();

    if (!text.toLowerCase().startsWith("/start")) {
      return new Response("OK");
    }

    const user =
      message.from || {};

    const username =
      String(user.username || "")
        .replace(/^@/, "")
        .toLowerCase();

    console.log(
      "START_COMMAND",
      JSON.stringify({
        username,
        userId: user.id,
        chatId: message.chat?.id
      })
    );

    /*
     * Only these two usernames receive statistics.
     */
    if (!ADMIN_USERNAMES.has(username)) {
      await telegramApi(
        env.BOT_TOKEN,
        "sendMessage",
        {
          chat_id: message.chat.id,
          text:
            "سلام 👋\n\n" +
            "به نبض خوش آمدید.\n" +
            "این ربات برای دریافت و انتشار اخبار تازه طراحی شده است."
        }
      );

      return new Response("OK");
    }

    const stats =
      await getStats(env);

    const statsText =
      buildStatsMessage(stats, username);

    await telegramApi(
      env.BOT_TOKEN,
      "sendMessage",
      {
        chat_id: message.chat.id,
        text: statsText,
        parse_mode: "HTML",
        disable_web_page_preview: true
      }
    );

    console.log(
      "STATS_SENT",
      username
    );

    return new Response("OK");

  } catch (error) {
    console.error(
      "TELEGRAM_WEBHOOK_ERROR",
      error?.stack || error?.message || String(error)
    );

    return new Response("OK");
  }
}


/* =========================================================
   STATISTICS
   ========================================================= */

async function initializeStats(env) {
  const existing =
    await env.SEEN.get(
      "stats:started_at"
    );

  if (!existing) {
    await env.SEEN.put(
      "stats:started_at",
      new Date().toISOString(),
      {
        expirationTtl: 60 * 60 * 24 * 3650
      }
    );
  }
}


async function incrementStat(env, key) {
  const current =
    Number(
      await env.SEEN.get(key) || "0"
    );

  await env.SEEN.put(
    key,
    String(current + 1),
    {
      expirationTtl: 60 * 60 * 24 * 3650
    }
  );
}


async function getStats(env) {
  const [
    total,
    iran,
    middleEast,
    world,
    startedAt,
    lastRun,
    lastPublishedAt,
    lastLatency
  ] = await Promise.all([
    env.SEEN.get("stats:total"),
    env.SEEN.get("stats:iran"),
    env.SEEN.get("stats:middle_east"),
    env.SEEN.get("stats:world"),
    env.SEEN.get("stats:started_at"),
    env.SEEN.get("stats:last_run"),
    env.SEEN.get("stats:last_published_at"),
    env.SEEN.get("stats:last_latency_seconds")
  ]);

  return {
    total: Number(total || 0),
    iran: Number(iran || 0),
    middleEast: Number(middleEast || 0),
    world: Number(world || 0),
    startedAt,
    lastRun,
    lastPublishedAt,
    lastLatencySeconds:
      Number(lastLatency || 0)
  };
}


function buildStatsMessage(
  stats,
  username
) {
  const latency =
    stats.lastLatencySeconds > 0
      ? `${stats.lastLatencySeconds} ثانیه`
      : "هنوز خبری ارسال نشده";

  return [
    `<b>📊 آمار ربات نبض</b>`,
    "",
    `👤 کاربر: @${escapeHtml(username)}`,
    "",
    `<b>کل اخبار ارسال‌شده:</b> ${stats.total}`,
    "",
    `🇮🇷 ایران: ${stats.iran}`,
    `🌍 خاورمیانه: ${stats.middleEast}`,
    `🌎 جهان: ${stats.world}`,
    "",
    `<b>آخرین تأخیر ثبت‌شده:</b> ${latency}`,
    "",
    stats.startedAt
      ? `🟢 شروع ثبت آمار: ${formatUtc(stats.startedAt)}`
      : `🟢 شروع ثبت آمار: نامشخص`,
    stats.lastPublishedAt
      ? `📰 آخرین انتشار: ${formatUtc(stats.lastPublishedAt)}`
      : `📰 آخرین انتشار: هنوز انجام نشده`,
    stats.lastRun
      ? `⚙️ آخرین اجرای ربات: ${formatUtc(stats.lastRun)}`
      : `⚙️ آخرین اجرای ربات: نامشخص`
  ].join("\n");
}


/* =========================================================
   TELEGRAM API
   ========================================================= */

async function telegramApi(
  botToken,
  method,
  payload
) {
  if (!botToken) {
    throw new Error("BOT_TOKEN is missing");
  }

  const url =
    `https://api.telegram.org/bot${botToken}/${method}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data =
    await response.json();

  if (!response.ok || !data.ok) {
    console.error(
      "TELEGRAM_API_ERROR",
      JSON.stringify(data)
    );
  }

  return data;
}


/* =========================================================
   HELPERS
   ========================================================= */

function normalizeChatId(value) {
  const chatId =
    String(value || "").trim();

  /*
   * If user supplied a normal numeric
   * supergroup ID without -100 prefix.
   */
  if (/^\d+$/.test(chatId)) {
    return `-100${chatId}`;
  }

  return chatId;
}


function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}


function escapeAttribute(value) {
  return escapeHtml(value)
    .replace(/'/g, "&#39;");
}


function formatUtc(value) {
  if (!value) {
    return "نامشخص";
  }

  const date =
    new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "نامشخص";
  }

  return date.toISOString()
    .replace("T", " ")
    .replace(/\.\d{3}Z$/, " UTC");
}


function sanitizeKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .slice(0, 100);
}


async function sha256(text) {
  const data =
    new TextEncoder().encode(text);

  const hash =
    await crypto.subtle.digest(
      "SHA-256",
      data
    );

  return Array.from(
    new Uint8Array(hash)
  )
    .map(byte =>
      byte.toString(16).padStart(2, "0")
    )
    .join("");
}
