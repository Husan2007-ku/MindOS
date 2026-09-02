"use client";
import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import MessageBubble from "@/components/MessageBubble";
import { apiGet, getAccessToken, API_ROOT } from "@/lib/api";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { Send, Mic, Square, Code2, MessageSquare, Lightbulb, BookOpen, Languages, X, Volume2, Loader2 } from "lucide-react";

interface Msg { id: string; role: "user"|"assistant"; content: string; }

const SUGGESTIONS = [
  "Python da qanday qilib funksiya yoziladi?",
  "Ingliz tilida Past Simple va Past Perfect farqi nima?",
  "Machine Learning nima va qanday ishlaydi?",
  "Motivatsiya yo'qolganda nima qilish kerak?",
];

function ChatPageInner() {
  const { checking } = useRequireAuth();
  const searchParams = useSearchParams();
  const [lessonId, setLessonId] = useState<number|null>(null);
  const [lessonInfo, setLessonInfo] = useState<{id:number; title:string}|null>(null);
  const [practiceMode, setPracticeMode] = useState<"normal"|"speaking_practice">("normal");
  const [autoStarted, setAutoStarted] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [mode, setMode] = useState<"chat"|"code">("chat");
  const [streaming, setStreaming] = useState(false);
  const [recording, setRecording] = useState(false);
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<string>("free");
  const [ttsRemaining, setTtsRemaining] = useState<number|null>(null);
  const [playingId, setPlayingId] = useState<string|null>(null);
  const [ttsError, setTtsError] = useState<string|null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<MediaRecorder|null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    const lp = searchParams.get("lesson");
    if (lp) setLessonId(Number(lp));
    if (searchParams.get("mode") === "speaking_practice") setPracticeMode("speaking_practice");
  }, [searchParams]);

  useEffect(() => { apiGet("/users/me").then(d => { setPlan(d.plan); setTtsRemaining(d.tts_remaining_today ?? null); }).catch(() => {}); }, []);

  // Mentor javobini ovozga aylantirib eshittirish. Pro rejada cheklovsiz,
  // Free rejada kunlik cheklangan limit bilan (backend nazorat qiladi) — shu
  // orqali Free foydalanuvchi ham ovozli javobni "tatib ko'radi".
  async function playTTS(text: string, msgId?: string) {
    if (!text.trim()) return;
    setTtsError(null);
    if (msgId) setPlayingId(msgId);
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_ROOT}/api/v1/chat/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        if (res.status === 403) {
          const data = await res.json().catch(() => null);
          setTtsError(data?.detail || "Bugungi bepul ovozli javob limiti tugadi. Pro rejada cheklovsiz.");
          setTtsRemaining(0);
        }
        return;
      }
      if (plan === "free") setTtsRemaining(r => (r === null ? null : Math.max(0, r - 1)));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => setPlayingId(p => (p === msgId ? null : p));
      audio.play().catch(() => setPlayingId(p => (p === msgId ? null : p)));
    } catch {
    } finally {
      if (msgId) setTimeout(() => setPlayingId(p => (p === msgId ? null : p)), 15000);
    }
  }

  useEffect(() => {
    if (checking) return;
    apiGet("/chat/history?limit=50").then(d => {
      setMessages(d.messages.map((m: any) => ({ id: String(m.id), role: m.role, content: m.content })));
    }).finally(() => setLoading(false));
  }, [checking]);

  useEffect(() => {
    if (!lessonId) return;
    apiGet(`/lessons/${lessonId}`).then(d => setLessonInfo({ id: d.id, title: d.title })).catch(() => {});
  }, [lessonId]);

  useEffect(() => {
    if (!lessonInfo || loading || autoStarted) return;
    setAutoStarted(true);
    send(`Bugungi "${lessonInfo.title}" darsini boshlaylik — menga tushuntirib bering.`);
  }, [lessonInfo, loading, autoStarted]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  function addToken(token: string, id: string) {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, content: m.content + token } : m));
  }

  async function stream(endpoint: string, body: object) {
    const token = getAccessToken();
    const res = await fetch(`${API_ROOT}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    if (!res.body) return;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n\n");
      buf = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try { const p = JSON.parse(line.slice(6)); if (p.token) return p.token; } catch {}
      }
    }
  }

  async function send(text: string, code?: string) {
    if (!text.trim() && !code?.trim()) return;
    if (streaming) return;
    const content = code ? `${text}\n\`\`\`\n${code}\n\`\`\`` : text;
    const uid = `u-${Date.now()}`, aid = `a-${Date.now()}`;
    setMessages(p => [...p, { id: uid, role: "user", content }, { id: aid, role: "assistant", content: "" }]);
    setInput(""); setCodeInput(""); setStreaming(true);
    const tkn = getAccessToken();
    const endpoint = code ? "/api/v1/chat/code" : "/api/v1/chat/message";
    const reqBody = code ? { message: text, code } : { message: text, lesson_id: lessonId, mode: practiceMode };
    try {
      const res = await fetch(`${API_ROOT}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(tkn ? { Authorization: `Bearer ${tkn}` } : {}) },
        body: JSON.stringify(reqBody),
      });
      if (!res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let fullText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try { const p = JSON.parse(line.slice(6)); if (p.token) { addToken(p.token, aid); fullText += p.token; } } catch {}
        }
      }
      if (!code && practiceMode === "speaking_practice") playTTS(fullText, aid);
    } catch { addToken("\n\n⚠️ Server bilan aloqa yo'q", aid); }
    finally { setStreaming(false); }
  }

  async function startRec() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = e => chunksRef.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const uid = `u-${Date.now()}`, aid = `a-${Date.now()}`;
        setMessages(p => [...p, { id: uid, role: "user", content: "🎤 ..." }, { id: aid, role: "assistant", content: "" }]);
        setStreaming(true);
        const token = getAccessToken();
        const fd = new FormData(); fd.append("file", blob, "voice.webm");
        fd.append("mode", practiceMode); if (lessonId) fd.append("lesson_id", String(lessonId));
        try {
          const res = await fetch(`${API_ROOT}/api/v1/chat/voice`, {
            method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd,
          });
          if (!res.body) return;
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buf = "";
          let fullText = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            const lines = buf.split("\n\n");
            buf = lines.pop() || "";
            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              try {
                const p = JSON.parse(line.slice(6));
                if (p.transcript) setMessages(prev => prev.map(m => m.id === uid ? { ...m, content: p.transcript } : m));
                if (p.token) { addToken(p.token, aid); fullText += p.token; }
              } catch {}
            }
          }
          if (practiceMode === "speaking_practice") playTTS(fullText, aid);
        } finally { setStreaming(false); }
      };
      rec.start(); recorderRef.current = rec; setRecording(true);
    } catch { alert("Mikrofonga ruxsat berilmadi"); }
  }

  if (checking) return null;

  return (
    <div className="flex h-screen bg-paper-100">
      <Sidebar />
      <main className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-deep-100 bg-white px-8 py-4">
          <h1 className="font-display text-xl font-bold text-deep-950">Mentor</h1>
          <div className="flex items-center gap-2">
            <button onClick={()=>setPracticeMode(practiceMode==="speaking_practice"?"normal":"speaking_practice")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${practiceMode==="speaking_practice"?"bg-amber-500 text-deep-950":"border border-deep-100 text-ink-500 hover:bg-deep-50"}`}>
              <Languages size={15}/> IELTS Speaking mashqi
            </button>
            <div className="flex gap-1 rounded-xl bg-deep-50 p-1">
              {[{ m:"chat" as const, icon:MessageSquare, label:"Suhbat"}, {m:"code" as const, icon:Code2, label:"Kod"}].map(({m,icon:Icon,label})=>(
                <button key={m} onClick={()=>setMode(m)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${mode===m?"bg-white text-deep-900 shadow-sm":"text-ink-500 hover:text-ink-700"}`}>
                  <Icon size={15}/> {label}
                </button>
              ))}
            </div>
          </div>
        </header>
        {lessonInfo && (
          <div className="flex items-center justify-between border-b border-amber-100 bg-amber-50 px-8 py-2.5 text-sm text-amber-800">
            <span className="flex items-center gap-2"><BookOpen size={15}/> Bugungi dars: <strong>{lessonInfo.title}</strong></span>
            <button onClick={()=>setLessonInfo(null)} className="rounded-full p-1 hover:bg-amber-100"><X size={14}/></button>
          </div>
        )}
        {practiceMode==="speaking_practice" && (
          <div className="flex items-center gap-2 border-b border-deep-100 bg-deep-950 px-8 py-2 text-sm text-white">
            <Languages size={15}/> IELTS Speaking rejimi yoqiq — javoblaringizni ingliz tilida yozing yoki mikrofondan gapiring
          </div>
        )}
        {plan==="free" && ttsRemaining !== null && (
          <div className="flex items-center gap-2 border-b border-deep-100 bg-amber-50 px-8 py-1.5 text-xs text-amber-700">
            <Volume2 size={13}/> Bugun ovozli javobdan {ttsRemaining} marta bepul foydalanishingiz mumkin (Pro rejada cheklovsiz)
          </div>
        )}
        {ttsError && (
          <div className="flex items-center justify-between gap-2 border-b border-deep-100 bg-red-50 px-8 py-1.5 text-xs text-red-700">
            <span>{ttsError}</span>
            <button onClick={()=>setTtsError(null)} className="rounded-full p-0.5 hover:bg-red-100"><X size={12}/></button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-8 py-6">
          {loading ? (
            <p className="text-center text-ink-400">Yuklanmoqda...</p>
          ) : messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-6">
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-deep-900">
                  <span className="text-2xl">🧠</span>
                </div>
                <p className="font-display text-xl font-semibold text-deep-950">Salom! Men sizning AI mentoringizman.</p>
                <p className="mt-2 text-ink-500">Quyidagi savollardan birini tanlang yoki o'zingiznikini yozing</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 w-full max-w-xl">
                {SUGGESTIONS.map(s=>(
                  <button key={s} onClick={()=>send(s)}
                    className="flex items-start gap-2 rounded-xl border border-deep-100 bg-white p-3 text-left text-sm text-ink-700 hover:border-deep-300 hover:shadow-sm transition-all">
                    <Lightbulb size={14} className="mt-0.5 flex-shrink-0 text-amber-500"/> {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto flex max-w-2xl flex-col gap-4">
              {messages.map(m=>(
                <div key={m.id} className={`flex flex-col ${m.role==="user"?"items-end":"items-start"}`}>
                  {m.content ? (
                    // MessageBubble: markdown (qalin, ro'yxat, kod bloklari) va Mermaid
                    // diagrammalarni haqiqiy vizual ko'rinishda render qiladi — ilgari
                    // bu yerda AI javobi xom matn (``` va #### belgilari bilan) ko'rsatilardi.
                    <MessageBubble role={m.role} content={m.content} />
                  ) : (
                    <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${m.role==="user"?"bg-deep-900 text-white":"bg-white border border-deep-100 text-ink-900"}`}>
                      {streaming ? <span className="animate-pulse">▋</span> : ""}
                    </div>
                  )}
                  {m.role==="assistant" && m.content && !streaming && (
                    <button onClick={()=>playTTS(m.content, m.id)} disabled={playingId===m.id}
                      title="Ovozda tinglash"
                      className="mt-1 flex items-center gap-1 rounded-full px-2 py-1 text-xs text-ink-400 hover:bg-deep-50 hover:text-ink-700 disabled:opacity-60">
                      {playingId===m.id ? <Loader2 size={13} className="animate-spin"/> : <Volume2 size={13}/>}
                      {playingId===m.id ? "Tinglanmoqda..." : "Tinglash"}
                    </button>
                  )}
                </div>
              ))}
              <div ref={bottomRef}/>
            </div>
          )}
        </div>

        <div className="border-t border-deep-100 bg-white px-8 py-4">
          <div className="mx-auto max-w-2xl">
            {mode==="code"&&(
              <textarea value={codeInput} onChange={e=>setCodeInput(e.target.value)} placeholder="Kod parchasi (ixtiyoriy)..." rows={3}
                className="mb-2 w-full rounded-xl border border-deep-100 bg-deep-950 px-4 py-2.5 font-mono text-sm text-green-400 focus:outline-none resize-none"/>
            )}
            <div className="flex items-end gap-2">
              <textarea value={input} onChange={e=>setInput(e.target.value)} rows={1} placeholder="Xabar yozing..."
                onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send(input,mode==="code"?codeInput:undefined);}}}
                className="flex-1 resize-none rounded-xl border border-deep-100 px-4 py-3 text-ink-900 placeholder:text-ink-300 focus:border-deep-500 focus:outline-none focus:ring-2 focus:ring-deep-100"/>
              {mode==="chat"&&(
                <button onClick={recording?()=>{recorderRef.current?.stop();setRecording(false);}:startRec} disabled={streaming}
                  className={`rounded-xl p-3 transition-colors ${recording?"bg-red-100 text-red-600":"border border-deep-100 bg-white text-ink-500 hover:bg-deep-50"}`}>
                  {recording?<Square size={20}/>:<Mic size={20}/>}
                </button>
              )}
              <button onClick={()=>send(input,mode==="code"?codeInput:undefined)} disabled={streaming}
                className="rounded-xl bg-deep-900 p-3 text-white hover:bg-deep-700 transition-colors disabled:opacity-50">
                <Send size={20}/>
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function ChatPage() {
  return <Suspense fallback={null}><ChatPageInner /></Suspense>;
}
