# MindOS — PyCharm orqali Local Ishga Tushirish

Bu qo'llanma faqat **backend'ni PyCharm orqali to'g'ridan-to'g'ri** ishga tushirish uchun
(Docker konteyner ichida emas) — shunda PyCharm debugger, breakpoint, va xato ko'rsatish
to'liq ishlaydi. Database va Redis esa Docker orqali ishlaydi (ularni PyCharm'da yozish kerak emas).

## 1-qadam: Faqat DB va Redis'ni Docker orqali ko'tarish

Loyiha papkasining ENG TEPASIDA (`mindos/` ichida, `backend/` emas) terminal oching:

```bash
docker-compose up db redis
```

Bu oyna ochiq qolsin (Postgres va Redis log yozadi). Yangi terminal oching keyingi qadamlar uchun.

**Tekshirish**: Agar "database system is ready to accept connections" degan qator ko'rinsa — OK.

## 2-qadam: PyCharm'da virtual environment yaratish

PyCharm pastidagi Terminal tab'da:

```bash
cd backend
python -m venv venv
```

Keyin venv'ni faollashtiring:

```bash
# Windows:
venv\Scripts\activate

# Mac / Linux:
source venv/bin/activate
```

Terminal qatori boshida `(venv)` chiqsa — to'g'ri ishladi.

PyCharm avtomatik venv'ni taklif qilishi mumkin: pastki o'ng burchakda "Python Interpreter"
ga bosib, yangi yaratilgan `backend/venv` ni tanlang.

## 3-qadam: Paketlarni o'rnatish

```bash
pip install -r requirements.txt
```

Bu 1-2 daqiqa vaqt oladi (ko'p paket bor: FastAPI, SQLAlchemy, OpenAI, Telegram bot va h.k.).

**Agar xato chiqsa** (masalan `psycopg2` yoki `asyncpg` compile xatosi):
- Windows: Microsoft C++ Build Tools kerak bo'lishi mumkin
- Mac: `xcode-select --install`

## 4-qadam: `.env` faylini sozlash

`backend/.env.local.example` faylini ko'ring — bu local ishga tushirish uchun maxsus tayyorlangan
(asosiy `.env.example` Docker ichidagi nomlar `db`/`redis` bilan ishlaydi, bu esa `localhost` bilan).

```bash
cp .env.local.example .env
```

Endi `.env` faylni ochib, **kamida shu ikkita qatorni to'ldiring**:

```
SECRET_KEY=har-qanday-uzun-tasodifiy-matn-32-belgidan-kop
OPENAI_API_KEY=sk-...sizning-haqiqiy-kalitingiz...
```

OPENAI_API_KEY siz https://platform.openai.com/api-keys dan olasiz (pullik xizmat, kredit kerak).

Boshqa qatorlar (Telegram, Stripe, Resend) hozircha bo'sh qolishi mumkin — backend xato bermaydi,
faqat shu funksiyalar (bot, to'lov, email) ishlamaydi.

## 5-qadam: Database migratsiyasini ishga tushirish

Hali `(venv)` faol terminal'da, `backend/` papkasida turib:

```bash
alembic upgrade head
```

Bu pgvector extension'ni yoqadi va barcha jadvallarni yaratadi. Muvaffaqiyatli bo'lsa,
"Running upgrade -> 0001_initial" kabi xabar ko'rinadi.

**Agar xato chiqsa**: "connection refused" — demak 1-qadamdagi Docker (db, redis) ishlamayapti,
qaytadan tekshiring.

## 6-qadam: Backend'ni ishga tushirish

```bash
uvicorn app.main:app --reload --port 8000
```

Yoki PyCharm'da `app/main.py` faylini ochib, ustidagi yashil "Run" tugmasini bossangiz ham bo'ladi
(lekin shunda Run Configuration'da "uvicorn" modulini ko'rsatish kerak — terminal orqali qilish
hozircha eng oson yo'l).

Brauzerda oching: **http://localhost:8000/docs**

Agar Swagger sahifasi va undagi barcha endpointlar (auth, chat, curricula va h.k.) ko'rinsa —
backend ishlamoqda! 🎉

## 7-qadam: Birinchi sinov — Swagger orqali

`/docs` sahifasida:
1. `POST /api/v1/auth/register` ni oching, "Try it out" bosing
2. Email, parol, ism kiritib yuboring
3. Javobda `access_token` qaytadi — uni nusxalang
4. Yuqorida "Authorize" tugmasi bor — shu tokenni kiritib, endi himoyalangan endpointlarni
   (masalan `/api/v1/users/me`) sinab ko'rishingiz mumkin

## Eng ko'p uchraydigan xatolar

| Xato | Sabab | Yechim |
|---|---|---|
| `connection refused` (DB) | Docker ishlamayapti | `docker-compose up db redis` qaytadan |
| `ModuleNotFoundError` | venv faollashmagan yoki paket o'rnatilmagan | `(venv)` borligini tekshirib, `pip install -r requirements.txt` qaytaring |
| `OPENAI_API_KEY` xatosi | `.env` da kalit yo'q/noto'g'ri | OpenAI saytidan haqiqiy kalit qo'ying |
| `pgvector` extension xatosi | Docker image eski | `docker-compose down -v` keyin qaytadan `up db redis` (eski volume o'chiriladi, ma'lumot ketadi — faqat dev uchun xavfsiz) |
| Port 5432/6379 band | Kompyuteringizda allaqachon Postgres/Redis ishlayapti | O'sha xizmatlarni to'xtatib, qaytadan urinib ko'ring |

## Keyingi qadam — Frontend

Backend ishlagandan keyin, frontend uchun **alohida** terminalda:

```bash
cd frontend
npm install
npm run dev
```

`http://localhost:3000` da to'liq saytni ko'rasiz. Frontend avtomatik `localhost:8000` dagi
backend'ga ulanadi (`next.config.js` da sozlangan).
