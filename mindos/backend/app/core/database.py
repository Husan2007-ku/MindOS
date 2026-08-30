from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from urllib.parse import urlsplit
from app.core.config import settings


def _build_engine_kwargs(url: str) -> dict:
    """Postgres (Render/Neon/Supabase va h.k.) va SQLite (faqat lokal/test)
    uchun to'g'ri engine parametrlarini tanlaydi.

    - SQLite pool_size/max_overflow'ni qo'llab-quvvatlamaydi.
    - Tashqi (public) Postgres xostlari (masalan Render'ning "External
      Database URL"i, *.oregon-postgres.render.com kabi domenga ega)
      SSL talab qiladi. Render'ning "Internal Database URL"i domensiz
      qisqa hostname beradi (masalan dpg-xxxx-a) va bir xil region ichida
      SSL'siz ham ishlaydi.
    """
    kwargs: dict = {
        "echo": settings.APP_ENV == "development",
        "pool_pre_ping": True,
    }
    if url.startswith("sqlite"):
        return kwargs

    kwargs["pool_size"] = 10
    kwargs["max_overflow"] = 20

    host = urlsplit(url).hostname or ""
    if host and host != "localhost" and "." in host:
        kwargs["connect_args"] = {"ssl": "require"}
    return kwargs


engine = create_async_engine(settings.DATABASE_URL, **_build_engine_kwargs(settings.DATABASE_URL))

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
