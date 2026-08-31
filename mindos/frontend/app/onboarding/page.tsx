"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { apiPost, apiFetch } from "@/lib/api";
import { Sparkles, Brain, SkipForward, CheckCircle2, FileText, Youtube, Type } from "lucide-react";

const LEVELS = [
  { value:"beginner", label:"Boshlang'ich", desc:"Noldan boshlayman" },
  { value:"intermediate", label:"O'rta", desc:"Asoslarni bilaman" },
  { value:"advanced", label:"Yuqori", desc:"Chuqurlashtirmoqchiman" },
];

interface DiagQuestion { question: string; options: string[]; }
interface DiagResult { recommended_level: string; score_percent: number; correct_count: number; total_questions: number; reasoning: string; }

const TOTAL_STEPS = 7;

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

  // --- Manba qo'shish, ixtiyoriy (foydalanuvchi so'rovi bo'yicha qo'shildi) ---
  const [sourceTab, setSourceTab] = useState<"file"|"youtube"|"text">("file");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sourceTitle, setSourceTitle] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [textContent, setTextContent] = useState("");
  const [sourceAdding, setSourceAdding] = useState(false);
  const [sourceAddedMsg, setSourceAddedMsg] = useState("");
  const [sourceError, setSourceError] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // --- Adaptiv diagnostika (TZ'dan tashqari qo'shilgan funksiya) ---
  const [diagQuestions, setDiagQuestions] = useState<DiagQuestion[] | null>(null);
  const [diagToken, setDiagToken] = useState<string>("");
  const [diagAnswers, setDiagAnswers] = useState<number[]>([]);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagError, setDiagError] = useState("");
  const [diagResult, setDiagResult] = useState<DiagResult | null>(null);
  const [diagSkipped, setDiagSkipped] = useState(false);
  const [scoring, setScoring] = useState(false);

  useEffect(() => {
    if (step === 2 && !diagQuestions && !diagSkipped && !diagResult && !diagLoading) {
      loadDiagnostic();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  if (checking) return null;

  async function loadDiagnostic() {
    setDiagLoading(true); setDiagError("");
    try {
      const d = await apiPost("/onboarding/diagnostic/generate", { topic });
      setDiagQuestions(d.questions);
      setDiagToken(d.quiz_token);
      setDiagAnswers(new Array(d.questions.length).fill(-1));
    } catch {
      setDiagError("Diagnostika testini yuklab bo'lmadi. O'zingiz darajangizni tanlashingiz mumkin.");
    } finally {
      setDiagLoading(false);
    }
  }

  function selectAnswer(qIdx: number, optIdx: number) {
    setDiagAnswers(prev => { const next = [...prev]; next[qIdx] = optIdx; return next; });
  }

  async function submitDiagnostic() {
    setScoring(true); setDiagError("");
    try {
      const result: DiagResult = await apiPost("/onboarding/diagnostic/score", { quiz_token: diagToken, answers: diagAnswers });
      setDiagResult(result);
      setLevel(result.recommended_level);
      setStep(3);
    } catch {
      setDiagError("Testni baholab bo'lmadi. Qaytadan urinib ko'ring yoki o'tkazib yuboring.");
    } finally {
      setScoring(false);
    }
  }

  function skipDiagnostic() {
    setDiagSkipped(true);
    setStep(3);
  }

  async function handleFinish() {
    setError(""); setSubmitting(true);
    try {
      // Ilgari bu yerda API manzili hardcode qilingan edi (production'da ishlamas edi) —
      // endi lib/api.ts orqali, environment variable'ga hurmat qilib yuboriladi.
      await apiPost("/onboarding/start", { topic, level, daily_minutes: dailyMinutes, current_knowledge: currentKnowledge, goal });
      router.push("/dashboard");
    } catch (e: any) {
      setError(e?.message || "Xatolik"); setSubmitting(false);
    }
  }

  // Onboarding paytida manba qo'shish (ixtiyoriy) — foydalanuvchi "onboarding'da
  // manba yuklash" so'ragan edi. Curriculum hali yaratilmagan bo'lsa ham manba
  // user_id'ga bog'lanadi va Curriculum Agent uni avtomatik topib ishlatadi
  // (source_service.search_relevant_chunks curriculum_id talab qilmaydi).
  async function addSourceDuringOnboarding() {
    setSourceError(""); setSourceAddedMsg("");
    setSourceAdding(true);
    try {
      if (sourceTab === "file") {
        const file = fileInputRef.current?.files?.[0];
        if (!file) { setSourceError("Avval fayl tanlang"); return; }
        const form = new FormData();
        form.append("file", file);
        form.append("title", sourceTitle);
        await apiFetch("/sources/upload", { method: "POST", body: form });
      } else if (sourceTab === "youtube") {
        if (!youtubeUrl.trim()) { setSourceError("YouTube link kiriting"); return; }
        await apiPost("/sources/youtube", { url: youtubeUrl.trim(), title: sourceTitle.trim() });
      } else {
        if (textContent.trim().length < 20) { setSourceError("Matn kamida 20 belgidan iborat bo'lsin"); return; }
        await apiPost("/sources/text", { title: sourceTitle.trim(), content: textContent.trim() });
      }
      setSourceAddedMsg("Manba qo'shildi! Reja shunga asoslanib tuziladi.");
      setSourceTitle(""); setYoutubeUrl(""); setTextContent("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (e: any) {
      setSourceError(e?.message || "Manba qo'shishda xatolik");
    } finally {
      setSourceAdding(false);
    }
  }

  const s = { card:{ background:"white", borderRadius:"20px", padding:"40px", maxWidth:"560px", width:"100%", boxShadow:"0 4px 24px rgba(0,0,0,0.08)" } };
  const allAnswered = diagQuestions ? diagAnswers.every(a => a >= 0) : false;

  return (
    <main style={{ display:"flex", minHeight:"100vh", alignItems:"center", justifyContent:"center", background:"#FAF8F4", padding:"24px" }}>
      <div style={s.card}>
        <div style={{ display:"flex", gap:"6px", marginBottom:"32px" }}>
          {Array.from({length:TOTAL_STEPS},(_,i)=>i+1).map(n=>(
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
            <div style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"8px" }}>
              <Brain size={20} color="#D4A024" />
              <h2 style={{ fontSize:"22px", fontWeight:"700", color:"#1A1814", margin:0 }}>Tezkor diagnostika</h2>
            </div>
            <p style={{ fontSize:"14px", color:"#6B675D", marginBottom:"20px" }}>
              O'zingiz taxmin qilish o'rniga, AI 4 ta savol bilan haqiqiy darajangizni aniqlaydi — bu shaxsiy rejani ancha aniqroq qiladi.
            </p>

            {diagLoading && (
              <div style={{ textAlign:"center", padding:"32px 0" }}>
                <div style={{ width:"32px", height:"32px", border:"3px solid #E5DFD3", borderTopColor:"#D4A024", borderRadius:"50%", margin:"0 auto 12px", animation:"spin 0.8s linear infinite" }} />
                <p style={{ fontSize:"13px", color:"#6B675D" }}>"{topic}" bo'yicha test tuzilmoqda...</p>
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
              </div>
            )}

            {diagError && !diagLoading && (
              <div style={{ background:"#FEF3C7", border:"1px solid #FCD34D", borderRadius:"12px", padding:"14px", marginBottom:"16px", fontSize:"13px", color:"#92400E" }}>
                {diagError}
              </div>
            )}

            {diagQuestions && !diagLoading && (
              <div style={{ display:"flex", flexDirection:"column", gap:"18px", maxHeight:"360px", overflowY:"auto", paddingRight:"4px" }}>
                {diagQuestions.map((q, qi) => (
                  <div key={qi}>
                    <p style={{ fontSize:"14px", fontWeight:"600", color:"#1A1814", marginBottom:"8px" }}>{qi+1}. {q.question}</p>
                    <div style={{ display:"flex", flexDirection:"column", gap:"6px" }}>
                      {q.options.map((opt, oi) => (
                        <button key={oi} onClick={()=>selectAnswer(qi, oi)}
                          style={{ textAlign:"left", padding:"10px 14px", borderRadius:"10px", fontSize:"13px", cursor:"pointer",
                            border:`1.5px solid ${diagAnswers[qi]===oi?"#0F2942":"#E5DFD3"}`,
                            background:diagAnswers[qi]===oi?"#F0F4F8":"white",
                            color:"#1A1814" }}>
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:"20px" }}>
              <button onClick={skipDiagnostic} style={{ display:"flex", alignItems:"center", gap:"6px", background:"none", border:"none", color:"#A8A398", fontSize:"13px", cursor:"pointer" }}>
                <SkipForward size={14}/> O'tkazib yuborish
              </button>
              {diagQuestions && (
                <button onClick={submitDiagnostic} disabled={!allAnswered||scoring}
                  style={{ padding:"10px 20px", background:"#0F2942", color:"white", border:"none", borderRadius:"10px", cursor:"pointer", fontSize:"14px", fontWeight:"600", opacity:allAnswered?1:0.5 }}>
                  {scoring?"Tekshirilmoqda...":"Testni yakunlash"}
                </button>
              )}
            </div>
          </>
        )}

        {step===3&&(
          <>
            <h2 style={{ fontSize:"22px", fontWeight:"700", color:"#1A1814", marginBottom:"8px" }}>Hozirgi darajangiz?</h2>
            {diagResult ? (
              <div style={{ display:"flex", alignItems:"flex-start", gap:"10px", background:"#F0F4F8", border:"1px solid #C7DBE5", borderRadius:"12px", padding:"14px", marginBottom:"20px" }}>
                <CheckCircle2 size={18} color="#0F2942" style={{ marginTop:"1px", flexShrink:0 }} />
                <div>
                  <p style={{ fontSize:"13px", fontWeight:"600", color:"#0F2942", margin:0 }}>Diagnostika natijasi: {diagResult.correct_count}/{diagResult.total_questions} to'g'ri ({diagResult.score_percent}%)</p>
                  <p style={{ fontSize:"13px", color:"#3D3A33", marginTop:"4px" }}>{diagResult.reasoning}</p>
                </div>
              </div>
            ) : (
              <p style={{ fontSize:"14px", color:"#6B675D", marginBottom:"24px" }}>Bu shaxsiy reja qurishda yordam beradi</p>
            )}
            <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
              {LEVELS.map(l=>(
                <button key={l.value} onClick={()=>setLevel(l.value)}
                  style={{ padding:"14px 16px", border:`2px solid ${level===l.value?"#0F2942":"#E5DFD3"}`, borderRadius:"12px", background:level===l.value?"#F0F4F8":"white", cursor:"pointer", textAlign:"left" }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    <div style={{ fontWeight:"600", color:"#1A1814" }}>{l.label}</div>
                    {diagResult?.recommended_level===l.value && <span style={{ fontSize:"11px", fontWeight:"700", color:"#B0801A", background:"#F6E8C8", padding:"2px 8px", borderRadius:"100px" }}>AI tavsiyasi</span>}
                  </div>
                  <div style={{ fontSize:"13px", color:"#6B675D" }}>{l.desc}</div>
                </button>
              ))}
            </div>
          </>
        )}

        {step===4&&(
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

        {step===5&&(
          <>
            <h2 style={{ fontSize:"22px", fontWeight:"700", color:"#1A1814", marginBottom:"4px" }}>Hozirgi bilimingiz <span style={{ fontSize:"13px", color:"#6B675D", fontWeight:"400" }}>(ixtiyoriy)</span></h2>
            <p style={{ fontSize:"14px", color:"#6B675D", marginBottom:"24px" }}>AI sizga moslab reja tuzadi</p>
            <textarea rows={3} value={currentKnowledge} onChange={e=>setCurrentKnowledge(e.target.value)} placeholder="Masalan: Men Excel bilaman, lekin kod yozmaganman"
              style={{ width:"100%", padding:"12px 16px", border:"1.5px solid #E5DFD3", borderRadius:"12px", fontSize:"14px", outline:"none", resize:"none", boxSizing:"border-box" }} />
          </>
        )}

        {step===6&&(
          <>
            <h2 style={{ fontSize:"22px", fontWeight:"700", color:"#1A1814", marginBottom:"4px" }}>Maqsadingiz nima? <span style={{ fontSize:"13px", color:"#6B675D", fontWeight:"400" }}>(ixtiyoriy)</span></h2>
            <p style={{ fontSize:"14px", color:"#6B675D", marginBottom:"24px" }}>Bu sizni nimaga undaydi?</p>
            <textarea rows={3} value={goal} onChange={e=>setGoal(e.target.value)} placeholder="Masalan: 3 oyda ishga joylashmoqchiman"
              style={{ width:"100%", padding:"12px 16px", border:"1.5px solid #E5DFD3", borderRadius:"12px", fontSize:"14px", outline:"none", resize:"none", boxSizing:"border-box" }} />
          </>
        )}

        {step===7&&(
          <>
            <h2 style={{ fontSize:"22px", fontWeight:"700", color:"#1A1814", marginBottom:"4px" }}>Sizda material bormi? <span style={{ fontSize:"13px", color:"#6B675D", fontWeight:"400" }}>(ixtiyoriy)</span></h2>
            <p style={{ fontSize:"14px", color:"#6B675D", marginBottom:"20px" }}>
              Darslik, konspekt yoki YouTube video qo'shsangiz, AI shu mavzuni sizning HAQIQIY materialingizga asoslanib tushuntiradi.
            </p>

            <div style={{ display:"flex", gap:"6px", marginBottom:"14px" }}>
              {[
                { key:"file" as const, label:"Fayl", icon:FileText },
                { key:"youtube" as const, label:"YouTube", icon:Youtube },
                { key:"text" as const, label:"Matn", icon:Type },
              ].map(({key,label,icon:Icon})=>(
                <button key={key} onClick={()=>{setSourceTab(key);setSourceError("");}}
                  style={{ display:"flex", alignItems:"center", gap:"6px", padding:"8px 14px", borderRadius:"10px", fontSize:"13px", fontWeight:"600", cursor:"pointer",
                    border:`1.5px solid ${sourceTab===key?"#0F2942":"#E5DFD3"}`,
                    background:sourceTab===key?"#0F2942":"white",
                    color:sourceTab===key?"white":"#1A1814" }}>
                  <Icon size={14}/>{label}
                </button>
              ))}
            </div>

            {sourceError && <p style={{ color:"#DC2626", fontSize:"13px", marginBottom:"10px" }}>{sourceError}</p>}
            {sourceAddedMsg && <p style={{ color:"#15803D", fontSize:"13px", marginBottom:"10px" }}>✓ {sourceAddedMsg}</p>}

            {sourceTab==="file" && (
              <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
                <input type="file" ref={fileInputRef} accept=".pdf,.docx,.txt"
                  style={{ width:"100%", padding:"10px", border:"1.5px solid #E5DFD3", borderRadius:"10px", fontSize:"13px" }} />
                <input value={sourceTitle} onChange={e=>setSourceTitle(e.target.value)} placeholder="Sarlavha (ixtiyoriy)"
                  style={{ width:"100%", padding:"11px 14px", border:"1.5px solid #E5DFD3", borderRadius:"10px", fontSize:"14px", outline:"none", boxSizing:"border-box" }} />
                <p style={{ fontSize:"12px", color:"#A8A398" }}>PDF, DOCX yoki TXT (20 MB gacha)</p>
              </div>
            )}
            {sourceTab==="youtube" && (
              <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
                <input value={youtubeUrl} onChange={e=>setYoutubeUrl(e.target.value)} placeholder="https://youtube.com/watch?v=..."
                  style={{ width:"100%", padding:"11px 14px", border:"1.5px solid #E5DFD3", borderRadius:"10px", fontSize:"14px", outline:"none", boxSizing:"border-box" }} />
                <input value={sourceTitle} onChange={e=>setSourceTitle(e.target.value)} placeholder="Sarlavha (ixtiyoriy)"
                  style={{ width:"100%", padding:"11px 14px", border:"1.5px solid #E5DFD3", borderRadius:"10px", fontSize:"14px", outline:"none", boxSizing:"border-box" }} />
              </div>
            )}
            {sourceTab==="text" && (
              <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
                <input value={sourceTitle} onChange={e=>setSourceTitle(e.target.value)} placeholder="Sarlavha"
                  style={{ width:"100%", padding:"11px 14px", border:"1.5px solid #E5DFD3", borderRadius:"10px", fontSize:"14px", outline:"none", boxSizing:"border-box" }} />
                <textarea rows={4} value={textContent} onChange={e=>setTextContent(e.target.value)} placeholder="Matnni shu yerga joylashtiring..."
                  style={{ width:"100%", padding:"11px 14px", border:"1.5px solid #E5DFD3", borderRadius:"10px", fontSize:"14px", outline:"none", resize:"none", boxSizing:"border-box" }} />
              </div>
            )}

            <button onClick={addSourceDuringOnboarding} disabled={sourceAdding}
              style={{ marginTop:"14px", padding:"10px 18px", background:"#F0F4F8", color:"#0F2942", border:"1.5px solid #C7DBE5", borderRadius:"10px", cursor:"pointer", fontSize:"13px", fontWeight:"600" }}>
              {sourceAdding?"Qo'shilmoqda...":"+ Manba qo'shish"}
            </button>
          </>
        )}

        {error&&<p style={{ color:"#DC2626", fontSize:"13px", marginTop:"12px" }}>{error}</p>}

        {step!==2&&(
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:"32px" }}>
            {step>1 ? (
              <button onClick={()=>setStep(step-1)} style={{ padding:"10px 20px", border:"1.5px solid #E5DFD3", borderRadius:"10px", background:"white", cursor:"pointer", fontSize:"14px", color:"#6B675D" }}>
                Orqaga
              </button>
            ) : <span />}
            {step<TOTAL_STEPS ? (
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
        )}
      </div>
    </main>
  );
}
