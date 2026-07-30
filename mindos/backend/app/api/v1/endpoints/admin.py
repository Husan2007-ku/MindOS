import logging
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import get_admin_user
from app.models.user import (
    User, Subscription, Lesson, LessonStatus, Curriculum,
    Message, Notification, NotificationChannel,
)

router = APIRouter(prefix="/admin", tags=["admin"])
logger = logging.getLogger(__name__)

PLAN_PRICE_USD = {"free": 0, "pro": 9, "team": 29, "enterprise": 199}


class AnnouncementRequest(BaseModel):
    title: str
    message: str
    channel: str = "telegram"  # telegram | email | in_app


@router.get("/users")
async def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    plan: str | None = None,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_admin_user),
):
    """TZ 4.9: barcha foydalanuvchilar — pagination bilan"""
    query = select(User)
    count_query = select(func.count(User.id))

    if plan:
        query = query.where(User.plan == plan)
        count_query = count_query.where(User.plan == plan)

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = query.order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    users = result.scalars().all()

    return {
        "users": [
            {
                "id": u.id,
                "email": u.email,
                "full_name": u.full_name,
                "plan": u.plan,
                "lang": u.lang,
                "streak": u.streak,
                "onboarding_completed": u.onboarding_completed,
                "is_active": u.is_active,
                "last_active": u.last_active,
                "created_at": u.created_at,
            }
            for u in users
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size if total else 0,
    }


@router.get("/analytics/overview")
async def analytics_overview(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_admin_user),
):
    """
    TZ 4.9 + TZ 16: umumiy metrikalar — DAU, MRR, Churn va boshqa KPI lar
    (TZ 16-bo'lim "Muvaffaqiyat mezonlari" bilan bog'liq).
    """
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_ago = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)

    # MAU / DAU
    total_users_result = await db.execute(select(func.count(User.id)).where(User.is_active == True))
    total_users = total_users_result.scalar() or 0

    dau_result = await db.execute(
        select(func.count(User.id)).where(User.last_active >= today_start)
    )
    dau = dau_result.scalar() or 0

    mau_result = await db.execute(
        select(func.count(User.id)).where(User.last_active >= month_ago)
    )
    mau = mau_result.scalar() or 0

    # Plan bo'yicha taqsimot
    plan_counts_result = await db.execute(
        select(User.plan, func.count(User.id)).group_by(User.plan)
    )
    plan_counts = {row[0]: row[1] for row in plan_counts_result.all()}

    # MRR (Monthly Recurring Revenue) — TZ 16.2
    mrr = sum(PLAN_PRICE_USD.get(plan, 0) * count for plan, count in plan_counts.items())

    # Churn — oxirgi 30 kunda bekor qilingan subscriptionlar
    churned_result = await db.execute(
        select(func.count(Subscription.id)).where(
            Subscription.status == "canceled",
            Subscription.updated_at >= month_ago,
        )
    )
    churned = churned_result.scalar() or 0
    paying_users = sum(c for p, c in plan_counts.items() if p != "free")
    churn_rate = round((churned / paying_users * 100), 2) if paying_users > 0 else 0.0

    # Tugatilgan darslar (haftalik)
    lessons_week_result = await db.execute(
        select(func.count(Lesson.id)).where(
            Lesson.status == LessonStatus.completed,
            Lesson.completed_at >= week_ago,
        )
    )
    lessons_week = lessons_week_result.scalar() or 0

    # Onboarding tugallanganlar foizi
    onboarded_result = await db.execute(
        select(func.count(User.id)).where(User.onboarding_completed == True)
    )
    onboarded = onboarded_result.scalar() or 0
    onboarding_rate = round((onboarded / total_users * 100), 1) if total_users > 0 else 0.0

    return {
        "total_users": total_users,
        "dau": dau,
        "mau": mau,
        "dau_mau_ratio": round((dau / mau * 100), 1) if mau > 0 else 0.0,
        "plan_distribution": plan_counts,
        "mrr_usd": mrr,
        "arr_usd": mrr * 12,
        "churn_rate_percent": churn_rate,
        "lessons_completed_week": lessons_week,
        "onboarding_completion_rate": onboarding_rate,
    }


@router.get("/revenue")
async def revenue_breakdown(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_admin_user),
):
    """TZ 4.9: daromad grafigi va statistika — reja bo'yicha taqsimot"""
    plan_counts_result = await db.execute(
        select(User.plan, func.count(User.id)).where(User.is_active == True).group_by(User.plan)
    )
    plan_counts = {row[0]: row[1] for row in plan_counts_result.all()}

    breakdown = []
    total_mrr = 0
    for plan, count in plan_counts.items():
        price = PLAN_PRICE_USD.get(plan, 0)
        revenue = price * count
        total_mrr += revenue
        breakdown.append({
            "plan": plan,
            "users": count,
            "price_usd": price,
            "monthly_revenue_usd": revenue,
        })

    # Oxirgi 6 oy — yangi obunalar (cohort ko'rinishi uchun soddalashtirilgan)
    six_months_ago = datetime.now(timezone.utc) - timedelta(days=180)
    new_subs_result = await db.execute(
        select(func.count(Subscription.id)).where(
            Subscription.status == "active",
            Subscription.created_at >= six_months_ago,
        )
    )
    new_subs_6mo = new_subs_result.scalar() or 0

    return {
        "breakdown": breakdown,
        "total_mrr_usd": total_mrr,
        "total_arr_usd": total_mrr * 12,
        "new_subscriptions_last_6mo": new_subs_6mo,
    }


@router.post("/announcements")
async def send_announcement(
    data: AnnouncementRequest,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_admin_user),
):
    """
    TZ 4.9: barcha userlarga xabar yuborish.
    Telegram orqali yuborish darhol amalga oshadi (mavjud bo'lganlarga);
    katta foydalanuvchi bazasida bu Celery task ga ko'chirilishi tavsiya etiladi.
    """
    if not data.title.strip() or not data.message.strip():
        raise HTTPException(status_code=400, detail="Sarlavha va xabar bo'sh bo'lmasin")

    channel_enum = {
        "telegram": NotificationChannel.telegram,
        "email": NotificationChannel.email,
        "in_app": NotificationChannel.in_app,
    }.get(data.channel, NotificationChannel.telegram)

    result = await db.execute(select(User).where(User.is_active == True))
    users = result.scalars().all()

    sent_count = 0
    full_text = f"{data.title}\n\n{data.message}"

    for user in users:
        notif = Notification(
            user_id=user.id,
            notification_type="announcement",
            channel=channel_enum,
            content=full_text,
            status="pending",
        )
        db.add(notif)

        if data.channel == "telegram" and user.telegram_id:
            from app.tasks.notifications import _send_telegram
            try:
                await _send_telegram(user.telegram_id, f"📢 <b>{data.title}</b>\n\n{data.message}")
                notif.status = "sent"
                notif.sent_at = datetime.now(timezone.utc)
                sent_count += 1
            except Exception as e:
                logger.error(f"Announcement yuborishda xato (user={user.id}): {e}")
                notif.status = "failed"

    await db.commit()

    return {
        "message": f"E'lon {len(users)} foydalanuvchiga rejalashtirildi, {sent_count} taga yuborildi",
        "total_users": len(users),
        "sent": sent_count,
    }
