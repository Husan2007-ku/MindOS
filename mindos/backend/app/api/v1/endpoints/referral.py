import secrets
import string
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from datetime import datetime, timezone, timedelta

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User, Referral, PlanEnum, Subscription

router = APIRouter(prefix="/referral", tags=["referral"])
logger = logging.getLogger(__name__)

REFERRAL_REWARD_DAYS = 30  # TZ 14.2: "1 oy Pro bepul"


def _generate_code(length: int = 8) -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


class ApplyReferralRequest(BaseModel):
    code: str


@router.post("/generate")
async def generate_referral_code(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Foydalanuvchi uchun referral kod yaratish.
    Agar foydalanuvchining ishlatilmagan kodi bo'lsa — uni qaytaradi (qayta-qayta yaratmaslik).
    """
    existing_result = await db.execute(
        select(Referral).where(
            Referral.referrer_id == current_user.id,
            Referral.status == "pending",
        )
    )
    existing = existing_result.scalar_one_or_none()
    if existing:
        return {
            "code": existing.code,
            "share_link": f"https://mindos.uz/register?ref={existing.code}",
            "message": "Mavjud referral kodingiz",
        }

    # Unikal kod yaratish — to'qnashuv bo'lsa qayta urinish
    for _ in range(5):
        code = _generate_code()
        check = await db.execute(select(Referral).where(Referral.code == code))
        if not check.scalar_one_or_none():
            break
    else:
        raise HTTPException(status_code=500, detail="Kod yaratishda xato, qaytadan urinib ko'ring")

    referral = Referral(
        referrer_id=current_user.id,
        code=code,
        status="pending",
    )
    db.add(referral)
    await db.commit()

    return {
        "code": code,
        "share_link": f"https://mindos.uz/register?ref={code}",
        "message": "Yangi referral kod yaratildi. Do'stingizga ulashing — ikkalangiz 1 oy Pro bepul olasiz!",
    }


@router.post("/apply")
async def apply_referral_code(
    data: ApplyReferralRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Yangi foydalanuvchi referral kodni qo'llaganda chaqiriladi.
    Ikkalasiga ham 1 oy Pro bepul beriladi (TZ 14.2).
    """
    code = data.code.strip().upper()

    result = await db.execute(select(Referral).where(Referral.code == code))
    referral = result.scalar_one_or_none()

    if not referral:
        raise HTTPException(status_code=404, detail="Referral kod topilmadi")

    if referral.status != "pending":
        raise HTTPException(status_code=400, detail="Bu referral kod allaqachon ishlatilgan")

    if referral.referrer_id == current_user.id:
        raise HTTPException(status_code=400, detail="O'zingizning kodingizni ishlata olmaysiz")

    # Foydalanuvchi avval referral ishlatganmi tekshirish (bir marta ishlatish huquqi)
    already_used = await db.execute(
        select(Referral).where(
            Referral.referred_id == current_user.id,
            Referral.status.in_(["completed", "rewarded"]),
        )
    )
    if already_used.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Siz allaqachon referral kod ishlatgansiz")

    referrer_result = await db.execute(select(User).where(User.id == referral.referrer_id))
    referrer = referrer_result.scalar_one_or_none()
    if not referrer:
        raise HTTPException(status_code=404, detail="Taklif qilgan foydalanuvchi topilmadi")

    now = datetime.now(timezone.utc)
    period_end = now + timedelta(days=REFERRAL_REWARD_DAYS)

    # Ikkalasiga ham Pro berish
    current_user.plan = PlanEnum.pro
    referrer.plan = PlanEnum.pro

    db.add(Subscription(
        user_id=current_user.id,
        plan=PlanEnum.pro,
        status="active",
        current_period_end=period_end,
    ))
    db.add(Subscription(
        user_id=referrer.id,
        plan=PlanEnum.pro,
        status="active",
        current_period_end=period_end,
    ))

    referral.referred_id = current_user.id
    referral.status = "rewarded"
    referral.reward_given = True
    referral.completed_at = now

    await db.commit()

    logger.info(f"Referral qo'llanildi: referrer={referrer.id}, referred={current_user.id}")

    return {
        "message": f"Tabriklaymiz! Sizga va do'stingizga {REFERRAL_REWARD_DAYS} kunlik Pro berildi 🎉",
        "plan": "pro",
        "expires_at": period_end,
    }


@router.get("/stats")
async def get_referral_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Foydalanuvchining referral statistikasi — nechta do'st taklif qilgan"""
    result = await db.execute(
        select(Referral).where(Referral.referrer_id == current_user.id)
    )
    referrals = result.scalars().all()

    completed = [r for r in referrals if r.status == "rewarded"]

    return {
        "total_invites": len(referrals),
        "successful_invites": len(completed),
        "pending_code": next((r.code for r in referrals if r.status == "pending"), None),
    }
