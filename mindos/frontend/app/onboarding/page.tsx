"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { getAccessToken } from "@/lib/api";
import { Sparkles } from "lucide-react";

const LEVELS = [
  { value:"beginner", label:"Boshlang'ich", desc:"Noldan boshlayman" },
  { value:"intermediate", label:"O'rta", desc:"Asoslarni bilaman" },
  { value:"advanced", label:"Yuqori", desc:"Chuqurlashtirmoqchiman" },
];

export default function OnboardingPage() {
  const { checking } = useRequireAuth();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState("beginner");
  const [dailyMinutes, setDailyMinutes] = useState(30);
  const [customMinutes, setCustomMinutes] = useState("");
  const [currentKnowledge, setCurrentKnowledge] = useState("");
  const [goal, setGoal] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (checking) return null;

  async function handleFinish() {
    setError(""); setSubmitting(true);
    try {
      const token = getAccessToken();
      const res = await fetch("http://localhost:8000/api/v1/onboarding/start", {
        method:"POST", headers:{ "Content-Type":"application/json", ...(token?{Authorization:`Bearer ${token}`}:{}) },
        body: JSON.stringify({ topic, level, daily_minutes: dailyMinutes, current_knowledge: currentKnowledge, goal }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.detail||"Xatolik"); setSubmitting(false); return; }
      router.push("/dashboard");
    } catch { setError("Server bilan aloqa yo'q"); setSubmitting(false); }
  }

  const s = { card:{ background:"white", borderRadius:"20px", padding:"40px", maxWidth:"480px", width:"100%", boxShadow:"0 4px 24px rgba(0,0,0,0.08)" } };

  return (
    <main style={{ display:"flex", minHeight:"100vh", alignItems:"center", justifyContent:"center", background:"#FAF8F4", padding:"24px" }}>
      <div style={s.card}>
        <div style={{ display:"flex", gap:"6px", marginBottom:"32px" }}>
          {[1,2,3,4,5].map(n=>(
            <div key={n} style={{ flex:1, height:"4px", borderRadius:"2px", background: n<=step?"#D4A024":"#E5DFD3", transition:"background 0.3s" }} />
          ))}
        </div>

        {step===1&&(
          <>
            <h2 style={{ fontSize:"22px", fontWeight:"700", color:"#1A1814", marginBottom:"8px" }}>Nimani o'rganmoqchisiz?</h2>
            <p style={{ fontSize:"14px", color:"#6B675D", marginBottom:"24px" }}>Aniq mavzu yozing — Python, Ingliz tili, Marketing va h.k.</p>
            <input autoFocus value={topic} onChange={e=>setTopic(e.target.value)} placeholder="Masalan: Python dasturlash"
              style={{ width:"100%", padding:"12px 16px", border:"1.5px solid #E5DFD3", borderRadius:"12px", fontSize:"15px", outline:"none", boxSizing:"border-box" }} />
          </>
        )}

        {step===2&&(
          <>
            <h2 style={{ fontSize:"22px", fontWeight:"700", color:"#1A1814", marginBottom:"8px" }}>Hozirgi darajangiz?</h2>
            <p style={{ fontSize:"14px", color:"#6B675D", marginBottom:"24px" }}>Bu shaxsiy reja qurishda yordam beradi</p>
            <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
              {LEVELS.map(l=>(
                <button key={l.value} onClick={()=>setLevel(l.value)}
                  style={{ padding:"14px 16px", border:`2px solid ${level===l.value?"#0F2942":"#E5DFD3"}`, borderRadius:"12px", background:level===l.value?"#F0F4F8":"white", cursor:"pointer", textAlign:"left" }}>
                  <div style={{ fontWeight:"600", color:"#1A1814" }}>{l.label}</div>
                  <div style={{ fontSize:"13px", color:"#6B675D" }}>{l.desc}</div>
                </button>
              ))}
            </div>
          </>
        )}

        {step===3&&(
          <>
            <h2 style={{ fontSize:"22px", fontWeight:"700", color:"#1A1814", marginBottom:"8px" }}>Kuniga qancha vaqt?</h2>
            <p style={{ fontSize:"14px", color:"#6B675D", marginBottom:"24px" }}>Real bo'lgan vaqtni tanlang</p>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:"8px", marginBottom:"16px" }}>
              {[15,30,45,60].map(m=>(
                <button key={m} onClick={()=>{setDailyMinutes(m);setCustomMinutes("");}}
                  style={{ padding:"12px", border:`2px solid ${dailyMinutes===m&&!customMinutes?"#0F2942":"#E5DFD3"}`, borderRadius:"12px", background:dailyMinutes===m&&!customMinutes?"#0F2942":"white", color:dailyMinutes===m&&!customMinutes?"white":"#1A1814", fontFamily:"monospace", cursor:"pointer", fontWeight:"600" }}>
                  {m}m
                </button>
              ))}
            </div>
            <div>
              <p style={{ fontSize:"13px", color:"#6B675D", marginBottom:"8px" }}>Yoki o'zingiz kiriting:</p>
              <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
                <input type="number" min={5} max={240} value={customMinutes} onChange={e=>{setCustomMinutes(e.target.value);if(e.target.value)setDailyMinutes(Number(e.target.value));}} placeholder="20"
                  style={{ width:"80px", padding:"10px 12px", border:`1.5px solid ${customMinutes?"#0F2942":"#E5DFD3"}`, borderRadius:"10px", fontSize:"15px", outline:"none", fontFamily:"monospace" }} />
                <span style={{ color:"#6B675D", fontSize:"14px" }}>daqiqa</span>
              </div>
            </div>
          </>
        )}

        {step===4&&(
          <>
            <h2 style={{ fontSize:"22px", fontWeight:"700", color:"#1A1814", marginBottom:"4px" }}>Hozirgi bilimingiz <span style={{ fontSize:"13px", color:"#6B675D", fontWeight:"400" }}>(ixtiyoriy)</span></h2>
            <p style={{ fontSize:"14px", color:"#6B675D", marginBottom:"24px" }}>AI sizga moslab reja tuzadi</p>
            <textarea rows={3} value={currentKnowledge} onChange={e=>setCurrentKnowledge(e.target.value)} placeholder="Masalan: Men Excel bilaman, lekin kod yozmaganman"
              style={{ width:"100%", padding:"12px 16px", border:"1.5px solid #E5DFD3", borderRadius:"12px", fontSize:"14px", outline:"none", resize:"none", boxSizing:"border-box" }} />
          </>
        )}

        {step===5&&(
          <>
            <h2 style={{ fontSize:"22px", fontWeight:"700", color:"#1A1814", marginBottom:"4px" }}>Maqsadingiz nima? <span style={{ fontSize:"13px", color:"#6B675D", fontWeight:"400" }}>(ixtiyoriy)</span></h2>
            <p style={{ fontSize:"14px", color:"#6B675D", marginBottom:"24px" }}>Bu sizni nimaga undaydi?</p>
            <textarea rows={3} value={goal} onChange={e=>setGoal(e.target.value)} placeholder="Masalan: 3 oyda ishga joylashmoqchiman"
              style={{ width:"100%", padding:"12px 16px", border:"1.5px solid #E5DFD3", borderRadius:"12px", fontSize:"14px", outline:"none", resize:"none", boxSizing:"border-box" }} />
          </>
        )}

        {error&&<p style={{ color:"#DC2626", fontSize:"13px", marginTop:"12px" }}>{error}</p>}

        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:"32px" }}>
          {step>1 ? (
            <button onClick={()=>setStep(step-1)} style={{ padding:"10px 20px", border:"1.5px solid #E5DFD3", borderRadius:"10px", background:"white", cursor:"pointer", fontSize:"14px", color:"#6B675D" }}>
              Orqaga
            </button>
          ) : <span />}
          {step<5 ? (
            <button onClick={()=>setStep(step+1)} disabled={step===1&&topic.trim().length<3}
              style={{ padding:"12px 24px", background:"#0F2942", color:"white", border:"none", borderRadius:"12px", cursor:"pointer", fontSize:"15px", fontWeight:"600", opacity:step===1&&topic.trim().length<3?0.5:1 }}>
              Keyingisi
            </button>
          ) : (
            <button onClick={handleFinish} disabled={submitting}
              style={{ padding:"12px 24px", background:"#D4A024", color:"#0F2942", border:"none", borderRadius:"12px", cursor:"pointer", fontSize:"15px", fontWeight:"700", display:"flex", alignItems:"center", gap:"8px" }}>
              ✨ {submitting?"Reja tuzilmoqda...":"Rejani tuzish"}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
