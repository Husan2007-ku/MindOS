"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import { apiGet } from "@/lib/api";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { Flame, Share2, TrendingUp, Brain, BookOpen, Award, Target } from "lucide-react";

interface DayActivity { date: string; label: string; messages: number; lessons_completed: number; }
interface MasteryItem {
  curriculum_id: number; topic: string; level: string; status: string;
  total_lessons: number; completed_lessons: number;
  completion_percent: number; avg_homework_score: number | null;
  retention_index: number; mastery_score: number; certificate_eligible: boolean;
}

export default function ProgressPage() {
  const { checking } = useRequireAuth();
  const [weekly, setWeekly] = useState({ lessons_completed:0, messages_sent:0 });
  const [monthly, setMonthly] = useState({ lessons_completed:0 });
  const [streak, setStreak] = useState({ current_streak:0, max_streak:0, streak_status:"" });
  const [sr, setSr] = useState({ total_cards:0, retention_rate:0 });
  const [daily, setDaily] = useState<DayActivity[]>([]);
  const [mastery, setMastery] = useState<MasteryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (checking) return;
    Promise.all([
      apiGet("/progress/weekly"),
      apiGet("/progress/monthly"),
      apiGet("/progress/streak"),
      apiGet("/spaced-repetition/stats"),
      apiGet("/progress/daily-activity"),
      apiGet("/progress/mastery"),
    ])
      .then(([w,m,s,srData,d,ms])=>{
        setWeekly(w); setMonthly(m); setStreak(s); setSr(srData);
        setDaily(d.days || []); setMastery(ms.curricula || []);
      })
      .finally(()=>setLoading(false));
  }, [checking]);

  function share() {
    const text=`MindOS bilan ${streak.current_streak} kunlik streak! 🔥\n#MindOS #OzbekistondaOqiymiz`;
    if(navigator.share) navigator.share({text,url:"https://mindos.uz"});
    else{navigator.clipboard.writeText(text);alert("Matn nusxalandi!");}
  }

  if (checking||loading) return <div className="flex h-screen items-center justify-center bg-paper-100"><div className="h-10 w-10 animate-spin rounded-full border-4 border-deep-100 border-t-deep-900"/></div>;

  const maxDailyValue = Math.max(...daily.map(d => d.messages), 1);

  return (
    <div className="flex min-h-screen bg-paper-100">
      <Sidebar/>
      <main className="flex-1 overflow-y-auto px-8 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div><h1 className="font-display text-3xl font-bold text-deep-950">Progress</h1><p className="mt-1 text-ink-500">Sizning o'sishingiz</p></div>
          <button onClick={share} className="flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-deep-950 hover:bg-amber-400"><Share2 size={16}/>Ulashish</button>
        </div>
        <div className="mb-6 rounded-3xl bg-deep-950 p-8 text-white">
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-amber-500"><Flame size={40} className="text-white"/></div>
            <div>
              <div className="font-mono text-5xl font-bold text-amber-400">{streak.current_streak}</div>
              <div className="text-deep-200">kunlik streak</div>
              <div className="mt-1 text-sm text-deep-300">{streak.streak_status}</div>
            </div>
            <div className="ml-auto text-right">
              <div className="text-sm text-deep-300">Rekord</div>
              <div className="font-mono text-3xl font-bold text-white">{streak.max_streak}</div>
              <div className="text-sm text-deep-300">kun</div>
            </div>
          </div>
          <div className="mt-6 h-2 rounded-full bg-deep-800">
            <div className="h-2 rounded-full bg-amber-400 transition-all" style={{width:`${Math.min((streak.current_streak/Math.max(streak.max_streak,1))*100,100)}%`}}/>
          </div>
        </div>
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          {[
            {icon:BookOpen,label:"Bu hafta",value:weekly.lessons_completed,sub:"dars tugatildi",color:"text-deep-700"},
            {icon:TrendingUp,label:"Bu oy",value:monthly.lessons_completed,sub:"dars tugatildi",color:"text-deep-700"},
            {icon:Brain,label:"Eslab qolish",value:`${sr.retention_rate}%`,sub:`${sr.total_cards} kartochka`,color:"text-green-600"},
          ].map(({icon:Icon,label,value,sub,color})=>(
            <div key={label} className="rounded-2xl border border-deep-100 bg-white p-6">
              <div className={`flex items-center gap-2 ${color}`}><Icon size={18}/><span className="text-sm font-medium">{label}</span></div>
              <div className="mt-2 font-mono text-3xl font-bold text-deep-950">{value}</div>
              <div className="mt-1 text-xs text-ink-400">{sub}</div>
            </div>
          ))}
        </div>

        {/* Haqiqiy kunlik faollik (avval 6/7 ustuni soxta/hardcode edi) */}
        <div className="mb-6 rounded-2xl border border-deep-100 bg-white p-6">
          <h3 className="font-semibold text-deep-950 mb-4">Bu hafta faollik</h3>
          <div className="flex items-end gap-2 h-24">
            {daily.map((d,i)=>(
              <div key={i} className="flex-1 flex flex-col items-center gap-1" title={`${d.messages} xabar, ${d.lessons_completed} dars`}>
                <div className="w-full rounded-t-lg bg-deep-900" style={{height:`${Math.max((d.messages/maxDailyValue)*80,4)}px`}}/>
                <span className="text-xs text-ink-400">{d.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Mastery / Ta'sir paneli — TZ'dan tashqari qo'shilgan funksiya */}
        <div className="rounded-2xl border border-deep-100 bg-white p-6">
          <div className="flex items-center gap-2 mb-1">
            <Target size={18} className="text-deep-700" />
            <h3 className="font-semibold text-deep-950">O'zlashtirish darajasi</h3>
          </div>
          <p className="text-xs text-ink-400 mb-4">Tugallanish + vazifa baholari + eslab qolish indeksidan hisoblangan yagona ko'rsatkich</p>
          {mastery.length === 0 ? (
            <p className="text-sm text-ink-500">Hali faol o'quv reja yo'q.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {mastery.map(m => (
                <div key={m.curriculum_id} className="rounded-xl border border-deep-100 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-semibold text-deep-950 text-sm">{m.topic}</p>
                      <p className="text-xs text-ink-400">{m.completed_lessons ?? 0} dars • {m.completion_percent}% tugallangan</p>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-2xl font-bold text-deep-950">{m.mastery_score}</div>
                      <div className="text-xs text-ink-400">mastery</div>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-deep-100 mb-3">
                    <div className="h-2 rounded-full bg-amber-500" style={{width:`${Math.min(m.mastery_score,100)}%`}}/>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex gap-4 text-xs text-ink-500">
                      <span>Vazifa: {m.avg_homework_score !== null ? `${m.avg_homework_score}%` : "—"}</span>
                      <span>Eslab qolish: {m.retention_index}%</span>
                    </div>
                    {m.certificate_eligible && (
                      <Link href={`/certificate/${m.curriculum_id}`} className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-deep-950 hover:bg-amber-400">
                        <Award size={13}/> Sertifikat
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
