"use client";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import { useRequireAuth } from "@/lib/useRequireAuth";
import {
  LayoutDashboard, MessageCircle, BookOpen, ClipboardCheck, Repeat2,
  TrendingUp, Library, Languages, Mic, ArrowRight, Sparkles,
} from "lucide-react";

const SECTIONS = [
  {
    icon: LayoutDashboard,
    title: "Bosh sahifa",
    body:
      "Bugungi darsingiz va necha kunlik streak (ketma-ket o'rganish)ingiz shu yerda ko'rinadi. \"Darsni boshlash\" tugmasini bosing — sizni to'g'ridan-to'g'ri o'sha darsni o'rgatadigan Mentor suhbatiga olib boradi.",
  },
  {
    icon: MessageCircle,
    title: "Mentor (asosiy o'qish joyi)",
    body:
      "Bu yerda AI Mentor bilan gaplashasiz: savol berasiz, dars mavzusini tushuntirib berishini so'raysiz, kod yozsangiz \"Kod\" rejimiga o'ting. Mikrofon tugmasi orqali ovozli gapirish ham mumkin (Pro reja). \"IELTS Speaking mashqi\" tugmasini yoqsangiz, Mentor IELTS imtihonchisi kabi savol beradi va har javobingizdan keyin qisqa baho (fluency, so'z boyligi, grammatika) beradi.",
  },
  {
    icon: BookOpen,
    title: "O'quv reja",
    body:
      "Barcha haftalik va kunlik darslaringiz ro'yxati. Istalgan darsni bosing — o'sha dars bo'yicha Mentor bilan suhbat ochiladi va u sizga mavzuni tushuntirib beradi.",
  },
  {
    icon: ClipboardCheck,
    title: "Vazifalar",
    body:
      "Har darsdan keyin paydo bo'ladigan yozma vazifalarni shu yerda ko'rasiz. Javobingizni yozib \"Topshirish\"ni bossangiz, AI uni baholaydi va fikr bildiradi. Past ball olsangiz, sizga avtomatik qo'shimcha tushuntirish darsi qo'shiladi.",
  },
  {
    icon: Repeat2,
    title: "Takrorlash",
    body:
      "Unutish egri chizig'iga (Ebbinghaus) asoslangan kartochkalar — o'rgangan narsalaringizni to'g'ri vaqtda takrorlab, uzoq muddatli xotirada saqlab qolasiz.",
  },
  {
    icon: Library,
    title: "Manbalar",
    body:
      "O'zingiz o'qiyotgan yoki o'qigan kursni (matn/konspekt), YouTube videoni yoki faylni (PDF/DOCX/TXT) shu yerga yuklang. Shundan keyin Mentor va o'quv reja umumiy internet ma'lumoti o'rniga AYNAN shu manbalaringizga asoslanib javob beradi va tushuntiradi. \"Manbalaringizdan so'rang\" orqali to'g'ridan-to'g'ri savol ham berishingiz mumkin.",
  },
  {
    icon: TrendingUp,
    title: "Progress",
    body: "Umumiy statistika: necha dars tugallandi, haftalik hisobot, mastery darajangiz.",
  },
];

export default function HelpPage() {
  const { checking } = useRequireAuth();
  if (checking) return null;

  return (
    <div className="flex min-h-screen bg-paper-100">
      <Sidebar />
      <main className="flex-1 overflow-y-auto px-8 py-8">
        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold text-deep-950">Ilovadan qanday foydalanish</h1>
          <p className="mt-1 text-ink-500">Maksimal foyda olish uchun har bo'lim nima qilishini bilib oling.</p>
        </div>

        <div className="mb-8 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <Sparkles size={20} className="mt-0.5 flex-shrink-0 text-amber-600" />
            <div>
              <p className="font-semibold text-amber-900">Eslatma: hech narsa yodlab yurishingiz shart emas</p>
              <p className="mt-1 text-sm text-amber-800">
                Agar biror tugma yoki bo'lim nima qilishini bilmasangiz — <Link href="/chat" className="underline font-medium">Mentordan</Link> shunchaki so'rang: "bu tugma nima qiladi", "IELTS uchun menga qanday yordam berasan" kabi. AI ilovaning o'zini yaxshi biladi va aniq javob beradi.
              </p>
            </div>
          </div>
        </div>

        <div className="mb-8 rounded-2xl border border-deep-100 bg-white p-6">
          <div className="mb-3 flex items-center gap-2 text-deep-900">
            <Languages size={20} />
            <h2 className="font-display text-lg font-semibold">Misol: 1 oyda IELTS tayyorgarligi</h2>
          </div>
          <ol className="space-y-2 text-sm text-ink-700">
            <li><strong>1.</strong> Onboarding'da mavzu qilib "IELTS tayyorgarlik", maqsad qilib "1 oyda IELTS olish" deb yozing — AI sizga shunga mos kunlik reja tuzadi.</li>
            <li><strong>2.</strong> O'zingizda IELTS darsligi yoki konspekt bo'lsa, <Link href="/sources" className="underline font-medium">Manbalar</Link> sahifasidan yuklang — Mentor shu materialga asoslanib tushuntiradi.</li>
            <li><strong>3.</strong> Har kuni Bosh sahifadan "Darsni boshlash"ni bosing — Mentor mavzuni tushuntirib, savol-javob qiladi.</li>
            <li><strong>4.</strong> Speaking mashq qilish uchun Mentor sahifasida <Mic size={13} className="inline" /> mikrofon yonidagi "IELTS Speaking mashqi"ni yoqing — AI imtihonchi kabi savol beradi, siz ingliz tilida javob berasiz (yozma yoki ovozli), u har javobdan keyin qisqa baho beradi.</li>
            <li><strong>5.</strong> Har dars oxiridagi vazifani <Link href="/homework" className="underline font-medium">Vazifalar</Link> sahifasida bajaring — AI baholaydi.</li>
          </ol>
        </div>

        <h2 className="mb-3 font-display text-lg font-semibold text-deep-950">Bo'limlar</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {SECTIONS.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-2xl border border-deep-100 bg-white p-5">
              <div className="mb-2 flex items-center gap-2 text-deep-900">
                <Icon size={18} />
                <h3 className="font-semibold">{title}</h3>
              </div>
              <p className="text-sm text-ink-600">{body}</p>
            </div>
          ))}
        </div>

        <Link href="/chat" className="mt-8 flex items-center justify-center gap-2 rounded-2xl bg-deep-900 px-6 py-3 text-sm font-semibold text-white hover:bg-deep-700">
          Mentor bilan boshlash <ArrowRight size={16} />
        </Link>
      </main>
    </div>
  );
}
