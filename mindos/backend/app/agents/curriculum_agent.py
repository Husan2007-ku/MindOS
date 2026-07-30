import json
import logging
from datetime import datetime, timezone, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from openai import AsyncOpenAI

from app.core.config import settings
from app.models.user import Curriculum, Lesson, LessonStatus
from app.services.memory_service import MemoryService

logger = logging.getLogger(__name__)
client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

LANG_NAMES = {"uz": "o'zbek", "ru": "rus", "en": "ingliz"}

SYSTEM_PROMPT = """Sen MindOS platformasining Curriculum Agent issan.
Sening vazifang: foydalanuvchi maqsadi va darajasi asosida SHAXSIY o'quv reja tuzish.

Qoidalar:
1. Javobni FAQAT JSON formatida ber — hech qanday matn yoki markdown yo'q
2. Har hafta uchun 5 ta dars (dam olish kunlari hisobga olinmagan)
3. Darslar progressiv — oddiydan murakkabga
4. Har dars uchun aniq sarlavha va 3-5 ta asosiy nuqta
5. Resurslar: bepul va mavjud manbalarga asoslangin (YouTube, freeCodeCamp, docs.python.org va h.k.)

JSON struktura:
{
  "total_weeks": <int, 8-16>,
  "overview": "<reja qisqacha tavsifi>",
  "milestones": ["<hafta X da erishiladigan natija>", ...],
  "weeks": [
    {
      "week": 1,
      "theme": "<hafta mavzusi>",
      "days": [
        {
          "day": 1,
          "title": "<dars sarlavhasi>",
          "key_points": ["<asosiy nuqta 1>", ...],
          "resources": [{"title": "<manba nomi>", "url": "<link yoki tavsif>"}],
          "homework": "<vazifa savoli>"
        },
        ...
      ]
    },
    ...
  ]
}"""


class CurriculumAgent:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.memory_service = MemoryService(db)

    async def generate(
        self,
        curriculum_id: int,
        user_id: int,
        topic: str,
        level: str,
        daily_minutes: int,
        current_knowledge: str,
        goal: str,
        lang: str,
    ):
        logger.info(f"Curriculum Agent boshlandi: user={user_id}, topic={topic}")

        user_prompt = f"""
Foydalanuvchi ma'lumoti:
- O'rganmoqchi: {topic}
- Daraja: {level}
- Kuniga vaqt: {daily_minutes} daqiqa
- Hozirgi bilim: {current_knowledge or 'Noma\'lum'}
- Maqsad: {goal or 'Umumiy bilim olish'}
- Til: {LANG_NAMES.get(lang, 'o\'zbek')}

Barcha tushuntirishlar, sarlavhalar va izohlar {LANG_NAMES.get(lang, 'o\'zbek')} tilida bo'lsin."""

        curriculum_data = None
        last_error = None

        # 3 marta urinish
        for attempt in range(3):
            try:
                response = await client.chat.completions.create(
                    model=settings.OPENAI_MODEL,
                    messages=[
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": user_prompt},
                    ],
                    temperature=0.3,
                    max_tokens=4000,
                    response_format={"type": "json_object"},
                )

                raw = response.choices[0].message.content
                curriculum_data = json.loads(raw)
                logger.info(f"Curriculum Agent muvaffaqiyatli: {curriculum_data.get('total_weeks')} hafta")
                break

            except (json.JSONDecodeError, Exception) as e:
                last_error = str(e)
                logger.warning(f"Urinish {attempt + 1} muvaffaqiyatsiz: {e}")
                continue

        # Agent muvaffaqiyatsiz bo'lsa — default template
        if curriculum_data is None:
            logger.error(f"Curriculum Agent 3 marta muvaffaqiyatsiz: {last_error}")
            curriculum_data = self._default_template(topic, lang)

        # DB ga saqlash
        await self._save_to_db(curriculum_id, curriculum_data)

        # Onboarding ma'lumotlarini darhol uzoq muddatli xotiraga urug'lash (TZ 2.3.2).
        # Bu Mentor Agent ning birinchi suhbatdan boshlab foydalanuvchi maqsadini
        # "eslab qolishi" uchun zarur — onboarding paytida hech qanday chat xabari
        # yo'q, shuning uchun Mentor Agent ning heuristikasi bu ma'lumotni ko'rmaydi.
        if goal.strip():
            await self.memory_service.save_memory(
                user_id=user_id,
                content=f"Foydalanuvchining maqsadi: {goal.strip()[:300]}",
                importance=3.0,
                memory_type="preference",
            )
        if current_knowledge.strip():
            await self.memory_service.save_memory(
                user_id=user_id,
                content=f"Onboarding paytida aytgan hozirgi bilimi: {current_knowledge.strip()[:300]}",
                importance=2.5,
                memory_type="fact",
            )
        await self.db.commit()

    async def _save_to_db(self, curriculum_id: int, data: dict):
        result = await self.db.execute(
            select(Curriculum).where(Curriculum.id == curriculum_id)
        )
        curriculum = result.scalar_one_or_none()
        if not curriculum:
            logger.error(f"Curriculum topilmadi: {curriculum_id}")
            return

        curriculum.curriculum_data = data
        curriculum.total_weeks = data.get("total_weeks", 12)

        # Darslarni yaratish
        base_date = datetime.now(timezone.utc)
        day_counter = 0

        for week_data in data.get("weeks", []):
            week_num = week_data.get("week", 1)
            for day_data in week_data.get("days", []):
                lesson = Lesson(
                    curriculum_id=curriculum_id,
                    week=week_num,
                    day=day_data.get("day", 1),
                    title=day_data.get("title", "Dars"),
                    content={
                        "key_points": day_data.get("key_points", []),
                        "resources": day_data.get("resources", []),
                        "homework": day_data.get("homework", ""),
                        "week_theme": week_data.get("theme", ""),
                    },
                    status=LessonStatus.pending,
                )
                self.db.add(lesson)
                day_counter += 1

        await self.db.commit()
        logger.info(f"Curriculum {curriculum_id}: {day_counter} ta dars saqlandi")

    def _default_template(self, topic: str, lang: str) -> dict:
        """Agent ishlamagan holda fallback template"""
        return {
            "total_weeks": 8,
            "overview": f"{topic} bo'yicha 8 haftalik asosiy kurs",
            "milestones": [
                "Hafta 2: Asosiy tushunchalar o'rganildi",
                "Hafta 4: Birinchi amaliy loyiha yaratildi",
                "Hafta 8: Mustaqil ishlash qobiliyati",
            ],
            "weeks": [
                {
                    "week": i,
                    "theme": f"Hafta {i}: {topic} — Bosqich {i}",
                    "days": [
                        {
                            "day": d,
                            "title": f"Kun {d}: Amaliyot",
                            "key_points": ["Nazariy bilim", "Amaliyot", "Takrorlash"],
                            "resources": [{"title": "Qo'llanma", "url": "Muallif bilan muhokama qiling"}],
                            "homework": "Bugungi mavzuni o'z so'zlaringiz bilan tushuntiring",
                        }
                        for d in range(1, 6)
                    ],
                }
                for i in range(1, 9)
            ],
        }
