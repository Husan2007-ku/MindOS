import logging
from datetime import datetime, timedelta, timezone
from jose import jwt
from telegram import Update
from telegram.ext import Application, CommandHandler, ContextTypes, MessageHandler, filters

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.user import User, SpacedItem, Lesson, Curriculum, LessonStatus
from sqlalchemy import select, func

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    telegram_id = str(update.effective_user.id)
    telegram_username = update.effective_user.username

    async with AsyncSessionLocal() as db:
        # Agar /start bir martalik bog'lash kodi bilan chaqirilgan bo'lsa (mavjud,
        # web'da ro'yxatdan o'tgan foydalanuvchi Sozlamalar'dan "Telegram bog'lash"ni
        # bosgan holat) — shu kodni tekshirib akkauntni bog'laymiz.
        link_code = context.args[0] if context.args else None
        if link_code:
            now = datetime.now(timezone.utc)
            code_result = await db.execute(
                select(User).where(User.telegram_link_code == link_code)
            )
            pending_user = code_result.scalar_one_or_none()
            if (
                pending_user
                and pending_user.telegram_link_code_expires
                and pending_user.telegram_link_code_expires > now
            ):
                pending_user.telegram_id = telegram_id
                pending_user.telegram_username = telegram_username
                pending_user.telegram_link_code = None
                pending_user.telegram_link_code_expires = None
                await db.commit()
                await update.message.reply_text(
                    f"✅ Telegram akkauntingiz MindOS bilan bog'landi, {pending_user.full_name or 'dost'}!\n\n"
                    f"🎯 Streak: {pending_user.streak} kun\n"
                    f"/today — bugungi dars\n"
                    f"/help — barcha buyruqlar"
                )
                return
            else:
                await update.message.reply_text(
                    "⚠️ Bog'lash kodi eskirgan yoki noto'g'ri. Ilovadagi Sozlamalar sahifasidan yangi link oling."
                )
                return

        result = await db.execute(select(User).where(User.telegram_id == telegram_id))
        user = result.scalar_one_or_none()

        if user:
            await update.message.reply_text(
                f"Xush kelibsiz qaytib, {user.full_name or 'dost'}! 👋\n\n"
                f"🎯 Streak: {user.streak} kun\n"
                f"/today — bugungi dars\n"
                f"/progress — progress\n"
                f"/help — barcha buyruqlar"
            )
        else:
            tg_register_token = jwt.encode(
                {
                    "tg_id": telegram_id,
                    "tg_username": telegram_username,
                    "type": "tg_register",
                    "exp": datetime.now(timezone.utc) + timedelta(minutes=30),
                },
                settings.SECRET_KEY,
                algorithm=settings.ALGORITHM,
            )
            link = f"https://mindos.uz/register?tg_token={tg_register_token}"
            await update.message.reply_text(
                "MindOS ga xush kelibsiz! 🧠\n\n"
                "Men sizning shaxsiy AI mentoringizman. Sizga har kuni dars o'taman, "
                "vazifa beraman va unutishingizdan oldin eslataman.\n\n"
                f"Ro'yxatdan o'tish uchun: {link}\n\n"
                "Agar allaqachon MindOS'da hisobingiz bo'lsa — Sozlamalar sahifasidan "
                "\"Telegram bog'lash\" tugmasini bosing."
            )


async def today_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    telegram_id = str(update.effective_user.id)
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.telegram_id == telegram_id))
        user = result.scalar_one_or_none()
        if not user:
            await update.message.reply_text("Avval ro'yxatdan o'ting: /start")
            return

        lesson_result = await db.execute(
            select(Lesson)
            .join(Curriculum)
            .where(
                Curriculum.user_id == user.id,
                Curriculum.status == "active",
                Lesson.status == LessonStatus.pending,
            )
            .order_by(Lesson.week, Lesson.day)
            .limit(1)
        )
        lesson = lesson_result.scalar_one_or_none()

        now = datetime.now(timezone.utc)
        sr_result = await db.execute(
            select(func.count(SpacedItem.id)).where(
                SpacedItem.user_id == user.id,
                SpacedItem.next_review_at <= now,
            )
        )
        sr_count = sr_result.scalar() or 0

        if lesson:
            text = f"📚 Bugungi dars: <b>{lesson.title}</b>\n\n"
        else:
            text = "✅ Bugun uchun barcha darslar tugallangan!\n\n"

        if sr_count > 0:
            text += f"📋 {sr_count} ta kartochka takrorlash kutmoqda\n\n"

        text += "To'liq dars uchun: https://mindos.uz/dashboard"
        await update.message.reply_text(text, parse_mode="HTML")


async def streak_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    telegram_id = str(update.effective_user.id)
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.telegram_id == telegram_id))
        user = result.scalar_one_or_none()
        if not user:
            await update.message.reply_text("Avval ro'yxatdan o'ting: /start")
            return

        emoji = "🔥" if user.streak >= 7 else "🌱"
        await update.message.reply_text(
            f"{emoji} Joriy streak: <b>{user.streak} kun</b>\n"
            f"🏆 Rekord: {user.max_streak} kun",
            parse_mode="HTML",
        )


async def progress_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    telegram_id = str(update.effective_user.id)
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.telegram_id == telegram_id))
        user = result.scalar_one_or_none()
        if not user:
            await update.message.reply_text("Avval ro'yxatdan o'ting: /start")
            return

        from datetime import timedelta
        week_ago = datetime.now(timezone.utc) - timedelta(days=7)
        lessons_result = await db.execute(
            select(func.count(Lesson.id))
            .join(Curriculum)
            .where(
                Curriculum.user_id == user.id,
                Lesson.status == LessonStatus.completed,
                Lesson.completed_at >= week_ago,
            )
        )
        count = lessons_result.scalar() or 0
        await update.message.reply_text(
            f"📊 Oxirgi 7 kun:\n"
            f"📚 {count} ta dars tugatildi\n"
            f"🎯 Streak: {user.streak} kun\n\n"
            f"Davom etamiz! https://mindos.uz/progress"
        )


async def remind_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    args = context.args
    if not args or ":" not in args[0]:
        await update.message.reply_text("Foydalanish: /remind 09:00")
        return

    time_str = args[0]
    telegram_id = str(update.effective_user.id)
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.telegram_id == telegram_id))
        user = result.scalar_one_or_none()
        if not user:
            await update.message.reply_text("Avval ro'yxatdan o'ting: /start")
            return
        user.notify_time = time_str
        await db.commit()
        await update.message.reply_text(f"✅ Eslatma vaqti {time_str} ga o'rnatildi")


async def pause_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    telegram_id = str(update.effective_user.id)
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.telegram_id == telegram_id))
        user = result.scalar_one_or_none()
        if not user:
            return
        user.notify_daily = False
        await db.commit()
        await update.message.reply_text("⏸ Eslatmalar to'xtatildi. Qayta yoqish: /remind")


async def premium_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "⭐ MindOS Pro — $9/oy\n\n"
        "✅ Cheksiz chat\n"
        "✅ Ovoz input\n"
        "✅ Diagram va vizual tushuntirish\n"
        "✅ To'liq Progress Agent\n\n"
        "Sotib olish: https://mindos.uz/pricing"
    )


async def help_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "📋 Barcha buyruqlar:\n\n"
        "/start — boshlash / ro'yxatdan o'tish\n"
        "/today — bugungi dars va SR kartochkalar\n"
        "/streak — joriy streak\n"
        "/progress — haftalik qisqa hisobot\n"
        "/remind HH:MM — eslatma vaqtini sozlash\n"
        "/pause — eslatmalarni to'xtatish\n"
        "/premium — Pro rejaga o'tish\n"
        "/help — shu xabar"
    )


async def fallback_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "To'liq suhbat uchun MindOS web ilovasiga o'ting: https://mindos.uz/chat\n\n"
        "Buyruqlar ro'yxati: /help"
    )


def build_application() -> Application:
    application = Application.builder().token(settings.TELEGRAM_BOT_TOKEN).build()

    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("today", today_cmd))
    application.add_handler(CommandHandler("streak", streak_cmd))
    application.add_handler(CommandHandler("progress", progress_cmd))
    application.add_handler(CommandHandler("remind", remind_cmd))
    application.add_handler(CommandHandler("pause", pause_cmd))
    application.add_handler(CommandHandler("premium", premium_cmd))
    application.add_handler(CommandHandler("help", help_cmd))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, fallback_message))

    return application


if __name__ == "__main__":
    app = build_application()
    logger.info("MindOS Telegram bot ishga tushdi (polling mode)")
    app.run_polling()
