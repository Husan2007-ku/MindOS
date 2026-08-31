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

const TOTAL_STEPS = 5;

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

  const allAnswered = diagQuestions ? diagAnswers.every(a => a >= 0) : false;
  const titleInputClass = "w-full px-3.5 py-[11px] border-[1.5px] border-deep-100 rounded-[10px] text-sm outline-none box-border";

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper-100 p-6">
      <div className="bg-white rounded-[20px] p-10 max-w-[560px] w-full shadow-[0_4px_24px_rgba(0,0,0,0.08)]">
        <div className="flex gap-1.5 mb-8">
          {Array.from({length:TOTAL_STEPS},(_,i)=>i+1).map(n=>(
            <div key={n} className={`flex-1 h-1 rounded-sm transition-colors duration-300 ${n<=step?"bg-amber-500":"bg-deep-100"}`} />
          ))}
        </div>

        {step===1&&(
          <>
            <h2 className="text-[22px] font-bold text-ink-900 mb-2">Nimani o'rganmoqchisiz?</h2>
            <p className="text-sm text-ink-500 mb-6">Aniq mavzu yozing — Python, Ingliz tili, Marketing va h.k.</p>
            <input autoFocus value={topic} onChange={e=>setTopic(e.target.value)} placeholder="Masalan: Python dasturlash"
              className="w-full px-4 py-3 border-[1.5px] border-deep-100 rounded-xl text-[15px] outline-none box-border" />
          </>
        )}

        {step===2&&(
          <>
            <div className="flex items-center gap-2 mb-2">
              <Brain size={20} className="text-amber-500" />
              <h2 className="text-[22px] font-bold text-ink-900">Tezkor diagnostika</h2>
            </div>
            <p className="text-sm text-ink-500 mb-5">
              O'zingiz taxmin qilish o'rniga, AI 4 ta savol bilan haqiqiy darajangizni aniqlaydi — bu shaxsiy rejani ancha aniqroq qiladi.
            </p>

            {diagLoading && (
              <div className="text-center py-8">
                <div className="w-8 h-8 border-[3px] border-deep-100 border-t-amber-500 rounded-full mx-auto mb-3 animate-spin" />
                <p className="text-[13px] text-ink-500">"{topic}" bo'yicha test tuzilmoqda...</p>
              </div>
            )}

            {diagError && !diagLoading && (
              <div className="bg-[#FEF3C7] border border-[#FCD34D] rounded-xl p-3.5 mb-4 text-[13px] text-[#92400E]">
                {diagError}
              </div>
            )}

            {diagQuestions && !diagLoading && (
              <div className="flex flex-col gap-[18px] max-h-[360px] overflow-y-auto pr-1">
                {diagQuestions.map((q, qi) => (
                  <div key={qi}>
                    <p className="text-sm font-semibold text-ink-900 mb-2">{qi+1}. {q.question}</p>
                    <div className="flex flex-col gap-1.5">
                      {q.options.map((opt, oi) => (
                        <button key={oi} onClick={()=>selectAnswer(qi, oi)}
                          className={`text-left px-3.5 py-2.5 rounded-[10px] text-[13px] cursor-pointer border-[1.5px] text-ink-900 ${diagAnswers[qi]===oi?"border-deep-900 bg-deep-50":"border-deep-100 bg-white"}`}>
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-between items-center mt-5">
              <button onClick={skipDiagnostic} className="flex items-center gap-1.5 bg-transparent border-none text-ink-300 text-[13px] cursor-pointer">
                <SkipForward size={14}/> O'tkazib yuborish
              </button>
              {diagQuestions && (
                <button onClick={submitDiagnostic} disabled={!allAnswered||scoring}
                  className={`px-5 py-2.5 bg-deep-900 text-white border-none rounded-[10px] cursor-pointer text-sm font-semibold ${allAnswered?"opacity-100":"opacity-50"}`}>
                  {scoring?"Tekshirilmoqda...":"Testni yakunlash"}
                </button>
              )}
            </div>
          </>
        )}

        {step===3&&(
          <>
            <h2 className="text-[22px] font-bold text-ink-900 mb-2">Hozirgi darajangiz?</h2>
            {diagResult ? (
              <div className="flex items-start gap-[10px] bg-deep-50 border border-deep-100 rounded-xl p-3.5 mb-5">
                <CheckCircle2 size={18} className="text-deep-900 mt-px flex-shrink-0" />
                <div>
                  <p className="text-[13px] font-semibold text-deep-900">Diagnostika natijasi: {diagResult.correct_count}/{diagResult.total_questions} to'g'ri ({diagResult.score_percent}%)</p>
                  <p className="text-[13px] text-ink-700 mt-1">{diagResult.reasoning}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-ink-500 mb-6">Bu shaxsiy reja qurishda yordam beradi</p>
            )}
            <div className="flex flex-col gap-[10px]">
              {LEVELS.map(l=>(
                <button key={l.value} onClick={()=>setLevel(l.value)}
                  className={`px-4 py-3.5 border-2 rounded-xl cursor-pointer text-left ${level===l.value?"border-deep-900 bg-deep-50":"border-deep-100 bg-white"}`}>
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-ink-900">{l.label}</div>
                    {diagResult?.recommended_level===l.value && <span className="text-[11px] font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">AI tavsiyasi</span>}
                  </div>
                  <div className="text-[13px] text-ink-500">{l.desc}</div>
                </button>
              ))}
            </div>
          </>
        )}

        {step===4&&(
          <>
            <h2 className="text-[22px] font-bold text-ink-900 mb-2">Yakuniy sozlamalar</h2>
            <p className="text-sm text-ink-500 mb-5">Bu ma'lumotlar rejani sizga moslashtiradi</p>

            <div className="flex flex-col gap-[22px] max-h-[380px] overflow-y-auto pr-1">
              <div>
                <p className="text-sm font-semibold text-ink-900 mb-2.5">Kuniga qancha vaqt?</p>
                <div className="grid grid-cols-4 gap-2 mb-2.5">
                  {[15,30,45,60].map(m=>(
                    <button key={m} onClick={()=>{setDailyMinutes(m);setCustomMinutes("");}}
                      className={`p-3 border-2 rounded-xl font-mono cursor-pointer font-semibold ${dailyMinutes===m&&!customMinutes?"bg-deep-900 text-white border-deep-900":"bg-white text-ink-900 border-deep-100"}`}>
                      {m}m
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input type="number" min={5} max={240} value={customMinutes} onChange={e=>{setCustomMinutes(e.target.value);if(e.target.value)setDailyMinutes(Number(e.target.value));}} placeholder="20"
                    className={`w-20 px-3 py-2.5 border-[1.5px] rounded-[10px] text-[15px] outline-none font-mono ${customMinutes?"border-deep-900":"border-deep-100"}`} />
                  <span className="text-ink-500 text-sm">daqiqa (o'zingiz ham kiritishingiz mumkin)</span>
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-ink-900 mb-1">Hozirgi bilimingiz <span className="text-xs text-ink-300 font-normal">(ixtiyoriy)</span></p>
                <textarea rows={2} value={currentKnowledge} onChange={e=>setCurrentKnowledge(e.target.value)} placeholder="Masalan: Men Excel bilaman, lekin kod yozmaganman"
                  className="w-full px-4 py-3 border-[1.5px] border-deep-100 rounded-xl text-sm outline-none resize-none box-border" />
              </div>

              <div>
                <p className="text-sm font-semibold text-ink-900 mb-1">Maqsadingiz nima? <span className="text-xs text-ink-300 font-normal">(ixtiyoriy)</span></p>
                <textarea rows={2} value={goal} onChange={e=>setGoal(e.target.value)} placeholder="Masalan: 3 oyda ishga joylashmoqchiman"
                  className="w-full px-4 py-3 border-[1.5px] border-deep-100 rounded-xl text-sm outline-none resize-none box-border" />
              </div>
            </div>
          </>
        )}

        {step===5&&(
          <>
            <h2 className="text-[22px] font-bold text-ink-900 mb-1">Sizda material bormi? <span className="text-[13px] text-ink-500 font-normal">(ixtiyoriy)</span></h2>
            <p className="text-sm text-ink-500 mb-5">
              Darslik, konspekt yoki YouTube video qo'shsangiz, AI shu mavzuni sizning HAQIQIY materialingizga asoslanib tushuntiradi.
            </p>

            <div className="flex gap-1.5 mb-3.5">
              {[
                { key:"file" as const, label:"Fayl", icon:FileText },
                { key:"youtube" as const, label:"YouTube", icon:Youtube },
                { key:"text" as const, label:"Matn", icon:Type },
              ].map(({key,label,icon:Icon})=>(
                <button key={key} onClick={()=>{setSourceTab(key);setSourceError("");}}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-[10px] text-[13px] font-semibold cursor-pointer border-[1.5px] ${sourceTab===key?"border-deep-900 bg-deep-900 text-white":"border-deep-100 bg-white text-ink-900"}`}>
                  <Icon size={14}/>{label}
                </button>
              ))}
            </div>

            {sourceError && <p className="text-red-600 text-[13px] mb-2.5">{sourceError}</p>}
            {sourceAddedMsg && <p className="text-green-700 text-[13px] mb-2.5">✓ {sourceAddedMsg}</p>}

            {sourceTab==="file" && (
              <div className="flex flex-col gap-2.5">
                <input type="file" ref={fileInputRef} accept=".pdf,.docx,.txt"
                  className="w-full p-2.5 border-[1.5px] border-deep-100 rounded-[10px] text-[13px]" />
                <input value={sourceTitle} onChange={e=>setSourceTitle(e.target.value)} placeholder="Sarlavha (ixtiyoriy)"
                  className={titleInputClass} />
                <p className="text-xs text-ink-300">PDF, DOCX yoki TXT (20 MB gacha)</p>
              </div>
            )}
            {sourceTab==="youtube" && (
              <div className="flex flex-col gap-2.5">
                <input value={youtubeUrl} onChange={e=>setYoutubeUrl(e.target.value)} placeholder="https://youtube.com/watch?v=..."
                  className={titleInputClass} />
                <input value={sourceTitle} onChange={e=>setSourceTitle(e.target.value)} placeholder="Sarlavha (ixtiyoriy)"
                  className={titleInputClass} />
              </div>
            )}
            {sourceTab==="text" && (
              <div className="flex flex-col gap-2.5">
                <input value={sourceTitle} onChange={e=>setSourceTitle(e.target.value)} placeholder="Sarlavha"
                  className={titleInputClass} />
                <textarea rows={4} value={textContent} onChange={e=>setTextContent(e.target.value)} placeholder="Matnni shu yerga joylashtiring..."
                  className="w-full px-3.5 py-[11px] border-[1.5px] border-deep-100 rounded-[10px] text-sm outline-none resize-none box-border" />
              </div>
            )}

            <button onClick={addSourceDuringOnboarding} disabled={sourceAdding}
              className="mt-3.5 px-[18px] py-2.5 bg-deep-50 text-deep-900 border-[1.5px] border-deep-100 rounded-[10px] cursor-pointer text-[13px] font-semibold">
              {sourceAdding?"Qo'shilmoqda...":"+ Manba qo'shish"}
            </button>
          </>
        )}

        {error&&<p className="text-red-600 text-[13px] mt-3">{error}</p>}

        {step!==2&&(
          <div className="flex justify-between items-center mt-8">
            {step>1 ? (
              <button onClick={()=>setStep(step-1)} className="px-5 py-2.5 border-[1.5px] border-deep-100 rounded-[10px] bg-white cursor-pointer text-sm text-ink-500">
                Orqaga
              </button>
            ) : <span />}
            {step<TOTAL_STEPS ? (
              <button onClick={()=>setStep(step+1)} disabled={step===1&&topic.trim().length<3}
                className={`px-6 py-3 bg-deep-900 text-white border-none rounded-xl cursor-pointer text-[15px] font-semibold ${step===1&&topic.trim().length<3?"opacity-50":"opacity-100"}`}>
                Keyingisi
              </button>
            ) : (
              <button onClick={handleFinish} disabled={submitting}
                className="px-6 py-3 bg-amber-500 text-deep-900 border-none rounded-xl cursor-pointer text-[15px] font-bold flex items-center gap-2">
                ✨ {submitting?"Reja tuzilmoqda...":"Rejani tuzish"}
              </button>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
