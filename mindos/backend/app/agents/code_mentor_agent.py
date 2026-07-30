import logging
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from openai import AsyncOpenAI

from app.core.config import settings
from app.models.user import User, Message

logger = logging.getLogger(__name__)
client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

LANG_NAMES = {"uz": "o'zbek", "ru": "rus", "en": "ingliz"}

CODE_MENTOR_SYSTEM = """Sen MindOS platformasining Code Mentor Agent issan.

ASOSIY QOIDA — HECH QACHON BUZILMAYDI:
Foydalanuvchi kod yozganda yoki dasturlash savol bersa, TO'G'RI JAVOBNI HECH QACHON TO'G'RIDAN-TO'G'RI BERMA.

Buning o'rniga:
1. Kodni diqqat bilan o'qi, xato yoki yaxshilash joyini ANIQLA (ichingda, foydalanuvchiga aytmasdan)
2. Yo'naltiruvchi savol ber: "Bu qatorda nima sodir bo'lishini kutyapsiz?", "Agar X = 0 bo'lsa nima bo'ladi?",
   "Qaysi qatorda xato bo'lishi mumkin deb o'ylaysiz?"
3. Foydalanuvchi javob bersa — to'g'ri bo'lsa tasdiqla va keyingi qadamga yo'nalt.
   Noto'g'ri bo'lsa — yana boshqa kichikroq savol bilan yo'naltir, lekin javobni hali ham berma.
3. Faqat foydalanuvchi 2-3 marta urinib, hali topa olmasa — kichik maslahat ber (hint), 
   lekin to'liq tuzatilgan kodni emas.
4. Foydalanuvchi haqiqatan qiynalsa va aniq so'rasa ("javobni ayt", "tushunmadim, ko'rsat") — 
   shunda ham avval tushuntir, NEGA xato, keyin to'g'ri yo'nalishni ko'rsat — lekin tayyor kodni
   to'liq yozib bermaslikka harakat qil. Tarbiyaviy maqsad — o'ylashni o'rgatish.

KOD KO'RSATISH:
- Kod bloklarini har doim til nomi bilan belgilab ber: ```python, ```javascript va h.k.
- Agar tushuntirish uchun diagram kerak bo'lsa, Mermaid.js ishlatishing mumkin: ```mermaid

TIL: {lang} tilida tushuntir. Kod o'zi (o'zgaruvchi nomlari, funksiyalar) — dasturlash tili 
qoidalariga ko'ra inglizcha qoladi, lekin SENING IZOHLARING {lang} tilida bo'lsin.

OHANG: Mehribon, sabrli, hech qachon kamsitma. Xato qilish — o'rganish jarayonining tabiiy qismi."""


class CodeMentorAgent:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_history(self, user_id: int, limit: int = 10) -> list[dict]:
        """Oxirgi kod-mentor suhbatlarini olish (qisqaroq kontekst — kod ko'p joy oladi)"""
        result = await self.db.execute(
            select(Message)
            .where(Message.user_id == user_id, Message.message_type.in_(["code", "text"]))
            .order_by(desc(Message.created_at))
            .limit(limit)
        )
        messages = result.scalars().all()
        messages.reverse()
        return [{"role": m.role, "content": m.content} for m in messages]

    async def review_stream(
        self,
        user: User,
        user_message: str,
        code_snippet: str = "",
    ) -> AsyncGenerator[str, None]:
        """
        Foydalanuvchi savoli + (ixtiyoriy) kod parchasi bilan Sokratik kod sharhi.
        Javobni to'g'ridan-to'g'ri bermaydi — yo'naltiruvchi savol beradi.
        """
        full_input = user_message
        if code_snippet.strip():
            full_input += f"\n\n```\n{code_snippet}\n```"

        msg = Message(
            user_id=user.id,
            role="user",
            content=full_input,
            message_type="code",
        )
        self.db.add(msg)
        await self.db.flush()

        lang_name = LANG_NAMES.get(user.lang, "o'zbek")
        system_prompt = CODE_MENTOR_SYSTEM.format(lang=lang_name)
        history = await self.get_history(user.id, limit=9)

        messages = [
            {"role": "system", "content": system_prompt},
            *history,
            {"role": "user", "content": full_input},
        ]

        full_response = ""
        try:
            stream = await client.chat.completions.create(
                model=settings.OPENAI_MODEL,
                messages=messages,
                temperature=0.5,
                max_tokens=800,
                stream=True,
            )
            async for chunk in stream:
                delta = chunk.choices[0].delta.content
                if delta:
                    full_response += delta
                    yield delta
        except Exception as e:
            logger.error(f"Code Mentor Agent xatosi: {e}")
            yield "Kechirasiz, texnik xatolik yuz berdi. Iltimos qayta urinib ko'ring."
            return

        ai_msg = Message(
            user_id=user.id,
            role="assistant",
            content=full_response,
            message_type="code" if "```" in full_response else "text",
            tokens_used=len(full_response.split()),
        )
        self.db.add(ai_msg)
        await self.db.commit()
