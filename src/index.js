const FEEDS = [
  { name: "BBC Persian", category: "iran", url: "https://feeds.bbci.co.uk/persian/rss.xml" },
  { name: "Iran International", category: "iran", url: "https://www.iranintl.com/en/rss" },
  { name: "Radio Farda", category: "iran", url: "https://www.radiofarda.com/api/z-pqpiev-qpp" },
  { name: "DW Persian", category: "iran", url: "https://rss.dw.com/xml/rss-fa-all" },

  { name: "Al Jazeera", category: "middle_east", url: "https://www.aljazeera.com/xml/rss/all.xml" },
  { name: "BBC Middle East", category: "middle_east", url: "https://feeds.bbci.co.uk/news/world/middle_east/rss.xml" },
  { name: "The Guardian Middle East", category: "middle_east", url: "https://www.theguardian.com/world/middleeast/rss" },

  { name: "BBC World", category: "world", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { name: "DW English", category: "world", url: "https://rss.dw.com/xml/rss-en-all" },
  { name: "The Guardian World", category: "world", url: "https://www.theguardian.com/world/rss" }
];

const CATEGORY_LABEL = {
  iran: "ایران",
  middle_east: "خاورمیانه",
  world: "جهان"
};

export default {
  async fetch() {
    return new Response("Nabz is running.", {
      headers: { "content-type": "text/plain; charset=utf-8" }
    });
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runNabz(env, controller));
  }
};

async function runNabz(env, controller) {
  const now = Date.now();
  const maxAgeMs = Number(env.MAX_NEWS_AGE_MINUTES || 5) * 60000;
  const maxFutureMs = Number(env.MAX_FUTURE_MINUTES || 2) * 60000;
  const maxItems = Number(env.MAX_ITEMS_PER_FEED || 10);
  const maxPublish = Number(env.MAX_PUBLISH_PER_RUN || 8);
  const candidates = [];

  const results = await Promise.allSettled(FEEDS.map(async feed => {
    const response = await fetch(feed.url, {
      headers: {
        "User-Agent": "NabzNewsBot/1.0",
        "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml"
      },
      cache: "no-store"
    });

    if (!response.ok) throw new Error(`${feed.name}: HTTP ${response.status}`);

    const items = parseFeed(await response.text()).slice(0, maxItems);

    for (const item of items) {
      if (!item.title || !item.link || !item.publishedAt) continue;
      const age = now - item.publishedAt.getTime();
      if (age > maxAgeMs || age < -maxFutureMs) continue;

      candidates.push({
        ...item,
        feedName: feed.name,
        category: feed.category
      });
    }
  }));

  for (const r of results) {
    if (r.status === "rejected") console.error("Feed error:", r.reason);
  }

  candidates.sort((a, b) => a.publishedAt - b.publishedAt);

  const unique = [];
  const local = new Set();

  for (const item of candidates) {
    const key = await fingerprint(item);
    if (local.has(key)) continue;
    local.add(key);
    if (await env.SEEN.get(key)) continue;
    item.fingerprint = key;
    unique.push(item);
  }

  let published = 0;

  for (const item of unique) {
    if (published >= maxPublish) break;

    try {
      await env.SEEN.put(item.fingerprint, JSON.stringify({
        title: item.title,
        url: item.link,
        source: item.feedName,
        category: item.category,
        published_at: item.publishedAt.toISOString(),
        detected_at: new Date().toISOString()
      }), { expirationTtl: 172800 });

      const translated = await translateWithGemini(env, item);
      await sendTelegram(env, item, translated);

      published++;
      console.log(JSON.stringify({
        event: "published",
        source: item.feedName,
        category: item.category,
        published_at: item.publishedAt.toISOString(),
        detected_at: new Date().toISOString(),
        latency_seconds: Math.round((Date.now() - item.publishedAt.getTime()) / 1000),
        url: item.link
      }));
    } catch (error) {
      console.error("Publish error:", item.feedName, item.title, error);
      try { await env.SEEN.delete(item.fingerprint); } catch (_) {}
    }
  }

  console.log(JSON.stringify({
    event: "run_complete",
    scheduled_at: controller?.scheduledTime
      ? new Date(controller.scheduledTime).toISOString()
      : new Date().toISOString(),
    candidates: candidates.length,
    new_items: unique.length,
    published
  }));
}

function parseFeed(xml) {
  const atom = /<feed[\s>]/i.test(xml);
  const blocks = xml.match(atom ? /<entry\b[\s\S]*?<\/entry>/gi : /<item\b[\s\S]*?<\/item>/gi) || [];

  return blocks.map(block => {
    const title = cleanText(firstTag(block, "title"));
    const description = cleanText(
      firstTag(block, "description") ||
      firstTag(block, "summary") ||
      firstTag(block, "content")
    );

    let link = firstTag(block, "link");
    if (atom) link = firstAttribute(block, "link", "href") || link;

    const dateText =
      firstTag(block, "pubDate") ||
      firstTag(block, "published") ||
      firstTag(block, "updated") ||
      firstTag(block, "date");

    const publishedAt = parseDate(dateText);

    return { title, description, link: cleanUrl(link), publishedAt };
  }).filter(x => x.title && x.link && x.publishedAt);
}

function firstTag(block, tag) {
  const re = new RegExp(
    `<(?:[\\w-]+:)?${escapeRegExp(tag)}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${escapeRegExp(tag)}\\s*>`,
    "i"
  );
  const m = block.match(re);
  return m ? m[1].trim() : "";
}

function firstAttribute(block, tag, attr) {
  const re = new RegExp(
    `<(?:[\\w-]+:)?${escapeRegExp(tag)}\\b[^>]*\\b${escapeRegExp(attr)}\\s*=\\s*["']([^"']+)["']`,
    "i"
  );
  const m = block.match(re);
  return m ? decodeEntities(m[1].trim()) : "";
}

function parseDate(value) {
  if (!value) return null;
  const ms = Date.parse(decodeEntities(stripTags(value)).trim());
  return Number.isFinite(ms) ? new Date(ms) : null;
}

function cleanText(value) {
  if (!value) return "";
  return stripTags(decodeEntities(String(value).replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "")))
    .replace(/\s+/g, " ").trim();
}

function cleanUrl(value) {
  return decodeEntities(String(value || "").trim()).replace(/&amp;/g, "&");
}

function stripTags(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      try { return String.fromCodePoint(Number(n)); } catch (_) { return _; }
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => {
      try { return String.fromCodePoint(parseInt(n, 16)); } catch (_) { return _; }
    });
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function fingerprint(item) {
  const bytes = new TextEncoder().encode(`${item.feedName}|${item.link}|${item.title}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function translateWithGemini(env, item) {
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is missing");

  const model = env.GEMINI_MODEL || "gemini-3.8-flash";
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;

  const prompt = [
    "Translate this news item into Persian.",
    "Do NOT summarize.",
    "Do NOT add, remove, explain, or invent information.",
    "Preserve names, organizations, places, numbers, dates and meaning.",
    "Return ONLY JSON with exactly two string fields: title and description.",
    "",
    `TITLE: ${item.title}`,
    `DESCRIPTION: ${item.description || ""}`
  ].join("\n");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json"
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini HTTP ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error("Gemini returned no text");

  const parsed = JSON.parse(text);
  return {
    title: String(parsed.title || item.title).trim(),
    description: String(parsed.description || "").trim()
  };
}

async function sendTelegram(env, item, translated) {
  if (!env.BOT_TOKEN) throw new Error("BOT_TOKEN is missing");
  if (!env.GROUP_CHAT_ID) throw new Error("GROUP_CHAT_ID is missing");

  const topic =
    item.category === "iran" ? env.TOPIC_IRAN :
    item.category === "middle_east" ? env.TOPIC_MIDDLE_EAST :
    env.TOPIC_WORLD;

  const text = [
    `<b>${escapeHtml(translated.title)}</b>`,
    translated.description ? `\n${escapeHtml(translated.description)}` : "",
    `\n<b>منبع:</b> ${escapeHtml(item.feedName)}`,
    `<b>دسته:</b> ${escapeHtml(CATEGORY_LABEL[item.category] || "خبر")}`,
    `<b>انتشار منبع:</b> ${escapeHtml(formatUtc(item.publishedAt))}`,
    `\n<a href="${escapeHtml(item.link)}">مشاهده خبر اصلی</a>`
  ].join("\n");

  const body = {
    chat_id: normalizeChatId(env.GROUP_CHAT_ID),
    text,
    parse_mode: "HTML",
    disable_web_page_preview: false
  };

  if (topic) body.message_thread_id = Number(topic);

  const response = await fetch(
    `https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    }
  );

  if (!response.ok) {
    throw new Error(`Telegram HTTP ${response.status}: ${await response.text()}`);
  }

  const result = await response.json();
  if (!result.ok) throw new Error(`Telegram error: ${JSON.stringify(result)}`);
}

function normalizeChatId(value) {
  const s = String(value || "").trim();
  if (s.startsWith("-100")) return s;
  if (/^\d+$/.test(s)) return `-100${s}`;
  return s;
}

function formatUtc(date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date).replace(",", "") + " UTC";
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
