"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { apiGet, apiPut, ApiError } from "@/lib/api";
import { useRequireAuth } from "@/lib/useRequireAuth";

interface AdminUser {
  id: number;
  email: string;
  full_name: string | null;
  plan: string;
  lang: string;
  streak: number;
  onboarding_completed: boolean;
  is_active: boolean;
  last_active: string | null;
  created_at: string;
}

const PLAN_OPTIONS = ["free", "pro", "team", "enterprise"] as const;
const PLAN_LABELS: Record<string, string> = { free: "Free", pro: "Pro", team: "Team", enterprise: "Enterprise" };

export default function AdminPage() {
  const { checking } = useRequireAuth();
  const [stats, setStats] = useState<any>(null);
  const [funnel, setFunnel] = useState<{event_type:string; total:number; unique_users:number}[] | null>(null);
  const [error, setError] = useState("");
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [savingId, setSavingId] = useState<number|null>(null);
  const [saveMsg, setSaveMsg] = useState("");

  useEffect(() => {
    if (checking) return;
    apiGet("/admin/analytics/overview").then(setStats).catch(e => setError(e.message));
    apiGet("/admin/analytics/funnel?days=30").then(d => setFunnel(d.events)).catch(() => {});
    apiGet("/admin/users?page_size=200").then(d => setUsers(d.users)).catch(() => {});
  }, [checking]);

  // Reja qo'lda o'zgartirilganda darhol serverga yuboriladi va ro'yxat
  // shu yerning o'zida yangilanadi — sahifani qayta yuklash shart emas.
  // Sinov/QA uchun (masalan loyiha egasi o'z hisobini Pro/Enterprise
  // qilib ko'rish) yoki mijozlar bilan alohida kelishilgan holatlar uchun.
  async function changePlan(user: AdminUser, plan: string) {
    if (plan === user.plan) return;
    setSavingId(user.id);
    setSaveMsg("");
    try {
      const updated = await apiPut(`/admin/users/${user.id}/plan`, { plan });
      setUsers(prev => prev ? prev.map(u => u.id === user.id ? { ...u, plan: updated.plan } : u) : prev);
      setSaveMsg(`✅ ${updated.email} — ${PLAN_LABELS[updated.plan] || updated.plan} rejasiga o'tkazildi`);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Reja o'zgartirilmadi";
      setSaveMsg(`⚠️ ${msg}`);
    } finally {
      setSavingId(null);
      setTimeout(() => setSaveMsg(""), 5000);
    }
  }

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

  const filteredUsers = users?.filter(u => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return true;
    return u.email.toLowerCase().includes(q) || (u.full_name || "").toLowerCase().includes(q);
  }) ?? null;

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

        {!error && (
          <div className="mt-8 rounded-2xl bg-white border border-deep-100 p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold text-deep-950">Foydalanuvchilar va rejalar</h2>
                <p className="text-xs text-ink-500">Rejani qo'lda o'zgartirish — sinov, qo'llab-quvvatlash yoki maxsus kelishuvlar uchun.</p>
              </div>
              <input
                value={userSearch}
                onChange={e=>setUserSearch(e.target.value)}
                placeholder="Email yoki ism bo'yicha qidirish..."
                className="w-64 rounded-lg border border-deep-100 px-3 py-2 text-sm outline-none focus:border-deep-500"
              />
            </div>
            {saveMsg && (
              <div className="mb-3 rounded-lg bg-deep-50 px-3 py-2 text-sm text-deep-900">{saveMsg}</div>
            )}
            {!users ? (
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-deep-100 border-t-deep-900" />
            ) : filteredUsers && filteredUsers.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-deep-100 text-left text-ink-500">
                      <th className="pb-2 font-medium">Foydalanuvchi</th>
                      <th className="pb-2 font-medium">Joriy reja</th>
                      <th className="pb-2 font-medium">Yangi reja</th>
                      <th className="pb-2 font-medium text-right">Streak</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map(u => (
                      <tr key={u.id} className="border-b border-deep-50 last:border-0">
                        <td className="py-2.5 text-ink-900">
                          <div className="font-medium">{u.full_name || "—"}</div>
                          <div className="text-xs text-ink-400">{u.email}</div>
                        </td>
                        <td className="py-2.5">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            u.plan==="free" ? "bg-deep-50 text-ink-500" :
                            u.plan==="pro" ? "bg-amber-100 text-amber-700" :
                            "bg-deep-900 text-white"
                          }`}>{PLAN_LABELS[u.plan] || u.plan}</span>
                        </td>
                        <td className="py-2.5">
                          <select
                            value={u.plan}
                            disabled={savingId===u.id}
                            onChange={e=>changePlan(u, e.target.value)}
                            className="rounded-lg border border-deep-100 px-2 py-1.5 text-sm outline-none focus:border-deep-500 disabled:opacity-50">
                            {PLAN_OPTIONS.map(p => <option key={p} value={p}>{PLAN_LABELS[p]}</option>)}
                          </select>
                        </td>
                        <td className="py-2.5 text-right font-mono text-ink-700">{u.streak}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-ink-400">Hech kim topilmadi.</p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
