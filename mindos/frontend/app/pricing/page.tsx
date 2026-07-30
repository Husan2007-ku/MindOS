"use client";
import { useState } from "react";
import Link from "next/link";
import { getAccessToken } from "@/lib/api";
import { Check, Zap } from "lucide-react";

const PLANS=[
  {id:"free",name:"Free",price:"$0",period:"",features:["1 curriculum","10 xabar/kun","7 kunlik Pro sinov","Spaced repetition"],cta:"Bepul boshlash",highlight:false},
  {id:"pro",name:"Pro",price:"$9",period:"/oy",features:["Cheksiz curriculum","Cheksiz chat","Ovoz input","Diagram render","Progress Agent","Telegram eslatma"],cta:"Pro boshlash",highlight:true},
  {id:"team",name:"Team",price:"$29",period:"/oy",features:["5 xodim profili","Admin dashboard","Umumiy progress","Priority support"],cta:"Team boshlash",highlight:false},
];

export default function PricingPage() {
  const [loading, setLoading] = useState<string|null>(null);
  const [error, setError] = useState("");

  async function select(planId: string) {
    if(planId==="free"){window.location.href="/register";return;}
    const token=getAccessToken();
    if(!token){window.location.href=`/register?plan=${planId}`;return;}
    setLoading(planId);
    try {
      const res=await fetch("http://localhost:8000/api/v1/subscription/checkout",{
        method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${token}`},
        body:JSON.stringify({plan:planId,success_url:`${window.location.origin}/dashboard`,cancel_url:`${window.location.origin}/pricing`}),
      });
      const d=await res.json();
      if(d.checkout_url) window.location.href=d.checkout_url;
    } catch{setError("Xatolik yuz berdi");}
    finally{setLoading(null);}
  }

  return (
    <main className="min-h-screen bg-paper-100 px-6 py-16">
      <div className="mx-auto max-w-5xl">
        <div className="text-center mb-16">
          <Link href="/" className="font-display text-2xl font-bold text-deep-900">MindOS</Link>
          <h1 className="mt-6 font-display text-5xl font-bold text-deep-950">Sizga mos reja</h1>
          <p className="mt-4 text-ink-500 text-lg">7 kun bepul sinab ko'ring. Kredit karta shart emas.</p>
          {error&&<p className="mt-4 text-red-600 text-sm">{error}</p>}
        </div>
        <div className="grid gap-6 sm:grid-cols-3">
          {PLANS.map(p=>(
            <div key={p.id} className={`rounded-3xl p-8 flex flex-col ${p.highlight?"bg-deep-950 text-white shadow-2xl scale-105":"bg-white border border-deep-100"}`}>
              {p.highlight&&<div className="mb-4 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-400"><Zap size={12}/>Eng mashhur</div>}
              <h3 className={`font-display text-2xl font-bold ${p.highlight?"text-white":"text-deep-950"}`}>{p.name}</h3>
              <div className="mt-3 mb-6">
                <span className={`font-mono text-4xl font-bold ${p.highlight?"text-amber-400":"text-deep-950"}`}>{p.price}</span>
                <span className={`text-sm ${p.highlight?"text-deep-300":"text-ink-400"}`}>{p.period}</span>
              </div>
              <ul className="flex-1 space-y-3 mb-8">
                {p.features.map(f=>(
                  <li key={f} className="flex items-center gap-2.5 text-sm">
                    <div className={`flex h-5 w-5 items-center justify-center rounded-full ${p.highlight?"bg-amber-500":"bg-deep-100"}`}>
                      <Check size={12} className={p.highlight?"text-deep-950":"text-deep-700"}/>
                    </div>
                    <span className={p.highlight?"text-deep-100":"text-ink-600"}>{f}</span>
                  </li>
                ))}
              </ul>
              <button onClick={()=>select(p.id)} disabled={loading===p.id}
                className={`w-full rounded-xl py-3 text-sm font-bold transition-all hover:scale-105 disabled:opacity-50 ${p.highlight?"bg-amber-500 text-deep-950 hover:bg-amber-400":"bg-deep-900 text-white hover:bg-deep-700"}`}>
                {loading===p.id?"Yuklanmoqda...":p.cta}
              </button>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
