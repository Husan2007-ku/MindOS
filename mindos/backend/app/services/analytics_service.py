"""
Minimal mahsulot analitikasi — PostHog/Mixpanel ulanmagunча oraliq yechim.

MAQSAD: "foydalanuvchilar qaysi bosqichda tushib qolyapti" va "gamifikatsiya/
TTS kabi yangi funksiyalar umuman ishlatilyaptimi" degan savollarga birinchi
marta HAQIQIY RAQAM bilan javob berish (CPO tahlilida topilgan "analytics
umuman yo'q — ko'r-ko'rona boshqarilyapti" muammosiga javoban qo'shildi).

QOIDA: bu faqat kuzatuv (instrumentation) — hech qachon asosiy funksiyani
buzmasligi kerak. Shuning uchun log_event() har doim try/except ichida,
xato bo'lsa jim yutiladi va faqat log'ga yoziladi.
"""
import logging
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import AnalyticsEvent

logger = logging.getLogger(__name__)

# Kuzatilayotgan voqealar katalogi — yangi voqea qo'shsangiz shu yerga ham
# bir qatorlik izoh bilan qo'shing, keyin funnel'ni tushunish osonlashadi.
EVENT_USER_REGISTERED = "user_registered"
EVENT_DIAGNOSTIC_STARTED = "diagnostic_started"
EVENT_DIAGNOSTIC_COMPLETED = "diagnostic_completed"
EVENT_DIAGNOSTIC_SKIPPED = "diagnostic_skipped"
EVENT_ONBOARDING_COMPLETED = "onboarding_completed"
EVENT_LESSON_COMPLETED = "lesson_completed"
EVENT_HOMEWORK_SUBMITTED = "homework_submitted"
EVENT_TTS_PLAYED = "tts_played"
EVENT_CHECKOUT_STARTED = "checkout_started"


async def log_event(db: AsyncSession, event_type: str, user_id: int | None = None, meta: dict | None = None) -> None:
    """Bitta analitika voqeasini yozib qo'yish. Hech qachon exception ko'tarmaydi —
    instrumentation asosiy so'rovni hech qachon 500'ga aylantirmasligi kerak."""
    try:
        db.add(AnalyticsEvent(user_id=user_id, event_type=event_type, meta=meta))
        await db.flush()
    except Exception as e:
        logger.warning(f"Analytics event yozilmadi ({event_type}): {e}")
