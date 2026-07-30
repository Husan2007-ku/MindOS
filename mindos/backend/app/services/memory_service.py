import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from openai import AsyncOpenAI

from app.core.config import settings
from app.models.user import Memory

logger = logging.getLogger(__name__)
client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

# Heuristik kalit so'zlar — qaysi xabarlar "eslab qolishga arziydi" (TZ 3.3: uzoq muddatli xotira)
MEMORY_TRIGGER_KEYWORDS = [
    "o'rganmoqchiman", "maqsadim", "sevaman", "yoqtirmayman", "qiyin",
    "tushundim", "tushunmadim", "erishdim", "ishga joylashmoqchiman",
    "men", "mening ismim", "men hohlardim", "muammo", "qo'rqaman",
]


class MemoryService:
    """
    TZ 2.3.2 — pgvector orqali AI uzoq muddatli xotira.
    Har bir muhim fakt OpenAI text-embedding-3-small bilan 1536-o'lchovli vektorga
    aylantiriladi va keyinchalik semantik o'xshashlik (cosine distance) orqali qidiriladi.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    @staticmethod
    def should_remember(user_message: str) -> bool:
        """Heuristika: xabar uzoq muddatli xotiraga loyiqmi (TZ 3.3 ko'rsatmasi asosida)"""
        lowered = user_message.lower()
        return any(kw in lowered for kw in MEMORY_TRIGGER_KEYWORDS) and len(user_message.strip()) > 8

    async def embed_text(self, text: str) -> list[float] | None:
        """OpenAI embedding API orqali matnni vektorga aylantirish"""
        try:
            response = await client.embeddings.create(
                model=settings.OPENAI_EMBEDDING_MODEL,
                input=text[:2000],  # token limitidan saqlanish uchun kesish
            )
            return response.data[0].embedding
        except Exception as e:
            logger.error(f"Embedding generatsiya xatosi: {e}")
            return None

    async def save_memory(
        self,
        user_id: int,
        content: str,
        importance: float = 2.0,
        memory_type: str = "preference",
    ) -> Memory | None:
        """Yangi xotira yozuvini yaratish — embedding bilan birga saqlanadi"""
        embedding = await self.embed_text(content)

        memory = Memory(
            user_id=user_id,
            content=content,
            embedding=embedding,
            importance=importance,
            memory_type=memory_type,
        )
        self.db.add(memory)
        await self.db.flush()
        return memory

    async def search_relevant_memories(
        self,
        user_id: int,
        query: str,
        limit: int = 10,
    ) -> list[Memory]:
        """
        TZ 2.3.2 qadam-ba-qadam jarayoni:
        1. Savol embedding ga aylantiriladi
        2. pgvector orqali eng yaqin (semantik o'xshash) xotiralar topiladi
        3. Natija Mentor Agent ga kontekst sifatida beriladi

        Agar embedding generatsiya muvaffaqiyatsiz bo'lsa (masalan API xatosi) —
        fallback sifatida importance bo'yicha eng muhim xotiralarni qaytaramiz,
        shunda suhbat hech bo'lmaganda davom etadi.
        """
        query_embedding = await self.embed_text(query)

        if query_embedding is None:
            return await self._fallback_recent_important(user_id, limit)

        try:
            # pgvector cosine distance operatori: <=>  (kichikroq = o'xshashroq)
            result = await self.db.execute(
                select(Memory)
                .where(Memory.user_id == user_id, Memory.embedding.is_not(None))
                .order_by(Memory.embedding.cosine_distance(query_embedding))
                .limit(limit)
            )
            memories = list(result.scalars().all())
            if memories:
                return memories
            return await self._fallback_recent_important(user_id, limit)
        except Exception as e:
            logger.error(f"pgvector semantik qidiruv xatosi: {e}")
            return await self._fallback_recent_important(user_id, limit)

    async def _fallback_recent_important(self, user_id: int, limit: int) -> list[Memory]:
        """Embedding yo'q bo'lgan eski yozuvlar yoki xato holatlar uchun zaxira"""
        from sqlalchemy import desc
        result = await self.db.execute(
            select(Memory)
            .where(Memory.user_id == user_id)
            .order_by(desc(Memory.importance))
            .limit(limit)
        )
        return list(result.scalars().all())
