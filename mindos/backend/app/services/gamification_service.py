"""
Gamifikatsiya: XP (tajriba ball) va yutuqlar (badge).

Yutuqlar katalogi shu yerda statik saqlanadi (DB'da alohida jadval kerak
emas) — UserBadge jadvali faqat foydalanuvchi qaysi badge_key'ni QACHON
qo'lga kiritganini saqlaydi.
"""
from datetime import datetime, timezone
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import (
    User, UserBadge, Lesson, Curriculum, LessonStatus,
    Homework, Source, Message,
)

XP_PER_LEVEL = 100
BADGE_BONUS_XP = 15

XP_LESSON_COMPLETED = 20
XP_DAILY_ACTIVITY = 5
XP_HOMEWORK_EXCELLENT = 20   # ball >= 80
XP_HOMEWORK_OK = 10          # ball >= 50
XP_HOMEWORK_PARTICIPATION = 5
XP_REFERRAL_BONUS = 30  # ikkala tomonga ham (taklif qilgan va qo'shilgan) beriladi


BADGE_CATALOG = [
    {
        "key": "first_lesson",
        "title": "Birinchi qadam",
        "description": "Birinchi darsingizni tugatdingiz",
        "icon": "🎯",
        "check": lambda s: s["lessons_completed"] >= 1,
    },
    {
        "key": "lessons_10",
        "title": "Barqaror o'quvchi",
        "description": "10 ta darsni tugatdingiz",
        "icon": "📚",
        "check": lambda s: s["lessons_completed"] >= 10,
    },
    {
        "key": "lessons_50",
        "title": "Bilim ustasi",
        "description": "50 ta darsni tugatdingiz",
        "icon": "🎓",
        "check": lambda s: s["lessons_completed"] >= 50,
    },
    {
        "key": "streak_7",
        "title": "Bir hafta olov",
        "description": "7 kun ketma-ket o'rgandingiz",
        "icon": "🔥",
        "check": lambda s: s["streak"] >= 7,
    },
    {
        "key": "streak_30",
        "title": "Bir oy olov",
        "description": "30 kun ketma-ket o'rgandingiz",
        "icon": "🏆",
        "check": lambda s: s["streak"] >= 30,
    },
    {
        "key": "homework_excellent",
        "title": "Mukammal vazifa",
        "description": "Biror vazifadan 95+ ball oldingiz",
        "icon": "⭐",
        "check": lambda s: s["best_homework_score"] >= 95,
    },
    {
        "key": "source_added",
        "title": "Manba tadqiqotchisi",
        "description": "O'z manbangizni (fayl/YouTube/matn) qo'shdingiz",
        "icon": "🔎",
        "check": lambda s: s["sources_count"] >= 1,
    },
    {
        "key": "active_talker",
        "title": "Faol suhbatdosh",
        "description": "Mentor bilan 50 tadan ortiq xabar almashdingiz",
        "icon": "💬",
        "check": lambda s: s["messages_sent"] >= 50,
    },
    {
        "key": "referral_1",
        "title": "Jamoa quruvchi",
        "description": "Birinchi do'stingizni MindOS'ga taklif qildingiz",
        "icon": "🤝",
        "check": lambda s: s["referrals_count"] >= 1,
    },
]

BADGE_BY_KEY = {b["key"]: b for b in BADGE_CATALOG}


def level_for_xp(xp: int) -> int:
    return xp // XP_PER_LEVEL + 1


def xp_into_level(xp: int) -> tuple[int, int]:
    """(joriy leveldagi xp, keyingi levelgacha kerak xp)"""
    return xp % XP_PER_LEVEL, XP_PER_LEVEL


async def add_xp(db: AsyncSession, user: User, amount: int) -> None:
    if amount <= 0:
        return
    user.xp = (user.xp or 0) + amount


async def compute_stats(db: AsyncSession, user: User) -> dict:
    lessons_result = await db.execute(
        select(func.count(Lesson.id))
        .join(Curriculum)
        .where(Curriculum.user_id == user.id, Lesson.status == LessonStatus.completed)
    )
    best_score_result = await db.execute(
        select(func.max(Homework.score)).where(Homework.user_id == user.id)
    )
    sources_result = await db.execute(
        select(func.count(Source.id)).where(Source.user_id == user.id)
    )
    messages_result = await db.execute(
        select(func.count(Message.id)).where(Message.user_id == user.id, Message.role == "user")
    )
    referrals_result = await db.execute(
        select(func.count(User.id)).where(User.referred_by_id == user.id)
    )

    return {
        "streak": user.streak or 0,
        "max_streak": user.max_streak or 0,
        "lessons_completed": lessons_result.scalar() or 0,
        "best_homework_score": best_score_result.scalar() or 0,
        "sources_count": sources_result.scalar() or 0,
        "messages_sent": messages_result.scalar() or 0,
        "referrals_count": referrals_result.scalar() or 0,
    }


async def check_and_award_badges(db: AsyncSession, user: User) -> list[dict]:
    """Yangi qo'lga kiritilgan yutuqlarni tekshiradi, saqlaydi va qaytaradi."""
    stats = await compute_stats(db, user)

    earned_result = await db.execute(
        select(UserBadge.badge_key).where(UserBadge.user_id == user.id)
    )
    already_earned = {row[0] for row in earned_result.all()}

    newly_earned = []
    for badge in BADGE_CATALOG:
        if badge["key"] in already_earned:
            continue
        if badge["check"](stats):
            db.add(UserBadge(
                user_id=user.id,
                badge_key=badge["key"],
                earned_at=datetime.now(timezone.utc),
            ))
            await add_xp(db, user, BADGE_BONUS_XP)
            newly_earned.append({
                "key": badge["key"],
                "title": badge["title"],
                "description": badge["description"],
                "icon": badge["icon"],
            })

    return newly_earned
