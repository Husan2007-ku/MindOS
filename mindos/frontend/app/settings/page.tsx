"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import { apiGet, apiPut, apiDelete, clearTokens } from "@/lib/api";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useTheme } from "@/lib/useTheme";
import { useRouter } from "next/navigation";
import { Sun, Moon, CreditCard, Bell, User, Shield } from "lucide-react";

const LANGS=[{value:"uz",label:"O'zbek"},{value:"ru",label:"Rus"},{value:"en",label:"Ingliz"}];
interface Profile { full_name:string|null; lang:string; plan:string; notify_daily:boolean; notify_time:string; notify_streak:boolean; notify_sr:boolean; }

export default function SettingsPage() {
  const { checking }=useRequireAuth(); const router=useRouter();
  const { theme, toggle }=useTheme();
  const [profile,setProfile]=useState<Profile|null>(null);
  const [saving,setSaving]=useState(false); const [saved,setSaved]=useState(false);
  useEffect(()=>{ if(checking) return; apiGet("/users/me").then(setProfile); },[checking]);

  if(checking||!profile) return <div style={{ display:"flex",height:"100vh",alignItems:"center",justifyContent:"center",background:"var(--bg-main)" }}><div style={{ width:"40px",height:"40px",borderRadius:"50%",border:"4px solid var(--border)",borderTopColor:"var(--accent)" }}/></div>;

  async function save() {
    setSaving(true); setSaved(false);
    try { await apiPut("/users/me",{full_name:profile!.full_name,lang:profile!.lang,notify_daily:profile!.notify_daily,notify_time:profile!.notify_time,notify_streak:profile!.notify_streak,notify_sr:profile!.notify_sr}); setSaved(true); setTimeout(()=>setSaved(false),2500); }
    finally { setSaving(false); }
  }
  async function del() {
    if(!confirm("Akkauntingizni o'chirmoqchimisiz?")) return;
    await apiDelete("/users/me"); clearTokens(); router.push("/");
  }

  const C={ background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:"16px",padding:"24px",marginBottom:"16px" };
  const I={ width:"100%",padding:"10px 14px",background:"var(--bg-hover)",border:"1px solid var(--border)",borderRadius:"10px",fontSize:"15px",color:"var(--text-1)",outline:"none",boxSizing:"border-box" as const };

  return (
    <div style={{ display:"flex",minHeight:"100vh",background:"var(--bg-main)" }}>
      <Sidebar/>
      <main style={{ flex:1,overflowY:"auto",padding:"32px" }}>
        <h1 style={{ fontSize:"28px",fontWeight:"800",color:"var(--text-1)",marginBottom:"4px" }}>Sozlamalar</h1>
        <p style={{ fontSize:"14px",color:"var(--text-2)",marginBottom:"32px" }}>Profilingiz va xususiyatlarni sozlang</p>
        <div style={{ maxWidth:"560px" }}>

          {/* TEMA */}
          <div style={C}>
            <div style={{ display:"flex",alignItems:"center",gap:"8px",marginBottom:"16px" }}>
              {theme==="dark"?<Moon size={18} color="var(--accent)"/>:<Sun size={18} color="var(--amber)"/>}
              <span style={{ fontSize:"16px",fontWeight:"700",color:"var(--text-1)" }}>Interfeys temi</span>
            </div>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px" }}>
              {[{v:"light",e:"☀️",l:"Yorug'",d:"Oq fon"},{v:"dark",e:"🌙",l:"Qora",d:"Ko'z uchun qulay"}].map(o=>(
                <button key={o.v} onClick={()=>o.v!==theme&&toggle()}
                  style={{ padding:"16px",borderRadius:"12px",textAlign:"left",cursor:"pointer",border:`2px solid ${theme===o.v?"var(--amber)":"var(--border)"}`,background:theme===o.v?"var(--amber-light)":"var(--bg-hover)",transition:"all 0.2s" }}>
                  <div style={{ fontSize:"18px",marginBottom:"4px" }}>{o.e} {o.l}</div>
                  <div style={{ fontSize:"12px",color:"var(--text-2)" }}>{o.d}</div>
                  {theme===o.v&&<div style={{ fontSize:"11px",fontWeight:"700",color:"var(--amber)",marginTop:"6px" }}>✓ Faol</div>}
                </button>
              ))}
            </div>
          </div>

          {/* PROFIL */}
          <div style={C}>
            <div style={{ display:"flex",alignItems:"center",gap:"8px",marginBottom:"16px" }}><User size={18} color="var(--accent)"/><span style={{ fontSize:"16px",fontWeight:"700",color:"var(--text-1)" }}>Profil</span></div>
            <label style={{ display:"block",fontSize:"13px",fontWeight:"600",color:"var(--text-2)",marginBottom:"6px" }}>Ism</label>
            <input value={profile.full_name||""} onChange={e=>setProfile({...profile,full_name:e.target.value})} style={{...I,marginBottom:"16px"}}/>
            <label style={{ display:"block",fontSize:"13px",fontWeight:"600",color:"var(--text-2)",marginBottom:"6px" }}>Til</label>
            <div style={{ display:"flex",gap:"8px" }}>
              {LANGS.map(l=><button key={l.value} onClick={()=>setProfile({...profile,lang:l.value})}
                style={{ flex:1,padding:"8px",borderRadius:"10px",fontSize:"14px",fontWeight:"600",cursor:"pointer",border:`1.5px solid ${profile.lang===l.value?"var(--accent)":"var(--border)"}`,background:profile.lang===l.value?"var(--accent)":"var(--bg-hover)",color:profile.lang===l.value?"#fff":"var(--text-1)" }}>
                {l.label}
              </button>)}
            </div>
          </div>

          {/* NOTIFIKATSIYALAR */}
          <div style={C}>
            <div style={{ display:"flex",alignItems:"center",gap:"8px",marginBottom:"16px" }}><Bell size={18} color="var(--accent)"/><span style={{ fontSize:"16px",fontWeight:"700",color:"var(--text-1)" }}>Notifikatsiyalar</span></div>
            {[{k:"notify_daily",l:"Kunlik eslatma",d:"Har kuni"},{k:"notify_streak",l:"Streak ogohlantirish",d:"Streak uzilishidan oldin"},{k:"notify_sr",l:"Takrorlash",d:"Kartochkalar tayyor bo'lganda"}].map(({k,l,d})=>(
              <div key={k} style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"12px" }}>
                <div><div style={{ fontSize:"14px",fontWeight:"500",color:"var(--text-1)" }}>{l}</div><div style={{ fontSize:"12px",color:"var(--text-2)" }}>{d}</div></div>
                <button onClick={()=>setProfile({...profile,[k]:!(profile as any)[k]})}
                  style={{ width:"44px",height:"24px",borderRadius:"12px",border:"none",cursor:"pointer",position:"relative",background:(profile as any)[k]?"var(--accent)":"var(--border)",transition:"background 0.2s" }}>
                  <span style={{ position:"absolute",top:"2px",width:"20px",height:"20px",borderRadius:"50%",background:"#fff",transition:"left 0.2s",left:(profile as any)[k]?"22px":"2px" }}/>
                </button>
              </div>
            ))}
          </div>

          {/* REJA */}
          <div style={C}>
            <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between" }}>
              <div style={{ display:"flex",alignItems:"center",gap:"8px" }}>
                <CreditCard size={18} color="var(--accent)"/>
                <div><div style={{ fontSize:"16px",fontWeight:"700",color:"var(--text-1)" }}>Joriy reja</div><div style={{ fontSize:"13px",color:"var(--text-2)",textTransform:"capitalize" }}>{profile.plan}</div></div>
              </div>
              <Link href="/pricing" style={{ padding:"8px 16px",background:"var(--amber)",color:"#0F2942",borderRadius:"10px",fontSize:"13px",fontWeight:"700",textDecoration:"none" }}>Rejani o'zgartirish</Link>
            </div>
          </div>

          <button onClick={save} disabled={saving}
            style={{ padding:"13px 32px",background:"var(--accent)",color:"#fff",border:"none",borderRadius:"12px",fontSize:"15px",fontWeight:"700",cursor:"pointer",marginBottom:"24px" }}>
            {saving?"Saqlanmoqda...":saved?"Saqlandi ✓":"Saqlash"}
          </button>

          {/* XAVFLI ZONA */}
          <div style={{ ...C,border:"1px solid #FCA5A5",background:"#FFF5F5" }}>
            <div style={{ display:"flex",alignItems:"center",gap:"8px",marginBottom:"8px" }}><Shield size={18} color="#DC2626"/><span style={{ fontSize:"16px",fontWeight:"700",color:"#DC2626" }}>Xavfli zona</span></div>
            <p style={{ fontSize:"13px",color:"#6B675D",marginBottom:"16px" }}>Barcha ma'lumotlaringiz qaytarib bo'lmas tarzda yo'qoladi.</p>
            <button onClick={del} style={{ padding:"10px 20px",background:"#DC2626",color:"#fff",border:"none",borderRadius:"10px",fontSize:"14px",fontWeight:"600",cursor:"pointer" }}>Akkauntni o'chirish</button>
          </div>
        </div>
      </main>
    </div>
  );
}
