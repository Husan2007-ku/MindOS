import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from datetime import datetime, timezone
from openai import AsyncOpenAI

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.config import settings
from app.models.user import User, Homework, Lesson

router = APIRouter(prefix="/homeworks", tags=["homeworks"])
logger = logging.getLogger(__name__)
client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

LANG_NAMES = {"uz": "o'zbek", "ru": "rus", "en": "ingliz"}

GRADING_SYSTEM = """Sen MindOS platformasining vazifa baholovchisisan.
Foydalanuvchi javobini 0-100 ball bilan baholang va qisqa, mehribon fikr bering (2-3 jumla).

Qoidalar:
1. Baho adolatli bo'lsin — to'liq tushunilgan javob 80+ ball, qisman tushunilgan 40-79, noto'g'ri <40
2. Fikr {lang} tilida, mehribon ohangda — kamchilikni ayblamasdan ko'rsating
3. JAVOBNI FAQAT JSON formatida ber: {{"score": <int>, "feedback": "<matn>"}}"""


class SubmitHomeworkRequest(BaseModel):
    answer: str


@router.get("/pending")
async def get_pending_homeworks(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Homework)
        .where(
            Homework.user_id == current_user.id,
            Homework.submitted_at.is_(None),
        )
        .order_by(Homework.created_at.desc())
    )
    homeworks = result.scalars().all()

    return {
        "homeworks": [
            {
                "id": h.id,
                "question": h.question,
                "user_answer": h.user_answer,
                "ai_feedback": h.ai_feedback,
                "score": h.score,
            }
            for h in homeworks
        ]
    }


@router.get("/{homework_id}")
async def get_homework(
    homework_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Homework).where(
            Homework.id == homework_id,
            Homework.user_id == current_user.id,
        )
    )
    hw = result.scalar_one_or_none()
    if not hw:
        raise HTTPException(status_code=404, detail="Vazifa topilmadi")

    return {
        "id": hw.id,
        "lesson_id": hw.lesson_id,
        "question": hw.question,
        "user_answer": hw.user_answer,
        "ai_feedback": hw.ai_feedback,
        "score": hw.score,
        "submitted_at": hw.submitted_at,
    }


@router.post("/{homework_id}/submit")
async def submit_homework(
    homework_id: int,
    data: SubmitHomeworkRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Javob topshirish — AI tekshiradi va baho + fikr qaytaradi (TZ 4.6)"""
    if not data.answer.strip():
        raise HTTPException(status_code=400, detail="Javob bo'sh bo'lishi mumkin emas")

    result = await db.execute(
        select(Homework).where(
            Homework.id == homework_id,
            Homework.user_id == current_user.id,
        )
    )
    hw = result.scalar_one_or_none()
    if not hw:
        raise HTTPException(status_code=404, detail="Vazifa topilmadi")

    if hw.submitted_at is not None:
        raise HTTPException(status_code=400, detail="Bu vazifa allaqachon topshirilgan")

    score, feedback = await _grade_answer(hw.question, data.answer, current_user.lang)

    hw.user_answer = data.answer
    hw.ai_feedback = feedback
    hw.score = score
    hw.submitted_at = datetime.now(timezone.utc)

    await db.commit()

    return {
        "id": hw.id,
        "score": score,
        "ai_feedback": feedback,
        "message": "Vazifa baholandi!",
    }


async def _grade_answer(question: str, answer: str, lang: str) -> tuple[int, str]:
    lang_name = LANG_NAMES.get(lang, "o'zbek")
    prompt = f"Savol: {question}\n\nFoydalanuvchi javobi: {answer}"

    try:
        response = await client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=[
                {"role": "system", "content": GRADING_SYSTEM.format(lang=lang_name)},
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
            max_tokens=300,
            response_format={"type": "json_object"},
        )
        import json
        result = json.loads(response.choices[0].message.content)
        score = max(0, min(100, int(result.get("score", 50))))
        feedback = result.get("feedback", "Javobingiz qabul qilindi.")
        return score, feedback
    except Exception as e:
        logger.error(f"Homework grading xatosi: {e}")
        return 50, "Javobingiz qabul qilindi, lekin avtomatik baholashda texnik xato yuz berdi."
