"""
Celery/Redis'siz yengil kunlik eslatma + streak-xavf tekshiruvi.

Hakaton bosqichida qo'shimcha Render worker/Redis xarajatiga ehtiyoj
qoldirmaslik uchun to'liq Celery+RedBeat infratuzilmasi (app/core/celery_app.py,
app/tasks/notifications.py) o'rniga — Render Cron Job orqali soatiga bir marta
ishga tushiriladigan yengil skript. Har bir foydalanuvchi uchun o'z
timezone'i asosida mahalliy soatni notify_time bilan solishtiradi.

Ishga tushirish: python -m app.tasks.run_cron_tick
"""
import asyncio
import logging
from datetime import datetime, timezone, timedelta

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def _send_telegram(telegram_id: str, text: str):
    from app.core.config import settings
    import httpx

    if not settings.TELEGRAM_BOT_TOKEN:
        return
    url = f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/sendMessage"
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            await client.post(url, json={"chat_id": telegram_id, "text": text, "parse_mode": "HTML"})
        except Exception as e:
            logger.error(f"Telegram yuborishda xato: {e}")


async def run_daily_reminders():
    import pytz
    from sqlalchemy import select, func
    from app.core.database import AsyncSessionLocal
    from app.models.user import User, SpacedItem

    now_utc = datetime.now(timezone.utc)

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(User).where(
                User.is_active == True,
                User.notify_daily == True,
                User.telegram_id.isnot(None),
            )
        )
        users = result.scalars().all()

        for user in users:
            try:
                user_tz = pytz.timezone(user.timezone or "Asia/Tashkent")
            except Exception:
                user_tz = pytz.timezone("Asia/Tashkent")
            local_now = now_utc.astimezone(user_tz)
            notify_hour = int((user.notify_time or "09:00").split(":")[0])

            if local_now.hour != notify_hour:
                continue
            if user.last_daily_reminder_at and (now_utc - user.last_daily_reminder_at) < timedelta(hours=20):
                continue

            sr_result = await db.execute(
                select(func.count(SpacedItem.id)).where(
                    SpacedItem.user_id == user.id,
                    SpacedItem.next_review_at <= now_utc,
                )
            )
            sr_count = sr_result.scalar() or 0

            streak_emoji = "🔥" if user.streak >= 7 else "📚"
            msg = f"{streak_emoji} Salom! Bugungi dars vaqti keldi.\n\n🎯 Streak: {user.streak} kun\n"
            if sr_count > 0:
                msg += f"📋 {sr_count} ta kartochka takrorlashni kutmoqda\n"
            msg += "\nMindOS ga kiring va davom eting! 💪"

            await _send_telegram(user.telegram_id, msg)
            user.last_daily_reminder_at = now_utc
            logger.info(f"Kunlik eslatma yuborildi: user={user.id}")

        await db.commit()


async def run_streak_danger_check():
    from sqlalchemy import select
    from app.core.database import AsyncSessionLocal
    from app.models.user import User

    now_utc = datetime.now(timezone.utc)
    danger_threshold = now_utc - timedelta(hours=20)

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(User).where(
                User.is_active == True,
                User.streak > 0,
                User.notify_streak == True,
                User.telegram_id.isnot(None),
                User.last_active <= danger_threshold,
            )
        )
        users = result.scalars().all()

        for user in users:
            await _send_telegram(
                user.telegram_id,
                f"⚡ Streak xavfda!\n\nSening {user.streak} kunlik streaking bugun uzilishi mumkin!\n"
                f"Bir dars qilsang, streak saqlanadi. Keling! 💪",
            )
            logger.info(f"Streak xavf ogohlantirishi yuborildi: user={user.id}")


async def main():
    await run_daily_reminders()
    await run_streak_danger_check()


if __name__ == "__main__":
    asyncio.run(main())
