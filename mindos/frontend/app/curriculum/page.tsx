"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { apiGet, apiPut } from "@/lib/api";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { CheckCircle2, Circle, Pause, Play, Target, BookOpen, Library, ChevronDown } from "lucide-react";
import Link from "next/link";

interface Curriculum { id:number; topic:string; level:string; total_weeks:number; status:string; }
interface Lesson { id:number; day:number; title:string; status:string; key_points?:string[]; }

export default function CurriculumPage() {
  const { checking } = useRequireAuth();
  const [curricula, setCurricula] = useState<Curriculum[]>([]);
  const [selectedId, setSelectedId] = useState<number|null>(null);
  const [weeks, setWeeks] = useState<Record<string,Lesson[]>>({});
  const [milestones, setMilestones] = useState<string[]>([]);
  const [progress, setProgress] = useState({ completed_lessons:0, total_lessons:0, percentage:0 });
  const [loading, setLoading] = useState(true);
  const [sourceCount, setSourceCount] = useState(0);
  const [expandedId, setExpandedId] = useState<number|null>(null);

  useEffect(() => {
    if (checking) return;
    apiGet("/curricula").then(d => { setCurricula(d.curricula); if(d.curricula.length>0) setSelectedId(d.curricula[0].id); else setLoading(false); });
    apiGet("/sources").then(d => setSourceCount((d.sources||[]).filter((s:any)=>s.status==="ready").length)).catch(()=>{});
  }, [checking]);

  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    Promise.all([apiGet(`/curricula/${selectedId}`), apiGet(`/curricula/${selectedId}/lessons`), apiGet(`/curricula/${selectedId}/progress`)])
      .then(([det,les,prog]) => { setMilestones(det.curriculum_data?.milestones||[]); setWeeks(les.weeks||{}); setProgress(prog); })
      .finally(() => setLoading(false));
  }, [selectedId]);

  async function togglePause(c: Curriculum) {
    await apiPut(`/curricula/${c.id}/${c.status==="active"?"pause":"resume"}`);
    apiGet("/curricula").then(d => setCurricula(d.curricula));
  }

  if (checking) return null;

  return (
    <div className="flex min-h-screen bg-paper-100">
      <Sidebar/>
      <main className="flex-1 overflow-y-auto px-8 pb-8 pt-20 md:pt-8">
        <div className="mb-8 flex items-center justify-between"><div><h1 className="font-display text-3xl font-bold text-deep-950">O'quv reja</h1><p className="mt-1 text-ink-500">Sizning shaxsiy o'quv yo'lxaritangiz</p></div>{sourceCount>0 && <Link href="/sources" className="flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100"><Library size={14}/>{sourceCount} ta manba asosida</Link>}</div>
        {curricula.length===0 ? (
          <div className="rounded-3xl bg-white border border-deep-100 p-12 text-center">
            <BookOpen size={40} className="mx-auto text-amber-500 mb-4"/>
            <h2 className="font-display text-xl font-semibold text-deep-950">Hali o'quv reja yo'q</h2>
          </div>
        ) : (
          <>
            {curricula.length>1&&<div className="mb-6 flex gap-2">{curricula.map(c=><button key={c.id} onClick={()=>setSelectedId(c.id)} className={`rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${selectedId===c.id?"border-deep-900 bg-deep-900 text-white":"border-deep-100 bg-white text-ink-700"}`}>{c.topic}</button>)}</div>}
            {!loading&&selectedId&&(()=>{
              const curr=curricula.find(c=>c.id===selectedId)!;
              return <>
                <div className="mb-6 rounded-2xl bg-white border border-deep-100 p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div><h2 className="font-display text-xl font-bold text-deep-950">{curr.topic}</h2><p className="mt-1 text-sm text-ink-500">{curr.total_weeks} hafta · {curr.level}</p></div>
                    <button onClick={()=>togglePause(curr)} className="flex items-center gap-1.5 rounded-xl border border-deep-100 px-3 py-1.5 text-sm text-ink-600 hover:bg-deep-50">
                      {curr.status==="active"?<><Pause size={14}/>To'xtatish</>:<><Play size={14}/>Davom</>}
                    </button>
                  </div>
                  <div className="flex justify-between text-sm text-ink-500 mb-1.5"><span>{progress.completed_lessons}/{progress.total_lessons} dars</span><span className="font-mono font-semibold text-deep-900">{progress.percentage}%</span></div>
                  <div className="h-2.5 rounded-full bg-deep-100"><div className="h-2.5 rounded-full bg-amber-500 transition-all" style={{width:`${progress.percentage}%`}}/></div>
                </div>
                {milestones.length>0&&<div className="mb-6 rounded-2xl bg-white border border-deep-100 p-6">
                  <div className="flex items-center gap-2 mb-3 text-deep-700"><Target size={18}/><h3 className="font-semibold">Milestone'lar</h3></div>
                  <ul className="space-y-2">{milestones.map((m,i)=><li key={i} className="flex items-start gap-2 text-sm text-ink-600"><span className="mt-0.5 h-5 w-5 rounded-full bg-amber-100 text-amber-600 text-xs font-bold flex items-center justify-center flex-shrink-0">{i+1}</span>{m}</li>)}</ul>
                </div>}
                <div className="space-y-4">{Object.entries(weeks).map(([week,lessons])=>(
                  <div key={week} className="rounded-2xl bg-white border border-deep-100 p-6">
                    <h3 className="font-display text-lg font-semibold text-deep-950 mb-3">Hafta {week}</h3>
                    <div className="space-y-1">{lessons.map(l=>(
                      <div key={l.id} className={`rounded-xl transition-colors ${l.status==="completed"?"bg-green-50":"hover:bg-deep-50"}`}>
                        <div className="flex items-center gap-3 px-3 py-2.5">
                          <Link href={`/chat?lesson=${l.id}`} className="flex flex-1 items-center gap-3 min-w-0">
                            {l.status==="completed"?<CheckCircle2 size={18} className="text-green-500 flex-shrink-0"/>:<Circle size={18} className="text-ink-200 flex-shrink-0"/>}
                            <span className={`text-sm ${l.status==="completed"?"text-ink-400 line-through":"text-ink-900"}`}>Kun {l.day}: {l.title}</span>
                          </Link>
                          {!!l.key_points?.length && (
                            <button onClick={()=>setExpandedId(expandedId===l.id?null:l.id)} className="flex-shrink-0 rounded-lg p-1 text-ink-300 hover:bg-deep-100 hover:text-ink-700">
                              <ChevronDown size={16} className={`transition-transform ${expandedId===l.id?"rotate-180":""}`}/>
                            </button>
                          )}
                        </div>
                        {expandedId===l.id && !!l.key_points?.length && (
                          <ul className="ml-9 mr-3 mb-3 space-y-1 border-l-2 border-deep-100 pl-3">
                            {l.key_points!.map((p,i)=><li key={i} className="text-xs text-ink-500">{p}</li>)}
                          </ul>
                        )}
                      </div>
                    ))}</div>
                  </div>
                ))}</div>
              </>;
            })()}
          </>
        )}
      </main>
    </div>
  );
}
