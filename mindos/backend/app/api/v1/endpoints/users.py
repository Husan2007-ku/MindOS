from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from pydantic import BaseModel
from typing import Optional

from app.core.database import get_db
from app.core.security import get_current_user, hash_password
from app.models.user import User

router = APIRouter(prefix="/users", tags=["users"])


class UpdateProfileRequest(BaseModel):
    full_name: Optional[str] = None
    timezone: Optional[str] = None
    lang: Optional[str] = None
    notify_daily: Optional[bool] = None
    notify_time: Optional[str] = None
    notify_streak: Optional[bool] = None
    notify_sr: Optional[bool] = None


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


@router.get("/me")
async def get_profile(current_user: User = Depends(get_current_user)):
    from datetime import date
    from app.api.v1.endpoints.chat import FREE_TTS_DAILY_LIMIT

    tts_remaining_today = None
    if current_user.plan == "free":
        used_today = current_user.tts_daily_count if current_user.tts_count_date == date.today().isoformat() else 0
        tts_remaining_today = max(0, FREE_TTS_DAILY_LIMIT - used_today)

    return {
        "id": current_user.id,
        "email": current_user.email,
        "full_name": current_user.full_name,
        "lang": current_user.lang,
        "timezone": current_user.timezone,
        "plan": current_user.plan,
        "streak": current_user.streak,
        "max_streak": current_user.max_streak,
        "last_active": current_user.last_active,
        "onboarding_completed": current_user.onboarding_completed,
        "notify_daily": current_user.notify_daily,
        "notify_time": current_user.notify_time,
        "notify_streak": current_user.notify_streak,
        "notify_sr": current_user.notify_sr,
        "created_at": current_user.created_at,
        "tts_remaining_today": tts_remaining_today,
    }


@router.put("/me")
async def update_profile(
    data: UpdateProfileRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if data.full_name is not None:
        current_user.full_name = data.full_name.strip()
    if data.timezone is not None:
        import pytz
        if data.timezone not in pytz.all_timezones:
            raise HTTPException(status_code=400, detail="Noto'g'ri timezone")
        current_user.timezone = data.timezone
    if data.lang is not None:
        if data.lang not in ("uz", "ru", "en"):
            raise HTTPException(status_code=400, detail="Til: uz, ru yoki en bo'lishi kerak")
        current_user.lang = data.lang
    if data.notify_daily is not None:
        current_user.notify_daily = data.notify_daily
    if data.notify_time is not None:
        current_user.notify_time = data.notify_time
    if data.notify_streak is not None:
        current_user.notify_streak = data.notify_streak
    if data.notify_sr is not None:
        current_user.notify_sr = data.notify_sr

    await db.commit()
    return {"message": "Profil yangilandi"}


@router.get("/me/stats")
async def get_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from sqlalchemy import func
    from app.models.user import Lesson, SpacedItem, Message, LessonStatus

    # Tugallangan darslar
    lessons_result = await db.execute(
        select(func.count(Lesson.id))
        .join(Lesson.curriculum)
        .where(
            Lesson.status == LessonStatus.completed,
        )
    )
    # SR kartochkalar
    sr_result = await db.execute(
        select(func.count(SpacedItem.id)).where(SpacedItem.user_id == current_user.id)
    )
    # Jami xabarlar
    msg_result = await db.execute(
        select(func.count(Message.id)).where(
            Message.user_id == current_user.id,
            Message.role == "user",
        )
    )

    return {
        "streak": current_user.streak,
        "max_streak": current_user.max_streak,
        "plan": current_user.plan,
        "lessons_completed": lessons_result.scalar() or 0,
        "sr_cards_total": sr_result.scalar() or 0,
        "messages_sent": msg_result.scalar() or 0,
        "last_active": current_user.last_active,
    }


@router.delete("/me")
async def delete_account(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """GDPR — akkauntni to'liq o'chirish"""
    await db.execute(delete(User).where(User.id == current_user.id))
    await db.commit()
    return {"message": "Akkaunt muvaffaqiyatli o'chirildi"}


@router.get("/telegram/status")
async def telegram_status(current_user: User = Depends(get_current_user)):
    return {
        "linked": bool(current_user.telegram_id),
        "telegram_username": current_user.telegram_username,
    }


_bot_username_cache: dict[str, str] = {}


async def _get_bot_username() -> str | None:
    from app.core.config import settings
    if not settings.TELEGRAM_BOT_TOKEN:
        return None
    if "username" in _bot_username_cache:
        return _bot_username_cache["username"]
    import httpx
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.get(f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/getMe")
            data = res.json()
            username = data.get("result", {}).get("username")
            if username:
                _bot_username_cache["username"] = username
            return username
    except Exception:
        return None


@router.post("/telegram/link-code")
async def create_telegram_link_code(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Mavjud (email bilan ro'yxatdan o'tgan) foydalanuvchi uchun Telegram
    akkauntini bog'lash uchun bir martalik kod + deep-link generatsiya qiladi.
    Foydalanuvchi shu linkni bossa, bot /start orqali kodni tekshirib
    telegram_id'ni akkauntga bog'laydi (app/telegram_bot/bot.py).
    """
    import secrets
    from datetime import datetime, timezone, timedelta

    bot_username = await _get_bot_username()
    if not bot_username:
        raise HTTPException(status_code=503, detail="Telegram bot hozircha sozlanmagan")

    code = secrets.token_urlsafe(8)
    current_user.telegram_link_code = code
    current_user.telegram_link_code_expires = datetime.now(timezone.utc) + timedelta(minutes=15)
    await db.commit()

    return {
        "link": f"https://t.me/{bot_username}?start={code}",
        "expires_in_minutes": 15,
    }
