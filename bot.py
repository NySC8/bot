import asyncio
import logging
import os
import sqlite3

import feedparser
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from dotenv import load_dotenv
from telegram import Bot
from telegram.constants import ParseMode

from core import clean_text, fingerprint, build_message


# --------------------------------------------------
# CONFIG
# --------------------------------------------------

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s"
)

BOT_TOKEN = os.getenv("BOT_TOKEN", "").strip()
GROUP_CHAT_ID = os.getenv("GROUP_CHAT_ID", "").strip()

POLL_MINUTES = int(os.getenv("POLL_MINUTES", "10"))
MAX_ITEMS_PER_FEED = int(os.getenv("MAX_ITEMS_PER_FEED", "8"))

DB_PATH = os.getenv("DB_PATH", "nabz.db")


# --------------------------------------------------
# TELEGRAM CHAT ID
# --------------------------------------------------

def normalize_chat_id(value: str):
    """
    Converts Telegram internal IDs such as:

    4352824876

    into Bot API supergroup IDs:

    -1004352824876
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


# --------------------------------------------------
# TELEGRAM TOPICS
# --------------------------------------------------

TOPIC_IDS = {
    "Iran": int(os.getenv("TOPIC_IRAN", "0")),
    "Middle East": int(os.getenv("TOPIC_MIDDLE_EAST", "0")),
    "World": int(os.getenv("TOPIC_WORLD", "0")),
}


# --------------------------------------------------
# RSS FEEDS
# --------------------------------------------------

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
    ],
}


# --------------------------------------------------
# DATABASE
# --------------------------------------------------

def get_db():
    conn = sqlite3.connect(DB_PATH)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS published (
            fingerprint TEXT PRIMARY KEY,
            title TEXT,
            url TEXT,
            category TEXT,
            published_at TEXT
        )
    """)

    conn.commit()

    return conn


def already_published(fp):
    """
    Checks whether a news item has already been published.
    """

    conn = get_db()

    try:
        cursor = conn.execute(
            "SELECT 1 FROM published WHERE fingerprint = ? LIMIT 1",
            (fp,)
        )

        return cursor.fetchone() is not None

    finally:
        conn.close()


def mark_published(fp, title, url, category):
    """
    Saves a successfully published news item.
    """

    conn = get_db()

    try:
        conn.execute(
            """
            INSERT OR IGNORE INTO published
            (
                fingerprint,
                title,
                url,
                category,
                published_at
            )
            VALUES (?, ?, ?, ?, datetime('now'))
            """,
            (
                fp,
                title,
                url,
                category,
            )
        )

        conn.commit()

    finally:
        conn.close()


# --------------------------------------------------
# SUMMARY EXTRACTION
# --------------------------------------------------

def extract_summary(entry):
    """
    Extracts the RSS summary/description.

    Different RSS feeds use different fields, so we
    check several common formats.
    """

    possible_fields = [
        "summary",
        "description",
        "subtitle",
        "content",
    ]

    for field in possible_fields:

        value = entry.get(field, "")

        if isinstance(value, list):

            texts = []

            for item in value:

                if isinstance(item, dict):
                    text = item.get("value", "")
                else:
                    text = str(item)

                if text:
                    texts.append(text)

            value = " ".join(texts)

        if value:
            value = clean_text(value)

            if value:
                return value

    return ""


# --------------------------------------------------
# FETCH RSS
# --------------------------------------------------

async def fetch_feed(category, source, feed_url):

    try:

        logging.info(
            "Fetching %s - %s",
            source,
            feed_url
        )

        parsed = await asyncio.to_thread(
            feedparser.parse,
            feed_url
        )

        if getattr(parsed, "bozo", False):
            logging.warning(
                "Feed warning for %s: %s",
                source,
                getattr(parsed, "bozo_exception", "")
            )

        entries = parsed.entries[:MAX_ITEMS_PER_FEED]

        logging.info(
            "Found %s items from %s",
            len(entries),
            source
        )

        return [
            (category, source, entry)
            for entry in entries
        ]

    except Exception:

        logging.exception(
            "Feed failed: %s",
            feed_url
        )

        return []


# --------------------------------------------------
# PUBLISH NEWS
# --------------------------------------------------

async def publish_item(
    bot,
    category,
    source,
    entry
):

    topic_id = TOPIC_IDS.get(category, 0)

    if not topic_id:

        logging.warning(
            "Topic ID missing for %s. Skipping.",
            category
        )

        return

    url = clean_text(
        entry.get("link", "")
    )

    title = clean_text(
        entry.get("title", "")
    )

    if not url or not title:

        logging.warning(
            "Invalid RSS item from %s",
            source
        )

        return

    fp = fingerprint(
        title,
        url
    )

    if already_published(fp):

        logging.info(
            "Already published: %s",
            title
        )

        return

    summary = extract_summary(entry)

    message = build_message(
        category,
        source,
        title,
        summary,
        url
    )

    try:

        await bot.send_message(
            chat_id=CHAT_ID,
            message_thread_id=topic_id,
            text=message,
            parse_mode=ParseMode.HTML,
            disable_web_page_preview=False,
        )

        mark_published(
            fp,
            title,
            url,
            category
        )

        logging.info(
            "Published [%s] %s",
            category,
            title
        )

    except Exception:

        logging.exception(
            "Telegram publish failed: %s",
            title
        )

        raise


# --------------------------------------------------
# POLL ALL SOURCES
# --------------------------------------------------

async def poll():

    if not BOT_TOKEN:

        raise RuntimeError(
            "BOT_TOKEN must be configured."
        )

    if not CHAT_ID:

        raise RuntimeError(
            "GROUP_CHAT_ID must be configured."
        )

    bot = Bot(BOT_TOKEN)

    tasks = []

    for category, sources in FEEDS.items():

        for source, feed_url in sources:

            tasks.append(
                fetch_feed(
                    category,
                    source,
                    feed_url
                )
            )

    batches = await asyncio.gather(
        *tasks,
        return_exceptions=True
    )

    for batch in batches:

        if isinstance(batch, Exception):

            logging.error(
                "Feed batch failed: %s",
                batch
            )

            continue

        for category, source, entry in batch:

            try:

                await publish_item(
                    bot,
                    category,
                    source,
                    entry
                )

                # Small delay to avoid hammering Telegram
                await asyncio.sleep(0.5)

            except Exception:

                logging.exception(
                    "Publish failed for %s",
                    source
                )


# --------------------------------------------------
# MAIN
# --------------------------------------------------

async def main():

    if not BOT_TOKEN:

        raise RuntimeError(
            "BOT_TOKEN is missing."
        )

    bot = Bot(BOT_TOKEN)

    # Verify bot token
    me = await bot.get_me()

    logging.info(
        "Bot authenticated: @%s",
        me.username
    )

    # RUN_ONCE=1 is useful for GitHub Actions testing
    if os.getenv("RUN_ONCE", "0").strip() == "1":

        logging.info(
            "RUN_ONCE enabled. Running one polling cycle."
        )

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

    logging.info(
        "Scheduler started. Polling every %s minutes.",
        POLL_MINUTES
    )

    # Run immediately instead of waiting for first interval
    await poll()

    # Keep application alive
    await asyncio.Event().wait()


# --------------------------------------------------
# ENTRY POINT
# --------------------------------------------------

if __name__ == "__main__":

    try:

        asyncio.run(main())

    except KeyboardInterrupt:

        logging.info(
            "Bot stopped."
        )
