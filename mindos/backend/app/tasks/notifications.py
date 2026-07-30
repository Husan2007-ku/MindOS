import logging
from datetime import datetime, timezone, timedelta
from app.core.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="app.tasks.notifications.check_streak_danger")
def check_streak_danger():
    """
    Har kuni 21:00 UTC — streak xavfda bo'lgan foydalanuvchilarga ogohlantirish
    """
    import asyncio
    asyncio.run(_check_streak_danger_async())


async def _check_streak_danger_async():
    from app.core.database import AsyncSessionLocal
    from app.models.user import User
    from sqlalchemy import select
    import pytz

    async with AsyncSessionLocal() as db:
        now = datetime.now(timezone.utc)
        danger_threshold = now - timedelta(hours=20)  # 20 soatdan oshgan

        result = await db.execute(
            select(User).where(
                User.is_active == True,
                User.streak > 0,
                User.notify_streak == True,
                User.last_active <= danger_threshold,
            )
        )
        users = result.scalars().all()

        for user in users:
            await _send_streak_danger(user)
            logger.info(f"Streak danger notification: user={user.id}, streak={user.streak}")


async def _send_streak_danger(user):
    if user.telegram_id:
        await _send_telegram(
            user.telegram_id,
            f"⚡ Streak xavfda!\n\n"
            f"Sening {user.streak} kunlik streaking bugun uzilishi mumkin!\n"
            f"Bir dars qilsang, streak saqlanadi. Keling! 💪"
        )


@celery_app.task(name="app.tasks.notifications.send_daily_reminder")
def send_daily_reminder(user_id: int):
    """Foydalanuvchining belgilangan vaqtida kunlik eslatma"""
    import asyncio
    asyncio.run(_send_daily_reminder_async(user_id))


async def _send_daily_reminder_async(user_id: int):
    from app.core.database import AsyncSessionLocal
    from app.models.user import User, SpacedItem
    from sqlalchemy import select, func

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user or not user.telegram_id:
            return

        now = datetime.now(timezone.utc)
        sr_result = await db.execute(
            select(func.count(SpacedItem.id)).where(
                SpacedItem.user_id == user_id,
                SpacedItem.next_review_at <= now,
            )
        )
        sr_count = sr_result.scalar() or 0

        streak_emoji = "🔥" if user.streak >= 7 else "📚"
        msg = (
            f"{streak_emoji} Salom! Bugungi dars vaqti keldi.\n\n"
            f"🎯 Streak: {user.streak} kun\n"
        )
        if sr_count > 0:
            msg += f"📋 {sr_count} ta kartochka takrorlashni kutmoqda\n"
        msg += "\nMindOS ga kiring va davom eting! 💪"

        await _send_telegram(user.telegram_id, msg)


async def _send_telegram(telegram_id: str, text: str):
    """Telegram xabar yuborish"""
    from app.core.config import settings
    import httpx

    if not settings.TELEGRAM_BOT_TOKEN:
        logger.warning("TELEGRAM_BOT_TOKEN sozlanmagan")
        return

    url = f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/sendMessage"
    async with httpx.AsyncClient() as client:
        try:
            await client.post(url, json={
                "chat_id": telegram_id,
                "text": text,
                "parse_mode": "HTML",
            })
        except Exception as e:
            logger.error(f"Telegram yuborishda xato: {e}")
