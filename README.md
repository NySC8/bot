# Nabz — Cloudflare Worker

نسخه Cloudflare ربات خبری نبض.

ویژگی‌ها:
- Cron هر ۱ دقیقه
- دریافت RSS
- فقط خبرهای تازه
- جلوگیری از تکرار با Workers KV
- ترجمه عنوان و توضیح موجود با Gemini
- بدون خلاصه‌سازی یا تولید خبر
- ارسال به تاپیک‌های ایران، خاورمیانه و جهان

Secrets لازم:
BOT_TOKEN
GROUP_CHAT_ID
TOPIC_IRAN
TOPIC_MIDDLE_EAST
TOPIC_WORLD
GEMINI_API_KEY

نکته: اجرای هر دقیقه، هدف حدود ۲ دقیقه‌ای را ممکن می‌کند اما زمان دقیق ۲ دقیقه تضمین‌شده نیست.
