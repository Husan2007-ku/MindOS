"use client";
import { useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { setTokens } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res = await fetch("http://localhost:8000/api/v1/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || "Email yoki parol noto'g'ri"); return; }
      setTokens(data.access_token, data.refresh_token);
      router.push("/dashboard");
    } catch { setError("Server bilan aloqa yo'q"); }
    finally { setLoading(false); }
  }

  return (
    <main style={{ display:"flex", minHeight:"100vh", alignItems:"center", justifyContent:"center", background:"#FAF8F4" }}>
      <div style={{ background:"white", padding:"40px", borderRadius:"20px", width:"380px", boxShadow:"0 4px 24px rgba(0,0,0,0.08)" }}>
        <Link href="/" style={{ fontSize:"24px", fontWeight:"700", color:"#0F2942", textDecoration:"none", display:"block", marginBottom:"8px" }}>MindOS</Link>
        <h1 style={{ fontSize:"22px", fontWeight:"700", color:"#1A1814", marginBottom:"6px" }}>Xush kelibsiz</h1>
        <p style={{ fontSize:"14px", color:"#6B675D", marginBottom:"28px" }}>Hisobingizga kiring va davom eting</p>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom:"16px" }}>
            <label style={{ display:"block", fontSize:"13px", fontWeight:"600", color:"#3D3A33", marginBottom:"6px" }}>Email</label>
            <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="siz@misol.uz" required
              style={{ width:"100%", padding:"11px 14px", border:"1.5px solid #E5DFD3", borderRadius:"10px", fontSize:"15px", outline:"none", boxSizing:"border-box" }} />
          </div>
          <div style={{ marginBottom:"8px" }}>
            <label style={{ display:"block", fontSize:"13px", fontWeight:"600", color:"#3D3A33", marginBottom:"6px" }}>Parol</label>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" required
              style={{ width:"100%", padding:"11px 14px", border:"1.5px solid #E5DFD3", borderRadius:"10px", fontSize:"15px", outline:"none", boxSizing:"border-box" }} />
          </div>
          <div style={{ textAlign:"right", marginBottom:"20px" }}>
            <Link href="/forgot-password" style={{ fontSize:"13px", color:"#0F2942", textDecoration:"none" }}>Parolni unutdingizmi?</Link>
          </div>
          {error && <p style={{ color:"#DC2626", fontSize:"13px", marginBottom:"12px" }}>{error}</p>}
          <button type="submit" disabled={loading}
            style={{ width:"100%", padding:"13px", background:"#0F2942", color:"white", border:"none", borderRadius:"12px", fontSize:"15px", fontWeight:"600", cursor:"pointer" }}>
            {loading ? "Kirilmoqda..." : "Kirish"}
          </button>
        </form>
        <p style={{ textAlign:"center", marginTop:"20px", fontSize:"14px", color:"#6B675D" }}>
          Hisobingiz yo'qmi? <Link href="/register" style={{ color:"#0F2942", fontWeight:"600", textDecoration:"none" }}>Ro'yxatdan o'tish</Link>
        </p>
      </div>
    </main>
  );
}
