# Nabz Telegram News Bot

نسخه اولیه ربات خبری «نبض» برای انتشار خبر در سه Topic:
- Iran
- Middle East
- World

## راه‌اندازی

1. یک Bot جدید/توکن جدید از BotFather بگیرید.
2. ربات را به گروه اضافه کنید و دسترسی ارسال پیام داشته باشد.
3. مقدارهای `.env.example` را در `.env` کپی و تکمیل کنید.
4. مقدار `GROUP_CHAT_ID` را با Chat ID گروه و سه مقدار `TOPIC_*` را با `message_thread_id` واقعی Topicها پر کنید.
5. نصب:
   `pip install -r requirements.txt`
6. اجرا:
   `python bot.py`

## نکته
این نسخه عمداً ترجمه و خلاصه‌سازی هوش مصنوعی را به API کلیددار متصل نکرده است تا توکن/API شما داخل GitHub قرار نگیرد. مرحله بعد می‌تواند یک provider ترجمه/LLM را از طریق Environment Variables اضافه کند.

## تست اتصال
قبل از scheduler، ربات با `get_me()` احراز هویت می‌شود. اگر توکن غلط باشد برنامه همان ابتدا خطا می‌دهد.
