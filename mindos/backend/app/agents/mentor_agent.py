import logging
from datetime import datetime, timezone
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from openai import AsyncOpenAI
import pytz

from app.core.config import settings
from app.models.user import User, Message, Curriculum
from app.services.memory_service import MemoryService

logger = logging.getLogger(__name__)
client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

SOCRATIC_SYSTEM = """Sen MindOS platformasining shaxsiy AI mentorisan. Ismingiz — MindOS Mentor.

ASOSIY QOIDALAR:
1. SOKRATIK USLUB: Hech qachon javobni to'g'ridan-to'g'ri berma. Avval savol ber: "Sizningcha nima uchun?", "Qanday o'ylaysiz?", "Agar X bo'lsa, Y nima bo'ladi?"
2. XOTIRA: Foydalanuvchi haqida bilganlaringni ishlatib gapir — ismi, maqsadi, oldingi darslar
3. REAL VAQT: Hozirgi sana/vaqt: {current_datetime}. Bugungi dars, hafta, progress — hammasini bilasan
4. TIL: Foydalanuvchi tili: {lang}. Shu tilda javob ber. Kod inglizcha bo'lishi mumkin, tushuntirish {lang} tilida
5. QAYISH DETEKSIYASI:
   - 3 kun kelmagan bo'lsa: "Sog'indik! Davom etishga tayyormisiz?"
   - 7+ kun kelmagan bo'lsa: "Xush kelibsiz! {days_away} kun bo'libdi — qaytadan isitib olaylikmi?"
6. DIAGRAM: Murakkab tushuncha uchun Mermaid.js kodi ber: ```mermaid\n...\n```
7. KOD: Syntax highlight uchun tilni ko'rsat: ```python\n...\n```
8. STREAK: Foydalanuvchi streak ini maqtab tur, motivatsiya ber

FOYDALANUVCHI MA'LUMOTLARI:
{user_context}

UZOQ MUDDATLI XOTIRA (Eng muhim faktlar):
{long_term_memories}

HOZIRGI O'QUV REJASI:
{curriculum_context}"""


class MentorAgent:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.memory_service = MemoryService(db)

    async def get_system_prompt(self, user: User, user_message: str = "") -> str:
        """Har sessiya uchun kontekstga asoslanib tizim prompti yaratish"""
        # Real vaqt
        user_tz = pytz.timezone(user.timezone or "Asia/Tashkent")
        now = datetime.now(user_tz)
        current_datetime = now.strftime("%Y yil %d %B, %A, soat %H:%M")

        # Qayish deteksiyasi
        days_away = 0
        days_away_text = ""
        if user.last_active:
            diff = now - user.last_active.astimezone(user_tz)
            days_away = diff.days
            if days_away >= 7:
                days_away_text = f"days_away={days_away}"

        # Foydalanuvchi konteksti
        user_context = f"""
- Ism: {user.full_name or 'Foydalanuvchi'}
- Plan: {user.plan}
- Streak: {user.streak} kun (rekord: {user.max_streak} kun)
- Onboarding: {'Tugallangan' if user.onboarding_completed else 'Tugallanmagan'}
- {days_away_text}
""".strip()

        # Uzoq muddatli xotira — TZ 2.3.2: hozirgi savolga semantik mos xotiralar
        # (embedding orqali pgvector cosine similarity qidiruvi)
        if user_message.strip():
            memories = await self.memory_service.search_relevant_memories(
                user.id, user_message, limit=10
            )
        else:
            memories = await self.memory_service._fallback_recent_important(user.id, limit=10)

        long_term = "\n".join([f"- {m.content}" for m in memories]) or "Hali xotira yo'q"

        # O'quv rejasi
        curr_result = await self.db.execute(
            select(Curriculum)
            .where(Curriculum.user_id == user.id, Curriculum.status == "active")
            .limit(1)
        )
        curriculum = curr_result.scalar_one_or_none()
        curriculum_context = f"Mavzu: {curriculum.topic}, Daraja: {curriculum.level}" if curriculum else "Hali o'quv reja yo'q"

        lang_names = {"uz": "O'zbek", "ru": "Rus", "en": "Ingliz"}
        lang = lang_names.get(user.lang, "O'zbek")

        return SOCRATIC_SYSTEM.format(
            current_datetime=current_datetime,
            lang=lang,
            days_away=days_away,
            user_context=user_context,
            long_term_memories=long_term,
            curriculum_context=curriculum_context,
        )

    async def get_short_term_memory(self, user_id: int, limit: int = 20) -> list[dict]:
        """Oxirgi N ta xabarni olish (short-term memory)"""
        result = await self.db.execute(
            select(Message)
            .where(Message.user_id == user_id)
            .order_by(desc(Message.created_at))
            .limit(limit)
        )
        messages = result.scalars().all()
        messages.reverse()  # Eskidan yangi tartibda

        return [{"role": m.role, "content": m.content} for m in messages]

    async def chat_stream(
        self,
        user: User,
        user_message: str,
        message_type: str = "text",
    ) -> AsyncGenerator[str, None]:
        """Streaming SSE — AI javobini token-by-token qaytarish"""

        # Foydalanuvchi xabarini saqlash
        msg = Message(
            user_id=user.id,
            role="user",
            content=user_message,
            message_type=message_type,
        )
        self.db.add(msg)
        await self.db.flush()

        # Kontekst tayyorlash — semantik xotira qidiruvi hozirgi savolga asoslanadi
        system_prompt = await self.get_system_prompt(user, user_message)
        history = await self.get_short_term_memory(user.id, limit=19)  # 20 - yangi xabar = 19

        messages = [
            {"role": "system", "content": system_prompt},
            *history,
            {"role": "user", "content": user_message},
        ]

        # Streaming
        full_response = ""
        try:
            stream = await client.chat.completions.create(
                model=settings.OPENAI_MODEL,
                messages=messages,
                temperature=0.7,
                max_tokens=1000,
                stream=True,
            )

            async for chunk in stream:
                delta = chunk.choices[0].delta.content
                if delta:
                    full_response += delta
                    yield delta

        except Exception as e:
            logger.error(f"Mentor Agent xatosi: {e}")
            yield "Kechirasiz, texnik xatolik yuz berdi. Iltimos qayta urinib ko'ring."
            return

        # AI javobini saqlash — message_type avtomatik aniqlanadi (TZ 5.2: diagram/code/text)
        ai_msg = Message(
            user_id=user.id,
            role="assistant",
            content=full_response,
            message_type=self._detect_response_type(full_response),
            tokens_used=len(full_response.split()),  # Taxminiy
        )
        self.db.add(ai_msg)

        # Streak va last_active yangilash
        await self._update_streak(user)

        await self.db.commit()

        # Muhim ma'lumotni xotiraga saqlash (background)
        await self._maybe_save_memory(user.id, user_message, full_response)

    @staticmethod
    def _detect_response_type(content: str) -> str:
        """AI javobida mermaid diagram yoki kod blok borligini aniqlash (TZ 5.2)"""
        if "```mermaid" in content:
            return "diagram"
        if "```" in content:
            return "code"
        return "text"

    async def _update_streak(self, user: User):
        """Kunlik streak yangilash"""
        user_tz = pytz.timezone(user.timezone or "Asia/Tashkent")
        now = datetime.now(user_tz)
        today = now.date()

        if user.last_active:
            last_day = user.last_active.astimezone(user_tz).date()
            if last_day == today:
                pass  # Bugun allaqachon faol — streak o'zgarmaydi
            elif (today - last_day).days == 1:
                user.streak += 1
                if user.streak > user.max_streak:
                    user.max_streak = user.streak
            else:
                user.streak = 1  # Streak uzildi

        else:
            user.streak = 1

        user.last_active = datetime.now(timezone.utc)

    async def _maybe_save_memory(self, user_id: int, user_msg: str, ai_response: str):
        """
        Muhim faktlarni long-term memory ga saqlash — TZ 2.3.2.
        Heuristika (kalit so'z) qaysi xabarlar saqlanishga loyiq ekanini aniqlaydi,
        keyin MemoryService orqali haqiqiy OpenAI embedding generatsiya qilinadi
        va pgvector ustunida saqlanadi — keyingi suhbatlarda semantik qidiruv uchun.
        """
        if self.memory_service.should_remember(user_msg):
            await self.memory_service.save_memory(
                user_id=user_id,
                content=f"Foydalanuvchi aytdi: {user_msg[:300]}",
                importance=2.0,
                memory_type="preference",
            )
            await self.db.commit()
