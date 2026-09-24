import asyncio
import hashlib
import html
import logging
import os
import re
import sqlite3
from datetime import datetime, timezone, timedelta
from email.utils import parsedate_to_datetime
from urllib.parse import urlparse

import feedparser
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from dotenv import load_dotenv
from telegram import Bot
from telegram.constants import ParseMode


# ============================================================
# NABZ NEWS BOT
# ============================================================
#
# اهداف:
# - دریافت سریع خبر
# - جلوگیری از انتشار خبر قدیمی
# - جلوگیری از انتشار تکراری
# - چندمنبعی
# - دسته‌بندی موضوعی
# - آماده برای ترجمه/AI
# - کنترل سرعت انتشار
#
# ============================================================


load_dotenv()


# ============================================================
# LOGGING
# ============================================================

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
)

logger = logging.getLogger("nabz")


# ============================================================
# TELEGRAM
# ============================================================

BOT_TOKEN = os.getenv("BOT_TOKEN", "").strip()
GROUP_CHAT_ID = os.getenv("GROUP_CHAT_ID", "").strip()


def normalize_chat_id(value: str):
    """
    Converts:
        4352824876
    into:
        -1004352824876

    if the user entered the internal Telegram ID.
    """

    if not value:
        return value

    try:
        number = int(value)

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


# ============================================================
# SPEED / FRESHNESS
# ============================================================

# Check feeds every 2 minutes.
POLL_MINUTES = int(
    os.getenv("POLL_MINUTES", "2")
)

# Maximum age of a normal news item.
#
# Example:
# News published 1 minute ago -> ACCEPT
# News published 7 minutes ago -> ACCEPT
# News published 60 minutes ago -> REJECT
#
MAX_NEWS_AGE_MINUTES = int(
    os.getenv("MAX_NEWS_AGE_MINUTES", "10")
)

# Future-dated RSS items can sometimes appear because of
# timezone/feed errors. Allow a small clock difference.
MAX_FUTURE_MINUTES = int(
    os.getenv("MAX_FUTURE_MINUTES", "5")
)

# Maximum RSS entries examined per feed.
MAX_ITEMS_PER_FEED = int(
    os.getenv("MAX_ITEMS_PER_FEED", "15")
)

# Number of items that may be published during one polling cycle.
MAX_PUBLISH_PER_CYCLE = int(
    os.getenv("MAX_PUBLISH_PER_CYCLE", "6")
)

# Delay between Telegram posts.
POST_DELAY_SECONDS = float(
    os.getenv("POST_DELAY_SECONDS", "5")
)


# ============================================================
# DATABASE
# ============================================================

DB_PATH = os.getenv(
    "DB_PATH",
    "nabz.db"
)


def get_db():
    conn = sqlite3.connect(
        DB_PATH,
        timeout=30
    )

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

    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_published_url
        ON published(url)
        """
    )

    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_published_title
        ON published(title)
        """
    )

    conn.commit()

    return conn


def already_published(fingerprint):
    conn = get_db()

    try:
        result = conn.execute(
            """
            SELECT 1
            FROM published
            WHERE fingerprint = ?
            LIMIT 1
            """,
            (fingerprint,)
        ).fetchone()

        return result is not None

    finally:
        conn.close()


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
    conn = get_db()

    try:
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
            )
        )

        conn.commit()

    finally:
        conn.close()


# ============================================================
# TEXT UTILITIES
# ============================================================

def clean_text(value):
    if not value:
        return ""

    if isinstance(value, list):

        values = []

        for item in value:

            if isinstance(item, dict):
                item = item.get("value", "")

            if item:
                values.append(str(item))

        value = " ".join(values)

    value = html.unescape(str(value))

    value = re.sub(
        r"<script.*?</script>",
        " ",
        value,
        flags=re.I | re.S,
    )

    value = re.sub(
        r"<style.*?</style>",
        " ",
        value,
        flags=re.I | re.S,
    )

    value = re.sub(
        r"<[^>]+>",
        " ",
        value,
    )

    value = re.sub(
        r"\s+",
        " ",
        value,
    )

    return value.strip()


def extract_summary(entry):

    fields = [
        "summary",
        "description",
        "subtitle",
    ]

    for field in fields:

        value = entry.get(field, "")

        value = clean_text(value)

        if value:
            return value

    content = entry.get("content", "")

    if content:
        value = clean_text(content)

        if value:
            return value

    return ""


# ============================================================
# FINGERPRINT
# ============================================================

def make_fingerprint(title, url):
    normalized_title = clean_text(title).lower()

    parsed = urlparse(url)

    key = (
        normalized_title
        + "|"
        + parsed.netloc.lower()
        + "|"
        + url
    )

    return hashlib.sha256(
        key.encode("utf-8")
    ).hexdigest()


# ============================================================
# DATE PARSING
# ============================================================

def parse_entry_datetime(entry):

    # feedparser usually provides a parsed UTC structure.
    for field in (
        "published_parsed",
        "updated_parsed",
        "created_parsed",
    ):

        value = entry.get(field)

        if value:

            try:

                timestamp = datetime(
                    value.tm_year,
                    value.tm_mon,
                    value.tm_mday,
                    value.tm_hour,
                    value.tm_min,
                    value.tm_sec,
                    tzinfo=timezone.utc,
                )

                return timestamp

            except Exception:
                pass

    # Fallback to textual dates.
    for field in (
        "published",
        "updated",
        "created",
        "date",
    ):

        raw = entry.get(field)

        if not raw:
            continue

        try:

            parsed = parsedate_to_datetime(
                raw
            )

            if parsed.tzinfo is None:
                parsed = parsed.replace(
                    tzinfo=timezone.utc
                )

            return parsed.astimezone(
                timezone.utc
            )

        except Exception:
            continue

    return None


def news_is_fresh(entry):

    published_at = parse_entry_datetime(
        entry
    )

    if published_at is None:
        logger.warning(
            "News has no reliable publication date."
        )

        # IMPORTANT:
        # If a source doesn't provide a reliable date,
        # we do NOT publish it automatically.
        return False, None

    now = datetime.now(
        timezone.utc
    )

    age = (
        now - published_at
    ).total_seconds() / 60

    if age < -MAX_FUTURE_MINUTES:

        logger.warning(
            "Future-dated news rejected: %.1f min",
            age
        )

        return False, published_at

    if age > MAX_NEWS_AGE_MINUTES:

        logger.info(
            "Old news rejected: %.1f min old",
            age
        )

        return False, published_at

    return True, published_at


# ============================================================
# SOURCE CONFIGURATION
# ============================================================
#
# IMPORTANT:
# Category is based on the SUBJECT of the news,
# not the nationality of the source.
#
# For example:
# Reuters + Iran news -> Iran
# BBC + Iran news -> Iran
# Al Jazeera + Iran news -> Iran
#
# ============================================================


FEEDS = {

    "Iran": [

        (
            "ISNA",
            os.getenv(
                "RSS_ISNA",
                "https://www.isna.ir/rss"
            )
        ),

        (
            "Fars",
            os.getenv(
                "RSS_FARS",
                "https://www.farsnews.ir/rss"
            )
        ),

        (
            "BBC Persian",
            os.getenv(
                "RSS_BBC_PERSIAN",
                ""
            )
        ),

        (
            "Reuters Iran",
            os.getenv(
                "RSS_REUTERS_IRAN",
                ""
            )
        ),

        (
            "AP Iran",
            os.getenv(
                "RSS_AP_IRAN",
                ""
            )
        ),

    ],

    "Middle East": [

        (
            "Al Jazeera",
            os.getenv(
                "RSS_ALJAZEERA",
                "https://www.aljazeera.com/xml/rss/all.xml"
            )
        ),

        (
            "France 24",
            os.getenv(
                "RSS_FRANCE24",
                "https://www.france24.com/en/rss"
            )
        ),

        (
            "BBC Middle East",
            os.getenv(
                "RSS_BBC_MIDDLE_EAST",
                ""
            )
        ),

        (
            "Reuters Middle East",
            os.getenv(
                "RSS_REUTERS_MIDDLE_EAST",
                ""
            )
        ),

        (
            "AP Middle East",
            os.getenv(
                "RSS_AP_MIDDLE_EAST",
                ""
            )
        ),

    ],

    "World": [

        (
            "The Guardian",
            os.getenv(
                "RSS_GUARDIAN",
                "https://www.theguardian.com/world/rss"
            )
        ),

        (
            "France 24",
            os.getenv(
                "RSS_FRANCE24_WORLD",
                "https://www.france24.com/en/rss"
            )
        ),

        (
            "Reuters World",
            os.getenv(
                "RSS_REUTERS_WORLD",
                ""
            )
        ),

        (
            "AP World",
            os.getenv(
                "RSS_AP_WORLD",
                ""
            )
        ),

        (
            "BBC World",
            os.getenv(
                "RSS_BBC_WORLD",
                ""
            )
        ),

    ],
}


# ============================================================
# DISABLED EMPTY FEEDS
# ============================================================

def valid_feeds():

    result = {}

    for category, sources in FEEDS.items():

        result[category] = []

        for source, url in sources:

            if not url:
                continue

            result[category].append(
                (source, url)
            )

    return result


# ============================================================
# TOPIC CLASSIFICATION
# ============================================================

IRAN_KEYWORDS = [
    "iran",
    "iranian",
    "tehran",
    "persian",
    "ایران",
    "ایرانی",
    "تهران",
    "فارس",
]

MIDDLE_EAST_KEYWORDS = [
    "israel",
    "palestine",
    "gaza",
    "lebanon",
    "syria",
    "iraq",
    "yemen",
    "jordan",
    "saudi",
    "qatar",
    "bahrain",
    "kuwait",
    "uae",
    "emirates",
    "middle east",
    "اسرائیل",
    "فلسطین",
    "غزه",
    "لبنان",
    "سوریه",
    "عراق",
    "یمن",
    "اردن",
    "عربستان",
    "قطر",
    "بحرین",
    "کویت",
    "امارات",
    "خاورمیانه",
]


def classify_category(
    title,
    summary,
    default_category
):

    text = (
        clean_text(title)
        + " "
        + clean_text(summary)
    ).lower()

    # Iran gets first priority.
    for keyword in IRAN_KEYWORDS:

        if keyword.lower() in text:
            return "Iran"

    # Then Middle East.
    for keyword in MIDDLE_EAST_KEYWORDS:

        if keyword.lower() in text:
            return "Middle East"

    # Otherwise use source's default category.
    return default_category


# ============================================================
# TRANSLATION PLACEHOLDER
# ============================================================
#
# This function is intentionally separated.
#
# We can connect OpenAI / another translation provider here
# without touching the RSS/Telegram system.
#
# Until an API key is configured, the original text is used.
#
# ============================================================

async def translate_to_persian(text):

    text = clean_text(text)

    if not text:
        return ""

    # --------------------------------------------------------
    # AI translation will be connected here.
    # --------------------------------------------------------
    #
    # For now:
    # Return the source text unchanged.
    #
    # IMPORTANT:
    # Do NOT pretend this is a translation.
    #
    # --------------------------------------------------------

    return text


async def make_persian_content(
    title,
    summary
):

    translated_title = await translate_to_persian(
        title
    )

    translated_summary = await translate_to_persian(
        summary
    )

    return (
        translated_title,
        translated_summary
    )


# ============================================================
# MESSAGE BUILDER
# ============================================================

def build_message(
    category,
    source,
    title,
    summary,
    url,
    published_at,
):

    if category == "Iran":
        icon = "🇮🇷"

    elif category == "Middle East":
        icon = "🌍"

    else:
        icon = "🌐"

    parts = []

    parts.append(
        f"{icon} <b>{html.escape(category)}</b>"
    )

    parts.append("")

    parts.append(
        f"<b>{html.escape(title)}</b>"
    )

    if summary:

        parts.append("")

        if len(summary) > 900:

            summary = (
                summary[:897]
                .rsplit(" ", 1)[0]
                + "..."
            )

        parts.append(
            html.escape(summary)
        )

    parts.append("")

    parts.append(
        f"📰 <b>منبع:</b> "
        f"{html.escape(source)}"
    )

    if published_at:

        published_text = (
            published_at
            .astimezone()
            .strftime("%H:%M")
        )

        parts.append(
            f"🕐 <b>زمان انتشار:</b> "
            f"{published_text}"
        )

    parts.append("")

    parts.append(
        f'🔗 <a href="{html.escape(url, quote=True)}">'
        f"مشاهده گزارش اصلی"
        f"</a>"
    )

    parts.append("")

    parts.append(
        f"#{category.replace(' ', '_')}"
    )

    return "\n".join(parts)


# ============================================================
# FETCH ONE FEED
# ============================================================

async def fetch_feed(
    category,
    source,
    feed_url
):

    try:

        logger.info(
            "Checking: %s | %s",
            source,
            feed_url
        )

        parsed = await asyncio.to_thread(
            feedparser.parse,
            feed_url
        )

        if getattr(
            parsed,
            "bozo",
            False
        ):

            logger.warning(
                "Feed warning: %s",
                source
            )

        entries = list(
            parsed.entries[:MAX_ITEMS_PER_FEED]
        )

        logger.info(
            "%s -> %d entries",
            source,
            len(entries)
        )

        return [
            (
                category,
                source,
                entry
            )
            for entry in entries
        ]

    except Exception:

        logger.exception(
            "Feed failed: %s",
            source
        )

        return []


# ============================================================
# PUBLISH ONE NEWS ITEM
# ============================================================

async def publish_item(
    bot,
    category,
    source,
    entry
):

    url = clean_text(
        entry.get(
            "link",
            ""
        )
    )

    title = clean_text(
        entry.get(
            "title",
            ""
        )
    )

    summary = extract_summary(
        entry
    )

    if not url or not title:

        return False

    # --------------------------------------------------------
    # FRESHNESS CHECK
    # --------------------------------------------------------

    fresh, published_at = news_is_fresh(
        entry
    )

    if not fresh:

        return False

    # --------------------------------------------------------
    # CLASSIFICATION
    # --------------------------------------------------------

    final_category = classify_category(
        title,
        summary,
        category
    )

    topic_id = TOPIC_IDS.get(
        final_category,
        0
    )

    if not topic_id:

        logger.warning(
            "Topic missing: %s",
            final_category
        )

        return False

    # --------------------------------------------------------
    # DUPLICATE CHECK
    # --------------------------------------------------------

    fp = make_fingerprint(
        title,
        url
    )

    if already_published(fp):

        logger.info(
            "Duplicate skipped: %s",
            title
        )

        return False

    # --------------------------------------------------------
    # TRANSLATION
    # --------------------------------------------------------

    (
        translated_title,
        translated_summary
    ) = await make_persian_content(
        title,
        summary
    )

    # --------------------------------------------------------
    # MESSAGE
    # --------------------------------------------------------

    message = build_message(
        final_category,
        source,
        translated_title,
        translated_summary,
        url,
        published_at,
    )

    # --------------------------------------------------------
    # SEND
    # --------------------------------------------------------

    try:

        sent = await bot.send_message(
            chat_id=CHAT_ID,
            message_thread_id=topic_id,
            text=message,
            parse_mode=ParseMode.HTML,
            disable_web_page_preview=False,
        )

        detected_at = datetime.now(
            timezone.utc
        ).isoformat()

        mark_published(
            fingerprint=fp,
            title=title,
            url=url,
            source=source,
            category=final_category,
            published_at=(
                published_at.isoformat()
                if published_at
                else ""
            ),
            detected_at=detected_at,
            telegram_message_id=sent.message_id,
        )

        logger.info(
            "PUBLISHED [%s] [%s] %s",
            final_category,
            source,
            title
        )

        return True

    except Exception:

        logger.exception(
            "Telegram publish failed: %s",
            title
        )

        return False


# ============================================================
# POLL
# ============================================================

async def poll():

    if not BOT_TOKEN:
        raise RuntimeError(
            "BOT_TOKEN is missing."
        )

    if not CHAT_ID:
        raise RuntimeError(
            "GROUP_CHAT_ID is missing."
        )

    bot = Bot(
        token=BOT_TOKEN
    )

    sources = valid_feeds()

    tasks = []

    for category, feeds in sources.items():

        for source, url in feeds:

            tasks.append(
                fetch_feed(
                    category,
                    source,
                    url
                )
            )

    if not tasks:

        logger.warning(
            "No RSS feeds configured."
        )

        return

    batches = await asyncio.gather(
        *tasks,
        return_exceptions=True
    )

    # --------------------------------------------------------
    # Collect all news.
    # --------------------------------------------------------

    all_items = []

    for batch in batches:

        if isinstance(
            batch,
            Exception
        ):

            logger.error(
                "Feed batch error: %s",
                batch
            )

            continue

        all_items.extend(
            batch
        )

    # --------------------------------------------------------
    # Sort newest first.
    # --------------------------------------------------------

    def sort_key(item):

        try:

            entry = item[2]

            date = parse_entry_datetime(
                entry
            )

            if date:
                return date.timestamp()

        except Exception:
            pass

        return 0

    all_items.sort(
        key=sort_key,
        reverse=True
    )

    # --------------------------------------------------------
    # Publish only a controlled number per cycle.
    # --------------------------------------------------------

    published_count = 0

    for (
        category,
        source,
        entry
    ) in all_items:

        if (
            published_count
            >= MAX_PUBLISH_PER_CYCLE
        ):
            break

        try:

            published = await publish_item(
                bot,
                category,
                source,
                entry
            )

            if published:

                published_count += 1

                await asyncio.sleep(
                    POST_DELAY_SECONDS
                )

        except Exception:

            logger.exception(
                "Unexpected item error."
            )

    logger.info(
        "Cycle complete. Published: %d",
        published_count
    )


# ============================================================
# MAIN
# ============================================================

async def main():

    if not BOT_TOKEN:

        raise RuntimeError(
            "BOT_TOKEN is missing."
        )

    bot = Bot(
        token=BOT_TOKEN
    )

    # --------------------------------------------------------
    # Verify Telegram connection.
    # --------------------------------------------------------

    me = await bot.get_me()

    logger.info(
        "Authenticated as @%s",
        me.username
    )

    # --------------------------------------------------------
    # RUN_ONCE mode
    # --------------------------------------------------------

    if os.getenv(
        "RUN_ONCE",
        "0"
    ).strip() == "1":

        logger.info(
            "RUN_ONCE enabled."
        )

        await poll()

        return

    # --------------------------------------------------------
    # Scheduler
    # --------------------------------------------------------

    scheduler = AsyncIOScheduler()

    scheduler.add_job(
        poll,
        "interval",
        minutes=POLL_MINUTES,
        max_instances=1,
        coalesce=True,
    )

    scheduler.start()

    logger.info(
        "Nabz started."
    )

    logger.info(
        "Polling interval: %d minutes",
        POLL_MINUTES
    )

    logger.info(
        "Maximum news age: %d minutes",
        MAX_NEWS_AGE_MINUTES
    )

    # --------------------------------------------------------
    # First scan immediately.
    # --------------------------------------------------------

    await poll()

    # --------------------------------------------------------
    # Keep process alive.
    # --------------------------------------------------------

    await asyncio.Event().wait()


# ============================================================
# ENTRY POINT
# ============================================================

if __name__ == "__main__":

    try:

        asyncio.run(
            main()
        )

    except KeyboardInterrupt:

        logger.info(
            "Nabz stopped."
        )
