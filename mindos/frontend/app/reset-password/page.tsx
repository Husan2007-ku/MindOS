"use client";
import { useState, FormEvent, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { setTokens, API_BASE } from "@/lib/api";

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length<8){setError("Parol kamida 8 ta belgi");return;}
    if (password!==confirm){setError("Parollar mos kelmadi");return;}
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/reset-password`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({reset_token:token, new_password:password}),
      });
      if (!res.ok){const d=await res.json();setError(d.detail||"Xatolik");return;}
      setSuccess(true);
      setTimeout(()=>router.push("/login"),2000);
    } catch {setError("Server bilan aloqa yo'q");}
    finally{setLoading(false);}
  }

  return (
    <main style={{display:"flex",minHeight:"100vh",alignItems:"center",justifyContent:"center",background:"#FAF8F4"}}>
      <div style={{background:"white",padding:"40px",borderRadius:"20px",width:"380px",boxShadow:"0 4px 24px rgba(0,0,0,0.08)"}}>
        <Link href="/" style={{fontSize:"24px",fontWeight:"700",color:"#0F2942",textDecoration:"none",display:"block",marginBottom:"24px"}}>MindOS</Link>
        {success?<p style={{color:"#16a34a",fontWeight:"600"}}>Parol yangilandi! Kirishga yo'naltirilmoqda...</p>:(
          <>
            <h1 style={{fontSize:"22px",fontWeight:"700",color:"#1A1814",marginBottom:"24px"}}>Yangi parol</h1>
            <form onSubmit={handleSubmit}>
              {[["Yangi parol",password,setPassword],["Tasdiqlang",confirm,setConfirm]].map(([label,val,set])=>(
                <div key={String(label)} style={{marginBottom:"16px"}}>
                  <label style={{display:"block",fontSize:"13px",fontWeight:"600",marginBottom:"6px",color:"#3D3A33"}}>{String(label)}</label>
                  <input type="password" value={String(val)} onChange={e=>(set as any)(e.target.value)} placeholder="••••••••" required
                    style={{width:"100%",padding:"11px 14px",border:"1.5px solid #E5DFD3",borderRadius:"10px",fontSize:"15px",outline:"none",boxSizing:"border-box"}} />
                </div>
              ))}
              {error&&<p style={{color:"#DC2626",fontSize:"13px",marginBottom:"12px"}}>{error}</p>}
              <button type="submit" disabled={loading}
                style={{width:"100%",padding:"13px",background:"#0F2942",color:"white",border:"none",borderRadius:"12px",fontSize:"15px",fontWeight:"600",cursor:"pointer"}}>
                {loading?"Saqlanmoqda...":"Parolni saqlash"}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return <Suspense fallback={null}><ResetForm /></Suspense>;
}
