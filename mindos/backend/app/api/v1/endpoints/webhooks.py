import logging
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
import stripe

from app.core.config import settings
from app.core.database import get_db
from app.api.v1.endpoints.subscription import process_stripe_event

router = APIRouter(prefix="/webhooks", tags=["webhooks"])
logger = logging.getLogger(__name__)

stripe.api_key = settings.STRIPE_SECRET_KEY


@router.post("/stripe")
async def stripe_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """
    TZ 4.8: POST /api/v1/webhooks/stripe — to'lov tasdiqlash.
    Stripe imzosi (STRIPE_WEBHOOK_SECRET) tekshiriladi (TZ 7.1).
    """
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    if not sig_header:
        raise HTTPException(status_code=400, detail="stripe-signature header yo'q")

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
        )
    except (ValueError, stripe.SignatureVerificationError):
        raise HTTPException(status_code=400, detail="Webhook imzosi noto'g'ri")

    await process_stripe_event(event, db)

    return {"received": True}


@router.post("/telegram")
async def telegram_webhook(request: Request):
    """
    Telegram bot yangilanishlari shu yerga keladi (setWebhook orqali sozlanadi).
    app/telegram_bot/bot.py'dagi barcha komandalar (/start, /today, /streak...)
    shu orqali ishlaydi — alohida polling worker kerak emas.

    Xavfsizlik: bu endpoint ochiq (auth talab qilmaydi) — Telegram o'zi
    shunday ishlaydi. Shuning uchun TELEGRAM_WEBHOOK_SECRET sozlangan bo'lsa,
    Telegram har bir so'rovga qo'shib yuboradigan
    "X-Telegram-Bot-Api-Secret-Token" header'i tekshiriladi — aks holda
    istalgan kishi bu URL'ni bilib, soxta Update yuborib, botni istalgan
    foydalanuvchi nomidan "gapirtirishi" mumkin bo'lardi.
    """
    from telegram import Update
    from app.telegram_bot.runtime import get_application, is_configured

    if not is_configured():
        raise HTTPException(status_code=503, detail="Telegram bot sozlanmagan")

    if settings.TELEGRAM_WEBHOOK_SECRET:
        provided = request.headers.get("x-telegram-bot-api-secret-token")
        if provided != settings.TELEGRAM_WEBHOOK_SECRET:
            raise HTTPException(status_code=403, detail="Noto'g'ri webhook tokeni")

    application = await get_application()
    data = await request.json()

    try:
        update = Update.de_json(data, application.bot)
        await application.process_update(update)
    except Exception as e:
        logger.error(f"Telegram webhook qayta ishlashda xato: {e}")

    return {"ok": True}
