import asyncio
import hashlib
import html
import logging
import os
import re
import sqlite3
from datetime import datetime, timezone
from urllib.parse import urlparse

import feedparser
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from dotenv import load_dotenv
from telegram import Bot
from telegram.constants import ParseMode

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

BOT_TOKEN = os.getenv("BOT_TOKEN", "").strip()
GROUP_CHAT_ID = os.getenv("GROUP_CHAT_ID", "").strip()
# Telegram Bot API group/supergroup IDs are negative. If the value came from a t.me/c/... link,
# convert the positive internal ID to the Bot API form automatically.
def normalize_chat_id(value: str):
    if not value:
        return value
    try:
        n = int(value)
        if n > 0:
            return int(f"-100{n}")
        return n
    except ValueError:
        return value

CHAT_ID = normalize_chat_id(GROUP_CHAT_ID)
POLL_MINUTES = int(os.getenv("POLL_MINUTES", "10"))
MAX_ITEMS_PER_FEED = int(os.getenv("MAX_ITEMS_PER_FEED", "8"))

# Replace these RSS URLs with the feeds you want to use.
FEEDS = {
    "Iran": [
        ("ISNA", os.getenv("RSS_ISNA", "https://www.isna.ir/rss")),
        ("Fars", os.getenv("RSS_FARS", "https://www.farsnews.ir/rss")),
    ],
    "Middle East": [
        ("Al Jazeera", os.getenv("RSS_ALJAZEERA", "https://www.aljazeera.com/xml/rss/all.xml")),
        ("France 24", os.getenv("RSS_FRANCE24", "https://www.france24.com/en/rss")),
    ],
    "World": [
        ("The Guardian", os.getenv("RSS_GUARDIAN", "https://www.theguardian.com/world/rss")),
        ("France 24", os.getenv("RSS_FRANCE24_WORLD", "https://www.france24.com/en/rss")),
    ],
}

# Set these after checking the actual Telegram topic IDs.
TOPIC_IDS = {
    "Iran": int(os.getenv("TOPIC_IRAN", "0")),
    "Middle East": int(os.getenv("TOPIC_MIDDLE_EAST", "0")),
    "World": int(os.getenv("TOPIC_WORLD", "0")),
}

DB_PATH = os.getenv("DB_PATH", "nabz.db")

def db():
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

from core import clean_text, fingerprint, build_message

async def fetch_feed(category, source, feed_url):
    try:
        parsed = await asyncio.to_thread(feedparser.parse, feed_url)
        entries = parsed.entries[:MAX_ITEMS_PER_FEED]
        return [(category, source, e) for e in entries]
    except Exception:
        logging.exception("Feed failed: %s", feed_url)
        return []

async def publish_item(bot, category, source, entry):
    topic_id = TOPIC_IDS.get(category, 0)
    if not topic_id:
        logging.warning("Topic ID missing for %s; skipping.", category)
        return

    url = entry.get("link", "").strip()
    title = clean_text(entry.get("title", ""))
    if not url or not title:
        return

    fp = fingerprint(title, url)
    if already_published(fp):
        return

    message = build_message(category, source, title, extract_summary(entry), url)
    await bot.send_message(
        chat_id=CHAT_ID,
        message_thread_id=topic_id,
        text=message,
        parse_mode=ParseMode.HTML,
        disable_web_page_preview=False,
    )
    mark_published(fp, title, url, category)
    logging.info("Published [%s] %s", category, title)

async def poll():
    if not BOT_TOKEN or not CHAT_ID:
        raise RuntimeError("BOT_TOKEN and GROUP_CHAT_ID must be configured.")

    bot = Bot(BOT_TOKEN)
    tasks = []
    for category, sources in FEEDS.items():
        for source, url in sources:
            tasks.append(fetch_feed(category, source, url))

    batches = await asyncio.gather(*tasks)
    for batch in batches:
        for category, source, entry in batch:
            try:
                await publish_item(bot, category, source, entry)
                await asyncio.sleep(0.5)
            except Exception:
                logging.exception("Publish failed")

async def main():
    # Validate credentials before entering the scheduler loop.
    bot = Bot(BOT_TOKEN)
    me = await bot.get_me()
    logging.info("Bot authenticated: @%s", me.username)

    if os.getenv("RUN_ONCE", "0").strip() == "1":
        await poll()
        return

    scheduler = AsyncIOScheduler()
    scheduler.add_job(poll, "interval", minutes=POLL_MINUTES, max_instances=1)
    scheduler.start()

    await poll()
    await asyncio.Event().wait()

if __name__ == "__main__":
    asyncio.run(main())
