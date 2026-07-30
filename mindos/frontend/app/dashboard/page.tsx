"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import { apiGet, apiPut } from "@/lib/api";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { Flame, BookOpen, Repeat2, ArrowRight, CheckCircle2, Trophy, Target, Zap } from "lucide-react";

interface TodayLesson { id: number; title: string; week: number; day: number; }
const MOTIVATIONAL = ["Har kun bir qadam — muvaffaqiyat shu yo'lda!","Ebbinghaus dedi: takrorlash — bilimning kaliti.","Bugun o'rgan, ertaga unutma — MindOS eslatadi.","Sokratik usul: savol bering, o'ylab toping."];

export default function DashboardPage() {
  const { checking } = useRequireAuth();
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [lesson, setLesson] = useState<TodayLesson | null>(null);
  const [noLessonMsg, setNoLessonMsg] = useState("");
  const [srDue, setSrDue] = useState(0);
  const [weeklyLessons, setWeeklyLessons] = useState(0);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [motivation] = useState(MOTIVATIONAL[Math.floor(Math.random() * MOTIVATIONAL.length)]);
  const [greeting, setGreeting] = useState("Xush kelibsiz");
  const [userName, setUserName] = useState("");

  useEffect(() => {
    const h = new Date().getHours();
    if (h < 12) setGreeting("Xayrli tong");
    else if (h < 17) setGreeting("Xayrli kun");
    else setGreeting("Xayrli kech");
  }, []);

  useEffect(() => {
    if (checking) return;
    Promise.all([apiGet("/users/me"), apiGet("/lessons/today"), apiGet("/spaced-repetition/stats"), apiGet("/progress/weekly")])
      .then(([me, today, sr, weekly]) => {
        setStreak(me.streak); setMaxStreak(me.max_streak);
        setUserName(me.full_name?.split(" ")[0] || "");
        setLesson(today.lesson); setNoLessonMsg(today.message || "");
        setSrDue(sr.due_today); setWeeklyLessons(weekly.lessons_completed);
      }).finally(() => setLoading(false));
  }, [checking]);

  async function completeLesson() {
    if (!lesson) return;
    setCompleting(true);
    try {
      await apiPut(`/lessons/${lesson.id}/complete`);
      const [today, me] = await Promise.all([apiGet("/lessons/today"), apiGet("/users/me")]);
      setLesson(today.lesson); setNoLessonMsg(today.message || ""); setStreak(me.streak);
    } finally { setCompleting(false); }
  }

  if (checking || loading) return (
    <div className="flex h-screen items-center justify-center bg-paper-100">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-deep-100 border-t-deep-900" />
    </div>
  );

  return (
    <div className="flex min-h-screen bg-paper-100">
      <Sidebar />
      <main className="flex-1 overflow-y-auto px-8 py-8">
        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold text-deep-950">{greeting}{userName ? `, ${userName}` : ""}! 👋</h1>
          <p className="mt-1 text-ink-500">{motivation}</p>
        </div>
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-deep-100 bg-white p-5">
            <div className={`flex items-center gap-2 ${streak>=30?"text-red-500":streak>=7?"text-amber-500":"text-orange-400"}`}>
              <Flame size={20} /><span className="text-sm font-medium">Streak</span>
              {streak>=7 && <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">🔥</span>}
            </div>
            <div className="mt-2 font-mono text-3xl font-bold text-deep-950">{streak} <span className="text-lg font-normal text-ink-400">kun</span></div>
            <div className="mt-1 text-xs text-ink-400">Rekord: {maxStreak} kun</div>
            <div className="mt-3 h-1.5 rounded-full bg-deep-100">
              <div className="h-1.5 rounded-full bg-amber-400" style={{width:`${Math.min((streak/Math.max(maxStreak,1))*100,100)}%`}} />
            </div>
          </div>
          <div className="rounded-2xl border border-deep-100 bg-white p-5">
            <div className="flex items-center gap-2 text-deep-700"><BookOpen size={20}/><span className="text-sm font-medium">Bu hafta</span></div>
            <div className="mt-2 font-mono text-3xl font-bold text-deep-950">{weeklyLessons}</div>
            <div className="mt-1 text-xs text-ink-400">dars tugatildi</div>
            <div className="mt-3 flex gap-1">{[1,2,3,4,5,6,7].map(d=><div key={d} className={`flex-1 h-6 rounded-md ${d<=weeklyLessons?"bg-deep-900":"bg-deep-100"}`}/>)}</div>
          </div>
          <div className="rounded-2xl border border-deep-100 bg-white p-5">
            <div className="flex items-center gap-2 text-deep-700"><Repeat2 size={20}/><span className="text-sm font-medium">Takrorlash</span></div>
            <div className="mt-2 font-mono text-3xl font-bold text-deep-950">{srDue}</div>
            <div className="mt-1 text-xs text-ink-400">kartochka kutmoqda</div>
            {srDue>0 && <Link href="/spaced-rep" className="mt-3 flex items-center gap-1 text-xs font-medium text-amber-600 hover:underline">Hoziroq <ArrowRight size={12}/></Link>}
          </div>
        </div>

        <div className={`mb-6 rounded-2xl p-6 ${lesson?"bg-deep-950 text-white":"border border-deep-100 bg-white"}`}>
          {lesson ? (
            <>
              <div className="flex items-center gap-2 mb-3"><Target size={18} className="text-amber-400"/><span className="font-mono text-sm text-amber-400 uppercase tracking-wide">Hafta {lesson.week} · Kun {lesson.day}</span></div>
              <h2 className="font-display text-2xl font-bold text-white">{lesson.title}</h2>
              <p className="mt-2 text-deep-200 text-sm">Bugungi darsni tugatib, streak'ingizni davom ettiring!</p>
              <div className="mt-6 flex gap-3">
                <Link href="/curriculum" className="flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-deep-950 hover:bg-amber-400">Darsni boshlash <ArrowRight size={16}/></Link>
                <button onClick={completeLesson} disabled={completing} className="flex items-center gap-2 rounded-xl border border-white/20 px-5 py-2.5 text-sm font-medium text-white hover:bg-white/10">
                  <CheckCircle2 size={16}/>{completing?"Belgilanmoqda...":"Tugatildi"}
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-green-50"><Trophy size={28} className="text-green-500"/></div>
              <div><h2 className="font-display text-xl font-semibold text-deep-950">Bugun hammasi tugallangan! 🎉</h2><p className="mt-1 text-sm text-ink-500">{noLessonMsg}</p></div>
              <Link href="/curriculum" className="ml-auto flex items-center gap-2 rounded-xl bg-deep-900 px-4 py-2 text-sm font-medium text-white hover:bg-deep-700">Curriculum <ArrowRight size={14}/></Link>
            </div>
          )}
        </div>

        {srDue>0 && (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 flex items-center justify-between">
            <div className="flex items-center gap-3"><Zap size={20} className="text-amber-500"/>
              <div><h3 className="font-semibold text-deep-950">{srDue} ta kartochka kutmoqda</h3><p className="text-xs text-ink-500">5 daqiqa yetadi</p></div>
            </div>
            <Link href="/spaced-rep" className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-deep-950 hover:bg-amber-400">Boshlash</Link>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          {[{href:"/chat",label:"Mentor bilan suhbat",icon:"💬",desc:"Savolingiz bormi?"},{href:"/progress",label:"Progress",icon:"📊",desc:"Statistikangiz"},{href:"/curriculum",label:"O'quv reja",icon:"📚",desc:"Barcha darslar"}].map(({href,label,icon,desc})=>(
            <Link key={href} href={href} className="flex items-center gap-3 rounded-xl border border-deep-100 bg-white p-4 hover:border-deep-300 hover:shadow-sm transition-all">
              <span className="text-2xl">{icon}</span>
              <div><div className="text-sm font-medium text-deep-950">{label}</div><div className="text-xs text-ink-400">{desc}</div></div>
              <ArrowRight size={14} className="ml-auto text-ink-300"/>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
