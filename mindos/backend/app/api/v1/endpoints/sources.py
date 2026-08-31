import logging
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User, Source, SourceChunk, SourceType, SourceStatus
from app.services.source_service import (
    SourceService,
    process_file_source,
    process_youtube_source,
    process_text_source,
)

router = APIRouter(prefix="/sources", tags=["sources"])
logger = logging.getLogger(__name__)

ALLOWED_FILE_EXTENSIONS = {"pdf", "docx", "txt"}
MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024  # 20 MB


class YoutubeSourceRequest(BaseModel):
    url: str
    title: str = ""
    curriculum_id: int | None = None


class TextSourceRequest(BaseModel):
    title: str
    content: str
    curriculum_id: int | None = None


class AskRequest(BaseModel):
    question: str
    source_id: int | None = None


def _serialize_source(source: Source, chunk_count: int = 0) -> dict:
    return {
        "id": source.id,
        "type": source.type.value if hasattr(source.type, "value") else source.type,
        "title": source.title,
        "origin": source.origin,
        "status": source.status.value if hasattr(source.status, "value") else source.status,
        "error_message": source.error_message,
        "char_count": source.char_count or 0,
        "chunk_count": chunk_count,
        "curriculum_id": source.curriculum_id,
        "created_at": source.created_at.isoformat() if source.created_at else None,
    }


@router.get("")
async def list_sources(
    curriculum_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = select(Source).where(Source.user_id == current_user.id)
    if curriculum_id is not None:
        stmt = stmt.where(Source.curriculum_id == curriculum_id)
    stmt = stmt.order_by(Source.created_at.desc())
    result = await db.execute(stmt)
    sources = result.scalars().all()

    if not sources:
        return {"sources": []}

    chunk_counts_result = await db.execute(
        select(SourceChunk.source_id, func.count(SourceChunk.id))
        .where(SourceChunk.source_id.in_([s.id for s in sources]))
        .group_by(SourceChunk.source_id)
    )
    chunk_counts = dict(chunk_counts_result.all())

    return {"sources": [_serialize_source(s, chunk_counts.get(s.id, 0)) for s in sources]}


@router.get("/{source_id}")
async def get_source(
    source_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Source).where(Source.id == source_id, Source.user_id == current_user.id)
    )
    source = result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="Manba topilmadi")

    chunk_count_result = await db.execute(
        select(func.count(SourceChunk.id)).where(SourceChunk.source_id == source.id)
    )
    chunk_count = chunk_count_result.scalar_one() or 0

    data = _serialize_source(source, chunk_count)
    data["raw_text_preview"] = (source.raw_text or "")[:1000]
    return data


@router.post("/upload")
async def upload_source_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    title: str = Form(""),
    curriculum_id: int | None = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    filename = file.filename or "fayl"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ALLOWED_FILE_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Qo'llab-quvvatlanmaydigan fayl turi. Ruxsat etilgan: {', '.join(sorted(ALLOWED_FILE_EXTENSIONS))}",
        )

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Fayl bo'sh")
    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="Fayl hajmi 20 MB dan katta bo'lmasligi kerak")

    source = Source(
        user_id=current_user.id,
        curriculum_id=curriculum_id,
        type=SourceType.file,
        title=title.strip() or filename,
        origin=filename,
        status=SourceStatus.processing,
    )
    db.add(source)
    await db.flush()
    source_id = source.id
    await db.commit()

    background_tasks.add_task(process_file_source, source_id, filename, file_bytes)

    return {"message": "Fayl qabul qilindi, matn chiqarilmoqda...", "source": _serialize_source(source)}


@router.post("/youtube")
async def add_youtube_source(
    data: YoutubeSourceRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    url = data.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="YouTube link kiritilmadi")
    if not SourceService.extract_youtube_video_id(url):
        raise HTTPException(status_code=400, detail="YouTube video ID topilmadi — link noto'g'ri bo'lishi mumkin")

    source = Source(
        user_id=current_user.id,
        curriculum_id=data.curriculum_id,
        type=SourceType.youtube,
        title=data.title.strip() or url,
        origin=url,
        status=SourceStatus.processing,
    )
    db.add(source)
    await db.flush()
    source_id = source.id
    await db.commit()

    background_tasks.add_task(process_youtube_source, source_id, url)

    return {"message": "YouTube video qabul qilindi, subtitr olinmoqda...", "source": _serialize_source(source)}


@router.post("/text")
async def add_text_source(
    data: TextSourceRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    content = data.content.strip()
    if len(content) < 20:
        raise HTTPException(status_code=400, detail="Matn juda qisqa (kamida 20 belgi)")
    title = data.title.strip() or "Qo'lda kiritilgan matn"

    source = Source(
        user_id=current_user.id,
        curriculum_id=data.curriculum_id,
        type=SourceType.text,
        title=title,
        raw_text=content,
        status=SourceStatus.processing,
    )
    db.add(source)
    await db.flush()
    source_id = source.id
    await db.commit()

    background_tasks.add_task(process_text_source, source_id)

    return {"message": "Matn qabul qilindi, qayta ishlanmoqda...", "source": _serialize_source(source)}


@router.post("/{source_id}/retry")
async def retry_source(
    source_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Muvaffaqiyatsiz manbani qayta ishlashga urinish — masalan YouTube video
    YouTube'ning vaqtinchalik "429 Too Many Requests" cheklovi tufayli
    muvaffaqiyatsiz bo'lgan bo'lsa, foydalanuvchi qaytadan yuklamasdan shu
    yerdan qayta urinib ko'rishi mumkin.
    """
    result = await db.execute(
        select(Source).where(Source.id == source_id, Source.user_id == current_user.id)
    )
    source = result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="Manba topilmadi")

    if source.type == SourceType.file:
        raise HTTPException(
            status_code=400,
            detail="Fayl turidagi manbalarni qayta urinib bo'lmaydi — faylni qaytadan yuklang",
        )

    source.status = SourceStatus.processing
    source.error_message = None
    await db.commit()

    if source.type == SourceType.youtube:
        background_tasks.add_task(process_youtube_source, source_id, source.origin)
    else:
        background_tasks.add_task(process_text_source, source_id)

    return {"message": "Qayta urinilmoqda...", "source": _serialize_source(source)}


@router.delete("/{source_id}")
async def delete_source(
    source_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Source).where(Source.id == source_id, Source.user_id == current_user.id)
    )
    source = result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="Manba topilmadi")

    await db.delete(source)
    await db.commit()
    return {"message": "Manba o'chirildi"}


@router.post("/ask")
async def ask_sources(
    data: AskRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    NotebookLM'dagi "Ask your sources" — foydalanuvchi o'z manbalari (fayl,
    YouTube, matn) haqida savol beradi, AI FAQAT shu manbalarga asoslanib
    javob beradi va qaysi manbadan olinganini (citation) ko'rsatadi.
    """
    question = data.question.strip()
    if len(question) < 3:
        raise HTTPException(status_code=400, detail="Savol juda qisqa")

    service = SourceService(db)
    result = await service.ask(user_id=current_user.id, question=question, source_id=data.source_id)
    return result
