from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr

from app.core.database import get_db
from app.core.config import settings
from app.core.security import (
    hash_password, verify_password,
    create_access_token, create_refresh_token, get_current_user
)
from app.models.user import User

router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str | None = None
    lang: str = "uz"
    tg_id: str | None = None
    tg_username: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    reset_token: str
    new_password: str


@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(data: RegisterRequest, db: AsyncSession = Depends(get_db)):
    # Mavjud email tekshirish
    result = await db.execute(select(User).where(User.email == data.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Bu email allaqachon ro'yxatdan o'tgan")

    if len(data.password) < 8:
        raise HTTPException(status_code=400, detail="Parol kamida 8 ta belgidan iborat bo'lishi kerak")

    user = User(
        email=data.email,
        hashed_password=hash_password(data.password),
        full_name=data.full_name,
        lang=data.lang,
    )

    # Agar foydalanuvchi Telegram bot orqali kelgan bo'lsa (bot.py /start'dagi
    # ro'yxatdan o'tish linki: ?tg_id=...&tg_username=...) — akkauntni darhol
    # bog'lab qo'yamiz, alohida "Telegram bog'lash" qadami kerak bo'lmaydi.
    if data.tg_id:
        existing_tg = await db.execute(select(User).where(User.telegram_id == data.tg_id))
        if not existing_tg.scalar_one_or_none():
            user.telegram_id = data.tg_id
            user.telegram_username = data.tg_username

    db.add(user)
    await db.flush()

    from app.services.analytics_service import log_event, EVENT_USER_REGISTERED
    await log_event(db, EVENT_USER_REGISTERED, user_id=user.id, meta={"lang": user.lang, "via_telegram": bool(data.tg_id)})

    try:
        from app.services.email_service import EmailService
        await EmailService.send_welcome(user.email, user.full_name)
    except Exception:
        pass

    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )


@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(data.password, user.hashed_password or ""):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email yoki parol noto'g'ri",
        )

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Akkaunt bloklangan")

    # ADMIN_EMAILS ro'yxatidagi email har safar login qilganda avtomatik
    # is_admin=True bo'lib qoladi — qo'lda SQL yozish shart emas.
    if user.email in settings.ADMIN_EMAILS and not user.is_admin:
        user.is_admin = True
        await db.commit()

    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(data: RefreshRequest, db: AsyncSession = Depends(get_db)):
    from jose import JWTError, jwt
    from app.core.config import settings

    try:
        payload = jwt.decode(data.refresh_token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Noto'g'ri token turi")
        user_id = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        raise HTTPException(status_code=401, detail="Token yaroqsiz yoki muddati o'tgan")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Foydalanuvchi topilmadi")

    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )


@router.post("/forgot-password")
async def forgot_password(data: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    """
    TZ 4.1: POST /auth/forgot-password — parolni tiklash linki yuborish.
    Email mavjud bo'lmasa ham bir xil javob qaytariladi — bu orqali kim ro'yxatdan
    o'tgan, kim o'tmagani aniqlanmasligi uchun (xavfsizlik amaliyoti).
    """
    from datetime import datetime, timedelta, timezone
    from jose import jwt
    from app.core.config import settings
    from app.services.email_service import EmailService

    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()

    generic_response = {
        "message": "Agar bu email ro'yxatdan o'tgan bo'lsa, parolni tiklash linki yuborildi"
    }

    if not user:
        return generic_response

    reset_token = jwt.encode(
        {
            "sub": str(user.id),
            "type": "password_reset",
            "exp": datetime.now(timezone.utc) + timedelta(hours=1),
        },
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )
    reset_link = f"https://mindos.uz/reset-password?token={reset_token}"
    try:
        await EmailService.send_password_reset(user.email, reset_link)
    except Exception:
        pass

    return generic_response


@router.post("/reset-password")
async def reset_password(data: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    """TZ 4.1: POST /auth/reset-password — yangi parol o'rnatish"""
    from jose import JWTError, jwt
    from app.core.config import settings

    if len(data.new_password) < 8:
        raise HTTPException(status_code=400, detail="Parol kamida 8 ta belgidan iborat bo'lishi kerak")

    try:
        payload = jwt.decode(data.reset_token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if payload.get("type") != "password_reset":
            raise HTTPException(status_code=400, detail="Noto'g'ri token turi")
        user_id = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        raise HTTPException(status_code=400, detail="Reset link yaroqsiz yoki muddati o'tgan")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Foydalanuvchi topilmadi")

    user.hashed_password = hash_password(data.new_password)
    await db.commit()

    return {"message": "Parol muvaffaqiyatli yangilandi. Endi yangi parol bilan kiring."}


@router.get("/me")
async def get_me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "email": current_user.email,
        "full_name": current_user.full_name,
        "lang": current_user.lang,
        "timezone": current_user.timezone,
        "plan": current_user.plan,
        "streak": current_user.streak,
        "max_streak": current_user.max_streak,
        "onboarding_completed": current_user.onboarding_completed,
        "created_at": current_user.created_at,
    }
