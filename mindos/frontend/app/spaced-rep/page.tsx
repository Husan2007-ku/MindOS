"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { apiGet, apiPost } from "@/lib/api";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { RotateCcw, PartyPopper, Brain } from "lucide-react";

interface Item { id:number; front:string; back:string; }
const Q = [
  {value:1,label:"Unutdim",bg:"#FEE2E2",color:"#991B1B"},
  {value:3,label:"Qiyin",bg:"#FEF3C7",color:"#92400E"},
  {value:4,label:"Yaxshi",bg:"#DBEAFE",color:"#1E40AF"},
  {value:5,label:"Oson",bg:"#DCFCE7",color:"#166534"},
];

export default function SpacedRepPage() {
  const { checking } = useRequireAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(false);

  useEffect(() => {
    if (checking) return;
    apiGet("/spaced-repetition/due").then(d=>setItems(d.items)).finally(()=>setLoading(false));
  }, [checking]);

  if (checking||loading) return <div className="flex h-screen items-center justify-center bg-paper-100"><div className="h-10 w-10 animate-spin rounded-full border-4 border-deep-100 border-t-deep-900"/></div>;

  const current=items[idx], done=idx>=items.length;

  async function review(quality: number) {
    if(!current) return;
    setReviewing(true);
    await apiPost(`/spaced-repetition/${current.id}/review`,{quality});
    setFlipped(false); setIdx(i=>i+1); setReviewing(false);
  }

  return (
    <div className="flex min-h-screen bg-paper-100">
      <Sidebar/>
      <main className="flex flex-1 flex-col items-center justify-center px-8 py-8">
        {items.length===0||done?(
          <div className="rounded-3xl bg-white border border-deep-100 p-12 text-center shadow-sm max-w-md">
            <PartyPopper size={48} className="mx-auto text-amber-500 mb-4"/>
            <h2 className="font-display text-2xl font-bold text-deep-950">{items.length===0?"Bugun takrorlash yo'q!":"Barakalla! 🎉"}</h2>
            <p className="mt-2 text-ink-500">{items.length===0?"Barcha bilimlar mustahkamlangan.":`${items.length} ta kartochka ko'rib chiqildi!`}</p>
          </div>
        ):(
          <div className="w-full max-w-lg">
            <div className="mb-4 flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm text-ink-500"><Brain size={16} className="text-deep-700"/><span>{idx+1}/{items.length}</span></div>
              <div className="h-2 flex-1 rounded-full bg-deep-100"><div className="h-2 rounded-full bg-deep-900 transition-all" style={{width:`${(idx/items.length)*100}%`}}/></div>
            </div>
            <button onClick={()=>setFlipped(!flipped)} className="w-full">
              <div className="min-h-64 rounded-3xl border-2 border-deep-100 bg-white p-10 text-center shadow-lg hover:shadow-xl transition-all hover:border-deep-300 cursor-pointer">
                <p className="mb-3 font-mono text-xs uppercase tracking-widest text-ink-300">{flipped?"Javob":"Savol"}</p>
                <p className="font-display text-xl font-semibold text-deep-950 leading-relaxed">{flipped?current.back:current.front}</p>
                {!flipped&&<p className="mt-6 flex items-center justify-center gap-1.5 text-sm text-ink-300"><RotateCcw size={14}/>Javobni ko'rish uchun bosing</p>}
              </div>
            </button>
            {flipped&&(
              <div className="mt-4 grid grid-cols-4 gap-2">
                {Q.map(q=>(
                  <button key={q.value} onClick={()=>review(q.value)} disabled={reviewing}
                    className="rounded-xl py-3 text-sm font-semibold transition-all hover:scale-105 disabled:opacity-50"
                    style={{background:q.bg,color:q.color}}>
                    {q.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
