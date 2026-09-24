import asyncio
import hashlib
import html
import logging
import os
import re
import sqlite3
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from urllib.parse import urlparse

import feedparser
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from dotenv import load_dotenv
from google import genai
from telegram import Bot
from telegram.constants import ParseMode

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)

# =========================================================
# CONFIG
# =========================================================

BOT_TOKEN = os.getenv("BOT_TOKEN", "").strip()
GROUP_CHAT_ID = os.getenv("GROUP_CHAT_ID", "").strip()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash").strip()

POLL_MINUTES = int(os.getenv("POLL_MINUTES", "5"))
MAX_NEWS_AGE_MINUTES = int(os.getenv("MAX_NEWS_AGE_MINUTES", "10"))
MAX_FUTURE_MINUTES = int(os.getenv("MAX_FUTURE_MINUTES", "5"))
MAX_ITEMS_PER_FEED = int(os.getenv("MAX_ITEMS_PER_FEED", "15"))
MAX_PUBLISH_PER_CYCLE = int(os.getenv("MAX_PUBLISH_PER_CYCLE", "6"))
POST_DELAY_SECONDS = float(os.getenv("POST_DELAY_SECONDS", "1"))

DB_PATH = os.getenv("DB_PATH", "nabz.db")


def normalize_chat_id(value: str):
    if not value:
        return value

    try:
        number = int(value)

        # Allows using the positive internal ID copied from t.me/c/...
        if number > 0:
            return int(f"-100{number}")

        return number

    except ValueError:
        return value


CHAT_ID = normalize_chat_id(GROUP_CHAT_ID)


TOPIC_IDS = {
    "Iran": int(os.getenv("TOPIC_IRAN", "0")),
    "Middle East": int(os.getenv("TOPIC_MIDDLE_EAST", "0")),
    "World": int(os.getenv("TOPIC_WORLD", "0")),
}


# =========================================================
# RSS SOURCES
# =========================================================

FEEDS = {
    "Iran": [
        ("ISNA", os.getenv("RSS_ISNA", "")),
        ("Fars", os.getenv("RSS_FARS", "")),
        ("BBC Persian", os.getenv("RSS_BBC_PERSIAN", "")),
        ("Iran International", os.getenv("RSS_IRAN_INTL", "")),
    ],

    "Middle East": [
        ("Al Jazeera", os.getenv("RSS_ALJAZEERA", "")),
        ("France 24", os.getenv("RSS_FRANCE24", "")),
        ("BBC Middle East", os.getenv("RSS_BBC_ME", "")),
        ("DW Middle East", os.getenv("RSS_DW_ME", "")),
    ],

    "World": [
        ("The Guardian", os.getenv("RSS_GUARDIAN", "")),
        ("BBC World", os.getenv("RSS_BBC_WORLD", "")),
        ("France 24 World", os.getenv("RSS_FRANCE24_WORLD", "")),
        ("DW World", os.getenv("RSS_DW_WORLD", "")),
    ],
}


# =========================================================
# GEMINI
# =========================================================

if GEMINI_API_KEY:
    gemini = genai.Client(api_key=GEMINI_API_KEY)
else:
    gemini = None


# =========================================================
# DATABASE
# =========================================================

def db():
    conn = sqlite3.connect(DB_PATH)

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS published (
            fingerprint TEXT PRIMARY KEY,
            title TEXT,
            url TEXT,
            source TEXT,
            category TEXT,
            published_at TEXT,
            detected_at TEXT,
            telegram_message_id INTEGER
        )
        """
    )

    conn.commit()
    return conn


def already_published(fingerprint: str) -> bool:
    conn = db()

    row = conn.execute(
        "SELECT 1 FROM published WHERE fingerprint = ? LIMIT 1",
        (fingerprint,),
    ).fetchone()

    conn.close()

    return row is not None


def mark_published(
    fingerprint,
    title,
    url,
    source,
    category,
    published_at,
    detected_at,
    telegram_message_id,
):
    conn = db()

    conn.execute(
        """
        INSERT OR IGNORE INTO published
        (
            fingerprint,
            title,
            url,
            source,
            category,
            published_at,
            detected_at,
            telegram_message_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            fingerprint,
            title,
            url,
            source,
            category,
            published_at,
            detected_at,
            telegram_message_id,
        ),
    )

    conn.commit()
    conn.close()


# =========================================================
# TEXT HELPERS
# =========================================================

def clean_text(text: str) -> str:
    if not text:
        return ""

    text = html.unescape(text)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text)

    return text.strip()


def fingerprint(title: str, url: str) -> str:
    normalized_title = clean_text(title).lower()
    normalized_url = url.strip().lower()

    raw = f"{normalized_title}|{normalized_url}"

    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def extract_summary(entry) -> str:
    summary = entry.get("summary", "")

    if not summary:
        summary = entry.get("description", "")

    return clean_text(summary)


# =========================================================
# DATE HANDLING
# =========================================================

def parse_entry_datetime(entry):
    candidates = [
        entry.get("published"),
        entry.get("created"),
        entry.get("updated"),
    ]

    for value in candidates:
        if not value:
            continue

        try:
            dt = parsedate_to_datetime(value)

            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)

            return dt.astimezone(timezone.utc)

        except Exception:
            pass

    # feedparser parsed time fallback
    for key in ("published_parsed", "created_parsed", "updated_parsed"):
        value = entry.get(key)

        if not value:
            continue

        try:
            from datetime import datetime as dt_datetime

            return dt_datetime(
                value.tm_year,
                value.tm_mon,
                value.tm_mday,
                value.tm_hour,
                value.tm_min,
                value.tm_sec,
                tzinfo=timezone.utc,
            )

        except Exception:
            pass

    return None


def news_is_fresh(entry) -> bool:
    published_at = parse_entry_datetime(entry)

    if not published_at:
        logging.warning(
            "Rejected item without reliable publication date: %s",
            entry.get("title", ""),
        )
        return False

    now = datetime.now(timezone.utc)

    age_seconds = (now - published_at).total_seconds()

    # Reject future timestamps that are obviously wrong.
    if age_seconds < -(MAX_FUTURE_MINUTES * 60):
        return False

    # Reject old news.
    if age_seconds > MAX_NEWS_AGE_MINUTES * 60:
        return False

    return True


# =========================================================
# GEMINI TRANSLATION
# =========================================================

async def translate_to_persian(text: str) -> str:
    if not text:
        return ""

    if not gemini:
        raise RuntimeError("GEMINI_API_KEY is not configured.")

    prompt = f"""
Translate the following news text into natural, professional Persian.

Rules:
- Translate only.
- Do NOT summarize.
- Do NOT add information.
- Do NOT remove important information.
- Preserve names, organizations, places, numbers and dates accurately.
- Keep the meaning and tone of the original.
- Do not add an introduction such as "ترجمه:".
- Return only the Persian translation.

Text:
{text}
"""

    try:
        response = await asyncio.to_thread(
            gemini.models.generate_content,
            model=GEMINI_MODEL,
            contents=prompt,
        )

        result = (response.text or "").strip()

        if not result:
            raise RuntimeError("Gemini returned an empty translation.")

        return result

    except Exception:
        logging.exception("Gemini translation failed.")
        raise


async def translate_article(title: str, summary: str):
    translated_title = await translate_to_persian(title)

    translated_summary = ""

    if summary:
        translated_summary = await translate_to_persian(summary)

    return translated_title, translated_summary


# =========================================================
# CATEGORY
# =========================================================

def classify_category(title: str, summary: str, default_category: str) -> str:
    text = f"{title} {summary}".lower()

    iran_keywords = [
        "iran",
        "iranian",
        "tehran",
        "ایران",
        "ایرانی",
        "تهران",
    ]

    middle_east_keywords = [
        "israel",
        "palestine",
        "gaza",
        "lebanon",
        "syria",
        "iraq",
        "yemen",
        "saudi",
        "israel",
        "فلسطین",
        "غزه",
        "لبنان",
        "سوریه",
        "عراق",
        "یمن",
        "عربستان",
        "اسرائیل",
    ]

    if any(word in text for word in iran_keywords):
        return "Iran"

    if any(word in text for word in middle_east_keywords):
        return "Middle East"

    return default_category


# =========================================================
# MESSAGE
# =========================================================

def build_message(
    category,
    source,
    title,
    summary,
    url,
    published_at,
):
    icons = {
        "Iran": "🇮🇷",
        "Middle East": "🌍",
        "World": "🌐",
    }

    icon = icons.get(category, "📰")

    safe_title = html.escape(title)
    safe_summary = html.escape(summary)
    safe_source = html.escape(source)
    safe_url = html.escape(url, quote=True)

    lines = [
        f"{icon} <b>{safe_title}</b>",
    ]

    if safe_summary:
        lines.extend(
            [
                "",
                safe_summary,
            ]
        )

    lines.extend(
        [
            "",
            f"📰 منبع: {safe_source}",
            f"🕒 زمان انتشار: {published_at.strftime('%Y-%m-%d %H:%M UTC')}",
            "",
            f"🔗 <a href=\"{safe_url}\">مشاهده خبر اصلی</a>",
        ]
    )

    return "\n".join(lines)


# =========================================================
# FETCH
# =========================================================

async def fetch_feed(category, source, feed_url):
    if not feed_url:
        return []

    try:
        parsed = await asyncio.to_thread(
            feedparser.parse,
            feed_url,
        )

        entries = parsed.entries[:MAX_ITEMS_PER_FEED]

        return [
            (category, source, entry)
            for entry in entries
        ]

    except Exception:
        logging.exception(
            "Feed failed: %s",
            source,
        )
        return []


# =========================================================
# PUBLISH
# =========================================================

async def publish_item(
    bot,
    category,
    source,
    entry,
):
    url = entry.get("link", "").strip()
    original_title = clean_text(entry.get("title", ""))
    original_summary = extract_summary(entry)

    if not url or not original_title:
        return False

    # Never publish old news.
    if not news_is_fresh(entry):
        return False

    fp = fingerprint(
        original_title,
        url,
    )

    if already_published(fp):
        return False

    published_at = parse_entry_datetime(entry)

    if not published_at:
        return False

    # Determine topic before translation.
    category = classify_category(
        original_title,
        original_summary,
        category,
    )

    topic_id = TOPIC_IDS.get(category, 0)

    if not topic_id:
        logging.warning(
            "Topic ID missing for category: %s",
            category,
        )
        return False

    # Translate title + existing RSS description.
    translated_title, translated_summary = await translate_article(
        original_title,
        original_summary,
    )

    detected_at = datetime.now(timezone.utc)

    latency = (
        detected_at - published_at
    ).total_seconds()

    logging.info(
        "News detected | source=%s | latency=%ss | title=%s",
        source,
        round(latency, 1),
        original_title,
    )

    message = build_message(
        category=category,
        source=source,
        title=translated_title,
        summary=translated_summary,
        url=url,
        published_at=published_at,
    )

    sent = await bot.send_message(
        chat_id=CHAT_ID,
        message_thread_id=topic_id,
        text=message,
        parse_mode=ParseMode.HTML,
        disable_web_page_preview=False,
    )

    mark_published(
        fingerprint=fp,
        title=original_title,
        url=url,
        source=source,
        category=category,
        published_at=published_at.isoformat(),
        detected_at=detected_at.isoformat(),
        telegram_message_id=sent.message_id,
    )

    logging.info(
        "Published [%s] [%s] %s",
        category,
        source,
        translated_title,
    )

    return True


# =========================================================
# POLLING
# =========================================================

async def poll():
    if not BOT_TOKEN:
        raise RuntimeError("BOT_TOKEN is missing.")

    if not CHAT_ID:
        raise RuntimeError("GROUP_CHAT_ID is missing.")

    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is missing.")

    bot = Bot(BOT_TOKEN)

    tasks = []

    for category, sources in FEEDS.items():
        for source, feed_url in sources:

            if not feed_url:
                continue

            tasks.append(
                fetch_feed(
                    category,
                    source,
                    feed_url,
                )
            )

    batches = await asyncio.gather(
        *tasks,
        return_exceptions=True,
    )

    candidates = []

    for batch in batches:
        if isinstance(batch, Exception):
            logging.exception(
                "Feed batch failed",
                exc_info=batch,
            )
            continue

        candidates.extend(batch)

    # Newest first.
    candidates.sort(
        key=lambda item: (
            parse_entry_datetime(item[2])
            or datetime.min.replace(tzinfo=timezone.utc)
        ),
        reverse=True,
    )

    published_count = 0

    for category, source, entry in candidates:

        if published_count >= MAX_PUBLISH_PER_CYCLE:
            break

        try:
            published = await publish_item(
                bot,
                category,
                source,
                entry,
            )

            if published:
                published_count += 1

                if POST_DELAY_SECONDS > 0:
                    await asyncio.sleep(
                        POST_DELAY_SECONDS
                    )

        except Exception:
            logging.exception(
                "Failed publishing item from %s",
                source,
            )

    logging.info(
        "Polling finished. Published=%s",
        published_count,
    )


# =========================================================
# MAIN
# =========================================================

async def main():
    if not BOT_TOKEN:
        raise RuntimeError("BOT_TOKEN is missing.")

    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is missing.")

    bot = Bot(BOT_TOKEN)

    me = await bot.get_me()

    logging.info(
        "Bot authenticated: @%s",
        me.username,
    )

    if os.getenv("RUN_ONCE", "0").strip() == "1":
        await poll()
        return

    scheduler = AsyncIOScheduler()

    scheduler.add_job(
        poll,
        "interval",
        minutes=POLL_MINUTES,
        max_instances=1,
        coalesce=True,
    )

    scheduler.start()

    await poll()

    await asyncio.Event().wait()


if __name__ == "__main__":
    asyncio.run(main())
