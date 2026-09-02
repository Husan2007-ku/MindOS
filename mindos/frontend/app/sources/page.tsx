"use client";
import { useEffect, useRef, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { apiGet, apiPost, apiDelete, apiFetch } from "@/lib/api";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { FileText, Youtube, Type, Trash2, Loader2, CheckCircle2, XCircle, Send, Library, RotateCcw } from "lucide-react";

interface SourceItem {
  id: number;
  type: "file" | "youtube" | "text";
  title: string;
  origin: string | null;
  status: "processing" | "ready" | "failed";
  error_message: string | null;
  char_count: number;
  chunk_count: number;
  created_at: string;
}

interface Citation { n: number; source_id: number; source_title: string; chunk_id: number; }

const TABS = [
  { key: "file", label: "Fayl", icon: FileText },
  { key: "youtube", label: "YouTube", icon: Youtube },
  { key: "text", label: "Matn / Kurs", icon: Type },
] as const;

const TYPE_ICON: Record<string, any> = { file: FileText, youtube: Youtube, text: Type };

export default function SourcesPage() {
  const { checking } = useRequireAuth();
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("file");

  const [fileTitle, setFileTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubeTitle, setYoutubeTitle] = useState("");
  const [addingYoutube, setAddingYoutube] = useState(false);

  const [textTitle, setTextTitle] = useState("");
  const [textContent, setTextContent] = useState("");
  const [addingText, setAddingText] = useState(false);

  const [formError, setFormError] = useState("");

  const [askQuestion, setAskQuestion] = useState("");
  const [askAnswer, setAskAnswer] = useState("");
  const [askCitations, setAskCitations] = useState<Citation[]>([]);
  const [asking, setAsking] = useState(false);
  const [askedOnce, setAskedOnce] = useState(false);

  function loadSources() {
    return apiGet("/sources").then((d) => setSources(d.sources || []));
  }

  useEffect(() => {
    if (checking) return;
    loadSources().finally(() => setLoading(false));
  }, [checking]);

  // Hali "processing" holatidagi manba bo'lsa — statusni avtomatik yangilab turamiz
  useEffect(() => {
    if (!sources.some((s) => s.status === "processing")) return;
    const interval = setInterval(() => loadSources().catch(() => {}), 4000);
    return () => clearInterval(interval);
  }, [sources]);

  async function handleFileUpload() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) { setFormError("Avval fayl tanlang"); return; }
    setFormError("");
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("title", fileTitle);
      await apiFetch("/sources/upload", { method: "POST", body: form });
      setFileTitle("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadSources();
    } catch (e: any) {
      setFormError(e.message || "Fayl yuklashda xatolik");
    } finally {
      setUploading(false);
    }
  }

  async function handleAddYoutube() {
    if (!youtubeUrl.trim()) { setFormError("YouTube link kiriting"); return; }
    setFormError("");
    setAddingYoutube(true);
    try {
      await apiPost("/sources/youtube", { url: youtubeUrl.trim(), title: youtubeTitle.trim() });
      setYoutubeUrl(""); setYoutubeTitle("");
      await loadSources();
    } catch (e: any) {
      setFormError(e.message || "YouTube video qo'shishda xatolik");
    } finally {
      setAddingYoutube(false);
    }
  }

  async function handleAddText() {
    if (textContent.trim().length < 20) { setFormError("Matn kamida 20 belgidan iborat bo'lsin"); return; }
    setFormError("");
    setAddingText(true);
    try {
      await apiPost("/sources/text", { title: textTitle.trim(), content: textContent.trim() });
      setTextTitle(""); setTextContent("");
      await loadSources();
    } catch (e: any) {
      setFormError(e.message || "Matn qo'shishda xatolik");
    } finally {
      setAddingText(false);
    }
  }

  async function handleDelete(id: number) {
    await apiDelete(`/sources/${id}`);
    setSources((prev) => prev.filter((s) => s.id !== id));
  }

  const [retryingId, setRetryingId] = useState<number | null>(null);
  async function handleRetry(id: number) {
    setRetryingId(id);
    try {
      await apiPost(`/sources/${id}/retry`);
      await loadSources();
    } catch (e: any) {
      setFormError(e?.message || "Qayta urinishda xatolik");
    } finally {
      setRetryingId(null);
    }
  }

  async function handleAsk() {
    if (askQuestion.trim().length < 3) return;
    setAsking(true);
    setAskedOnce(true);
    try {
      const res = await apiPost("/sources/ask", { question: askQuestion.trim() });
      setAskAnswer(res.answer);
      setAskCitations(res.citations || []);
    } catch (e: any) {
      setAskAnswer(e.message || "Xatolik yuz berdi");
      setAskCitations([]);
    } finally {
      setAsking(false);
    }
  }

  if (checking) return null;

  const readyCount = sources.filter((s) => s.status === "ready").length;

  return (
    <div className="flex min-h-screen bg-paper-100">
      <Sidebar />
      <main className="flex-1 overflow-y-auto px-8 pb-8 pt-20 md:pt-8">
        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold text-deep-950">Manbalar</h1>
          <p className="mt-1 text-ink-500">
            O'zingiz o'qiyotgan yoki o'qigan kursni, YouTube videoni yoki faylni qo'shing — AI Mentor va
            o'quv reja endi shu haqiqiy manbalarga asoslanadi (NotebookLM'dagi kabi).
          </p>
        </div>

        {/* Manba qo'shish formasi */}
        <div className="mb-8 rounded-2xl border border-deep-100 bg-white p-6">
          <div className="mb-4 flex gap-2">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => { setTab(key); setFormError(""); }}
                className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${
                  tab === key ? "border-deep-900 bg-deep-900 text-white" : "border-deep-100 bg-white text-ink-700 hover:bg-deep-50"
                }`}
              >
                <Icon size={14} />{label}
              </button>
            ))}
          </div>

          {formError && <p className="mb-3 text-sm text-red-500">{formError}</p>}

          {tab === "file" && (
            <div className="space-y-3">
              <input
                type="file"
                ref={fileInputRef}
                accept=".pdf,.docx,.txt"
                className="block w-full rounded-xl border border-deep-100 px-3 py-2 text-sm"
              />
              <input
                type="text"
                placeholder="Sarlavha (ixtiyoriy — bo'sh qoldirsangiz fayl nomi ishlatiladi)"
                value={fileTitle}
                onChange={(e) => setFileTitle(e.target.value)}
                className="block w-full rounded-xl border border-deep-100 px-3 py-2 text-sm"
              />
              <p className="text-xs text-ink-400">Qo'llab-quvvatlanadi: PDF, DOCX, TXT (20 MB gacha)</p>
              <button
                onClick={handleFileUpload}
                disabled={uploading}
                className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-deep-950 hover:bg-amber-400 disabled:opacity-50"
              >
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                {uploading ? "Yuklanmoqda..." : "Fayl qo'shish"}
              </button>
            </div>
          )}

          {tab === "youtube" && (
            <div className="space-y-3">
              <input
                type="text"
                placeholder="YouTube video linki (https://youtube.com/watch?v=...)"
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                className="block w-full rounded-xl border border-deep-100 px-3 py-2 text-sm"
              />
              <input
                type="text"
                placeholder="Sarlavha (ixtiyoriy)"
                value={youtubeTitle}
                onChange={(e) => setYoutubeTitle(e.target.value)}
                className="block w-full rounded-xl border border-deep-100 px-3 py-2 text-sm"
              />
              <p className="text-xs text-ink-400">Video subtitr/transcript'ga ega bo'lishi kerak (uz/ru/en)</p>
              <button
                onClick={handleAddYoutube}
                disabled={addingYoutube}
                className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-deep-950 hover:bg-amber-400 disabled:opacity-50"
              >
                {addingYoutube ? <Loader2 size={14} className="animate-spin" /> : <Youtube size={14} />}
                {addingYoutube ? "Qo'shilmoqda..." : "Video qo'shish"}
              </button>
            </div>
          )}

          {tab === "text" && (
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Sarlavha (masalan: 'Universitet kursim — 3-mavzu konspekti')"
                value={textTitle}
                onChange={(e) => setTextTitle(e.target.value)}
                className="block w-full rounded-xl border border-deep-100 px-3 py-2 text-sm"
              />
              <textarea
                placeholder="O'zingiz o'qiyotgan yoki o'qigan kurs matnini, konspektni shu yerga joylashtiring..."
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                rows={6}
                className="block w-full rounded-xl border border-deep-100 px-3 py-2 text-sm"
              />
              <button
                onClick={handleAddText}
                disabled={addingText}
                className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-deep-950 hover:bg-amber-400 disabled:opacity-50"
              >
                {addingText ? <Loader2 size={14} className="animate-spin" /> : <Type size={14} />}
                {addingText ? "Qo'shilmoqda..." : "Matn qo'shish"}
              </button>
            </div>
          )}
        </div>

        {/* Manbalar ro'yxati */}
        <div className="mb-8">
          <h2 className="mb-3 font-display text-lg font-semibold text-deep-950">
            Sizning manbalaringiz {sources.length > 0 && <span className="text-ink-400 font-normal text-sm">({readyCount}/{sources.length} tayyor)</span>}
          </h2>
          {loading ? (
            <p className="text-sm text-ink-400">Yuklanmoqda...</p>
          ) : sources.length === 0 ? (
            <div className="rounded-2xl border border-deep-100 bg-white p-10 text-center">
              <Library size={32} className="mx-auto mb-3 text-amber-500" />
              <p className="text-sm text-ink-500">Hali hech qanday manba qo'shilmagan. Yuqoridagi formadan boshlang.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sources.map((s) => {
                const Icon = TYPE_ICON[s.type] || FileText;
                return (
                  <div key={s.id} className="flex items-center gap-3 rounded-xl border border-deep-100 bg-white px-4 py-3">
                    <Icon size={18} className="flex-shrink-0 text-ink-400" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-deep-950">{s.title}</p>
                      <p className="truncate text-xs text-ink-400">
                        {s.status === "processing" && "Qayta ishlanmoqda..."}
                        {s.status === "ready" && `${s.chunk_count} bo'lak · ${s.char_count.toLocaleString()} belgi`}
                        {s.status === "failed" && (s.error_message || "Xatolik yuz berdi")}
                      </p>
                    </div>
                    {s.status === "processing" && <Loader2 size={16} className="flex-shrink-0 animate-spin text-amber-500" />}
                    {s.status === "ready" && <CheckCircle2 size={16} className="flex-shrink-0 text-green-500" />}
                    {s.status === "failed" && <XCircle size={16} className="flex-shrink-0 text-red-500" />}
                    {s.status === "failed" && s.type !== "file" && (
                      <button onClick={() => handleRetry(s.id)} disabled={retryingId === s.id}
                        className="flex-shrink-0 rounded-lg p-1.5 text-ink-300 hover:bg-amber-50 hover:text-amber-600 disabled:opacity-50">
                        <RotateCcw size={16} className={retryingId === s.id ? "animate-spin" : ""} />
                      </button>
                    )}
                    <button onClick={() => handleDelete(s.id)} className="flex-shrink-0 rounded-lg p-1.5 text-ink-300 hover:bg-red-50 hover:text-red-500">
                      <Trash2 size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Manbalar bilan suhbat (NotebookLM'dagi "Ask sources") */}
        <div className="rounded-2xl border border-deep-100 bg-white p-6">
          <h2 className="mb-1 font-display text-lg font-semibold text-deep-950">Manbalaringizdan so'rang</h2>
          <p className="mb-4 text-sm text-ink-500">AI faqat yuklagan manbalaringizga asoslanib javob beradi va manbani ko'rsatadi.</p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder={readyCount === 0 ? "Avval kamida bitta manba qo'shing..." : "Masalan: 3-mavzuda nima haqida gap bordi?"}
              value={askQuestion}
              onChange={(e) => setAskQuestion(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAsk()}
              disabled={readyCount === 0}
              className="flex-1 rounded-xl border border-deep-100 px-3 py-2 text-sm disabled:bg-deep-50"
            />
            <button
              onClick={handleAsk}
              disabled={asking || readyCount === 0}
              className="flex items-center gap-2 rounded-xl bg-deep-900 px-4 py-2 text-sm font-medium text-white hover:bg-deep-700 disabled:opacity-50"
            >
              {asking ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            </button>
          </div>
          {askedOnce && (
            <div className="mt-4 rounded-xl bg-deep-50 p-4">
              <p className="whitespace-pre-wrap text-sm text-ink-800">{asking ? "O'ylanmoqda..." : askAnswer}</p>
              {askCitations.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {askCitations.map((c) => (
                    <span key={c.chunk_id} className="rounded-full bg-white border border-deep-100 px-2.5 py-1 text-xs text-ink-500">
                      [{c.n}] {c.source_title}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
