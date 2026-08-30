"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { setTokens } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError(""); setLoading(true);
    try {
      const res = await fetch("http://localhost:8000/api/v1/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, full_name: fullName, lang: "uz" }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || "Xatolik yuz berdi"); return; }
      setTokens(data.access_token, data.refresh_token);
      router.push("/onboarding");
    } catch { setError("Server bilan aloqa yoq"); }
    finally { setLoading(false); }
  }

  return (
    <main style={{ display:"flex", minHeight:"100vh", alignItems:"center", justifyContent:"center", background:"var(--bg-main)" }}>
      <div style={{ background:"var(--bg-card)", padding:"40px", borderRadius:"20px", width:"380px", boxShadow:"0 4px 24px rgba(0,0,0,0.08)", border:"1px solid var(--border)" }}>
        <Link href="/" style={{ fontSize:"24px", fontWeight:"700", color:"var(--accent)", textDecoration:"none", display:"block", marginBottom:"8px" }}>MindOS</Link>
        <h1 style={{ fontSize:"22px", fontWeight:"700", color:"var(--text-1)", marginBottom:"6px" }}>Hisob yaratish</h1>
        <p style={{ fontSize:"14px", color:"var(--text-2)", marginBottom:"28px" }}>Shaxsiy mentoringiz sizni kutmoqda</p>
        <div style={{ marginBottom:"16px" }}>
          <label style={{ display:"block", fontSize:"13px", fontWeight:"600", color:"var(--text-2)", marginBottom:"6px" }}>Ismingiz</label>
          <input value={fullName} onChange={e=>setFullName(e.target.value)} placeholder="Ism Familiya"
            style={{ width:"100%", padding:"11px 14px", border:"1.5px solid var(--border)", borderRadius:"10px", fontSize:"15px", outline:"none", boxSizing:"border-box", background:"var(--bg-hover)", color:"var(--text-1)" }} />
        </div>
        <div style={{ marginBottom:"16px" }}>
          <label style={{ display:"block", fontSize:"13px", fontWeight:"600", color:"var(--text-2)", marginBottom:"6px" }}>Email</label>
          <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="email@misol.uz"
            style={{ width:"100%", padding:"11px 14px", border:"1.5px solid var(--border)", borderRadius:"10px", fontSize:"15px", outline:"none", boxSizing:"border-box", background:"var(--bg-hover)", color:"var(--text-1)" }} />
        </div>
        <div style={{ marginBottom:"20px" }}>
          <label style={{ display:"block", fontSize:"13px", fontWeight:"600", color:"var(--text-2)", marginBottom:"6px" }}>Parol</label>
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Kamida 8 belgi"
            style={{ width:"100%", padding:"11px 14px", border:"1.5px solid var(--border)", borderRadius:"10px", fontSize:"15px", outline:"none", boxSizing:"border-box", background:"var(--bg-hover)", color:"var(--text-1)" }} />
        </div>
        {error && <p style={{ color:"#DC2626", fontSize:"13px", marginBottom:"12px" }}>{error}</p>}
        <button onClick={handleSubmit} disabled={loading}
          style={{ width:"100%", padding:"13px", background:"var(--accent)", color:"white", border:"none", borderRadius:"12px", fontSize:"15px", fontWeight:"600", cursor:"pointer" }}>
          {loading ? "Yaratilmoqda..." : "Royxatdan otish"}
        </button>
        <p style={{ textAlign:"center", marginTop:"20px", fontSize:"14px", color:"var(--text-2)" }}>
          Hisobingiz bormi? <Link href="/login" style={{ color:"var(--accent)", fontWeight:"600", textDecoration:"none" }}>Kirish</Link>
        </p>
      </div>
    </main>
  );
}
