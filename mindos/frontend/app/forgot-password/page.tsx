"use client";
import { useState, FormEvent } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setLoading(true);
    try {
      await fetch("http://localhost:8000/api/v1/auth/forgot-password", {
        method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({email}),
      });
    } finally { setLoading(false); setSent(true); }
  }

  return (
    <main style={{display:"flex",minHeight:"100vh",alignItems:"center",justifyContent:"center",background:"#FAF8F4"}}>
      <div style={{background:"white",padding:"40px",borderRadius:"20px",width:"380px",boxShadow:"0 4px 24px rgba(0,0,0,0.08)"}}>
        <Link href="/" style={{fontSize:"24px",fontWeight:"700",color:"#0F2942",textDecoration:"none",display:"block",marginBottom:"24px"}}>MindOS</Link>
        {sent ? (
          <><h1 style={{fontSize:"22px",fontWeight:"700",color:"#1A1814",marginBottom:"12px"}}>Emailni tekshiring</h1>
          <p style={{fontSize:"14px",color:"#6B675D",lineHeight:"1.6"}}>Agar <strong>{email}</strong> ro'yxatdan o'tgan bo'lsa, tiklash linki yuborildi. Link 1 soat amal qiladi.</p></>
        ) : (
          <><h1 style={{fontSize:"22px",fontWeight:"700",color:"#1A1814",marginBottom:"8px"}}>Parolni tiklash</h1>
          <p style={{fontSize:"14px",color:"#6B675D",marginBottom:"24px"}}>Email manzilingizni kiriting</p>
          <form onSubmit={handleSubmit}>
            <div style={{marginBottom:"16px"}}>
              <label style={{display:"block",fontSize:"13px",fontWeight:"600",marginBottom:"6px",color:"#3D3A33"}}>Email</label>
              <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="siz@misol.uz" required
                style={{width:"100%",padding:"11px 14px",border:"1.5px solid #E5DFD3",borderRadius:"10px",fontSize:"15px",outline:"none",boxSizing:"border-box"}} />
            </div>
            <button type="submit" disabled={loading}
              style={{width:"100%",padding:"13px",background:"#0F2942",color:"white",border:"none",borderRadius:"12px",fontSize:"15px",fontWeight:"600",cursor:"pointer"}}>
              {loading?"Yuborilmoqda...":"Linkni yuborish"}
            </button>
          </form></>
        )}
        <p style={{textAlign:"center",marginTop:"20px",fontSize:"14px",color:"#6B675D"}}>
          <Link href="/login" style={{color:"#0F2942",fontWeight:"600",textDecoration:"none"}}>Kirishga qaytish</Link>
        </p>
      </div>
    </main>
  );
}
