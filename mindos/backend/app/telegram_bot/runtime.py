"""
Telegram bot Application'ining yagona nusxasi (singleton).

Bot webhook rejimida ishlaydi — alohida polling process/worker kerak emas,
Telegram serverlari yangilanishlarni to'g'ridan-to'g'ri bizning FastAPI
web-service'imizga (POST /api/v1/webhooks/telegram) yuboradi. Bu qo'shimcha
Render worker xarajatisiz butun bot funksionalligini (bot.py'dagi barcha
/start, /today, /streak va h.k. handler'lar) ishga tushiradi.
"""
import logging
from typing import Optional

from telegram.ext import Application

from app.core.config import settings
from app.telegram_bot.bot import build_application

logger = logging.getLogger(__name__)

_application: Optional[Application] = None


def is_configured() -> bool:
    return bool(settings.TELEGRAM_BOT_TOKEN)


async def get_application() -> Optional[Application]:
    """Application'ni birinchi chaqiruvda yaratadi va initialize qiladi."""
    global _application
    if not is_configured():
        return None
    if _application is None:
        _application = build_application()
        await _application.initialize()
        logger.info("Telegram bot Application initialize qilindi (webhook rejimi)")
    return _application


async def shutdown_application() -> None:
    global _application
    if _application is not None:
        await _application.shutdown()
        _application = None
