"""
Diagnostic Service — TZ ga qo'shimcha: "Adaptiv diagnostika".

Onboarding paytida foydalanuvchi o'zi "boshlang'ich/o'rta/yuqori" deb taxmin qilish
o'rniga, AI mavzuga mos qisqa (4 ta savolli) diagnostika testi tuzadi va natijaga
qarab darajani ANIQ belgilaydi. Statelesss ishlaydi — savol/javoblar DB'ga
yozilmaydi, to'g'ri javoblar HMAC bilan imzolangan JWT ("quiz_token") ichida
frontendga yuboriladi, keyin skorlashda shu tokenni qayta tekshirib chiqamiz.
Shu sababli yangi jadval/migratsiya kerak emas va token soxtalashtirib bo'lmaydi.
"""
import json
import logging
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from openai import AsyncOpenAI

from app.core.config import settings
from app.models.user import LevelEnum

logger = logging.getLogger(__name__)
client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

LANG_NAMES = {"uz": "o'zbek", "ru": "rus", "en": "ingliz"}

DIAGNOSTIC_SYSTEM = """Sen MindOS platformasining Diagnostika Agentisan.
Vazifang: foydalanuvchi kiritgan mavzu bo'yicha uning HAQIQIY darajasini aniqlaydigan
4 ta savoldan iborat qisqa test tuzish — savollar oson emas, chindan ham farqlovchi bo'lsin.

Qoidalar:
1. Aniq 4 ta savol: 1-si beginner darajani, 2-si va 3-si intermediate darajani,
   4-si advanced darajani tekshiradigan qilib tuzilsin (progressiv qiyinlashish).
2. Har savol 4 ta variantli (faqat 1 tasi to'g'ri).
3. Savol va variantlar {lang} tilida (mavzuga oid texnik atamalar xalqaro shaklda qolishi mumkin).
4. Javobni FAQAT JSON formatida ber, boshqa matn yo'q.

JSON struktura:
{
  "questions": [
    {"question": "...", "options": ["...", "...", "...", "..."], "correct_index": 0, "difficulty": "beginner"},
    {"question": "...", "options": ["...", "...", "...", "..."], "correct_index": 2, "difficulty": "intermediate"},
    {"question": "...", "options": ["...", "...", "...", "..."], "correct_index": 1, "difficulty": "intermediate"},
    {"question": "...", "options": ["...", "...", "...", "..."], "correct_index": 3, "difficulty": "advanced"}
  ]
}"""

QUIZ_TOKEN_EXPIRE_MINUTES = 20


def _default_quiz(topic: str, lang: str) -> dict:
    """AI ishlamasa fallback — umumiy savollar (baribir foydalanuvchini bloklamaslik uchun)."""
    return {
        "questions": [
            {
                "question": f"'{topic}' bilan avval qanchalik shug'ullangansiz?",
                "options": ["Hech qachon", "Bir marta eshitganman", "Biroz amaliyotim bor", "Muntazam ishlataman"],
                "correct_index": 3,
                "difficulty": "beginner",
            },
            {
                "question": f"'{topic}' bo'yicha asosiy atamalarni tushuntira olasizmi?",
                "options": ["Yo'q, birinchi marta eshityapman", "Bir nechtasini bilaman", "Ko'pchiligini bilaman", "Hammasini bilaman"],
                "correct_index": 2,
                "difficulty": "intermediate",
            },
            {
                "question": f"'{topic}' bo'yicha mustaqil amaliy loyiha qilganmisiz?",
                "options": ["Yo'q", "Boshlaganman, tugatmaganman", "1-2 tasini tugatganman", "Bir nechtasini tugatganman"],
                "correct_index": 2,
                "difficulty": "intermediate",
            },
            {
                "question": f"'{topic}' dagi murakkab/ilg'or mavzularni boshqalarga o'rgata olasizmi?",
                "options": ["Yo'q", "Qisman", "Ha, ba'zilarini", "Ha, to'liq"],
                "correct_index": 3,
                "difficulty": "advanced",
            },
        ]
    }


async def generate_diagnostic_quiz(topic: str, lang: str) -> dict:
    """4 savolli diagnostika testi tuzadi va imzolangan quiz_token bilan qaytaradi."""
    lang_name = LANG_NAMES.get(lang, "o'zbek")
    quiz_data = None

    for attempt in range(2):
        try:
            response = await client.chat.completions.create(
                model=settings.OPENAI_MODEL,
                messages=[
                    {"role": "system", "content": DIAGNOSTIC_SYSTEM.replace("{lang}", lang_name)},
                    {"role": "user", "content": f"Mavzu: {topic}"},
                ],
                temperature=0.4,
                max_tokens=1200,
                response_format={"type": "json_object"},
            )
            quiz_data = json.loads(response.choices[0].message.content)
            if not quiz_data.get("questions") or len(quiz_data["questions"]) < 3:
                raise ValueError("Yetarli savol qaytmadi")
            break
        except Exception as e:
            logger.warning(f"Diagnostika testi urinish {attempt + 1} muvaffaqiyatsiz: {e}")
            continue

    if quiz_data is None:
        quiz_data = _default_quiz(topic, lang)

    questions = quiz_data["questions"]

    # To'g'ri javoblar + qiyinlik darajalarini imzolangan tokenga yashiramiz —
    # frontendga faqat savol+variantlar (correct_index'siz) yuboriladi.
    expire = datetime.now(timezone.utc) + timedelta(minutes=QUIZ_TOKEN_EXPIRE_MINUTES)
    token_payload = {
        "typ": "diagnostic",
        "topic": topic,
        "answers": [
            {"correct_index": q.get("correct_index", 0), "difficulty": q.get("difficulty", "beginner")}
            for q in questions
        ],
        "exp": expire,
    }
    quiz_token = jwt.encode(token_payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

    public_questions = [
        {"question": q.get("question", ""), "options": q.get("options", [])}
        for q in questions
    ]

    return {"questions": public_questions, "quiz_token": quiz_token, "topic": topic}


_DIFFICULTY_WEIGHT = {"beginner": 1.0, "intermediate": 1.5, "advanced": 2.0}


def score_diagnostic_quiz(quiz_token: str, answers: list[int]) -> dict:
    """quiz_token'ni tekshiradi, javoblarni solishtiradi va tavsiya darajani qaytaradi."""
    try:
        payload = jwt.decode(quiz_token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        raise ValueError("Diagnostika testi muddati o'tgan yoki yaroqsiz — qaytadan urinib ko'ring")

    if payload.get("typ") != "diagnostic":
        raise ValueError("Yaroqsiz token turi")

    correct_answers = payload.get("answers", [])
    if len(answers) != len(correct_answers):
        raise ValueError("Javoblar soni savollar soniga mos kelmadi")

    total_weight = 0.0
    earned_weight = 0.0
    correct_count = 0

    for user_ans, ref in zip(answers, correct_answers):
        weight = _DIFFICULTY_WEIGHT.get(ref.get("difficulty", "beginner"), 1.0)
        total_weight += weight
        if user_ans == ref.get("correct_index"):
            earned_weight += weight
            correct_count += 1

    score_percent = round((earned_weight / total_weight) * 100, 1) if total_weight > 0 else 0.0

    if score_percent >= 75:
        level = LevelEnum.advanced
        reasoning = f"Testda {correct_count}/{len(correct_answers)} to'g'ri, shu jumladan yuqori qiyinlikdagilar ham — sizga 'Yuqori' daraja mos keladi."
    elif score_percent >= 40:
        level = LevelEnum.intermediate
        reasoning = f"Testda {correct_count}/{len(correct_answers)} to'g'ri — asoslarni bilasiz, 'O'rta' darajadan boshlash tavsiya etiladi."
    else:
        level = LevelEnum.beginner
        reasoning = f"Testda {correct_count}/{len(correct_answers)} to'g'ri — 'Boshlang'ich' darajadan mustahkam boshlash eng samarali yo'l."

    return {
        "recommended_level": level.value,
        "score_percent": score_percent,
        "correct_count": correct_count,
        "total_questions": len(correct_answers),
        "reasoning": reasoning,
    }
