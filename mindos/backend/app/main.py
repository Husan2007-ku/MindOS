import sentry_sdk
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.core.config import settings
from app.core.database import engine, Base
from app.api.v1.router import api_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Telegram bot — faqat TELEGRAM_BOT_TOKEN sozlangan bo'lsa ishga tushadi.
    # Webhook rejimi: alohida polling worker kerak emas (app/telegram_bot/runtime.py).
    try:
        from app.telegram_bot.runtime import get_application, is_configured, shutdown_application
        if is_configured():
            application = await get_application()
            if settings.TELEGRAM_WEBHOOK_URL:
                await application.bot.set_webhook(url=settings.TELEGRAM_WEBHOOK_URL)
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Telegram bot ishga tushmadi: {e}")

    yield

    try:
        from app.telegram_bot.runtime import shutdown_application
        await shutdown_application()
    except Exception:
        pass
    await engine.dispose()

if settings.SENTRY_DSN:
    sentry_sdk.init(dsn=settings.SENTRY_DSN, traces_sample_rate=0.2)

app = FastAPI(
    title='MindOS API',
    description='AI-Powered Shaxsiy Mentor Platformasi',
    version='1.0.0',
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

app.include_router(api_router, prefix='/api/v1')

@app.get('/health')
async def health_check():
    return {'status': 'ok', 'version': '1.0.0', 'app': 'MindOS'}
