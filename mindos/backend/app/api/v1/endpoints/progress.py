import hashlib
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime, timezone, timedelta

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User, Lesson, LessonStatus, Curriculum, Message, Homework, SpacedItem

router = APIRouter(prefix="/progress", tags=["progress"])

WEEKDAY_LABELS_UZ = ["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"]


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


@router.get("/daily-activity")
async def get_daily_activity(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Haqiqiy kunlik faollik (TZ'dan tashqari tuzatildi).
    Eslatma: frontend progress sahifasida avval bu grafikning 6/7 ustuni
    HARDCODE (soxta) raqamlar edi — faqat oxirgi ustun haqiqiy edi. Bu endpoint
    barcha 7 kunni ham Message jadvalidan haqiqiy hisoblab qaytaradi.
    """
    now = datetime.now(timezone.utc)
    days = []
    for i in range(6, -1, -1):
        day_start = (now - timedelta(days=i)).replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)

        msg_result = await db.execute(
            select(func.count(Message.id)).where(
                Message.user_id == current_user.id,
                Message.role == "user",
                Message.created_at >= day_start,
                Message.created_at < day_end,
            )
        )
        lesson_result = await db.execute(
            select(func.count(Lesson.id))
            .join(Curriculum)
            .where(
                Curriculum.user_id == current_user.id,
                Lesson.status == LessonStatus.completed,
                Lesson.completed_at >= day_start,
                Lesson.completed_at < day_end,
            )
        )
        days.append({
            "date": day_start.date().isoformat(),
            "label": WEEKDAY_LABELS_UZ[day_start.weekday()],
            "messages": msg_result.scalar() or 0,
            "lessons_completed": lesson_result.scalar() or 0,
        })

    return {"days": days}


@router.get("/mastery")
async def get_mastery(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    'Ta'sir paneli' — o'zlashtirish darajasi (TZ'dan tashqari qo'shildi).
    Har bir o'quv reja uchun: tugallanish foizi + vazifa baholari o'rtachasi +
    spaced-repetition eslab qolish indeksi asosida yagona "mastery score" chiqaradi.
    Bu foydalanuvchiga (va hakamlarga) o'lchanadigan, aniq natija ko'rsatadi —
    faqat "streak" emas, haqiqiy bilim mustahkamligi.
    """
    result = await db.execute(
        select(Curriculum)
        .where(Curriculum.user_id == current_user.id)
        .order_by(Curriculum.created_at.desc())
    )
    curricula = result.scalars().all()

    mastery_list = []
    for c in curricula:
        total_result = await db.execute(
            select(func.count(Lesson.id)).where(Lesson.curriculum_id == c.id)
        )
        completed_result = await db.execute(
            select(func.count(Lesson.id)).where(
                Lesson.curriculum_id == c.id, Lesson.status == LessonStatus.completed
            )
        )
        total = total_result.scalar() or 0
        completed = completed_result.scalar() or 0
        completion_pct = round(completed / total * 100, 1) if total else 0.0

        avg_score_result = await db.execute(
            select(func.avg(Homework.score))
            .join(Lesson, Homework.lesson_id == Lesson.id)
            .where(Lesson.curriculum_id == c.id, Homework.score.isnot(None))
        )
        avg_score = avg_score_result.scalar()

        avg_ease_result = await db.execute(
            select(func.avg(SpacedItem.ease_factor))
            .join(Lesson, SpacedItem.lesson_id == Lesson.id)
            .where(Lesson.curriculum_id == c.id)
        )
        avg_ease = avg_ease_result.scalar()

        homework_component = float(avg_score) if avg_score is not None else 60.0
        retention_component = min(float(avg_ease) / 3.0 * 100, 100) if avg_ease is not None else 60.0
        mastery_score = round(completion_pct * 0.4 + homework_component * 0.35 + retention_component * 0.25, 1)

        mastery_list.append({
            "curriculum_id": c.id,
            "topic": c.topic,
            "level": c.level,
            "status": c.status,
            "total_lessons": total,
            "completed_lessons": completed,
            "completion_percent": completion_pct,
            "avg_homework_score": round(float(avg_score), 1) if avg_score is not None else None,
            "retention_index": round(retention_component, 1),
            "mastery_score": mastery_score,
            "certificate_eligible": total > 0 and completed == total,
        })

    return {"curricula": mastery_list}


@router.get("/certificate/{curriculum_id}")
async def get_certificate(
    curriculum_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Avtomatik sertifikat ma'lumotlari (TZ'dan tashqari qo'shildi).
    O'quv reja to'liq tugallangandagina beriladi. PDF generatsiya frontendda
    (bosib chiqarish/saqlash) amalga oshiriladi — backend faqat tekshirilgan,
    soxtalashtirib bo'lmaydigan (hash-asosli) ma'lumotni qaytaradi.
    """
    result = await db.execute(
        select(Curriculum).where(
            Curriculum.id == curriculum_id,
            Curriculum.user_id == current_user.id,
        )
    )
    curriculum = result.scalar_one_or_none()
    if not curriculum:
        raise HTTPException(status_code=404, detail="O'quv reja topilmadi")

    total_result = await db.execute(
        select(func.count(Lesson.id)).where(Lesson.curriculum_id == curriculum_id)
    )
    completed_result = await db.execute(
        select(func.count(Lesson.id)).where(
            Lesson.curriculum_id == curriculum_id, Lesson.status == LessonStatus.completed
        )
    )
    total = total_result.scalar() or 0
    completed = completed_result.scalar() or 0

    if total == 0 or completed < total:
        raise HTTPException(
            status_code=400,
            detail=f"Sertifikat uchun o'quv reja to'liq yakunlanishi kerak ({completed}/{total} dars tugallangan)",
        )

    avg_score_result = await db.execute(
        select(func.avg(Homework.score))
        .join(Lesson, Homework.lesson_id == Lesson.id)
        .where(Lesson.curriculum_id == curriculum_id, Homework.score.isnot(None))
    )
    avg_score = avg_score_result.scalar()

    completion_date_result = await db.execute(
        select(func.max(Lesson.completed_at)).where(Lesson.curriculum_id == curriculum_id)
    )
    completion_date = completion_date_result.scalar()

    verify_raw = f"MINDOS-{current_user.id}-{curriculum_id}-{curriculum.topic}"
    verify_code = hashlib.sha256(verify_raw.encode()).hexdigest()[:10].upper()

    return {
        "user_name": current_user.full_name or "MindOS foydalanuvchisi",
        "topic": curriculum.topic,
        "level": curriculum.level,
        "total_weeks": curriculum.total_weeks,
        "lessons_completed": completed,
        "avg_score": round(float(avg_score), 1) if avg_score is not None else None,
        "completion_date": completion_date,
        "verify_code": verify_code,
    }
