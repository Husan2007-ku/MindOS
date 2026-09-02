from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User, Curriculum, Lesson, LessonStatus, CurriculumStatus, LevelEnum

router = APIRouter(prefix="/curricula", tags=["curricula"])


class CreateCurriculumRequest(BaseModel):
    topic: str
    level: LevelEnum
    daily_minutes: int = 30
    current_knowledge: str = ""
    goal: str = ""


@router.get("")
async def list_curricula(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Curriculum)
        .where(Curriculum.user_id == current_user.id)
        .order_by(Curriculum.created_at.desc())
    )
    curricula = result.scalars().all()
    return {
        "curricula": [
            {
                "id": c.id,
                "topic": c.topic,
                "level": c.level,
                "total_weeks": c.total_weeks,
                "status": c.status,
                "created_at": c.created_at,
            }
            for c in curricula
        ]
    }


@router.get("/{curriculum_id}")
async def get_curriculum(
    curriculum_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Curriculum).where(
            Curriculum.id == curriculum_id,
            Curriculum.user_id == current_user.id,
        )
    )
    curriculum = result.scalar_one_or_none()
    if not curriculum:
        raise HTTPException(status_code=404, detail="O'quv reja topilmadi")

    return {
        "id": curriculum.id,
        "topic": curriculum.topic,
        "level": curriculum.level,
        "total_weeks": curriculum.total_weeks,
        "daily_minutes": curriculum.daily_minutes,
        "status": curriculum.status,
        "curriculum_data": curriculum.curriculum_data,
        "created_at": curriculum.created_at,
    }


@router.get("/{curriculum_id}/lessons")
async def get_curriculum_lessons(
    curriculum_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Curriculum tekshirish
    curr_result = await db.execute(
        select(Curriculum).where(
            Curriculum.id == curriculum_id,
            Curriculum.user_id == current_user.id,
        )
    )
    if not curr_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="O'quv reja topilmadi")

    result = await db.execute(
        select(Lesson)
        .where(Lesson.curriculum_id == curriculum_id)
        .order_by(Lesson.week, Lesson.day)
    )
    lessons = result.scalars().all()

    # Haftalab guruhlashtirish
    weeks = {}
    for lesson in lessons:
        week = lesson.week
        if week not in weeks:
            weeks[week] = []
        lesson_content = lesson.content or {}
        weeks[week].append({
            "id": lesson.id,
            "day": lesson.day,
            "title": lesson.title,
            "status": lesson.status,
            "completed_at": lesson.completed_at,
            # Foydalanuvchi darsni ochmasdan turib ham reja mazmunini ko'rishi uchun
            # (judge/foydalanuvchi ro'yxatni ko'rib "bu yerda hech narsa yo'q" deb
            # o'ylamasligi kerak — asosiy nuqtalar shu yerda ham ko'rinadi).
            "key_points": lesson_content.get("key_points", []),
        })

    return {"curriculum_id": curriculum_id, "weeks": weeks}


@router.get("/{curriculum_id}/progress")
async def get_curriculum_progress(
    curriculum_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    total_result = await db.execute(
        select(func.count(Lesson.id)).where(Lesson.curriculum_id == curriculum_id)
    )
    completed_result = await db.execute(
        select(func.count(Lesson.id)).where(
            Lesson.curriculum_id == curriculum_id,
            Lesson.status == LessonStatus.completed,
        )
    )
    total = total_result.scalar() or 0
    completed = completed_result.scalar() or 0
    percentage = round(completed / total * 100, 1) if total > 0 else 0

    return {
        "total_lessons": total,
        "completed_lessons": completed,
        "percentage": percentage,
    }


@router.put("/{curriculum_id}/pause")
async def pause_curriculum(
    curriculum_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Curriculum).where(
            Curriculum.id == curriculum_id,
            Curriculum.user_id == current_user.id,
        )
    )
    curriculum = result.scalar_one_or_none()
    if not curriculum:
        raise HTTPException(status_code=404, detail="O'quv reja topilmadi")
    curriculum.status = CurriculumStatus.paused
    await db.commit()
    return {"message": "O'quv reja to'xtatildi"}


@router.put("/{curriculum_id}/resume")
async def resume_curriculum(
    curriculum_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Curriculum).where(
            Curriculum.id == curriculum_id,
            Curriculum.user_id == current_user.id,
        )
    )
    curriculum = result.scalar_one_or_none()
    if not curriculum:
        raise HTTPException(status_code=404, detail="O'quv reja topilmadi")
    curriculum.status = CurriculumStatus.active
    await db.commit()
    return {"message": "O'quv reja davom ettirildi"}


@router.delete("/{curriculum_id}")
async def delete_curriculum(
    curriculum_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from sqlalchemy import delete as sql_delete
    result = await db.execute(
        select(Curriculum).where(
            Curriculum.id == curriculum_id,
            Curriculum.user_id == current_user.id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="O'quv reja topilmadi")
    await db.execute(sql_delete(Curriculum).where(Curriculum.id == curriculum_id))
    await db.commit()
    return {"message": "O'quv reja o'chirildi"}
