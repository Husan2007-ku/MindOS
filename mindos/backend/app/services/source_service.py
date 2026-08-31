import io
import re
import logging
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from openai import AsyncOpenAI

from app.core.config import settings
from app.models.user import Source, SourceChunk, SourceStatus

logger = logging.getLogger(__name__)
client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

CHUNK_SIZE = 1200          # belgi (character) hisobida — soddalik uchun token emas
CHUNK_OVERLAP = 150
EMBED_BATCH_SIZE = 64
MAX_RAW_TEXT_CHARS = 200_000  # bitta manba uchun xavfsizlik chegarasi


class SourceService:
    """
    NotebookLM-uslubidagi manba asosli o'rganish (TZ'dan tashqari, foydalanuvchi
    so'roviga ko'ra qo'shildi):

    Foydalanuvchi fayl (PDF/DOCX/TXT), YouTube video yoki oddiy matn (masalan
    o'zi o'qiyotgan kursning konspekti) qo'shadi -> matn chiqarib olinadi ->
    bo'laklarga (chunk) bo'linadi -> har bir bo'lak uchun OpenAI embedding
    hisoblanadi va pgvector'ga saqlanadi (xuddi Memory/xotira tizimidagi kabi).
    Keyin Curriculum Agent va Mentor Agent shu bo'laklarni semantik qidiruv
    orqali topib, AI generatsiyasiga HAQIQIY kontekst sifatida qo'shadi —
    o'ylab topilgan (hallucinated) ma'lumot o'rniga.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    # ---------- 1) Matn chiqarib olish ----------

    @staticmethod
    def extract_text_from_file(filename: str, file_bytes: bytes) -> str:
        ext = (filename.rsplit(".", 1)[-1] if "." in filename else "").lower()
        if ext == "pdf":
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(file_bytes))
            pages = []
            for page in reader.pages:
                try:
                    pages.append(page.extract_text() or "")
                except Exception:
                    continue
            return "\n\n".join(pages).strip()
        if ext == "docx":
            from docx import Document
            doc = Document(io.BytesIO(file_bytes))
            return "\n".join(p.text for p in doc.paragraphs if p.text.strip()).strip()
        # .txt yoki noma'lum kengaytma — oddiy matn sifatida o'qishga urinamiz
        try:
            return file_bytes.decode("utf-8", errors="ignore").strip()
        except Exception:
            return ""

    @staticmethod
    def extract_youtube_video_id(url: str) -> Optional[str]:
        pattern = r"(?:v=|\/videos\/|embed\/|youtu\.be\/|\/v\/|\/e\/|watch\?v=)([A-Za-z0-9_-]{11})"
        m = re.search(pattern, url)
        return m.group(1) if m else None

    @staticmethod
    def extract_youtube_transcript(url: str, lang_prefs: Optional[list[str]] = None) -> str:
        """
        YouTube video subtitr/transcript'ini oladi — NotebookLM'dagi kabi, video
        ovozini emas, YouTube'ning o'zi generatsiya qilgan yoki yuklab qo'yilgan
        subtitrlarni matn sifatida ishlatamiz.

        Bulutli serverlar (Render, AWS va h.k.) IP manzillari YouTube tomonidan
        tez-tez "429 Too Many Requests" bilan vaqtincha cheklanadi — bu bizning
        kodimizdagi xato emas, YouTube'ning anti-bot himoyasi. Shu sabab avval
        ancha chidamli yt-dlp orqali, muvaffaqiyatsiz bo'lsa youtube-transcript-api
        orqali (retry bilan) urinib ko'ramiz.
        """
        video_id = SourceService.extract_youtube_video_id(url)
        if not video_id:
            raise ValueError("YouTube video ID topilmadi — link noto'g'ri bo'lishi mumkin")

        lang_prefs = lang_prefs or ["uz", "ru", "en"]
        last_error: Exception | None = None

        try:
            text = SourceService._extract_transcript_via_ytdlp(url, lang_prefs)
            if text.strip():
                return text.strip()
        except Exception as e:
            last_error = e
            logger.warning(f"yt-dlp orqali transcript olinmadi ({video_id}): {e}")

        from youtube_transcript_api import YouTubeTranscriptApi
        from youtube_transcript_api._errors import TranscriptsDisabled, NoTranscriptFound
        import time

        for attempt in range(3):
            try:
                transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
                try:
                    transcript = transcript_list.find_transcript(lang_prefs)
                except NoTranscriptFound:
                    try:
                        transcript = transcript_list.find_generated_transcript(lang_prefs)
                    except NoTranscriptFound:
                        transcript = next(iter(transcript_list))
                entries = transcript.fetch()
                text = " ".join(e.get("text", "") for e in entries if e.get("text"))
                if text.strip():
                    return text.strip()
                last_error = ValueError("Subtitr matni bo'sh qaytdi")
                break
            except (TranscriptsDisabled, NoTranscriptFound) as e:
                raise ValueError(f"Bu videoda subtitr/transcript mavjud emas: {e}")
            except Exception as e:
                last_error = e
                if "429" in str(e) or "Too Many Requests" in str(e):
                    time.sleep(1.5 * (attempt + 1))
                    continue
                break

        raise ValueError(
            "Video subtitrlarini olib bo'lmadi — YouTube serveri vaqtincha cheklamoqda (429). "
            "Birozdan so'ng \"Qayta urinish\"ni bosib ko'ring, yoki video mazmunini qo'lda "
            f"\"Matn/Kurs\" bo'limi orqali qo'shing. Texnik tafsilot: {last_error}"
        )

    @staticmethod
    def _extract_transcript_via_ytdlp(url: str, lang_prefs: list[str]) -> str:
        import yt_dlp
        import httpx

        ydl_opts = {
            "skip_download": True,
            "writesubtitles": True,
            "writeautomaticsub": True,
            "subtitleslangs": lang_prefs,
            "quiet": True,
            "no_warnings": True,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)

        tracks: dict = {}
        tracks.update(info.get("subtitles") or {})
        for lang, fmts in (info.get("automatic_captions") or {}).items():
            tracks.setdefault(lang, fmts)

        chosen = None
        for lang in lang_prefs:
            if lang in tracks:
                chosen = tracks[lang]
                break
        if chosen is None and tracks:
            chosen = next(iter(tracks.values()))
        if not chosen:
            raise ValueError("yt-dlp orqali subtitr topilmadi")

        fmt = next((f for f in chosen if f.get("ext") == "vtt"), chosen[0])
        sub_url = fmt["url"]

        with httpx.Client(timeout=15) as http_client:
            resp = http_client.get(sub_url)
            resp.raise_for_status()
            vtt_content = resp.text

        return SourceService._vtt_to_text(vtt_content)

    @staticmethod
    def _vtt_to_text(vtt_content: str) -> str:
        """VTT/SRT subtitr faylidan vaqt belgilari va takrorlanuvchi qatorlarsiz
        toza matn chiqaradi (YouTube avtomatik subtitrlari ko'pincha bir xil
        qatorni bir necha marta ketma-ket takrorlaydi — "rolling captions")."""
        text_lines: list[str] = []
        prev: Optional[str] = None
        for raw_line in vtt_content.splitlines():
            line = raw_line.strip()
            if not line or line.upper().startswith("WEBVTT") or "-->" in line or line.isdigit():
                continue
            line = re.sub(r"<[^>]+>", "", line).strip()
            if line and line != prev:
                text_lines.append(line)
                prev = line
        return " ".join(text_lines)

    # ---------- 2) Bo'laklarga bo'lish ----------

    @staticmethod
    def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
        text = re.sub(r"\s+", " ", text).strip()
        if not text:
            return []
        chunks: list[str] = []
        start = 0
        n = len(text)
        while start < n:
            end = min(start + chunk_size, n)
            if end < n:
                last_space = text.rfind(" ", start, end)
                if last_space > start:
                    end = last_space
            chunk = text[start:end].strip()
            if chunk:
                chunks.append(chunk)
            if end >= n:
                break
            start = max(end - overlap, start + 1)
        return chunks

    # ---------- 3) Embedding + saqlash ----------

    async def embed_texts(self, texts: list[str]) -> list[Optional[list[float]]]:
        if not texts:
            return []
        try:
            response = await client.embeddings.create(
                model=settings.OPENAI_EMBEDDING_MODEL,
                input=texts,
            )
            return [d.embedding for d in response.data]
        except Exception as e:
            logger.error(f"Source chunk embedding xatosi: {e}")
            return [None] * len(texts)

    async def store_chunks(self, source_id: int, chunks: list[str]):
        for batch_start in range(0, len(chunks), EMBED_BATCH_SIZE):
            batch = chunks[batch_start:batch_start + EMBED_BATCH_SIZE]
            embeddings = await self.embed_texts(batch)
            for i, (content, embedding) in enumerate(zip(batch, embeddings)):
                self.db.add(SourceChunk(
                    source_id=source_id,
                    chunk_index=batch_start + i,
                    content=content,
                    embedding=embedding,
                ))
            await self.db.flush()

    async def finalize_source(self, source: Source, raw_text: str):
        raw_text = raw_text[:MAX_RAW_TEXT_CHARS]
        source.raw_text = raw_text
        source.char_count = len(raw_text)
        chunks = self.chunk_text(raw_text)
        if not chunks:
            source.status = SourceStatus.failed
            source.error_message = "Matn chiqarib olinmadi (fayl bo'sh yoki o'qib bo'lmadi)"
            await self.db.commit()
            return
        await self.store_chunks(source.id, chunks)
        source.status = SourceStatus.ready
        await self.db.commit()
        logger.info(f"Source {source.id} tayyor: {len(chunks)} ta chunk")

    async def mark_failed(self, source: Source, error: str):
        source.status = SourceStatus.failed
        source.error_message = error[:2000]
        await self.db.commit()
        logger.error(f"Source {source.id} muvaffaqiyatsiz: {error}")

    # ---------- 4) Semantik qidiruv (Curriculum/Mentor Agent uchun) ----------

    async def search_relevant_chunks(
        self,
        user_id: int,
        query: str,
        curriculum_id: Optional[int] = None,
        limit: int = 8,
    ) -> list[SourceChunk]:
        """
        Foydalanuvchining tayyor (status=ready) manbalaridan so'rovga semantik
        eng yaqin bo'laklarni topadi. Curriculum/Mentor Agent shularni AI
        promptiga "haqiqiy manba" sifatida qo'shadi.
        """
        from sqlalchemy import or_

        embeddings = await self.embed_texts([query])
        query_embedding = embeddings[0] if embeddings else None
        if query_embedding is None:
            return []

        stmt = (
            select(SourceChunk)
            .join(Source, Source.id == SourceChunk.source_id)
            .where(
                Source.user_id == user_id,
                Source.status == SourceStatus.ready,
                SourceChunk.embedding.is_not(None),
            )
        )
        if curriculum_id is not None:
            stmt = stmt.where(or_(Source.curriculum_id == curriculum_id, Source.curriculum_id.is_(None)))
        stmt = stmt.order_by(SourceChunk.embedding.cosine_distance(query_embedding)).limit(limit)

        try:
            result = await self.db.execute(stmt)
            return list(result.scalars().all())
        except Exception as e:
            logger.error(f"Source semantik qidiruv xatosi: {e}")
            return []

    @staticmethod
    def format_chunks_as_context(chunks: list[SourceChunk], sources_by_id: dict[int, Source]) -> str:
        """Topilgan bo'laklarni AI promptiga qo'shish uchun matn blokiga aylantiradi."""
        if not chunks:
            return ""
        lines = []
        for chunk in chunks:
            source = sources_by_id.get(chunk.source_id)
            title = source.title if source else "Noma'lum manba"
            lines.append(f"— \"{title}\": {chunk.content}")
        return "\n".join(lines)

    # ---------- 5) Manbalar bilan suhbat (NotebookLM'dagi "Ask sources") ----------

    async def ask(
        self,
        user_id: int,
        question: str,
        source_id: Optional[int] = None,
        limit: int = 6,
    ) -> dict:
        """
        Foydalanuvchi o'z manbalari haqida savol beradi; AI FAQAT topilgan
        bo'laklarga asoslanib javob beradi va qaysi manbadan olinganini
        (citation) ko'rsatadi — xuddi NotebookLM'dagi kabi.
        """
        embeddings = await self.embed_texts([question])
        query_embedding = embeddings[0] if embeddings else None
        if query_embedding is None:
            return {"answer": "Savolni qayta ishlab bo'lmadi, birozdan keyin qayta urinib ko'ring.", "citations": []}

        stmt = (
            select(SourceChunk, Source)
            .join(Source, Source.id == SourceChunk.source_id)
            .where(
                Source.user_id == user_id,
                Source.status == SourceStatus.ready,
                SourceChunk.embedding.is_not(None),
            )
        )
        if source_id is not None:
            stmt = stmt.where(Source.id == source_id)
        stmt = stmt.order_by(SourceChunk.embedding.cosine_distance(query_embedding)).limit(limit)

        result = await self.db.execute(stmt)
        rows = result.all()
        if not rows:
            return {
                "answer": "Bu savolga javob beradigan hech qanday manba topilmadi. Avval tegishli fayl, YouTube video yoki matn qo'shing.",
                "citations": [],
            }

        context_blocks = []
        citations = []
        for i, (chunk, source) in enumerate(rows, start=1):
            context_blocks.append(f"[{i}] Manba: \"{source.title}\"\n{chunk.content}")
            citations.append({"n": i, "source_id": source.id, "source_title": source.title, "chunk_id": chunk.id})

        context_text = "\n\n".join(context_blocks)
        system_prompt = (
            "Sen foydalanuvchining shaxsiy manbalari (fayl/YouTube/kurs matni) bo'yicha "
            "javob beruvchi yordamchisan. FAQAT quyida berilgan manba parchalariga asoslanib javob ber. "
            "Agar javob manbalarda yo'q bo'lsa, aniq ayt: \"Bu ma'lumot yuklangan manbalarda yo'q\". "
            "Javob ichida foydalangan parchalaringni [1], [2] kabi raqamlar bilan belgila."
        )
        user_prompt = f"Manbalar:\n{context_text}\n\nSavol: {question}"

        try:
            response = await client.chat.completions.create(
                model=settings.OPENAI_MODEL_FAST,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.2,
                max_tokens=800,
            )
            answer = response.choices[0].message.content
        except Exception as e:
            logger.error(f"Source-based chat xatosi: {e}")
            answer = "Javob generatsiya qilishda xatolik yuz berdi, birozdan keyin qayta urinib ko'ring."

        return {"answer": answer, "citations": citations}


# ─── Background task orchestratorlari ───────────────────────
# onboarding.py'dagi run_curriculum_agent bilan bir xil pattern: har biri o'z
# AsyncSessionLocal sessiyasini ochadi, chunki BackgroundTasks request session
# tugagandan keyin ishga tushadi.

async def process_file_source(source_id: int, filename: str, file_bytes: bytes):
    from app.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        service = SourceService(db)
        result = await db.execute(select(Source).where(Source.id == source_id))
        source = result.scalar_one_or_none()
        if not source:
            logger.error(f"Source topilmadi: {source_id}")
            return
        try:
            raw_text = service.extract_text_from_file(filename, file_bytes)
            if not raw_text.strip():
                raise ValueError("Fayldan matn chiqarib bo'lmadi (bo'sh yoki qo'llab-quvvatlanmaydigan format)")
            await service.finalize_source(source, raw_text)
        except Exception as e:
            await service.mark_failed(source, str(e))


async def process_youtube_source(source_id: int, url: str):
    from app.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        service = SourceService(db)
        result = await db.execute(select(Source).where(Source.id == source_id))
        source = result.scalar_one_or_none()
        if not source:
            logger.error(f"Source topilmadi: {source_id}")
            return
        try:
            raw_text = service.extract_youtube_transcript(url)
            if not raw_text.strip():
                raise ValueError("Video subtitrlari bo'sh")
            await service.finalize_source(source, raw_text)
        except Exception as e:
            await service.mark_failed(source, str(e))


async def process_text_source(source_id: int):
    from app.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        service = SourceService(db)
        result = await db.execute(select(Source).where(Source.id == source_id))
        source = result.scalar_one_or_none()
        if not source:
            logger.error(f"Source topilmadi: {source_id}")
            return
        try:
            raw_text = source.raw_text or ""
            if not raw_text.strip():
                raise ValueError("Matn bo'sh")
            await service.finalize_source(source, raw_text)
        except Exception as e:
            await service.mark_failed(source, str(e))
