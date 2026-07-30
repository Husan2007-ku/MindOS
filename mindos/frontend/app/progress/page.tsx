"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { apiGet } from "@/lib/api";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { Flame, Share2, TrendingUp, Brain, BookOpen } from "lucide-react";

export default function ProgressPage() {
  const { checking } = useRequireAuth();
  const [weekly, setWeekly] = useState({ lessons_completed:0, messages_sent:0 });
  const [monthly, setMonthly] = useState({ lessons_completed:0 });
  const [streak, setStreak] = useState({ current_streak:0, max_streak:0, streak_status:"" });
  const [sr, setSr] = useState({ total_cards:0, retention_rate:0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (checking) return;
    Promise.all([apiGet("/progress/weekly"),apiGet("/progress/monthly"),apiGet("/progress/streak"),apiGet("/spaced-repetition/stats")])
      .then(([w,m,s,sr])=>{setWeekly(w);setMonthly(m);setStreak(s);setSr(sr);})
      .finally(()=>setLoading(false));
  }, [checking]);

  function share() {
    const text=`MindOS bilan ${streak.current_streak} kunlik streak! 🔥\n#MindOS #OzbekistondaOqiymiz`;
    if(navigator.share) navigator.share({text,url:"https://mindos.uz"});
    else{navigator.clipboard.writeText(text);alert("Matn nusxalandi!");}
  }

  if (checking||loading) return <div className="flex h-screen items-center justify-center bg-paper-100"><div className="h-10 w-10 animate-spin rounded-full border-4 border-deep-100 border-t-deep-900"/></div>;

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
        <div className="rounded-2xl border border-deep-100 bg-white p-6">
          <h3 className="font-semibold text-deep-950 mb-4">Bu hafta faollik</h3>
          <div className="flex items-end gap-2 h-24">
            {[3,5,2,7,4,6,weekly.messages_sent].map((v,i)=>(
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full rounded-t-lg bg-deep-900" style={{height:`${Math.max((v/10)*80,8)}px`}}/>
                <span className="text-xs text-ink-400">{["Du","Se","Ch","Pa","Ju","Sh","Ya"][i]}</span>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
