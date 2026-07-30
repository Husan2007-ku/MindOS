from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel, Field
from datetime import datetime, timezone, timedelta

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User, SpacedItem

router = APIRouter(prefix="/spaced-repetition", tags=["spaced-repetition"])


class ReviewRequest(BaseModel):
    quality: int = Field(..., ge=0, le=5, description="0=butunlay unutilgan, 5=mukammal eslab qolindi")


def sm2_update(item: SpacedItem, quality: int) -> SpacedItem:
    """
    SuperMemo SM-2 algoritmi
    quality: 0-5 (0=unutildi, 5=mukammal)
    """
    if quality >= 3:
        if item.repetitions == 0:
            item.interval_days = 1
        elif item.repetitions == 1:
            item.interval_days = 6
        else:
            item.interval_days = round(item.interval_days * item.ease_factor)
        item.repetitions += 1
    else:
        # Noto'g'ri javob — qaytadan boshlash
        item.repetitions = 0
        item.interval_days = 1

    # ease_factor yangilash
    item.ease_factor = max(
        1.3,
        item.ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    )

    # Keyingi ko'rib chiqish sanasi
    item.next_review_at = datetime.now(timezone.utc) + timedelta(days=item.interval_days)
    return item


@router.get("/due")
async def get_due_items(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Bugun takrorlanadigan kartochkalar"""
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(SpacedItem)
        .where(
            SpacedItem.user_id == current_user.id,
            SpacedItem.next_review_at <= now,
        )
        .limit(20)
    )
    items = result.scalars().all()

    return {
        "items": [
            {
                "id": item.id,
                "front": item.front,
                "back": item.back,
                "repetitions": item.repetitions,
                "ease_factor": round(item.ease_factor, 2),
            }
            for item in items
        ],
        "total_due": len(items),
    }


@router.post("/{item_id}/review")
async def review_item(
    item_id: int,
    data: ReviewRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Kartochkani baholash — SM-2 algoritmi interval yangilaydi"""
    result = await db.execute(
        select(SpacedItem).where(
            SpacedItem.id == item_id,
            SpacedItem.user_id == current_user.id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Kartochka topilmadi")

    item = sm2_update(item, data.quality)
    await db.commit()

    return {
        "id": item.id,
        "next_review_at": item.next_review_at,
        "interval_days": round(item.interval_days, 1),
        "ease_factor": round(item.ease_factor, 2),
        "repetitions": item.repetitions,
        "message": "Zo'r!" if data.quality >= 4 else ("Yaxshi!" if data.quality >= 3 else "Davom eting, bo'ladi!"),
    }


@router.get("/stats")
async def get_sr_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    now = datetime.now(timezone.utc)

    total_result = await db.execute(
        select(func.count(SpacedItem.id)).where(SpacedItem.user_id == current_user.id)
    )
    due_result = await db.execute(
        select(func.count(SpacedItem.id)).where(
            SpacedItem.user_id == current_user.id,
            SpacedItem.next_review_at <= now,
        )
    )
    avg_ease_result = await db.execute(
        select(func.avg(SpacedItem.ease_factor)).where(SpacedItem.user_id == current_user.id)
    )

    total = total_result.scalar() or 0
    due = due_result.scalar() or 0
    avg_ease = avg_ease_result.scalar() or 2.5

    # Retention rate hisoblash (ease > 2.0 = yaxshi)
    good_result = await db.execute(
        select(func.count(SpacedItem.id)).where(
            SpacedItem.user_id == current_user.id,
            SpacedItem.ease_factor >= 2.0,
        )
    )
    good = good_result.scalar() or 0
    retention = round((good / total * 100), 1) if total > 0 else 0

    return {
        "total_cards": total,
        "due_today": due,
        "avg_ease_factor": round(float(avg_ease), 2),
        "retention_rate": retention,
    }
