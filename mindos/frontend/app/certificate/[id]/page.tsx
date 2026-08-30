"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiGet } from "@/lib/api";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { Award, Printer, ArrowLeft, ShieldCheck } from "lucide-react";

interface Certificate {
  user_name: string; topic: string; level: string; total_weeks: number;
  lessons_completed: number; avg_score: number | null;
  completion_date: string; verify_code: string;
}

const LEVEL_LABELS: Record<string,string> = { beginner:"Boshlang'ich", intermediate:"O'rta", advanced:"Yuqori" };

export default function CertificatePage() {
  const { checking } = useRequireAuth();
  const params = useParams();
  const router = useRouter();
  const [cert, setCert] = useState<Certificate | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (checking) return;
    apiGet(`/progress/certificate/${params.id}`)
      .then(setCert)
      .catch((e) => setError(e?.message || "Sertifikatni yuklab bo'lmadi"))
      .finally(() => setLoading(false));
  }, [checking, params.id]);

  if (checking || loading) return <div className="flex h-screen items-center justify-center bg-paper-100"><div className="h-10 w-10 animate-spin rounded-full border-4 border-deep-100 border-t-deep-900"/></div>;

  if (error || !cert) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-paper-100 gap-4 px-6 text-center">
        <p className="text-ink-500">{error || "Sertifikat topilmadi"}</p>
        <button onClick={() => router.push("/progress")} className="flex items-center gap-2 rounded-xl bg-deep-950 px-5 py-2.5 text-sm font-semibold text-white">
          <ArrowLeft size={16}/> Progress sahifasiga qaytish
        </button>
      </div>
    );
  }

  const dateLabel = cert.completion_date
    ? new Date(cert.completion_date).toLocaleDateString("uz-UZ", { year: "numeric", month: "long", day: "numeric" })
    : "";

  return (
    <div className="min-h-screen bg-paper-200 py-10 px-4 print:bg-white print:py-0">
      <div className="mx-auto mb-6 flex max-w-3xl items-center justify-between print:hidden">
        <button onClick={() => router.push("/progress")} className="flex items-center gap-2 text-sm text-ink-500 hover:text-deep-950">
          <ArrowLeft size={16}/> Orqaga
        </button>
        <button onClick={() => window.print()} className="flex items-center gap-2 rounded-xl bg-deep-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-deep-700">
          <Printer size={16}/> PDF sifatida saqlash
        </button>
      </div>

      <div className="mx-auto max-w-3xl rounded-3xl border-8 border-double p-12 text-center shadow-xl print:shadow-none"
        style={{ borderColor:"#D4A024", background:"linear-gradient(180deg,#FFFFFF 0%,#FAF8F4 100%)" }}>
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-amber-500">
          <Award size={32} className="text-deep-950" />
        </div>
        <p className="font-mono text-xs uppercase tracking-[4px] text-ink-400 mb-2">MindOS Yakunlash Sertifikati</p>
        <h1 className="font-display text-3xl font-bold text-deep-950 mb-1">{cert.user_name}</h1>
        <p className="text-ink-500 mb-8">quyidagi o'quv rejani muvaffaqiyatli yakunladi</p>

        <h2 className="font-display text-2xl font-bold mb-2" style={{ color:"#B0801A" }}>{cert.topic}</h2>
        <p className="text-sm text-ink-500 mb-8">{LEVEL_LABELS[cert.level] || cert.level} daraja • {cert.total_weeks} hafta</p>

        <div className="mx-auto mb-8 grid max-w-md grid-cols-3 gap-4 border-y border-deep-100 py-6">
          <div>
            <div className="font-mono text-2xl font-bold text-deep-950">{cert.lessons_completed}</div>
            <div className="text-xs text-ink-400">dars tugallandi</div>
          </div>
          <div>
            <div className="font-mono text-2xl font-bold text-deep-950">{cert.avg_score !== null ? `${cert.avg_score}%` : "—"}</div>
            <div className="text-xs text-ink-400">o'rtacha ball</div>
          </div>
          <div>
            <div className="font-mono text-2xl font-bold text-deep-950">{cert.total_weeks}</div>
            <div className="text-xs text-ink-400">hafta davomida</div>
          </div>
        </div>

        <p className="text-sm text-ink-500 mb-1">{dateLabel} sanasida yakunlangan</p>

        <div className="mx-auto mt-8 flex w-fit items-center gap-2 rounded-full border border-deep-100 bg-white px-4 py-2 text-xs text-ink-400">
          <ShieldCheck size={14} className="text-green-600" />
          Tasdiqlash kodi: <span className="font-mono font-semibold text-deep-950">{cert.verify_code}</span>
        </div>
      </div>
    </div>
  );
}
