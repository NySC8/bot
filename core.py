import hashlib, html, re
from urllib.parse import urlparse

def clean_text(value):
    value = html.unescape(value or "")
    value = re.sub(r"<[^>]+>", " ", value)
    return re.sub(r"\s+", " ", value).strip()

def fingerprint(title, url):
    key = f"{clean_text(title).lower()}|{urlparse(url).netloc}|{url}".encode()
    return hashlib.sha256(key).hexdigest()

def build_message(category, source, title, summary, url):
    title, summary = clean_text(title), clean_text(summary)
    if len(summary) > 900:
        summary = summary[:897].rsplit(" ", 1)[0] + "..."
    parts = [f"📰 <b>{html.escape(title)}</b>", ""]
    if summary:
        parts += [html.escape(summary), ""]
    parts += [
        f"🌐 <b>منبع:</b> {html.escape(source)}",
        f'🔗 <a href="{html.escape(url, quote=True)}">مشاهده گزارش اصلی</a>',
        "",
        f"#{category.replace(' ', '_')}"
    ]
    return "\n".join(parts)
