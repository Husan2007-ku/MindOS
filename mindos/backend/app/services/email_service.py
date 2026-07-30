import logging
import resend
from app.core.config import settings

logger = logging.getLogger(__name__)

resend.api_key = settings.RESEND_API_KEY


class EmailService:
    """
    TZ 2.1: Email — Resend / SendGrid, transaksion email (fallback notification).
    TZ 6.3: Telegram asosiy kanal, lekin telegram_id yo'q foydalanuvchilar uchun
    email — yagona yetkazish yo'li.
    """

    @staticmethod
    async def send(to: str, subject: str, html: str) -> bool:
        if not settings.RESEND_API_KEY:
            logger.warning("RESEND_API_KEY sozlanmagan — email yuborilmadi")
            return False

        try:
            resend.Emails.send({
                "from": settings.FROM_EMAIL,
                "to": to,
                "subject": subject,
                "html": html,
            })
            return True
        except Exception as e:
            logger.error(f"Email yuborishda xato (to={to}): {e}")
            return False

    @staticmethod
    def _wrap(body_html: str) -> str:
        """Barcha emaillar uchun umumiy MindOS brendli qobiq"""
        return f"""
        <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #FAF8F4;">
          <div style="text-align: center; margin-bottom: 24px;">
            <span style="font-size: 24px; font-weight: 600; color: #0F2942;">MindOS</span>
          </div>
          <div style="background: white; border-radius: 16px; padding: 24px; border: 1px solid #F0ECE3;">
            {body_html}
          </div>
          <p style="text-align: center; color: #A8A398; font-size: 12px; margin-top: 24px;">
            MindOS — O'rgan. Esla. O's.
          </p>
        </div>
        """

    @classmethod
    async def send_weekly_report(cls, to: str, full_name: str, report_text: str) -> bool:
        """TZ 3.4 Progress Agent — telegram_id yo'q foydalanuvchilar uchun email fallback"""
        body = f"""
          <h2 style="color: #0F2942; margin-top: 0;">Salom, {full_name or 'do\u02bbst'}! 📊</h2>
          <p style="color: #3D3A33; line-height: 1.6;">{report_text}</p>
          <a href="https://mindos.uz/progress" style="display: inline-block; margin-top: 16px; background: #0F2942; color: white; padding: 10px 20px; border-radius: 10px; text-decoration: none;">
            Progressni ko'rish
          </a>
        """
        return await cls.send(to, "📊 Haftalik hisobot — MindOS", cls._wrap(body))

    @classmethod
    async def send_password_reset(cls, to: str, reset_link: str) -> bool:
        """TZ 4.1: POST /auth/forgot-password — parolni tiklash linki"""
        body = f"""
          <h2 style="color: #0F2942; margin-top: 0;">Parolni tiklash</h2>
          <p style="color: #3D3A33; line-height: 1.6;">
            Parolingizni tiklash uchun so'rov yubordingiz. Quyidagi tugma orqali yangi parol o'rnatishingiz mumkin.
            Agar bu so'rovni siz yubormagan bo'lsangiz, xabarni e'tiborsiz qoldiring.
          </p>
          <a href="{reset_link}" style="display: inline-block; margin-top: 16px; background: #0F2942; color: white; padding: 10px 20px; border-radius: 10px; text-decoration: none;">
            Parolni tiklash
          </a>
          <p style="color: #A8A398; font-size: 13px; margin-top: 16px;">Link 1 soat ichida amal qiladi.</p>
        """
        return await cls.send(to, "Parolni tiklash — MindOS", cls._wrap(body))

    @classmethod
    async def send_payment_confirmation(cls, to: str, plan: str, amount: int) -> bool:
        """TZ 4.8: Stripe webhook checkout.session.completed dan keyin tasdiqlash"""
        body = f"""
          <h2 style="color: #0F2942; margin-top: 0;">To'lov muvaffaqiyatli! 🎉</h2>
          <p style="color: #3D3A33; line-height: 1.6;">
            <strong>{plan.upper()}</strong> rejasiga ${amount}/oy narxida obuna bo'ldingiz.
            Endi barcha imkoniyatlardan to'liq foydalanishingiz mumkin.
          </p>
          <a href="https://mindos.uz/dashboard" style="display: inline-block; margin-top: 16px; background: #D4A024; color: #0F2942; padding: 10px 20px; border-radius: 10px; text-decoration: none; font-weight: 600;">
            Boshlash
          </a>
        """
        return await cls.send(to, "To'lov tasdiqlandi — MindOS", cls._wrap(body))

    @classmethod
    async def send_welcome(cls, to: str, full_name: str) -> bool:
        """Ro'yxatdan o'tgandan keyin xush kelibsiz xabari"""
        body = f"""
          <h2 style="color: #0F2942; margin-top: 0;">Xush kelibsiz, {full_name or 'do\u02bbst'}! 👋</h2>
          <p style="color: #3D3A33; line-height: 1.6;">
            MindOS — sizning shaxsiy AI mentoringiz. Onboarding orqali shaxsiy o'quv reja tuzib,
            bugundan o'rganishni boshlang.
          </p>
          <a href="https://mindos.uz/onboarding" style="display: inline-block; margin-top: 16px; background: #0F2942; color: white; padding: 10px 20px; border-radius: 10px; text-decoration: none;">
            Boshlash
          </a>
        """
        return await cls.send(to, "MindOS ga xush kelibsiz!", cls._wrap(body))
