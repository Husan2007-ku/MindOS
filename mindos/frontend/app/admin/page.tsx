"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { apiGet } from "@/lib/api";
import { useRequireAuth } from "@/lib/useRequireAuth";

export default function AdminPage() {
  const { checking } = useRequireAuth();
  const [stats, setStats] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (checking) return;
    apiGet("/admin/analytics/overview").then(setStats).catch(e => setError(e.message));
  }, [checking]);

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
      </main>
    </div>
  );
}
