from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from pydantic import BaseModel
import json
import logging

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.config import settings
from app.models.user import User, Message
from app.agents.mentor_agent import MentorAgent
from app.agents.code_mentor_agent import CodeMentorAgent

router = APIRouter(prefix="/chat", tags=["chat"])
logger = logging.getLogger(__name__)

FREE_PLAN_DAILY_LIMIT = 10
MAX_VOICE_FILE_SIZE = 25 * 1024 * 1024  # 25MB — TZ 7.3 ga muvofiq
ALLOWED_VOICE_TYPES = {"audio/mpeg", "audio/wav", "audio/x-wav", "audio/mp4", "audio/m4a", "audio/ogg", "audio/webm"}


class ChatRequest(BaseModel):
    message: str
    lesson_id: int | None = None
    mode: str = "normal"


class TTSRequest(BaseModel):
    text: str


MAX_TTS_CHARS = 2000


@router.post("/message")
async def send_message(
    data: ChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not data.message.strip():
        raise HTTPException(status_code=400, detail="Xabar bo'sh bo'lishi mumkin emas")

    if len(data.message) > 4000:
        raise HTTPException(status_code=400, detail="Xabar 4000 belgidan oshmasin")

    # Free plan limiti tekshirish
    if current_user.plan == "free":
        from datetime import date, timezone
        from sqlalchemy import func
        today_start = date.today()
        count_result = await db.execute(
            select(func.count(Message.id)).where(
                Message.user_id == current_user.id,
                Message.role == "user",
                func.date(Message.created_at) == today_start,
            )
        )
        today_count = count_result.scalar() or 0
        if today_count >= FREE_PLAN_DAILY_LIMIT:
            raise HTTPException(
                status_code=429,
                detail=f"Bepul rejada kuniga {FREE_PLAN_DAILY_LIMIT} ta xabar. Pro rejaga o'ting!",
            )

    agent = MentorAgent(db)

    async def event_stream():
        try:
            async for token in agent.chat_stream(current_user, data.message, lesson_id=data.lesson_id, mode=data.mode):
                yield f"data: {json.dumps({'token': token})}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/voice")
async def send_voice_message(
    file: UploadFile = File(...),
    lesson_id: int | None = Form(None),
    mode: str = Form("normal"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Ovoz fayl yuborish — Whisper orqali matnga aylantiriladi, keyin Mentor Agent ga yuboriladi.
    TZ 4.5: faqat audio formatlar, max 25MB.
    Pro va undan yuqori planlarga ochiq — Free da ovoz input yo'q (TZ 9.1).
    """
    if current_user.plan == "free":
        raise HTTPException(
            status_code=403,
            detail="Ovoz input faqat Pro va undan yuqori rejalarda mavjud",
        )

    if file.content_type not in ALLOWED_VOICE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Qo'llab-quvvatlanmaydigan fayl turi: {file.content_type}. "
                    f"Faqat audio fayllar qabul qilinadi (.mp3, .wav, .m4a, .ogg)",
        )

    raw_bytes = await file.read()
    if len(raw_bytes) > MAX_VOICE_FILE_SIZE:
        raise HTTPException(status_code=400, detail="Fayl hajmi 25MB dan oshmasin")
    if len(raw_bytes) == 0:
        raise HTTPException(status_code=400, detail="Fayl bo'sh")

    # Whisper orqali transkripsiya
    transcript = await _transcribe_audio(raw_bytes, file.filename or "audio.mp3")

    if not transcript or not transcript.strip():
        raise HTTPException(
            status_code=422,
            detail="Ovozdan matn aniqlanmadi. Iltimos qaytadan urinib ko'ring yoki yozma yuboring.",
        )

    # Free plan limiti — voice ham message limitiga kiradi
    from datetime import date
    from sqlalchemy import func as sa_func
    today_start = date.today()
    count_result = await db.execute(
        select(sa_func.count(Message.id)).where(
            Message.user_id == current_user.id,
            Message.role == "user",
            sa_func.date(Message.created_at) == today_start,
        )
    )
    today_count = count_result.scalar() or 0
    if current_user.plan == "free" and today_count >= FREE_PLAN_DAILY_LIMIT:
        raise HTTPException(
            status_code=429,
            detail=f"Bepul rejada kuniga {FREE_PLAN_DAILY_LIMIT} ta xabar. Pro rejaga o'ting!",
        )

    agent = MentorAgent(db)

    async def event_stream():
        try:
            # Avval transkripsiya qilingan matnni frontend ga yuboramiz (ko'rsatish uchun)
            yield f"data: {json.dumps({'transcript': transcript})}\n\n"
            async for token in agent.chat_stream(current_user, transcript, message_type="voice", lesson_id=lesson_id, mode=mode):
                yield f"data: {json.dumps({'token': token})}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
        except Exception as e:
            logger.error(f"Voice chat xatosi: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/tts")
async def text_to_speech(
    data: TTSRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Mentor javobini ovozga aylantirish (OpenAI TTS) — IELTS Speaking mashqini
    haqiqiy suhbatga o'xshatish uchun. Ovoz input kabi Pro va undan yuqori
    rejalarga ochiq (TZ 9.1 bilan bir xil siyosat).
    """
    if current_user.plan == "free":
        raise HTTPException(
            status_code=403,
            detail="Ovozli javob faqat Pro va undan yuqori rejalarda mavjud",
        )

    text = data.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Matn bo'sh bo'lishi mumkin emas")
    text = text[:MAX_TTS_CHARS]

    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

    try:
        response = await client.audio.speech.create(
            model="tts-1",
            voice="alloy",
            input=text,
            response_format="mp3",
        )
        audio_bytes = response.content
    except Exception as e:
        logger.error(f"TTS xatosi: {e}")
        raise HTTPException(status_code=502, detail="Ovozli javob generatsiya qilinmadi")

    import io
    return StreamingResponse(io.BytesIO(audio_bytes), media_type="audio/mpeg")


async def _transcribe_audio(raw_bytes: bytes, filename: str) -> str:
    """OpenAI Whisper API orqali audio -> matn"""
    from openai import AsyncOpenAI
    import io

    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    audio_file = io.BytesIO(raw_bytes)
    audio_file.name = filename  # OpenAI SDK fayl nomidan formatni aniqlaydi

    try:
        response = await client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file,
            response_format="text",
        )
        # response_format="text" da to'g'ridan-to'g'ri string qaytadi
        return str(response).strip()
    except Exception as e:
        logger.error(f"Whisper transkripsiya xatosi: {e}")
        raise HTTPException(status_code=502, detail="Ovozni tanib bo'lmadi — AI xizmati bilan bog'lanishda xato")


class CodeReviewRequest(BaseModel):
    message: str
    code: str = ""


@router.post("/code")
async def send_code_message(
    data: CodeReviewRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Code Mentor Agent — dasturlash savollari uchun Sokratik yo'naltiruvchi (TZ 3.5).
    Javobni to'g'ridan-to'g'ri bermaydi, o'ylatadi.
    """
    if not data.message.strip() and not data.code.strip():
        raise HTTPException(status_code=400, detail="Savol yoki kod bo'sh bo'lishi mumkin emas")

    if len(data.message) + len(data.code) > 8000:
        raise HTTPException(status_code=400, detail="Xabar + kod 8000 belgidan oshmasin")

    # Free plan limiti — umumiy xabar limitiga kiradi
    if current_user.plan == "free":
        from datetime import date
        from sqlalchemy import func as sa_func
        today_start = date.today()
        count_result = await db.execute(
            select(sa_func.count(Message.id)).where(
                Message.user_id == current_user.id,
                Message.role == "user",
                sa_func.date(Message.created_at) == today_start,
            )
        )
        today_count = count_result.scalar() or 0
        if today_count >= FREE_PLAN_DAILY_LIMIT:
            raise HTTPException(
                status_code=429,
                detail=f"Bepul rejada kuniga {FREE_PLAN_DAILY_LIMIT} ta xabar. Pro rejaga o'ting!",
            )

    agent = CodeMentorAgent(db)

    async def event_stream():
        try:
            async for token in agent.review_stream(current_user, data.message, data.code):
                yield f"data: {json.dumps({'token': token})}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
        except Exception as e:
            logger.error(f"Code chat xatosi: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/history")
async def get_chat_history(
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Message)
        .where(Message.user_id == current_user.id)
        .order_by(desc(Message.created_at))
        .limit(limit)
        .offset(offset)
    )
    messages = result.scalars().all()
    messages.reverse()

    return {
        "messages": [
            {
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "message_type": m.message_type,
                "created_at": m.created_at,
            }
            for m in messages
        ],
        "total": len(messages),
    }


@router.delete("/history")
async def clear_chat_history(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from sqlalchemy import delete
    await db.execute(delete(Message).where(Message.user_id == current_user.id))
    await db.commit()
    return {"message": "Chat tarixi tozalandi"}
