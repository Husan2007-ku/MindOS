from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime, timezone, timedelta

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User, Lesson, LessonStatus, Curriculum, Message

router = APIRouter(prefix="/progress", tags=["progress"])


@router.get("/weekly")
async def get_weekly_progress(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)

    lessons_result = await db.execute(
        select(func.count(Lesson.id))
        .join(Curriculum)
        .where(
            Curriculum.user_id == current_user.id,
            Lesson.status == LessonStatus.completed,
            Lesson.completed_at >= week_ago,
        )
    )
    messages_result = await db.execute(
        select(func.count(Message.id)).where(
            Message.user_id == current_user.id,
            Message.role == "user",
            Message.created_at >= week_ago,
        )
    )

    return {
        "period": "7 kun",
        "lessons_completed": lessons_result.scalar() or 0,
        "messages_sent": messages_result.scalar() or 0,
        "streak": current_user.streak,
        "max_streak": current_user.max_streak,
    }


@router.get("/streak")
async def get_streak(current_user: User = Depends(get_current_user)):
    return {
        "current_streak": current_user.streak,
        "max_streak": current_user.max_streak,
        "last_active": current_user.last_active,
        "streak_status": (
            "🔥 Zo'r streak!" if current_user.streak >= 30
            else "👍 Yaxshi ketayapti!" if current_user.streak >= 7
            else "🌱 Boshlanmoqda"
        ),
    }


@router.get("/monthly")
async def get_monthly_progress(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    now = datetime.now(timezone.utc)
    month_ago = now - timedelta(days=30)

    lessons_result = await db.execute(
        select(func.count(Lesson.id))
        .join(Curriculum)
        .where(
            Curriculum.user_id == current_user.id,
            Lesson.status == LessonStatus.completed,
            Lesson.completed_at >= month_ago,
        )
    )

    return {
        "period": "30 kun",
        "lessons_completed": lessons_result.scalar() or 0,
        "streak": current_user.streak,
        "max_streak": current_user.max_streak,
    }
