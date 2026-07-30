"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { apiGet, apiPost } from "@/lib/api";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { ClipboardCheck, Send, CheckCircle2 } from "lucide-react";

interface HW { id:number; question:string; user_answer:string|null; ai_feedback:string|null; score:number|null; }

export default function HomeworkPage() {
  const { checking } = useRequireAuth();
  const [homeworks, setHomeworks] = useState<HW[]>([]);
  const [answers, setAnswers] = useState<Record<number,string>>({});
  const [submitting, setSubmitting] = useState<number|null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (checking) return;
    apiGet("/homeworks/pending").then(d=>setHomeworks(d.homeworks||[])).finally(()=>setLoading(false));
  }, [checking]);

  async function submit(id: number) {
    const answer=answers[id]?.trim(); if(!answer) return;
    setSubmitting(id);
    try {
      const r=await apiPost(`/homeworks/${id}/submit`,{answer});
      setHomeworks(p=>p.map(h=>h.id===id?{...h,user_answer:answer,ai_feedback:r.ai_feedback,score:r.score}:h));
    } finally{setSubmitting(null);}
  }

  if (checking||loading) return <div className="flex h-screen items-center justify-center bg-paper-100"><div className="h-10 w-10 animate-spin rounded-full border-4 border-deep-100 border-t-deep-900"/></div>;

  return (
    <div className="flex min-h-screen bg-paper-100">
      <Sidebar/>
      <main className="flex-1 overflow-y-auto px-8 py-8">
        <div className="mb-8"><h1 className="font-display text-3xl font-bold text-deep-950">Vazifalar</h1><p className="mt-1 text-ink-500">AI tomonidan berilgan vazifalar</p></div>
        {homeworks.length===0?(
          <div className="rounded-3xl bg-white border border-deep-100 p-12 text-center">
            <ClipboardCheck size={40} className="mx-auto text-amber-500 mb-4"/>
            <h2 className="font-display text-xl font-semibold text-deep-950">Hozircha vazifa yo'q</h2>
            <p className="mt-2 text-ink-500">Darslarni tugatganingizdan keyin vazifalar paydo bo'ladi</p>
          </div>
        ):(
          <div className="space-y-4 max-w-2xl">{homeworks.map(hw=>(
            <div key={hw.id} className="rounded-2xl border border-deep-100 bg-white p-6">
              <p className="font-semibold text-deep-950 leading-relaxed">{hw.question}</p>
              {hw.ai_feedback?(
                <div className="mt-4 rounded-xl bg-deep-50 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-deep-700"><CheckCircle2 size={16} className="text-green-500"/>AI fikri</div>
                    {hw.score!==null&&<span className="font-mono font-bold text-amber-600">{hw.score}/100</span>}
                  </div>
                  <p className="text-sm text-ink-700">{hw.ai_feedback}</p>
                </div>
              ):(
                <div className="mt-4">
                  <textarea rows={3} placeholder="Javobingizni yozing..." value={answers[hw.id]||""} onChange={e=>setAnswers({...answers,[hw.id]:e.target.value})}
                    className="w-full rounded-xl border border-deep-100 px-4 py-3 text-ink-900 resize-none focus:border-deep-500 focus:outline-none"/>
                  <button onClick={()=>submit(hw.id)} disabled={submitting===hw.id}
                    className="mt-3 flex items-center gap-2 rounded-xl bg-deep-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-deep-700 disabled:opacity-50">
                    <Send size={14}/>{submitting===hw.id?"Yuborilmoqda...":"Topshirish"}
                  </button>
                </div>
              )}
            </div>
          ))}</div>
        )}
      </main>
    </div>
  );
}
