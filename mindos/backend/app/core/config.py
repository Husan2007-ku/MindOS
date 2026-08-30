from pydantic_settings import BaseSettings
from pydantic import field_validator
from typing import List


class Settings(BaseSettings):
    # App
    APP_ENV: str = "development"
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # Database
    DATABASE_URL: str

    @field_validator("DATABASE_URL", mode="after")
    @classmethod
    def _normalize_database_url(cls, v: str) -> str:
        """Render/Heroku va shu kabi provayderlar odatda
        postgres:// yoki postgresql:// ko'rinishida beradi, bizga esa
        asinxron SQLAlchemy uchun asyncpg drayveri kerak."""
        if v.startswith("postgres://"):
            v = v.replace("postgres://", "postgresql+asyncpg://", 1)
        elif v.startswith("postgresql://") and "+asyncpg" not in v:
            v = v.replace("postgresql://", "postgresql+asyncpg://", 1)
        return v

    # Redis
    REDIS_URL: str = "redis://redis:6379/0"
    REDBEAT_REDIS_URL: str = "redis://redis:6379/1"

    # OpenAI
    OPENAI_API_KEY: str
    # Ikki bosqichli model tanlash — token/pul tejash uchun:
    # FAST — tez-tez chaqiriladigan suhbat/baholash vazifalari (Mentor, Code Mentor,
    #   uy vazifasi baholash, haftalik hisobot) uchun arzon model.
    # SMART — kamdan-kam, lekin sifat muhim bo'lgan strukturaviy vazifalar
    #   (curriculum generatsiyasi, remedial dars, diagnostika testi) uchun kuchli model.
    OPENAI_MODEL_FAST: str = "gpt-4o-mini"
    OPENAI_MODEL_SMART: str = "gpt-4o"
    OPENAI_EMBEDDING_MODEL: str = "text-embedding-3-small"

    # Telegram
    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_WEBHOOK_URL: str = ""

    # Stripe
    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""
    STRIPE_PRO_PRICE_ID: str = ""
    STRIPE_TEAM_PRICE_ID: str = ""
    STRIPE_ENTERPRISE_PRICE_ID: str = ""

    # Email
    RESEND_API_KEY: str = ""
    FROM_EMAIL: str = "noreply@mindos.uz"

    # Sentry
    SENTRY_DSN: str = ""

    # CORS
    ALLOWED_ORIGINS: List[str] = ["http://localhost:3000"]

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
