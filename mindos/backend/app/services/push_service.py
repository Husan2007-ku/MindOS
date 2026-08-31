"""
Web Push notification service.

Bu servis PushSubscription orqali foydalanuvchi brauzeriga to'g'ridan-to'g'ri
bildirishnoma yuboradi (Telegram bog'lanishidan mustaqil ravishda ishlaydi).

pywebpush kutubxonasi VAPID protokolini ishlatadi:
- VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY: bir marta generatsiya qilingan EC (P-256) kalit juftligi
- VAPID_CLAIM_EMAIL: murojaat manzili ("mailto:..." formatida yuboriladi)

Agar subscription endi amal qilmasa (foydalanuvchi ruxsatni bekor qilgan yoki
brauzer keshni tozalagan bo'lsa), push provayder 404/410 qaytaradi — bunday
holatda yozuvni bazadan avtomatik o'chiramiz.
"""
import json
import logging

from pywebpush import webpush, WebPushException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.user import PushSubscription

logger = logging.getLogger(__name__)


async def send_push_to_user(db: AsyncSession, user_id: int, title: str, body: str, url: str = "/") -> int:
    """
    Berilgan foydalanuvchining barcha faol push obunalariga bildirishnoma yuboradi.
    Nechta obunachiga muvaffaqiyatli yuborilgani (int) qaytariladi.
    Hech qanday xato asosiy oqimni to'xtatmaydi (chaqiruvchi joyda try/except shart emas).
    """
    if not settings.VAPID_PRIVATE_KEY or not settings.VAPID_PUBLIC_KEY:
        return 0

    result = await db.execute(select(PushSubscription).where(PushSubscription.user_id == user_id))
    subs = result.scalars().all()
    if not subs:
        return 0

    payload = json.dumps({"title": title, "body": body, "url": url})
    sent = 0
    dead_ids = []

    for sub in subs:
        try:
            webpush(
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                },
                data=payload,
                vapid_private_key=settings.VAPID_PRIVATE_KEY,
                vapid_claims={"sub": f"mailto:{settings.VAPID_CLAIM_EMAIL}"},
            )
            sent += 1
        except WebPushException as e:
            status_code = getattr(e.response, "status_code", None)
            if status_code in (404, 410):
                dead_ids.append(sub.id)
            else:
                logger.warning(f"Push yuborishda xato (user_id={user_id}): {e}")
        except Exception as e:
            logger.warning(f"Push yuborishda kutilmagan xato (user_id={user_id}): {e}")

    if dead_ids:
        dead_result = await db.execute(select(PushSubscription).where(PushSubscription.id.in_(dead_ids)))
        for dead_sub in dead_result.scalars().all():
            await db.delete(dead_sub)
        await db.commit()

    return sent
