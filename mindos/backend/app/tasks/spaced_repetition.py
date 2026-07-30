import logging
from datetime import datetime, timezone
from app.core.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="app.tasks.spaced_repetition.check_due_reviews")
def check_due_reviews():
    """
    Har 15 daqiqada — yangi due bo'lgan SR kartochkalar uchun
    notifikatsiya yuborish kerak bo'lgan foydalanuvchilarni tekshiradi
    """
    import asyncio
    asyncio.run(_check_due_reviews_async())


async def _check_due_reviews_async():
    from app.core.database import AsyncSessionLocal
    from app.models.user import User, SpacedItem, Notification, NotificationChannel
    from sqlalchemy import select, func, and_
    from datetime import timedelta

    async with AsyncSessionLocal() as db:
        now = datetime.now(timezone.utc)
        # Faqat oxirgi 15 daqiqada due bo'lganlarni olish — qayta yuborilmasin
        window_start = now - timedelta(minutes=15)

        result = await db.execute(
            select(SpacedItem.user_id, func.count(SpacedItem.id).label("cnt"))
            .where(
                SpacedItem.next_review_at <= now,
                SpacedItem.next_review_at > window_start,
            )
            .group_by(SpacedItem.user_id)
        )
        rows = result.all()

        for user_id, count in rows:
            user_result = await db.execute(select(User).where(User.id == user_id))
            user = user_result.scalar_one_or_none()
            if not user or not user.notify_sr or not user.telegram_id:
                continue

            from app.tasks.notifications import _send_telegram
            await _send_telegram(
                user.telegram_id,
                f"📋 {count} ta kartochka takrorlash vaqti keldi!\n\n"
                f"Unutishdan oldin mustahkamlab oling — bu 2 daqiqa vaqt oladi."
            )

            notif = Notification(
                user_id=user_id,
                notification_type="sr",
                channel=NotificationChannel.telegram,
                content=f"{count} ta kartochka due",
                sent_at=now,
                status="sent",
            )
            db.add(notif)
            logger.info(f"SR notification sent: user={user_id}, count={count}")

        await db.commit()
