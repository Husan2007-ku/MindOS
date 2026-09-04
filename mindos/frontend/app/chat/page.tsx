"use client";
import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import MessageBubble from "@/components/MessageBubble";
import { apiGet, apiPut, apiDelete, getAccessToken, API_ROOT } from "@/lib/api";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { Send, Mic, MicOff, Square, Code2, MessageSquare, Lightbulb, BookOpen, Languages, X, Volume2, Loader2, AudioLines, PhoneOff, CheckCircle2, PanelLeft, Search, Trash2, History } from "lucide-react";

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
  const router = useRouter();
  const [lessonId, setLessonId] = useState<number|null>(null);
  interface ConversationItem { lesson_id: number|null; title: string; last_message: string; last_role: string; last_at: string; }
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [convSearch, setConvSearch] = useState("");
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  // Mobilda "Suhbatlar" paneli (chat tarixi) doim yashirin edi (faqat md:flex) —
  // foydalanuvchi telefonda oldingi suhbatlarini umuman ko'ra olmasdi. Endi
  // shu holat orqali alohida overlay-drawer sifatida ochiladi.
  const [convDrawerOpen, setConvDrawerOpen] = useState(false);
  const [lessonInfo, setLessonInfo] = useState<{id:number; title:string; status?:string; is_language?:boolean}|null>(null);
  const [completingLesson, setCompletingLesson] = useState(false);
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

  // Ovozli suhbat (ChatGPT uslubidagi, tinim tugagach o'zi to'xtaydigan va
  // javobni eshittirib bo'lgach yana o'zi tinglashni boshlaydigan uzluksiz
  // rejim) uchun holatlar. Oddiy mikrofon tugmasidan farqi: har gal qo'lda
  // "to'xtatish" bosish shart emas, va javob ovozi tugashi bilan avtomatik
  // yana tinglay boshlaydi — real suhbat hissini beradi.
  const [voiceMode, setVoiceMode] = useState(false);
  const [voiceState, setVoiceState] = useState<"idle"|"listening"|"processing"|"speaking"|"error">("idle");
  const [voiceCaption, setVoiceCaption] = useState("");
  const [voiceLevel, setVoiceLevel] = useState(0);
  const voiceActiveRef = useRef(false);
  const voiceStreamRef = useRef<MediaStream|null>(null);
  const voiceAudioCtxRef = useRef<AudioContext|null>(null);
  const voiceAnalyserRef = useRef<AnalyserNode|null>(null);
  const vcRecorderRef = useRef<MediaRecorder|null>(null);
  const voiceRafRef = useRef<number|null>(null);
  const voiceAudioRef = useRef<HTMLAudioElement|null>(null);
  const voiceTtsResolveRef = useRef<(() => void)|null>(null);

  useEffect(() => {
    const lp = searchParams.get("lesson");
    // lp bo'lmasa ham lessonId'ni null'ga qaytaramiz — aks holda "Mentor"
    // sahifasiga darssiz kirilganda oldingi darsning suhbati ko'rinib qolardi.
    setLessonId(lp ? Number(lp) : null);
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

  // --- Ovozli suhbat: mikrofon oqimi va tinim aniqlash (VAD) ---
  // Bitta getUserMedia oqimi butun suhbat davomida ochiq turadi (har safar
  // qayta so'ralmaydi) — faqat MediaRecorder har navbatda yangidan boshlanadi.
  async function ensureVoiceStream(): Promise<{ stream: MediaStream; analyser: AnalyserNode } | null> {
    if (voiceStreamRef.current && voiceAnalyserRef.current) {
      return { stream: voiceStreamRef.current, analyser: voiceAnalyserRef.current };
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const AudioCtxCls: typeof AudioContext = (window.AudioContext || (window as any).webkitAudioContext);
    const audioCtx = new AudioCtxCls();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    voiceStreamRef.current = stream;
    voiceAudioCtxRef.current = audioCtx;
    voiceAnalyserRef.current = analyser;
    return { stream, analyser };
  }

  function teardownVoiceStream() {
    try { voiceStreamRef.current?.getTracks().forEach(t => t.stop()); } catch {}
    try { voiceAudioCtxRef.current?.close(); } catch {}
    voiceStreamRef.current = null;
    voiceAudioCtxRef.current = null;
    voiceAnalyserRef.current = null;
  }

  // Foydalanuvchi gapirishni to'xtatgach (taxminan 1.1 soniya jimlikdan
  // keyin) yozishni o'zi to'xtatadi — "gapirib bo'ldim" tugmasini bosish
  // shart emas. Agar 8 soniya ichida umuman ovoz aniqlanmasa (mikrofon
  // jim), null qaytaradi va tashqi tsikl yana tinglashni boshlaydi.
  async function recordWithVAD(): Promise<Blob | null> {
    const ctx = await ensureVoiceStream();
    if (!ctx) return null;
    const { stream, analyser } = ctx;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const rec = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    rec.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    vcRecorderRef.current = rec;
    rec.start();

    const SPEECH_THRESHOLD = 0.045;
    const SILENCE_MS = 1100;
    const MAX_MS = 25000;
    const MIN_SPEECH_MS = 400;
    const GIVEUP_MS = 8000;
    let hasSpoken = false;
    let lastLoudAt = Date.now();
    const startedAt = Date.now();

    return new Promise<Blob | null>((resolve) => {
      let settled = false;
      const finish = (result: Blob | null) => {
        if (settled) return;
        settled = true;
        if (voiceRafRef.current) cancelAnimationFrame(voiceRafRef.current);
        voiceRafRef.current = null;
        setVoiceLevel(0);
        resolve(result);
      };
      rec.onstop = () => {
        if (!hasSpoken || chunks.length === 0) { finish(null); return; }
        finish(new Blob(chunks, { type: "audio/webm" }));
      };
      const tick = () => {
        if (!voiceActiveRef.current) { try { rec.stop(); } catch { finish(null); } return; }
        analyser.getByteTimeDomainData(data);
        let sumSquares = 0;
        for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sumSquares += v * v; }
        const rms = Math.sqrt(sumSquares / data.length);
        setVoiceLevel(Math.min(1, rms * 6));
        const now = Date.now();
        if (rms > SPEECH_THRESHOLD) { hasSpoken = true; lastLoudAt = now; }
        if (hasSpoken && now - lastLoudAt > SILENCE_MS && now - startedAt > MIN_SPEECH_MS) { try { rec.stop(); } catch {} return; }
        if (now - startedAt > MAX_MS) { try { rec.stop(); } catch {} return; }
        if (!hasSpoken && now - startedAt > GIVEUP_MS) { try { rec.stop(); } catch {} return; }
        voiceRafRef.current = requestAnimationFrame(tick);
      };
      voiceRafRef.current = requestAnimationFrame(tick);
    });
  }

  // Ovozni serverga yuboradi (Whisper transkripsiya + Mentor javobi bir
  // oqim ichida), ekranga ham yozadi va to'liq javob matnini qaytaradi
  // (keyin shu matn ovozga aylantiriladi). Xatolik holatida (masalan Free
  // rejada ovoz yopiq bo'lsa) foydalanuvchiga aniq xabar ko'rsatiladi —
  // ilgari bu holat sukut bo'yicha hech narsa ko'rsatmay "osilib qolardi".
  async function sendVoiceTurn(blob: Blob): Promise<string | null> {
    setVoiceState("processing");
    const uid = `u-${Date.now()}`, aid = `a-${Date.now()}`;
    setMessages(p => [...p, { id: uid, role: "user", content: "🎤 ..." }, { id: aid, role: "assistant", content: "" }]);
    const token = getAccessToken();
    const fd = new FormData();
    fd.append("file", blob, "voice.webm");
    fd.append("mode", practiceMode);
    if (lessonId) fd.append("lesson_id", String(lessonId));
    try {
      const res = await fetch(`${API_ROOT}/api/v1/chat/voice`, {
        method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd,
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        const msg = errData?.detail || "Ovozli xabar yuborishda xatolik yuz berdi";
        setMessages(prev => prev.map(m => m.id === aid ? { ...m, content: `⚠️ ${msg}` } : m));
        setVoiceCaption(msg);
        setVoiceState("error");
        return null;
      }
      if (!res.body) { setVoiceState("error"); return null; }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "", fullText = "";
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
            if (p.transcript) { setMessages(prev => prev.map(m => m.id === uid ? { ...m, content: p.transcript } : m)); setVoiceCaption(p.transcript); }
            if (p.token) { addToken(p.token, aid); fullText += p.token; }
            if (p.error) { setVoiceCaption(p.error); }
          } catch {}
        }
      }
      refreshConversations();
      return fullText;
    } catch {
      setMessages(prev => prev.map(m => m.id === aid ? { ...m, content: "⚠️ Server bilan aloqa yo'q" } : m));
      setVoiceCaption("Server bilan aloqa yo'q");
      setVoiceState("error");
      return null;
    }
  }

  // Javobni ovozda o'qiydi va o'qib bo'lgunicha kutadi (shu orqali tashqi
  // tsikl "javob tugadi — endi yana tingla" deb bila oladi). Foydalanuvchi
  // orb'ni bosib gapni bo'lib yuborishi mumkin — shunda interruptSpeaking()
  // shu promise'ni darhol yakunlaydi.
  function playTTSAwait(text: string): Promise<void> {
    return new Promise((resolve) => {
      let settled = false;
      const done = () => { if (settled) return; settled = true; voiceTtsResolveRef.current = null; resolve(); };
      voiceTtsResolveRef.current = done;
      if (!text.trim()) { done(); return; }
      setVoiceState("speaking");
      setVoiceCaption(text);
      (async () => {
        try {
          const token = getAccessToken();
          const res = await fetch(`${API_ROOT}/api/v1/chat/tts`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify({ text }),
          });
          if (!res.ok) { done(); return; }
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          voiceAudioRef.current = audio;
          audio.onended = () => { URL.revokeObjectURL(url); done(); };
          audio.onerror = () => { URL.revokeObjectURL(url); done(); };
          audio.play().catch(() => done());
        } catch { done(); }
      })();
    });
  }

  function interruptSpeaking() {
    if (voiceAudioRef.current) { try { voiceAudioRef.current.pause(); } catch {} voiceAudioRef.current = null; }
    voiceTtsResolveRef.current?.();
  }

  async function voiceLoop() {
    while (voiceActiveRef.current) {
      setVoiceState("listening");
      setVoiceCaption("");
      let blob: Blob | null = null;
      try {
        blob = await recordWithVAD();
      } catch {
        setVoiceState("error");
        setVoiceCaption("Mikrofonga ruxsat berilmadi");
        voiceActiveRef.current = false;
        break;
      }
      if (!voiceActiveRef.current) break;
      if (!blob) continue;
      const replyText = await sendVoiceTurn(blob);
      if (!voiceActiveRef.current) break;
      if (replyText && replyText.trim()) {
        await playTTSAwait(replyText);
      }
    }
    setVoiceState("idle");
  }

  function openVoiceChat() {
    if (plan === "free") { alert("Ovozli suhbat faqat Pro va undan yuqori rejada mavjud. Pro rejaga o'ting!"); return; }
    setVoiceMode(true);
    setVoiceCaption("");
    voiceActiveRef.current = true;
    voiceLoop();
  }

  function closeVoiceChat() {
    voiceActiveRef.current = false;
    try { vcRecorderRef.current?.stop(); } catch {}
    try { voiceAudioRef.current?.pause(); } catch {}
    voiceAudioRef.current = null;
    voiceTtsResolveRef.current?.();
    teardownVoiceStream();
    setVoiceMode(false);
    setVoiceState("idle");
    setVoiceCaption("");
  }

  function handleOrbTap() {
    if (voiceState === "speaking") { interruptSpeaking(); return; }
    if (voiceState === "listening") { try { vcRecorderRef.current?.stop(); } catch {} }
  }

  useEffect(() => {
    return () => {
      voiceActiveRef.current = false;
      try { voiceAudioRef.current?.pause(); } catch {}
      teardownVoiceStream();
    };
  }, []);

  // Har bir dars — O'Z suhbat tarixi. Ilgari bu effekt faqat sahifa ochilganda
  // bir marta ishlar edi (lessonId o'zgarishiga bog'liq emas edi), shu sababli
  // bitta darsdan ikkinchisiga o'tilganda ham eski xabarlar ekranda qolib
  // ketardi va ular bir-biriga aralashardi. Endi lessonId o'zgarganda ekran
  // tozalanadi va faqat o'sha darsga (yoki umumiy suhbatga, lessonId=null
  // bo'lsa) tegishli tarix qayta yuklanadi.
  useEffect(() => {
    if (checking) return;
    setLoading(true);
    setMessages([]);
    setAutoStarted(false);
    const qs = lessonId ? `&lesson_id=${lessonId}` : "";
    apiGet(`/chat/history?limit=50${qs}`).then(d => {
      setMessages(d.messages.map((m: any) => ({ id: String(m.id), role: m.role, content: m.content })));
    }).finally(() => setLoading(false));
  }, [checking, lessonId]);

  // Chap paneldagi "Suhbatlar" ro'yxati — Claude/ChatGPT'dagi kabi, har bir
  // dars (yoki umumiy suhbat) alohida qator bo'lib, bosilsa o'sha suhbatga
  // olib boradi. Sahifa ochilganda va har safar yangi xabar yuborilgach
  // yangilanadi, shunda yangi boshlangan suhbat ham darrov ro'yxatda chiqadi.
  async function refreshConversations() {
    try {
      const d = await apiGet("/chat/conversations");
      setConversations(d.conversations || []);
    } catch {}
  }

  useEffect(() => { if (!checking) refreshConversations(); }, [checking]);

  function formatConvTime(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString("uz-UZ", { day: "2-digit", month: "2-digit" });
  }

  // Suhbatni butunlay o'chirish — mos lesson_id (yoki umumiy suhbat uchun
  // hech narsa) bilan DELETE /chat/history chaqiradi, faqat o'sha suhbatni
  // tozalaydi (boshqalarga tegmaydi). Hozir ochiq turgan suhbat o'chirilsa,
  // umumiy suhbatga qaytariladi.
  async function deleteConversation(c: ConversationItem, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`"${c.title}" suhbatini butunlay o'chirmoqchimisiz? Bu amalni orqaga qaytarib bo'lmaydi.`)) return;
    try {
      const qs = c.lesson_id ? `?lesson_id=${c.lesson_id}` : "";
      await apiDelete(`/chat/history${qs}`);
      setConversations(prev => prev.filter(x => x.lesson_id !== c.lesson_id));
      if (c.lesson_id === lessonId) router.push("/chat");
    } catch {
      alert("O'chirishda xatolik yuz berdi");
    }
  }

  const filteredConversations = conversations.filter(c => {
    const q = convSearch.trim().toLowerCase();
    if (!q) return true;
    return c.title.toLowerCase().includes(q) || c.last_message.toLowerCase().includes(q);
  });

  useEffect(() => {
    if (!lessonId) { setLessonInfo(null); return; }
    apiGet(`/lessons/${lessonId}`).then(d => setLessonInfo({ id: d.id, title: d.title, status: d.status, is_language: !!d.is_language })).catch(() => {});
  }, [lessonId]);

  // Ilgari darsni "tugallangan" deb belgilash FAQAT Bosh sahifadagi tugma
  // orqali mumkin edi — aynan shu tugma vazifa (Homework) va takrorlash
  // (SpacedItem) kartochkalarini yaratadigan yagona joy edi. Lekin dars
  // aslida shu — Mentor chat — sahifasida o'tiladi, shuning uchun ko'p
  // foydalanuvchi suhbatni tugatib, Bosh sahifaga qaytmasdan chiqib
  // ketardi va vazifa/takrorlash HECH QACHON yaratilmasdi. Endi shu
  // tugma to'g'ridan-to'g'ri shu yerda, dars banner'ida ham bor.
  async function completeCurrentLesson() {
    if (!lessonInfo || lessonInfo.status === "completed") return;
    setCompletingLesson(true);
    try {
      await apiPut(`/lessons/${lessonInfo.id}/complete`);
      setLessonInfo(prev => prev ? { ...prev, status: "completed" } : prev);
    } catch {
      alert("Darsni tugatishda xatolik yuz berdi. Qayta urinib ko'ring.");
    } finally {
      setCompletingLesson(false);
    }
  }

  useEffect(() => {
    if (!lessonInfo || loading || autoStarted) return;
    setAutoStarted(true);
    send(`Bugungi "${lessonInfo.title}" darsini boshlaylik — menga tushuntirib bering.`);
  }, [lessonInfo, loading, autoStarted]);

  // "IELTS Speaking mashqi" faqat chet tili darsiga (yoki umumiy suhbatga)
  // tegishli — Python/Tarix kabi til bo'lmagan darsga o'tilganda avtomatik
  // o'chib qolsin, aks holda tugma yo'qolgach ham rejim yopishib qolar edi.
  useEffect(() => {
    if (lessonInfo && !lessonInfo.is_language) setPracticeMode("normal");
  }, [lessonInfo]);

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
    finally { setStreaming(false); refreshConversations(); }
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
          if (!res.ok) {
            const errData = await res.json().catch(() => null);
            addToken(`⚠️ ${errData?.detail || "Ovozli xabar yuborishda xatolik yuz berdi"}`, aid);
            return;
          }
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
        } finally { setStreaming(false); refreshConversations(); }
      };
      rec.start(); recorderRef.current = rec; setRecording(true);
    } catch { alert("Mikrofonga ruxsat berilmadi"); }
  }

  // Suhbatlar ro'yxatining o'zagi — desktop panel VA mobil drawer ikkalasi
  // ham shu funksiyani chaqiradi, shuning uchun ikki joyda alohida-alohida
  // yozilgan JSX bir-biridan chetlashib ketmaydi. `onNavigate` mobil
  // drawer'ni bosilgach yopish uchun beriladi (desktopda kerak emas).
  function renderConvItems(onNavigate?: () => void) {
    if (filteredConversations.length === 0) {
      return (
        <p className="px-4 py-6 text-center text-xs text-ink-400">
          {conversations.length === 0 ? "Hali suhbat yo'q" : "Hech narsa topilmadi"}
        </p>
      );
    }
    return filteredConversations.map(c => {
      const active = c.lesson_id === lessonId;
      return (
        <div key={c.lesson_id ?? "general"} className="group relative border-b border-deep-50">
          <button
            onClick={() => { router.push(c.lesson_id ? `/chat?lesson=${c.lesson_id}` : "/chat"); onNavigate?.(); }}
            className={`flex w-full flex-col gap-0.5 px-4 py-3 pr-9 text-left transition-colors ${active ? "bg-deep-50" : "hover:bg-deep-50/60"}`}>
            <div className="flex items-center justify-between gap-2">
              <span className={`truncate text-sm font-medium ${active ? "text-deep-950" : "text-ink-700"}`}>{c.title}</span>
              <span className="shrink-0 text-[10px] text-ink-400">{formatConvTime(c.last_at)}</span>
            </div>
            <span className="truncate text-xs text-ink-400">{c.last_message}</span>
          </button>
          {/* Telefonda hover degan narsa yo'q — avvalgi "faqat hover'da
              chiqadi" o'chirish tugmasi mobilda umuman bosib bo'lmas edi.
              Endi mobilda doim ko'rinadi, desktopda hover bilan chiqadi. */}
          <button onClick={(e)=>deleteConversation(c,e)} title="Suhbatni o'chirish"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-ink-300 opacity-100 transition-opacity hover:bg-red-50 hover:text-red-600 md:opacity-0 md:group-hover:opacity-100">
            <Trash2 size={14}/>
          </button>
        </div>
      );
    });
  }

  if (checking) return null;

  return (
    <div className="flex h-screen bg-paper-100">
      {voiceMode && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-gradient-to-b from-deep-950 to-deep-900 text-white">
          <div className="flex w-full items-center justify-between px-6 py-5">
            <span className="flex items-center gap-2 text-sm text-white/60">
              <AudioLines size={16}/> Ovozli suhbat
            </span>
            <button onClick={closeVoiceChat} className="rounded-full bg-white/10 p-2 hover:bg-white/20 transition-colors">
              <X size={20}/>
            </button>
          </div>

          <div className="flex flex-1 flex-col items-center justify-center gap-8 px-8">
            <button
              onClick={handleOrbTap}
              style={{ transform: `scale(${1 + (voiceState==="listening" ? voiceLevel*0.18 : 0)})` }}
              className="relative flex h-44 w-44 items-center justify-center rounded-full transition-transform duration-100">
              <span className={`absolute inset-0 rounded-full ${
                voiceState==="listening" ? "bg-amber-500/25 animate-ping" :
                voiceState==="speaking" ? "bg-deep-300/25 animate-pulse" :
                "bg-white/5"
              }`} />
              <span className={`relative flex h-32 w-32 items-center justify-center rounded-full transition-colors ${
                voiceState==="listening" ? "bg-amber-500" :
                voiceState==="speaking" ? "bg-deep-300" :
                voiceState==="processing" ? "bg-white/20" :
                voiceState==="error" ? "bg-red-500/70" : "bg-white/10"
              }`}>
                {voiceState==="processing" ? <Loader2 size={36} className="animate-spin text-white"/> :
                 voiceState==="speaking" ? <Volume2 size={36} className="text-deep-950"/> :
                 voiceState==="error" ? <MicOff size={36} className="text-white"/> :
                 <Mic size={36} className={voiceState==="listening" ? "text-deep-950" : "text-white/70"}/>}
              </span>
            </button>
            <p className="text-center text-sm text-white/50">
              {voiceState==="listening" ? "Tinglayapman... gapiring" :
               voiceState==="processing" ? "O'ylayapman..." :
               voiceState==="speaking" ? "Javob berayapman — bo'lish uchun bosing" :
               voiceState==="error" ? "Xatolik yuz berdi" : "Tayyorlanmoqda..."}
            </p>
            {voiceCaption && (
              <p className="max-h-32 max-w-md overflow-y-auto text-center text-sm text-white/80">{voiceCaption}</p>
            )}
          </div>

          <div className="flex w-full items-center justify-center pb-10">
            <button onClick={closeVoiceChat}
              className="flex items-center gap-2 rounded-full bg-white/10 px-6 py-3 text-sm font-medium hover:bg-white/20 transition-colors">
              <PhoneOff size={16}/> Suhbatni tugatish
            </button>
          </div>
        </div>
      )}
      <Sidebar />

      {/* Suhbatlar paneli — Claude/ChatGPT'dagi chat ro'yxati kabi: har bir
          dars (yoki umumiy suhbat) alohida qator, bosilganda o'sha suhbatga
          o'tadi. Qidiruv, yig'ish (collapse) tugmasi va suhbatni o'chirish
          — hammasi xuddi shu ilova (Claude)dagi kabi. */}
      {panelCollapsed ? (
        <div className="hidden w-12 shrink-0 flex-col items-center border-r border-deep-100 bg-white py-4 md:flex">
          <button onClick={()=>setPanelCollapsed(false)} title="Suhbatlar panelini ochish"
            className="rounded-lg p-2 text-ink-400 hover:bg-deep-50 hover:text-ink-700">
            <PanelLeft size={18}/>
          </button>
        </div>
      ) : (
        <aside className="hidden w-72 shrink-0 flex-col border-r border-deep-100 bg-white md:flex">
          <div className="border-b border-deep-100 px-4 py-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-base font-bold text-deep-950">Suhbatlar</h2>
              <button onClick={()=>setPanelCollapsed(true)} title="Panelni yig'ish"
                className="rounded-lg p-1.5 text-ink-400 hover:bg-deep-50 hover:text-ink-700">
                <PanelLeft size={16}/>
              </button>
            </div>
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-300"/>
              <input value={convSearch} onChange={e=>setConvSearch(e.target.value)} placeholder="Qidirish..."
                className="w-full rounded-lg border border-deep-100 bg-paper-50 py-1.5 pl-8 pr-2 text-xs text-ink-900 outline-none focus:border-deep-500"/>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {renderConvItems()}
          </div>
        </aside>
      )}

      {/* Mobil overlay-drawer: xuddi shu ro'yxat (renderConvItems), lekin
          yuqoridagi aside "md:flex" bo'lgani uchun mobilda ko'rinmas edi —
          shu drawer "Tarix" tugmasi bilan ochiladi/yopiladi. */}
      {convDrawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div onClick={()=>setConvDrawerOpen(false)} className="absolute inset-0 bg-black/50" />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-deep-100 bg-white">
            <div className="border-b border-deep-100 px-4 py-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display text-base font-bold text-deep-950">Suhbatlar</h2>
                <button onClick={()=>setConvDrawerOpen(false)} title="Yopish"
                  className="rounded-lg p-1.5 text-ink-400 hover:bg-deep-50 hover:text-ink-700">
                  <X size={16}/>
                </button>
              </div>
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-300"/>
                <input value={convSearch} onChange={e=>setConvSearch(e.target.value)} placeholder="Qidirish..."
                  className="w-full rounded-lg border border-deep-100 bg-paper-50 py-1.5 pl-8 pr-2 text-xs text-ink-900 outline-none focus:border-deep-500"/>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {renderConvItems(()=>setConvDrawerOpen(false))}
            </div>
          </aside>
        </div>
      )}

      <main className="flex flex-1 flex-col">
        <header className="flex flex-col gap-2 border-b border-deep-100 bg-white pl-16 pr-4 py-3 md:flex-row md:items-center md:justify-between md:pl-8 md:pr-8 md:py-4">
          <div className="flex items-center justify-between gap-2 md:contents">
            <h1 className="font-display text-xl font-bold text-deep-950">Mentor</h1>
            {/* Suhbatlar (chat tarixi) paneli md:flex bo'lgani uchun mobilda
                butunlay yashirin edi — shu tugma orqali drawer sifatida ochiladi. */}
            <button onClick={()=>setConvDrawerOpen(true)} title="Suhbatlar tarixi"
              className="flex items-center gap-1.5 rounded-lg border border-deep-100 px-2.5 py-1.5 text-xs font-medium text-ink-500 hover:bg-deep-50 md:hidden">
              <History size={15}/> Tarix
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Dasturlash, tarix va h.k. darslarda bu tugma keraksiz edi — endi
                faqat chet tili darsi (yoki dars tanlanmagan umumiy suhbat)da
                ko'rinadi. */}
            {(!lessonInfo || lessonInfo.is_language) && (
              <button onClick={()=>setPracticeMode(practiceMode==="speaking_practice"?"normal":"speaking_practice")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${practiceMode==="speaking_practice"?"bg-amber-500 text-deep-950":"border border-deep-100 text-ink-500 hover:bg-deep-50"}`}>
                <Languages size={15}/> IELTS Speaking mashqi
              </button>
            )}
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
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-100 bg-amber-50 px-4 md:px-8 py-2.5 text-sm text-amber-800">
            <span className="flex items-center gap-2"><BookOpen size={15}/> Bugungi dars: <strong>{lessonInfo.title}</strong></span>
            <div className="flex flex-wrap items-center gap-2">
              {lessonInfo.status === "completed" ? (
                <span className="flex items-center gap-1 rounded-lg bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
                  <CheckCircle2 size={13}/> Tugallangan
                </span>
              ) : (
                <button onClick={completeCurrentLesson} disabled={completingLesson}
                  title="Vazifa va takrorlash kartochkalari shu tugma bilan yaratiladi"
                  className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-deep-950 hover:bg-amber-400 disabled:opacity-50">
                  <CheckCircle2 size={13}/> {completingLesson ? "Belgilanmoqda..." : "Darsni tugatildi deb belgilash"}
                </button>
              )}
              <button onClick={()=>setLessonInfo(null)} className="rounded-full p-1 hover:bg-amber-100"><X size={14}/></button>
            </div>
          </div>
        )}
        {practiceMode==="speaking_practice" && (
          <div className="flex items-center gap-2 border-b border-deep-100 bg-deep-950 px-4 md:px-8 py-2 text-sm text-white">
            <Languages size={15}/> IELTS Speaking rejimi yoqiq — javoblaringizni ingliz tilida yozing yoki mikrofondan gapiring
          </div>
        )}
        {plan==="free" && ttsRemaining !== null && (
          <div className="flex items-center gap-2 border-b border-deep-100 bg-amber-50 px-4 md:px-8 py-1.5 text-xs text-amber-700">
            <Volume2 size={13}/> Bugun ovozli javobdan {ttsRemaining} marta bepul foydalanishingiz mumkin (Pro rejada cheklovsiz)
          </div>
        )}
        {ttsError && (
          <div className="flex items-center justify-between gap-2 border-b border-deep-100 bg-red-50 px-4 md:px-8 py-1.5 text-xs text-red-700">
            <span>{ttsError}</span>
            <button onClick={()=>setTtsError(null)} className="rounded-full p-0.5 hover:bg-red-100"><X size={12}/></button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6">
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

        <div className="border-t border-deep-100 bg-white px-4 md:px-8 py-4">
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
                <button onClick={openVoiceChat} title="Ovozli suhbat (uzluksiz)"
                  className="relative rounded-xl border border-deep-100 bg-white p-3 text-ink-500 hover:bg-deep-50 transition-colors">
                  <AudioLines size={20}/>
                  {plan==="free" && <span className="absolute -right-1 -top-1 rounded-full bg-amber-400 px-1 text-[9px] font-bold text-deep-950">PRO</span>}
                </button>
              )}
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
