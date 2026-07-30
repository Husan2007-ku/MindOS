from celery import Celery
from celery.schedules import crontab
from app.core.config import settings

celery_app = Celery(
    "mindos",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=[
        "app.tasks.notifications",
        "app.tasks.spaced_repetition",
        "app.tasks.progress",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    # RedBeat scheduler uchun
    redbeat_redis_url=settings.REDBEAT_REDIS_URL,
    beat_scheduler="redbeat.RedBeatScheduler",
    beat_schedule={
        # Har dushanba 09:00 UTC — haftalik hisobot (Progress Agent, TZ 3.4)
        "weekly-progress-report": {
            "task": "app.tasks.progress.send_weekly_reports",
            "schedule": crontab(hour=9, minute=0, day_of_week=1),
        },
        # Har 15 daqiqada — SR eslatmalar tekshirish (TZ 6.3)
        "check-spaced-repetition-due": {
            "task": "app.tasks.spaced_repetition.check_due_reviews",
            "schedule": crontab(minute="*/15"),
        },
        # Har kuni 21:00 UTC — streak xavfi tekshirish (TZ 6.3)
        "streak-danger-check": {
            "task": "app.tasks.notifications.check_streak_danger",
            "schedule": crontab(hour=21, minute=0),
        },
    },
)
