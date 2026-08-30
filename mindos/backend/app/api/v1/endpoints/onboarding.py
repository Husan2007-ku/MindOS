from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User, Curriculum, LevelEnum

router = APIRouter(prefix="/onboarding", tags=["onboarding"])


class OnboardingRequest(BaseModel):
    topic: str              # "Python dasturlash", "Ingliz tili", "Machine Learning"
    level: LevelEnum        # beginner | intermediate | advanced
    daily_minutes: int = 30 # Kuniga necha daqiqa
    current_knowledge: str = ""  # "Men Excel bilaman, lekin kod yozmagan"
    goal: str = ""          # "3 oyda ishga joylashmoqchiman"


class DiagnosticGenerateRequest(BaseModel):
    topic: str


class DiagnosticScoreRequest(BaseModel):
    quiz_token: str
    answers: list[int]


@router.post("/diagnostic/generate")
async def generate_diagnostic(
    data: DiagnosticGenerateRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Adaptiv diagnostika — TZ'dan tashqari qo'shilgan funksiya.
    Foydalanuvchi o'zi "boshlang'ich/o'rta/yuqori" deb TAXMIN qilishi o'rniga,
    AI mavzuga mos 4 ta savolli qisqa test tuzadi va shu asosda darajani aniq belgilaydi.
    """
    if len(data.topic.strip()) < 3:
        raise HTTPException(status_code=400, detail="Mavzu kamida 3 ta belgidan iborat bo'lishi kerak")

    from app.services.diagnostic_service import generate_diagnostic_quiz
    quiz = await generate_diagnostic_quiz(data.topic.strip(), current_user.lang.value)
    return quiz


@router.post("/diagnostic/score")
async def score_diagnostic(
    data: DiagnosticScoreRequest,
    current_user: User = Depends(get_current_user),
):
    """Diagnostika javoblarini baholaydi va tavsiya etilgan darajani qaytaradi."""
    from app.services.diagnostic_service import score_diagnostic_quiz
    try:
        result = score_diagnostic_quiz(data.quiz_token, data.answers)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return result


@router.post("/start")
async def start_onboarding(
    data: OnboardingRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.onboarding_completed:
        raise HTTPException(status_code=400, detail="Onboarding allaqachon tugallangan")

    if len(data.topic.strip()) < 3:
        raise HTTPException(status_code=400, detail="Mavzu kamida 3 ta belgidan iborat bo'lishi kerak")

    # Curriculum yozuvi yaratish
    curriculum = Curriculum(
        user_id=current_user.id,
        topic=data.topic.strip(),
        level=data.level,
        daily_minutes=data.daily_minutes,
    )
    db.add(curriculum)
    await db.flush()

    curriculum_id = curriculum.id

    # Foydalanuvchini onboarding tugallangan deb belgilash
    current_user.onboarding_completed = True
    await db.flush()

    # Background da Curriculum Agent ishga tushirish
    background_tasks.add_task(
        run_curriculum_agent,
        curriculum_id=curriculum_id,
        user_id=current_user.id,
        topic=data.topic,
        level=data.level.value,
        daily_minutes=data.daily_minutes,
        current_knowledge=data.current_knowledge,
        goal=data.goal,
        lang=current_user.lang.value,
    )

    return {
        "message": "Onboarding boshlandi! Shaxsiy o'quv reja tayyorlanmoqda...",
        "curriculum_id": curriculum_id,
        "status": "generating",
    }


@router.get("/status")
async def get_onboarding_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Curriculum).where(Curriculum.user_id == current_user.id)
    )
    curricula = result.scalars().all()

    return {
        "onboarding_completed": current_user.onboarding_completed,
        "curricula_count": len(curricula),
        "has_active_curriculum": any(c.status == "active" for c in curricula),
    }


async def run_curriculum_agent(
    curriculum_id: int,
    user_id: int,
    topic: str,
    level: str,
    daily_minutes: int,
    current_knowledge: str,
    goal: str,
    lang: str,
):
    """Background task — Curriculum Agent ishga tushiradi"""
    from app.agents.curriculum_agent import CurriculumAgent
    from app.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        agent = CurriculumAgent(db)
        await agent.generate(
            curriculum_id=curriculum_id,
            user_id=user_id,
            topic=topic,
            level=level,
            daily_minutes=daily_minutes,
            current_knowledge=current_knowledge,
            goal=goal,
            lang=lang,
        )
