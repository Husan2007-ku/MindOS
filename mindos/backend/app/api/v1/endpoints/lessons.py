from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timezone

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User, Lesson, LessonStatus, Curriculum, SpacedItem, Homework

router = APIRouter(prefix="/lessons", tags=["lessons"])


@router.get("/today")
async def get_today_lesson(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Bugungi birinchi tugallanmagan dars"""
    result = await db.execute(
        select(Lesson)
        .join(Curriculum)
        .where(
            Curriculum.user_id == current_user.id,
            Curriculum.status == "active",
            Lesson.status == LessonStatus.pending,
        )
        .order_by(Lesson.week, Lesson.day)
        .limit(1)
    )
    lesson = result.scalar_one_or_none()
    if not lesson:
        return {"lesson": None, "message": "Bugun uchun dars yo'q. Zo'r, hammasi tugallangan!"}

    return {
        "lesson": {
            "id": lesson.id,
            "week": lesson.week,
            "day": lesson.day,
            "title": lesson.title,
            "content": lesson.content,
            "status": lesson.status,
        }
    }


@router.get("/{lesson_id}")
async def get_lesson(
    lesson_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Lesson)
        .join(Curriculum)
        .where(
            Lesson.id == lesson_id,
            Curriculum.user_id == current_user.id,
        )
    )
    lesson = result.scalar_one_or_none()
    if not lesson:
        raise HTTPException(status_code=404, detail="Dars topilmadi")

    return {
        "id": lesson.id,
        "curriculum_id": lesson.curriculum_id,
        "week": lesson.week,
        "day": lesson.day,
        "title": lesson.title,
        "content": lesson.content,
        "status": lesson.status,
        "completed_at": lesson.completed_at,
    }


@router.put("/{lesson_id}/complete")
async def complete_lesson(
    lesson_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Darsni tugatish — avtomatik SR kartochkalar yaratiladi"""
    result = await db.execute(
        select(Lesson)
        .join(Curriculum)
        .where(
            Lesson.id == lesson_id,
            Curriculum.user_id == current_user.id,
        )
    )
    lesson = result.scalar_one_or_none()
    if not lesson:
        raise HTTPException(status_code=404, detail="Dars topilmadi")

    if lesson.status == LessonStatus.completed:
        return {"message": "Bu dars allaqachon tugallangan"}

    lesson.status = LessonStatus.completed
    lesson.completed_at = datetime.now(timezone.utc)

    # SR kartochkalar yaratish (darsning key_points dan)
    content = lesson.content or {}
    key_points = content.get("key_points", [])
    homework_q = content.get("homework", "")

    sr_cards_created = 0
    for point in key_points:
        if len(point) > 10:
            card = SpacedItem(
                user_id=current_user.id,
                lesson_id=lesson_id,
                front=f"'{lesson.title}' darsida: {point}ni tushuntiring",
                back=point,
            )
            db.add(card)
            sr_cards_created += 1

    # Vazifa yaratish
    if homework_q:
        hw = Homework(
            lesson_id=lesson_id,
            user_id=current_user.id,
            question=homework_q,
        )
        db.add(hw)

    await db.commit()

    return {
        "message": "Dars tugallandi! 🎉",
        "sr_cards_created": sr_cards_created,
        "homework_created": bool(homework_q),
    }
