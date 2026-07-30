from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
import stripe

from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User, Subscription, PlanEnum

router = APIRouter(prefix="/subscription", tags=["subscription"])

stripe.api_key = settings.STRIPE_SECRET_KEY

PLAN_PRICE_MAP = {
    "pro": settings.STRIPE_PRO_PRICE_ID,
    "team": settings.STRIPE_TEAM_PRICE_ID,
    "enterprise": settings.STRIPE_ENTERPRISE_PRICE_ID,
}

PLAN_DISPLAY = {
    "free": {"name": "Free", "price": 0, "features": ["1 curriculum", "10 xabar/kun", "7 kunlik Pro sinov"]},
    "pro": {"name": "Pro", "price": 9, "features": ["Cheksiz curriculum", "Cheksiz chat", "Ovoz input", "Diagram", "Progress Agent", "Telegram to'liq"]},
    "team": {"name": "Team", "price": 29, "features": ["5 xodim profili", "Admin dashboard", "Umumiy progress", "Priority support"]},
    "enterprise": {"name": "Enterprise", "price": 199, "features": ["Cheksiz xodim", "White-label", "API kirish", "Dedicated support", "SLA"]},
}


class CheckoutRequest(BaseModel):
    plan: str
    success_url: str
    cancel_url: str


@router.get("/plans")
async def get_plans():
    return {"plans": PLAN_DISPLAY}


@router.get("/current")
async def get_current_subscription(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Subscription)
        .where(Subscription.user_id == current_user.id, Subscription.status == "active")
        .order_by(Subscription.created_at.desc())
        .limit(1)
    )
    sub = result.scalar_one_or_none()

    return {
        "plan": current_user.plan,
        "subscription": {
            "id": sub.id,
            "status": sub.status,
            "current_period_end": sub.current_period_end,
            "cancel_at_period_end": sub.cancel_at_period_end,
        } if sub else None,
    }


@router.post("/checkout")
async def create_checkout_session(
    data: CheckoutRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if data.plan not in PLAN_PRICE_MAP:
        raise HTTPException(status_code=400, detail="Noto'g'ri plan")

    price_id = PLAN_PRICE_MAP[data.plan]
    if not price_id:
        raise HTTPException(status_code=503, detail="To'lov tizimi sozlanmagan")

    try:
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            mode="subscription",
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=data.success_url + "?session_id={CHECKOUT_SESSION_ID}",
            cancel_url=data.cancel_url,
            metadata={"user_id": str(current_user.id), "plan": data.plan},
            customer_email=current_user.email,
        )
        return {"checkout_url": session.url}
    except stripe.StripeError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/cancel")
async def cancel_subscription(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Subscription).where(
            Subscription.user_id == current_user.id,
            Subscription.status == "active",
        )
    )
    sub = result.scalar_one_or_none()
    if not sub or not sub.stripe_subscription_id:
        raise HTTPException(status_code=404, detail="Faol subscription topilmadi")

    try:
        stripe.Subscription.modify(
            sub.stripe_subscription_id,
            cancel_at_period_end=True,
        )
        sub.cancel_at_period_end = True
        await db.commit()
        return {"message": "Subscription davr oxirida bekor qilinadi"}
    except stripe.StripeError as e:
        raise HTTPException(status_code=400, detail=str(e))


async def process_stripe_event(event: dict, db: AsyncSession):
    """
    Stripe webhook event ni qayta ishlash — webhooks.py dan chaqiriladi (TZ 4.8: /api/v1/webhooks/stripe).
    """
    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        user_id = int(session["metadata"]["user_id"])
        plan = session["metadata"]["plan"]
        stripe_sub_id = session.get("subscription")

        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user:
            user.plan = plan
            sub = Subscription(
                user_id=user_id,
                plan=plan,
                stripe_subscription_id=stripe_sub_id,
                stripe_customer_id=session.get("customer"),
                status="active",
            )
            await db.commit()

            try:
                from app.services.email_service import EmailService
                await EmailService.send_payment_confirmation(
                    user.email, plan, PLAN_DISPLAY.get(plan, {}).get("price", 0)
                )
            except Exception:
                pass


    elif event["type"] == "customer.subscription.deleted":
        stripe_sub_id = event["data"]["object"]["id"]
        result = await db.execute(
            select(Subscription).where(Subscription.stripe_subscription_id == stripe_sub_id)
        )
        sub = result.scalar_one_or_none()
        if sub:
            sub.status = "canceled"
            result2 = await db.execute(select(User).where(User.id == sub.user_id))
            user = result2.scalar_one_or_none()
            if user:
                user.plan = PlanEnum.free
            await db.commit()
