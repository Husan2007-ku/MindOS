"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LayoutDashboard,MessageCircle,BookOpen,ClipboardCheck,Repeat2,TrendingUp,Settings,LogOut,Flame,Sun,Moon,Library,HelpCircle,ShieldCheck,Menu,X } from "lucide-react";
import { apiGet, clearTokens } from "@/lib/api";
import { useTheme } from "@/lib/useTheme";

const NAV=[
  {href:"/dashboard",label:"Bosh sahifa",icon:LayoutDashboard},
  {href:"/chat",label:"Mentor",icon:MessageCircle},
  {href:"/curriculum",label:"O'quv reja",icon:BookOpen},
  {href:"/sources",label:"Manbalar",icon:Library},
  {href:"/homework",label:"Vazifalar",icon:ClipboardCheck},
  {href:"/spaced-rep",label:"Takrorlash",icon:Repeat2},
  {href:"/progress",label:"Natijalar",icon:TrendingUp}, // "Progress" (inglizcha) o'rniga — sidebar'dagi yagona inglizcha yorliq edi, foydalanuvchi buni topolmagan
  {href:"/help",label:"Yordam",icon:HelpCircle},
  {href:"/settings",label:"Sozlamalar",icon:Settings},
];

export default function Sidebar() {
  const pathname=usePathname(); const router=useRouter();
  const { theme, toggle }=useTheme();
  const [streak,setStreak]=useState<number|null>(null);
  const [name,setName]=useState("");
  const [xp,setXp]=useState<number|null>(null);
  const [level,setLevel]=useState<number|null>(null);
  const [isAdmin,setIsAdmin]=useState(false);
  const [mobileOpen,setMobileOpen]=useState(false);
  // Mobil ekranlarda sidebar berkitilgan drawer sifatida ochiladi — sahifa almashganda
  // avtomatik yopiladi, aks holda foydalanuvchi har safar qo'lda yopishi kerak bo'lardi.
  useEffect(()=>{ setMobileOpen(false); },[pathname]);
  useEffect(()=>{ apiGet("/users/me").then(d=>{setStreak(d.streak);setName(d.full_name?.split(" ")[0]||"");setIsAdmin(!!d.is_admin);}).catch(()=>{}); },[]);
  useEffect(()=>{ apiGet("/gamification/me").then(d=>{setXp(d.xp);setLevel(d.level);}).catch(()=>{}); },[]);
  function logout(){ clearTokens(); router.push("/"); }
  return (
    <>
      {/* Mobilda sidebar-ni ochish tugmasi — faqat kichik ekranlarda ko'rinadi */}
      <button
        onClick={()=>setMobileOpen(true)}
        aria-label="Menyuni ochish"
        className="md:hidden"
        style={{ position:"fixed",top:"12px",left:"12px",zIndex:40,display:mobileOpen?"none":"flex",alignItems:"center",justifyContent:"center",width:"40px",height:"40px",borderRadius:"10px",border:"1px solid var(--border)",background:"var(--bg-sidebar)",color:"var(--text-1)",cursor:"pointer" }}
      >
        <Menu size={20}/>
      </button>
      {/* Orqa fon (backdrop) — mobilda sidebar ochiq bo'lganda bosilsa yopiladi */}
      {mobileOpen && (
        <div
          onClick={()=>setMobileOpen(false)}
          className="md:hidden"
          style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:45 }}
        />
      )}
      <aside
        className={`md:!static md:!translate-x-0 ${mobileOpen?"translate-x-0":"-translate-x-full"}`}
        style={{ display:"flex",height:"100vh",width:"256px",flexDirection:"column",padding:"24px 16px",background:"var(--bg-sidebar)",borderRight:"1px solid var(--border)",flexShrink:0,position:"fixed",top:0,left:0,zIndex:50,transition:"transform 0.2s ease",overflowY:"auto" }}
      >
        <button
          onClick={()=>setMobileOpen(false)}
          aria-label="Menyuni yopish"
          className="md:hidden"
          style={{ position:"absolute",top:"16px",right:"16px",background:"transparent",border:"none",color:"var(--text-2)",cursor:"pointer" }}
        >
          <X size={20}/>
        </button>
      <Link href="/dashboard" style={{ display:"block",marginBottom:"24px",padding:"0 8px",textDecoration:"none" }}>
        <span style={{ fontSize:"22px",fontWeight:"800",color:"var(--accent)" }}>MindOS</span>
      </Link>
      {streak!==null&&(
        <div style={{ display:"flex",alignItems:"center",gap:"8px",background:"var(--amber-light)",borderRadius:"12px",padding:"10px 12px",marginBottom:xp!==null?"6px":"16px" }}>
          <Flame size={16} color={streak>=7?"#EF4444":"#F59E0B"}/>
          <div><p style={{ fontSize:"11px",color:"var(--text-2)",margin:0 }}>{name}</p><p style={{ fontSize:"14px",fontWeight:"700",color:"var(--text-1)",margin:0,fontFamily:"monospace" }}>{streak} kun streak</p></div>
        </div>
      )}
      {xp!==null&&(
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 4px",marginBottom:"16px",fontSize:"11px",color:"var(--text-2)",fontFamily:"monospace" }}>
          <span>⭐ {xp} XP</span>
          <span>Level {level}</span>
        </div>
      )}
      <nav style={{ flex:1,display:"flex",flexDirection:"column",gap:"2px" }}>
        {NAV.map(({href,label,icon:Icon})=>{
          const active=pathname===href;
          return (
            <Link key={href} href={href} style={{ display:"flex",alignItems:"center",gap:"12px",padding:"10px 12px",borderRadius:"12px",textDecoration:"none",fontSize:"14px",fontWeight:"500",transition:"all 0.15s",background:active?"var(--accent)":"transparent",color:active?"#fff":"var(--text-2)" }}>
              <Icon size={18}/>{label}
            </Link>
          );
        })}
        {isAdmin && (
          <Link href="/admin" style={{ display:"flex",alignItems:"center",gap:"12px",padding:"10px 12px",borderRadius:"12px",textDecoration:"none",fontSize:"14px",fontWeight:"500",transition:"all 0.15s",background:pathname==="/admin"?"var(--accent)":"transparent",color:pathname==="/admin"?"#fff":"var(--text-2)" }}>
            <ShieldCheck size={18}/>Admin
          </Link>
        )}
      </nav>
      <button onClick={toggle} style={{ display:"flex",alignItems:"center",gap:"12px",padding:"10px 12px",borderRadius:"12px",border:"none",background:"transparent",cursor:"pointer",fontSize:"14px",fontWeight:"500",color:"var(--text-2)",width:"100%",marginBottom:"4px" }}>
        {theme==="dark"?<Sun size={18}/>:<Moon size={18}/>}
        {theme==="dark"?"Yorug' rejim":"Qora rejim"}
      </button>
      <button onClick={logout} style={{ display:"flex",alignItems:"center",gap:"12px",padding:"10px 12px",borderRadius:"12px",border:"none",background:"transparent",cursor:"pointer",fontSize:"14px",fontWeight:"500",color:"var(--text-3)",width:"100%" }}>
        <LogOut size={18}/>Chiqish
      </button>
      </aside>
    </>
  );
}
