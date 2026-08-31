from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, Float,
    Text, ForeignKey, JSON, Enum as SAEnum, UniqueConstraint
)
from sqlalchemy.orm import relationship
import enum
from pgvector.sqlalchemy import Vector

from app.core.database import Base


def utcnow():
    return datetime.now(timezone.utc)


# ─── Enums ────────────────────────────────────────────────
class PlanEnum(str, enum.Enum):
    free = "free"
    pro = "pro"
    team = "team"
    enterprise = "enterprise"


class LangEnum(str, enum.Enum):
    uz = "uz"
    ru = "ru"
    en = "en"


class LevelEnum(str, enum.Enum):
    beginner = "beginner"
    intermediate = "intermediate"
    advanced = "advanced"


class CurriculumStatus(str, enum.Enum):
    active = "active"
    paused = "paused"
    completed = "completed"


class LessonStatus(str, enum.Enum):
    pending = "pending"
    in_progress = "in_progress"
    completed = "completed"


class NotificationChannel(str, enum.Enum):
    telegram = "telegram"
    email = "email"
    in_app = "in_app"


# ─── User ─────────────────────────────────────────────────
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=True)  # Telegram auth da yo'q bo'lishi mumkin
    full_name = Column(String(255), nullable=True)
    telegram_id = Column(String(50), unique=True, index=True, nullable=True)
    telegram_username = Column(String(100), nullable=True)

    lang = Column(SAEnum(LangEnum), default=LangEnum.uz, nullable=False)
    timezone = Column(String(50), default="Asia/Tashkent", nullable=False)
    plan = Column(SAEnum(PlanEnum), default=PlanEnum.free, nullable=False)

    streak = Column(Integer, default=0, nullable=False)
    max_streak = Column(Integer, default=0, nullable=False)
    last_active = Column(DateTime(timezone=True), nullable=True)

    is_active = Column(Boolean, default=True, nullable=False)
    is_admin = Column(Boolean, default=False, nullable=False)
    onboarding_completed = Column(Boolean, default=False, nullable=False)

    # Notification sozlamalari
    notify_daily = Column(Boolean, default=True)
    notify_time = Column(String(5), default="09:00")  # HH:MM
    notify_streak = Column(Boolean, default=True)
    notify_sr = Column(Boolean, default=True)

    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    # Gamifikatsiya (XP/yutuqlar)
    xp = Column(Integer, default=0, nullable=False)

    # Telegram akkaunt bog'lash (mavjud foydalanuvchi uchun bir martalik kod)
    telegram_link_code = Column(String(16), unique=True, nullable=True, index=True)
    telegram_link_code_expires = Column(DateTime(timezone=True), nullable=True)
    last_daily_reminder_at = Column(DateTime(timezone=True), nullable=True)

    # Free rejadagi kunlik TTS (ovozli javob) limiti — 100% blok o'rniga
    # cheklangan "pro tatib ko'rish" imkoniyati (kuniga tiklanadi)
    tts_daily_count = Column(Integer, default=0, nullable=False)
    tts_count_date = Column(String(10), nullable=True)  # "YYYY-MM-DD"

    # Relationships
    curricula = relationship("Curriculum", back_populates="user", cascade="all, delete-orphan")
    messages = relationship("Message", back_populates="user", cascade="all, delete-orphan")
    memories = relationship("Memory", back_populates="user", cascade="all, delete-orphan")
    spaced_items = relationship("SpacedItem", back_populates="user", cascade="all, delete-orphan")
    subscriptions = relationship("Subscription", back_populates="user", cascade="all, delete-orphan")
    notifications = relationship("Notification", back_populates="user", cascade="all, delete-orphan")
    sources = relationship("Source", back_populates="user", cascade="all, delete-orphan")
    badges = relationship("UserBadge", back_populates="user", cascade="all, delete-orphan")


# ─── Curriculum ───────────────────────────────────────────
class Curriculum(Base):
    __tablename__ = "curricula"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    topic = Column(String(500), nullable=False)
    level = Column(SAEnum(LevelEnum), nullable=False)
    total_weeks = Column(Integer, default=12)
    daily_minutes = Column(Integer, default=30)
    status = Column(SAEnum(CurriculumStatus), default=CurriculumStatus.active)
    curriculum_data = Column(JSON, nullable=True)  # Agent dan kelgan to'liq JSON
    created_at = Column(DateTime(timezone=True), default=utcnow)

    user = relationship("User", back_populates="curricula")
    lessons = relationship("Lesson", back_populates="curriculum", cascade="all, delete-orphan")
    sources = relationship("Source", back_populates="curriculum")


# ─── Lesson ───────────────────────────────────────────────
class Lesson(Base):
    __tablename__ = "lessons"

    id = Column(Integer, primary_key=True, index=True)
    curriculum_id = Column(Integer, ForeignKey("curricula.id", ondelete="CASCADE"), nullable=False)
    week = Column(Integer, nullable=False)
    day = Column(Integer, nullable=False)  # 1-7
    title = Column(String(500), nullable=False)
    content = Column(JSON, nullable=True)  # {summary, key_points, resources}
    status = Column(SAEnum(LessonStatus), default=LessonStatus.pending)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    curriculum = relationship("Curriculum", back_populates="lessons")
    homeworks = relationship("Homework", back_populates="lesson", cascade="all, delete-orphan")


# ─── Message (Chat tarix) ──────────────────────────────────
class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role = Column(String(20), nullable=False)  # user | assistant | system
    content = Column(Text, nullable=False)
    message_type = Column(String(20), default="text")  # text | code | diagram | voice
    tokens_used = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    user = relationship("User", back_populates="messages")


# ─── Memory (AI Long-term xotira) ─────────────────────────
class Memory(Base):
    __tablename__ = "memories"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    content = Column(Text, nullable=False)
    embedding = Column(Vector(1536), nullable=True)  # text-embedding-3-small
    importance = Column(Float, default=1.0)  # 0.0 - 5.0
    memory_type = Column(String(50), default="fact")  # fact | preference | achievement | mistake
    created_at = Column(DateTime(timezone=True), default=utcnow)

    user = relationship("User", back_populates="memories")


# ─── Homework ─────────────────────────────────────────────
class Homework(Base):
    __tablename__ = "homeworks"

    id = Column(Integer, primary_key=True, index=True)
    lesson_id = Column(Integer, ForeignKey("lessons.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    question = Column(Text, nullable=False)
    user_answer = Column(Text, nullable=True)
    ai_feedback = Column(Text, nullable=True)
    score = Column(Integer, nullable=True)  # 0-100
    submitted_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    lesson = relationship("Lesson", back_populates="homeworks")


# ─── SpacedItem (SM-2 kartochkalar) ───────────────────────
class SpacedItem(Base):
    __tablename__ = "spaced_items"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    lesson_id = Column(Integer, ForeignKey("lessons.id", ondelete="SET NULL"), nullable=True)
    front = Column(Text, nullable=False)   # Savol / tushuncha
    back = Column(Text, nullable=False)    # Javob / tushuntirish
    next_review_at = Column(DateTime(timezone=True), default=utcnow, index=True)
    interval_days = Column(Float, default=1.0)
    ease_factor = Column(Float, default=2.5)
    repetitions = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    user = relationship("User", back_populates="spaced_items")


# ─── Subscription ─────────────────────────────────────────
class Subscription(Base):
    __tablename__ = "subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    plan = Column(SAEnum(PlanEnum), nullable=False)
    stripe_subscription_id = Column(String(255), unique=True, nullable=True)
    stripe_customer_id = Column(String(255), nullable=True)
    status = Column(String(50), default="active")  # active | canceled | past_due
    current_period_end = Column(DateTime(timezone=True), nullable=True)
    cancel_at_period_end = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    user = relationship("User", back_populates="subscriptions")


# ─── Notification ─────────────────────────────────────────
class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    notification_type = Column(String(50), nullable=False)  # daily | streak | sr | weekly | milestone
    channel = Column(SAEnum(NotificationChannel), default=NotificationChannel.telegram)
    content = Column(Text, nullable=False)
    scheduled_at = Column(DateTime(timezone=True), nullable=True)
    sent_at = Column(DateTime(timezone=True), nullable=True)
    status = Column(String(20), default="pending")  # pending | sent | failed
    created_at = Column(DateTime(timezone=True), default=utcnow)

    user = relationship("User", back_populates="notifications")


# ─── Referral ─────────────────────────────────────────────
class Referral(Base):
    __tablename__ = "referrals"

    id = Column(Integer, primary_key=True, index=True)
    referrer_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    referred_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    code = Column(String(20), unique=True, nullable=False, index=True)
    status = Column(String(20), default="pending")  # pending | completed | rewarded
    reward_given = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    completed_at = Column(DateTime(timezone=True), nullable=True)


# ─── Source (NotebookLM-uslubidagi manba asosli o'rganish) ──
# Foydalanuvchi o'zi o'qiyotgan/o'qigan kursni, YouTube videoni yoki faylni
# (PDF/DOCX/TXT) qo'shishi mumkin. Matn chiqarib olinadi, bo'laklarga (chunk)
# bo'linadi va har bir bo'lak uchun embedding hisoblanadi (xuddi Memory kabi) —
# shu orqali Curriculum/Mentor Agent AI generatsiyasi HAQIQIY manbaga
# asoslanishi mumkin, o'ylab topilgan (hallucinated) ma'lumot o'rniga.
class SourceType(str, enum.Enum):
    file = "file"
    youtube = "youtube"
    text = "text"


class SourceStatus(str, enum.Enum):
    processing = "processing"
    ready = "ready"
    failed = "failed"


class Source(Base):
    __tablename__ = "sources"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    curriculum_id = Column(Integer, ForeignKey("curricula.id", ondelete="SET NULL"), nullable=True, index=True)
    type = Column(SAEnum(SourceType), nullable=False)
    title = Column(String(500), nullable=False)
    origin = Column(String(1000), nullable=True)  # asl fayl nomi yoki YouTube URL
    raw_text = Column(Text, nullable=True)  # to'liq chiqarib olingan matn
    status = Column(SAEnum(SourceStatus), default=SourceStatus.processing, nullable=False)
    error_message = Column(Text, nullable=True)
    char_count = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    user = relationship("User", back_populates="sources")
    curriculum = relationship("Curriculum", back_populates="sources")
    chunks = relationship("SourceChunk", back_populates="source", cascade="all, delete-orphan")


class SourceChunk(Base):
    __tablename__ = "source_chunks"

    id = Column(Integer, primary_key=True, index=True)
    source_id = Column(Integer, ForeignKey("sources.id", ondelete="CASCADE"), nullable=False, index=True)
    chunk_index = Column(Integer, nullable=False)
    content = Column(Text, nullable=False)
    embedding = Column(Vector(1536), nullable=True)  # text-embedding-3-small

    source = relationship("Source", back_populates="chunks")


# ─── UserBadge (Gamifikatsiya yutuqlari) ───────────────────
# Yutuqlar katalogi (nom, tavsif, ikonka) kodda staitk saqlanadi
# (app/services/gamification_service.py, BADGE_CATALOG) — bu jadval faqat
# foydalanuvchi qaysi badge_key'larni QACHON qo'lga kiritganini saqlaydi.
class UserBadge(Base):
    __tablename__ = "user_badges"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    badge_key = Column(String(50), nullable=False)
    earned_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    user = relationship("User", back_populates="badges")

    __table_args__ = (
        UniqueConstraint("user_id", "badge_key", name="uq_user_badge"),
    )


# ─── AnalyticsEvent (minimal mahsulot analitikasi) ───────────────────
# Sotib olinadigan Mixpanel/PostHog o'rniga eng arzon, o'zimizniki bo'lgan
# yechim: har muhim "funnel" nuqtasida bitta qator yozamiz. Bu orqali
# "foydalanuvchilar qaysi bosqichda tushib qolyapti" (masalan ro'yxatdan
# o'tgan lekin onboarding'ni tugatmagan) va "gamifikatsiya/TTS kabi yangi
# funksiyalar umuman ishlatilyaptimi" degan savollarga birinchi marta
# haqiqiy raqam bilan javob berish mumkin bo'ladi.
class AnalyticsEvent(Base):
    __tablename__ = "analytics_events"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    event_type = Column(String(50), nullable=False, index=True)
    meta = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)



# ─── PushSubscription (Web Push bildirishnomalari) ───────────────────
# Telegram bog'lamagan foydalanuvchilar ham (brauzer ruxsat bersa) kunlik
# eslatma/streak-xavf ogohlantirishini olishi uchun. VAPID protokoli orqali
# ishlaydi (app/services/push_service.py), Telegram'dan mustaqil.
class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    endpoint = Column(String(500), unique=True, nullable=False)
    p256dh = Column(String(255), nullable=False)
    auth = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
