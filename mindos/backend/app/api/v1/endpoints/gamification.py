from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.services.gamification_service import (
    BADGE_CATALOG, level_for_xp, xp_into_level, compute_stats,
)

router = APIRouter(prefix="/gamification", tags=["gamification"])


@router.get("/me")
async def get_my_gamification(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models.user import UserBadge

    earned_result = await db.execute(
        select(UserBadge).where(UserBadge.user_id == current_user.id).order_by(UserBadge.earned_at.desc())
    )
    earned = {b.badge_key: b.earned_at for b in earned_result.scalars().all()}

    xp = current_user.xp or 0
    xp_current, xp_needed = xp_into_level(xp)

    badges = []
    for b in BADGE_CATALOG:
        badges.append({
            "key": b["key"],
            "title": b["title"],
            "description": b["description"],
            "icon": b["icon"],
            "earned": b["key"] in earned,
            "earned_at": earned.get(b["key"]),
        })

    return {
        "xp": xp,
        "level": level_for_xp(xp),
        "xp_current_level": xp_current,
        "xp_needed_for_level": xp_needed,
        "badges": badges,
        "badges_earned_count": len(earned),
        "badges_total_count": len(BADGE_CATALOG),
    }


@router.get("/leaderboard")
async def get_leaderboard(
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(User).where(User.is_active == True).order_by(desc(User.xp)).limit(limit)
    )
    top_users = result.scalars().all()

    top = [
        {
            "rank": i + 1,
            "user_id": u.id,
            "name": u.full_name or "Foydalanuvchi",
            "xp": u.xp or 0,
            "level": level_for_xp(u.xp or 0),
            "is_me": u.id == current_user.id,
        }
        for i, u in enumerate(top_users)
    ]

    me_in_top = any(u["is_me"] for u in top)
    my_rank = None
    if not me_in_top:
        rank_result = await db.execute(
            select(func.count(User.id)).where(User.is_active == True, User.xp > (current_user.xp or 0))
        )
        my_rank = (rank_result.scalar() or 0) + 1

    return {
        "top": top,
        "me": {
            "rank": my_rank if my_rank else next((u["rank"] for u in top if u["is_me"]), None),
            "xp": current_user.xp or 0,
            "level": level_for_xp(current_user.xp or 0),
        },
    }
