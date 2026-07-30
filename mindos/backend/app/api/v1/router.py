from fastapi import APIRouter

from app.api.v1.endpoints.auth import router as auth_router
from app.api.v1.endpoints.onboarding import router as onboarding_router
from app.api.v1.endpoints.chat import router as chat_router
from app.api.v1.endpoints.spaced_repetition import router as sr_router
from app.api.v1.endpoints.curricula import router as curricula_router
from app.api.v1.endpoints.lessons import router as lessons_router
from app.api.v1.endpoints.homeworks import router as homeworks_router
from app.api.v1.endpoints.progress import router as progress_router
from app.api.v1.endpoints.subscription import router as subscription_router
from app.api.v1.endpoints.referral import router as referral_router
from app.api.v1.endpoints.webhooks import router as webhooks_router
from app.api.v1.endpoints.admin import router as admin_router
from app.api.v1.endpoints.users import router as users_router

api_router = APIRouter()

api_router.include_router(auth_router)
api_router.include_router(users_router)
api_router.include_router(onboarding_router)
api_router.include_router(curricula_router)
api_router.include_router(lessons_router)
api_router.include_router(homeworks_router)
api_router.include_router(chat_router)
api_router.include_router(sr_router)
api_router.include_router(progress_router)
api_router.include_router(subscription_router)
api_router.include_router(referral_router)
api_router.include_router(webhooks_router)
api_router.include_router(admin_router)
