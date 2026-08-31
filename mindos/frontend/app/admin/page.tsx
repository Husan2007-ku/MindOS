"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { apiGet } from "@/lib/api";
import { useRequireAuth } from "@/lib/useRequireAuth";

export default function AdminPage() {
  const { checking } = useRequireAuth();
  const [stats, setStats] = useState<any>(null);
  const [funnel, setFunnel] = useState<{event_type:string; total:number; unique_users:number}[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (checking) return;
    apiGet("/admin/analytics/overview").then(setStats).catch(e => setError(e.message));
    apiGet("/admin/analytics/funnel?days=30").then(d => setFunnel(d.events)).catch(() => {});
  }, [checking]);

  const EVENT_LABELS: Record<string,string> = {
    user_registered: "Ro'yxatdan o'tish",
    diagnostic_started: "Diagnostika boshlandi",
    diagnostic_completed: "Diagnostika tugallandi",
    onboarding_completed: "Onboarding tugallandi",
    lesson_completed: "Dars tugallandi",
    homework_submitted: "Vazifa topshirildi",
    tts_played: "Ovozli javob tinglandi",
    checkout_started: "To'lovga o'tish bosildi",
  };

  if (checking) return null;

  return (
    <div className="flex min-h-screen bg-paper-100">
      <Sidebar />
      <main className="flex-1 px-8 py-8">
        <h1 className="font-display text-3xl font-bold text-deep-950 mb-8">Admin Panel</h1>
        {error ? (
          <div className="rounded-2xl bg-red-50 border border-red-200 p-6">
            <p className="text-red-700">{error === "Admin huquqi talab qilinadi" ? "Bu sahifa faqat adminlar uchun" : error}</p>
          </div>
        ) : stats ? (
          <div className="grid gap-4 sm:grid-cols-4">
            {[
              { label:"Jami foydalanuvchilar", value: stats.total_users },
              { label:"Bugungi faollar (DAU)", value: stats.dau },
              { label:"MRR ($)", value: `$${stats.mrr_usd}` },
              { label:"Churn", value: `${stats.churn_rate_percent}%` },
            ].map(({label,value}) => (
              <div key={label} className="rounded-2xl bg-white border border-deep-100 p-6">
                <p className="text-sm text-ink-500">{label}</p>
                <p className="mt-1 font-mono text-2xl font-bold text-deep-950">{value}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-deep-100 border-t-deep-900" />
        )}
        {funnel && funnel.length > 0 && (
          <div className="mt-8 rounded-2xl bg-white border border-deep-100 p-6">
            <h2 className="font-display text-lg font-bold text-deep-950 mb-1">Foydalanuvchi funnel'i (oxirgi 30 kun)</h2>
            <p className="text-xs text-ink-500 mb-4">"Ro'yxatdan o'tish" bilan "Onboarding tugallandi" orasidagi farq — qancha foydalanuvchi tushib qolayotganini ko'rsatadi.</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-deep-100 text-left text-ink-500">
                  <th className="pb-2 font-medium">Voqea</th>
                  <th className="pb-2 font-medium text-right">Jami</th>
                  <th className="pb-2 font-medium text-right">Noyob foydalanuvchi</th>
                </tr>
              </thead>
              <tbody>
                {funnel.map(f => (
                  <tr key={f.event_type} className="border-b border-deep-50 last:border-0">
                    <td className="py-2 text-ink-900">{EVENT_LABELS[f.event_type] || f.event_type}</td>
                    <td className="py-2 text-right font-mono text-deep-950">{f.total}</td>
                    <td className="py-2 text-right font-mono text-deep-950">{f.unique_users}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
