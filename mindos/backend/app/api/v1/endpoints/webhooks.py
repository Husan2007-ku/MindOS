from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
import stripe

from app.core.config import settings
from app.core.database import get_db
from app.api.v1.endpoints.subscription import process_stripe_event

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

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
