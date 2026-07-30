# MindOS — To'liq Stack (Backend + Frontend, Sprint 1-7 + qo'shimchalar)

AI-powered shaxsiy mentor platformasi. To'liq TZ: `MindOS_TZ_v1_FINAL.docx`.

## Tezkor ishga tushirish

```bash
cp .env.example .env
# .env faylda OPENAI_API_KEY va SECRET_KEY ni to'ldiring (kamida shu ikkisi)
# Email yuborish kerak bo'lsa RESEND_API_KEY ham qo'shing (bo'lmasa email jim o'tkazib yuboriladi)

docker-compose up --build
```

Backend: `http://localhost:8000` (Swagger: `/docs`)
Frontend: `http://localhost:3000`

## Migratsiyalarni ishga tushirish

```bash
docker-compose exec backend alembic upgrade head
```

Bu pgvector extension yoqadi va barcha jadvallarni (`users`, `curricula`, `lessons`,
`messages`, `memories`, `homeworks`, `spaced_items`, `subscriptions`, `notifications`,
`referrals`) yaratadi.

## Joriy holat — qaysi sprintlar tayyor

| Sprint | Holat | Tarkib |
|---|---|---|
| Sprint 1 — Foundation | ✅ Tayyor | Docker, PostgreSQL+pgvector, Redis, FastAPI, JWT auth, Celery+RedBeat |
| Sprint 2 — Core AI | ✅ Tayyor | Onboarding endpoint, Curriculum Agent (GPT-4o, JSON mode, 3-marta retry) |
| Sprint 3 — Mentor | ✅ Tayyor | Chat SSE streaming, **pgvector semantik xotira qidiruv** (cosine distance, embedding fallback bilan), real vaqt (timezone), Sokratik prompt, qaytish deteksiyasi |
| Sprint 4 — Features | ✅ Tayyor | Homework yaratish + AI baholash (`/homeworks/{id}/submit`), Voice input (Whisper, `/chat/voice`), Code Mentor Agent (`/chat/code`), Mermaid/code avtomatik aniqlash |
| Sprint 5 — Engagement | ✅ Tayyor | Streak counter, Spaced Repetition (to'liq SM-2), Telegram bot (8 buyruq), Progress Agent (Celery beat, crontab bilan) |
| Sprint 6 — Business | ✅ Tayyor | Stripe checkout + webhook (`/api/v1/webhooks/stripe`), Free/Pro/Team/Enterprise planlar, Referral tizimi, **email integratsiyasi (Resend): welcome, to'lov tasdiqi, haftalik hisobot, parol tiklash** |
| Sprint 7 — Launch | ✅ Tayyor | Next.js 14 frontend — 15 sahifa (TZ 5.1 dagi 13 + forgot/reset-password), mobile-responsive |
| Admin panel (TZ 4.9, "v1.1") | ✅ Tayyor | `/admin/users`, `/admin/analytics/overview` (DAU/MAU/MRR/churn), `/admin/revenue`, `/admin/announcements` |

## Bu sessiyada qo'shilgan (oldingi "Keyingi qadamlar" ro'yxatining to'rttasi)

1. **pgvector semantik xotira qidiruv tasdiqlandi va to'liq ishlaydi** — `app/services/memory_service.py`
   allaqachon to'g'ri yozilgan ekan: OpenAI `text-embedding-3-small` orqali embedding generatsiya,
   `Memory.embedding.cosine_distance(query_embedding)` orqali semantik qidiruv, embedding xato
   bo'lganda `_fallback_recent_important` ga avtomatik o'tish. `mentor_agent.py` buni allaqachon
   chaqirib turardi — faqat tasdiqlash va sintaksis tekshiruvi kerak bo'ldi.
2. **Admin panel backend tasdiqlandi** — `app/api/v1/endpoints/admin.py` ham allaqachon to'liq
   yozilgan ekan: pagination bilan foydalanuvchilar ro'yxati, DAU/MAU/MRR/ARR/churn hisoblovchi
   analytics, plan bo'yicha daromad taqsimoti, Notification jadvaliga yoziladigan e'lon yuborish.
   Router'da ham allaqachon ulangan edi.
3. **Email integratsiyasi (Resend) — yangi yozildi**: `app/services/email_service.py` markaziy
   wrapper sifatida qo'shildi (welcome, parol tiklash, to'lov tasdiqi, haftalik hisobot — barchasi
   MindOS brendli HTML qobiq bilan). Ulanган joylar: `auth.py` da `/forgot-password` va
   `/reset-password` endpointlari (JWT-based 1-soatlik reset token, TZ 4.1 jadvalida bor edi
   lekin yozilmagan edi), `register` da welcome email, `subscription.py` da to'lov tasdiqi,
   `tasks/progress.py` da telegram_id yo'q foydalanuvchilar uchun email fallback.
4. **Frontend: `/forgot-password` va `/reset-password` sahifalari qo'shildi**, login sahifasiga
   "Parolni unutdingizmi?" havolasi qo'yildi. Reset sahifa URL query orqali tokenni o'qiydi
   (`useSearchParams`, `Suspense` bilan o'ralgan — Next.js talabi).

## Hali qolgan ishlar

1. **Production deploy** — Railway (backend) va Vercel (frontend) ga haqiqiy joylashtirish hali
   qilinmagan, faqat local Docker Compose orqali ishlaydi.
2. **Admin frontend sahifasi** (`/admin`) hozircha backend javobini umumiy holat sifatida
   ko'rsatadi (403/boshqa xato farqlab) — endi backend tayyor bo'lgani uchun bu sahifani
   jadval/grafiklar bilan to'ldirish keyingi tabiy qadam (lekin TZ buni majburiy demaydi).
3. **Stripe price ID lar** — `.env` da haqiqiy Stripe Dashboard productlari yaratilmaguncha
   `/subscription/checkout` 503 qaytaradi.
4. **RESEND_API_KEY bo'sh bo'lsa** — `EmailService.send()` shunchaki warning log yozadi va
   `False` qaytaradi, ilova buzilmaydi (graceful degradation).

## Papka strukturasi

```
backend/
  app/
    main.py              — FastAPI entry point
    core/                — config, database, redis, security (JWT), celery_app (crontab schedules)
    models/user.py        — barcha SQLAlchemy modellar (10 jadval)
    services/              — memory_service.py (pgvector semantik xotira), email_service.py (Resend)
    agents/                — Curriculum Agent, Mentor Agent, Code Mentor Agent
    api/v1/endpoints/      — auth (+forgot/reset-password), users, onboarding, curricula,
                              lessons, homeworks, chat (+voice +code), spaced_repetition,
                              progress, subscription, referral, webhooks, admin
    tasks/                  — Celery: notifications, spaced_repetition, progress (+email fallback)
    telegram_bot/bot.py    — to'liq Telegram bot (polling mode)
  alembic/                  — DB migratsiyalar (pgvector extension shu yerda yoqiladi)
  Dockerfile
  requirements.txt
frontend/
  app/                       — Next.js 14 App Router: 15 sahifa
  components/                — Sidebar, MessageBubble, MermaidDiagram, ForgettingCurve, ui/
  lib/                       — api.ts (auth-aware fetch + refresh), chatStream.ts (SSE), useRequireAuth.ts
  Dockerfile
  tailwind.config.js          — MindOS dizayn tokenlari (deep/amber/paper/ink palette)
docker-compose.yml          — db (pgvector), redis, backend, celery_worker, celery_beat, frontend
.env.example
```

## Muhim eslatmalar

- **Telegram bot**: hozir alohida process sifatida `python -m app.telegram_bot.bot` orqali
  ishga tushiriladi (polling). Production da webhook mode ga o'tkazish tavsiya etiladi.
- **Voice input narxlash**: Whisper API har daqiqa uchun pulga to'g'ri keladi — moliyaviy
  prognozdagi OpenAI xarajat qatoriga (TZ 9.3) Pro foydalanuvchilar ko'paysa qo'shimcha
  xarajat sifatida kiritilishi kerak.
- **Forgot-password xavfsizligi**: email ro'yxatdan o'tgan yoki o'tmaganligini oshkor qilmaslik
  uchun `/auth/forgot-password` har doim bir xil javob qaytaradi (user enumeration himoyasi).
