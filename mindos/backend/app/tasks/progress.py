import logging
import json
from datetime import datetime, timezone, timedelta
from app.core.celery_app import celery_app

logger = logging.getLogger(__name__)

PROGRESS_AGENT_SYSTEM = """Sen MindOS platformasining Progress Agent issan.
Vazifang: foydalanuvchining haftalik faoliyatini tahlil qilib, qisqa va motivatsion hisobot yozish.

Qoidalar:
1. 3-5 jumladan oshmasin
2. Aniq raqamlar bilan gapir (necha dars, necha kun streak)
3. Zaif tomon bo'lsa, mehribonlik bilan ko'rsat — ayblamasdan
4. Keyingi hafta uchun 1 ta aniq tavsiya ber
5. {lang} tilida yoz
6. Telegram uchun mos formatda (HTML: <b>, <i> ishlatish mumkin)"""


@celery_app.task(name="app.tasks.progress.send_weekly_reports")
def send_weekly_reports():
    """Har dushanba 09:00 — barcha faol foydalanuvchilarga haftalik hisobot"""
    import asyncio
    asyncio.run(_send_weekly_reports_async())


async def _send_weekly_reports_async():
    from app.core.database import AsyncSessionLocal
    from app.models.user import User, Lesson, Curriculum, LessonStatus, SpacedItem
    from sqlalchemy import select, func

    async with AsyncSessionLocal() as db:
        now = datetime.now(timezone.utc)
        week_ago = now - timedelta(days=7)

        # Faqat oxirgi 14 kun ichida faol bo'lganlar
        result = await db.execute(
            select(User).where(
                User.is_active == True,
                User.onboarding_completed == True,
                User.last_active >= now - timedelta(days=14),
            )
        )
        users = result.scalars().all()

        for user in users:
            lessons_result = await db.execute(
                select(func.count(Lesson.id))
                .join(Curriculum)
                .where(
                    Curriculum.user_id == user.id,
                    Lesson.status == LessonStatus.completed,
                    Lesson.completed_at >= week_ago,
                )
            )
            lessons_completed = lessons_result.scalar() or 0

            sr_result = await db.execute(
                select(func.avg(SpacedItem.ease_factor)).where(SpacedItem.user_id == user.id)
            )
            avg_ease = sr_result.scalar() or 2.5

            report = await _generate_report(user, lessons_completed, avg_ease)
            await _deliver_report(user, report)

        logger.info(f"Weekly reports sent: {len(users)} users")


async def _generate_report(user, lessons_completed: int, avg_ease: float) -> str:
    from openai import AsyncOpenAI
    from app.core.config import settings

    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    lang_names = {"uz": "o'zbek", "ru": "rus", "en": "ingliz"}

    prompt = f"""
Foydalanuvchi: {user.full_name or 'Foydalanuvchi'}
Bu hafta tugatgan darslar: {lessons_completed}
Joriy streak: {user.streak} kun
O'rtacha eslab qolish darajasi (ease factor): {round(avg_ease, 2)} (1.3-2.5 past, 2.5-4 yaxshi)
"""

    try:
        response = await client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=[
                {"role": "system", "content": PROGRESS_AGENT_SYSTEM.format(lang=lang_names.get(user.lang, "o'zbek"))},
                {"role": "user", "content": prompt},
            ],
            temperature=0.4,
            max_tokens=300,
        )
        return response.choices[0].message.content
    except Exception as e:
        logger.error(f"Progress Agent xatosi: {e}")
        return (
            f"📊 Haftalik hisobot\n\n"
            f"Bu hafta {lessons_completed} ta dars tugatdingiz.\n"
            f"Streak: {user.streak} kun. Davom etamiz! 💪"
        )


async def _deliver_report(user, report: str):
    delivered = False
    if user.telegram_id and user.notify_daily:
        from app.tasks.notifications import _send_telegram
        await _send_telegram(user.telegram_id, f"📊 <b>Haftalik hisobot</b>\n\n{report}")
        delivered = True

    # Email fallback — telegram_id yo'q yoki Telegram orqali yetkazilmagan foydalanuvchilar uchun
    if not delivered and user.email:
        from app.services.email_service import EmailService
        await EmailService.send_weekly_report(user.email, user.full_name, report)
