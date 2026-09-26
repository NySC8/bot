# Nabz final

این بسته نسخه نهایی Worker است.

## لازم است
- Secret: `BOT_TOKEN`
- KV binding: `SEEN` با همان KV قبلی
- Workers AI binding: `AI`

## Telegram PV
مسیر `/telegram` وبهوک Telegram است. برای اینکه لازم نباشد URL را دستی داخل BotFather وارد کنی، فقط بعد از Deploy یک بار URL زیر را باز کن:

`https://YOUR-WORKER-URL/health`

Worker همان لحظه `getMe` را تست می‌کند و webhook را روی `/telegram` تنظیم می‌کند. بعد از آن `/start` باید بلافاصله جواب بگیرد.

## زمان خبر
هر منبع تقریباً هر ۲ دقیقه یک بار بررسی می‌شود. خبر فقط اگر سن آن حداقل ۲ و حداکثر ۵ دقیقه باشد، وارد پردازش می‌شود. هیچ خلاصه‌سازی تولید نمی‌شود؛ عنوان و توضیحات موجود فقط ترجمه می‌شوند.

## تست
- `/health` اتصال Telegram، AI، KV و webhook را بررسی و webhook را تنظیم می‌کند.
- `/test-telegram` فقط `getMe` را تست می‌کند.
- Cron محلی: `npx wrangler dev` سپس `curl "http://localhost:8787/cdn-cgi/local/scheduled?format=json"`

## wrangler.jsonc
در `wrangler.jsonc` مقدار `REPLACE_WITH_YOUR_EXISTING_KV_ID` را با ID همان KV فعلی جایگزین کن؛ اگر فایل قبلی ID واقعی دارد، همان را حفظ کن.
