"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getAccessToken } from "@/lib/api";
import { Check, ArrowRight, Zap, Shield, Star, Brain, Repeat2, Mic, MessageCircle } from "lucide-react";

export default function LandingPage() {
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (getAccessToken()) router.replace("/dashboard");
  }, [router]);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <main style={{ minHeight:"100vh", background:"#FAF8F4", overflow:"hidden" }}>
      {/* Navbar */}
      <nav style={{ position:"fixed", top:0, left:0, right:0, zIndex:50, padding:"16px 24px", display:"flex", alignItems:"center", justifyContent:"space-between", background:scrolled?"rgba(255,255,255,0.95)":"transparent", backdropFilter:scrolled?"blur(10px)":"none", boxShadow:scrolled?"0 1px 12px rgba(0,0,0,0.08)":"none", transition:"all 0.3s", maxWidth:"1200px", margin:"0 auto" }}>
        <span style={{ fontSize:"24px", fontWeight:"800", color:"#0F2942" }}>MindOS</span>
        <div style={{ display:"flex", gap:"12px", alignItems:"center" }}>
          <Link href="/login" style={{ padding:"8px 16px", fontSize:"14px", fontWeight:"500", color:"#3D3A33", textDecoration:"none" }}>Kirish</Link>
          <Link href="/register" style={{ padding:"10px 20px", background:"#0F2942", color:"white", borderRadius:"12px", fontSize:"14px", fontWeight:"600", textDecoration:"none", display:"flex", alignItems:"center", gap:"6px" }}>
            Boshlash <ArrowRight size={15} />
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ maxWidth:"1200px", margin:"0 auto" }} className="pt-24 pb-16 px-4 md:pt-[120px] md:pb-20 md:px-6">
        <div className="grid grid-cols-1 md:grid-cols-2 items-center gap-10 md:gap-[60px]">
          <div>
            <div style={{ display:"inline-flex", alignItems:"center", gap:"8px", background:"#FEF3C7", border:"1px solid #FCD34D", borderRadius:"100px", padding:"6px 16px", fontSize:"13px", fontWeight:"600", color:"#92400E", marginBottom:"24px" }}>
              <Zap size={14} color="#D97706" /> Ebbinghaus, 1885 — 140 yillik ilmiy fakt
            </div>
            <h1 style={{ fontSize:"clamp(40px,5vw,64px)", fontWeight:"800", color:"#0F2942", lineHeight:"1.1", marginBottom:"24px" }}>
              O'rgan. <span style={{ color:"#D4A024" }}>Esla.</span> O's.
            </h1>
            <p style={{ fontSize:"18px", color:"#6B675D", lineHeight:"1.7", marginBottom:"36px", maxWidth:"480px" }}>
              Har bir o'quvchining cho'ntagidagi shaxsiy AI mentori. Sokratik usulda o'qitadi, unutishdan oldin eslatadi va siz bilan birga o'sadi.
            </p>
            <div style={{ display:"flex", flexWrap:"wrap", alignItems:"center", gap:"16px", marginBottom:"32px" }}>
              <Link href="/register" style={{ display:"flex", alignItems:"center", gap:"8px", padding:"16px 32px", background:"#0F2942", color:"white", borderRadius:"14px", fontSize:"16px", fontWeight:"700", textDecoration:"none", boxShadow:"0 8px 24px rgba(15,41,66,0.3)" }}>
                Bepul boshlash <ArrowRight size={18} />
              </Link>
              <div style={{ display:"flex", alignItems:"center", gap:"6px", fontSize:"13px", color:"#6B675D" }}>
                <Shield size={14} color="#22c55e" /> Kredit karta shart emas
              </div>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
              <Star size={14} color="#D4A024" />
              <span style={{ fontSize:"13px", color:"#6B675D" }}>Erta kirish bosqichida — <strong style={{ color:"#0F2942" }}>birinchi foydalanuvchilardan bo'ling</strong></span>
            </div>
          </div>

          {/* Forgetting curve card */}
          <div style={{ background:"white", borderRadius:"24px", padding:"32px", boxShadow:"0 20px 60px rgba(0,0,0,0.1)", border:"1px solid #F0ECE3" }}>
            <p style={{ fontSize:"11px", fontFamily:"monospace", textTransform:"uppercase", letterSpacing:"2px", color:"#A8A398", marginBottom:"8px" }}>Unutish egri chizig'i</p>
            <h3 style={{ fontSize:"16px", fontWeight:"600", color:"#0F2942", marginBottom:"20px" }}>Bilim qanday yo'qoladi — va MindOS nima qiladi</h3>
            <svg viewBox="0 0 420 200" style={{ width:"100%" }}>
              <line x1="40" y1="20" x2="40" y2="170" stroke="#E5DFD3" strokeWidth="1" />
              <line x1="40" y1="170" x2="400" y2="170" stroke="#E5DFD3" strokeWidth="1" />
              {[0,25,50,75,100].map((v,i)=>(
                <text key={v} x="32" y={170-(v/100)*150+4} textAnchor="end" fontSize="10" fill="#A8A398" fontFamily="monospace">{v}%</text>
              ))}
              {["Bugun","1 hafta","1 oy"].map((l,i)=>(
                <text key={l} x={40+i*180} y="186" fontSize="10" fill="#A8A398" fontFamily="monospace">{l}</text>
              ))}
              <path d="M 40,20 C 80,65 100,110 130,135 C 190,165 290,168 400,170" fill="none" stroke="#E8C168" strokeWidth="2.5" strokeDasharray="6,3" opacity="0.7"/>
              <path d="M 40,20 C 60,50 80,85 100,105 L 100,58 C 130,78 155,98 170,108 L 170,52 C 210,70 240,84 260,94 L 260,35 C 305,52 345,64 390,72" fill="none" stroke="#D4A024" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
              {[100,170,260,390].map((x,i)=>(
                <circle key={x} cx={x} cy={[58,52,35,72][i]} r="5" fill="#D4A024" stroke="white" strokeWidth="2"/>
              ))}
              <text x="310" y="162" fontSize="11" fill="#C2A48A">Oddiy</text>
              <text x="310" y="55" fontSize="11" fill="#B0801A" fontWeight="700">MindOS</text>
            </svg>
            <p style={{ fontSize:"12px", color:"#A8A398", textAlign:"center", marginTop:"12px", fontFamily:"monospace" }}>Har nuqta — to'g'ri vaqtda kelgan eslatma</p>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section style={{ background:"#0F2942", padding:"64px 24px" }}>
        <div style={{ maxWidth:"1200px", margin:"0 auto", textAlign:"center" }} className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          {[
            { value:"3", label:"AI agent: Mentor, Curriculum, Code" },
            { value:"SM-2", label:"Ilmiy spaced-repetition algoritmi" },
            { value:"24/7", label:"Telegram orqali mavjud" },
          ].map(({value,label})=>(
            <div key={label}>
              <div style={{ fontSize:"48px", fontWeight:"800", color:"#D4A024", fontFamily:"monospace" }}>{value}</div>
              <div style={{ fontSize:"16px", color:"#8BA4BC", marginTop:"8px" }}>{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section style={{ padding:"80px 24px", maxWidth:"1200px", margin:"0 auto" }}>
        <div style={{ textAlign:"center", marginBottom:"60px" }}>
          <h2 style={{ fontSize:"40px", fontWeight:"800", color:"#0F2942", marginBottom:"16px" }}>Oddiy kursdan farqi nima?</h2>
          <p style={{ fontSize:"18px", color:"#6B675D", maxWidth:"500px", margin:"0 auto" }}>MindOS — shunchaki video darslar emas. U sizni o'ylatadi, eslatadi va kuzatib boradi.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {[
            { icon:"🧠", title:"Shaxsiy reja", text:"Maqsad va darajangizga mos 8-16 haftalik o'quv reja" },
            { icon:"💬", title:"Sokratik mentor", text:"AI javob bermaydi — o'ylashga undaydi. Bilim chuqurlashadi." },
            { icon:"🔄", title:"SM-2 algoritm", text:"Anki kabi spaced repetition — to'g'ri vaqtda eslatadi" },
            { icon:"🎤", title:"Ovoz bilan", text:"Yozish shart emas — gapirib o'rganing (Pro)" },
          ].map(({icon,title,text})=>(
            <div key={title} style={{ background:"white", border:"1px solid #E5DFD3", borderRadius:"20px", padding:"24px", transition:"all 0.3s" }}>
              <div style={{ fontSize:"32px", marginBottom:"16px" }}>{icon}</div>
              <h3 style={{ fontSize:"16px", fontWeight:"700", color:"#0F2942", marginBottom:"8px" }}>{title}</h3>
              <p style={{ fontSize:"14px", color:"#6B675D", lineHeight:"1.6" }}>{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Testimonials */}
      <section style={{ padding:"80px 24px", background:"#F5F2ED" }}>
        <div style={{ maxWidth:"1200px", margin:"0 auto" }}>
          <h2 style={{ fontSize:"36px", fontWeight:"800", color:"#0F2942", textAlign:"center", marginBottom:"48px" }}>Foydalanuvchilar nima deydi</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              { name:"Aziz T.", role:"Backend dasturchi", text:"2 oyda Python'ni o'rgandim. MindOS meni hech qachon to'g'ridan-to'g'ri javob bermadi — o'zi toptirib o'rgatti." },
              { name:"Malika R.", role:"Ingliz tili o'quvchisi", text:"30 kunlik streak! Duolingo 3 yildan beri ishlatganman, lekin MindOS 2 oyda ko'proq narsani o'rganishimga yordam berdi." },
              { name:"Jamshid K.", role:"Machine Learning", text:"Spaced repetition funksiyasi zo'r — qachon qaytarishim kerakligini o'zi biladi. Imtihonga tayyorlanishda judayam qo'l keldi." },
            ].map(({name,role,text})=>(
              <div key={name} style={{ background:"white", borderRadius:"20px", padding:"24px", border:"1px solid #E5DFD3" }}>
                <div style={{ display:"flex", gap:"4px", marginBottom:"16px" }}>
                  {[1,2,3,4,5].map(s=><span key={s} style={{ color:"#F59E0B", fontSize:"16px" }}>★</span>)}
                </div>
                <p style={{ fontSize:"14px", color:"#6B675D", lineHeight:"1.7", marginBottom:"16px" }}>"{text}"</p>
                <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
                  <div style={{ width:"36px", height:"36px", borderRadius:"50%", background:"#0F2942", display:"flex", alignItems:"center", justifyContent:"center", color:"white", fontSize:"14px", fontWeight:"700" }}>{name[0]}</div>
                  <div>
                    <div style={{ fontSize:"14px", fontWeight:"600", color:"#0F2942" }}>{name}</div>
                    <div style={{ fontSize:"12px", color:"#A8A398" }}>{role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section style={{ padding:"80px 24px", background:"#0F2942" }}>
        <div style={{ maxWidth:"900px", margin:"0 auto", textAlign:"center" }}>
          <h2 style={{ fontSize:"40px", fontWeight:"800", color:"white", marginBottom:"12px" }}>Oddiy narx. Katta natija.</h2>
          <p style={{ color:"#8BA4BC", fontSize:"16px", marginBottom:"48px" }}>7 kun bepul sinab ko'ring. Kredit karta shart emas.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              { plan:"Free", price:"$0", period:"", features:["1 curriculum","10 xabar/kun","7 kunlik Pro sinov","Spaced repetition"], highlight:false },
              { plan:"Pro", price:"$9", period:"/oy", features:["Cheksiz curriculum","Cheksiz chat","Ovoz input","Progress Agent","Telegram eslatma"], highlight:true },
              { plan:"Team", price:"$29", period:"/oy", features:["5 xodim profili","Admin dashboard","Umumiy progress","Priority support"], highlight:false },
            ].map(({plan,price,period,features,highlight})=>(
              <div key={plan} style={{ background:highlight?"#D4A024":"rgba(255,255,255,0.05)", borderRadius:"20px", padding:"32px", border:highlight?"none":"1px solid rgba(255,255,255,0.1)" }} className={highlight?"md:scale-105":""}>
                {highlight&&<div style={{ fontSize:"11px", fontWeight:"700", textTransform:"uppercase", letterSpacing:"2px", color:"#0F2942", marginBottom:"12px" }}>Eng mashhur</div>}
                <h3 style={{ fontSize:"22px", fontWeight:"700", color:highlight?"#0F2942":"white" }}>{plan}</h3>
                <div style={{ margin:"12px 0 24px" }}>
                  <span style={{ fontSize:"40px", fontWeight:"800", color:highlight?"#0F2942":"#D4A024", fontFamily:"monospace" }}>{price}</span>
                  <span style={{ fontSize:"14px", color:highlight?"#0F2942":"#8BA4BC" }}>{period}</span>
                </div>
                <ul style={{ listStyle:"none", padding:0, margin:"0 0 24px", textAlign:"left" }}>
                  {features.map(f=>(
                    <li key={f} style={{ display:"flex", alignItems:"center", gap:"8px", fontSize:"14px", color:highlight?"#0F2942":"#CBD5E1", marginBottom:"10px" }}>
                      <span style={{ color:highlight?"#0F2942":"#D4A024", fontWeight:"700" }}>✓</span> {f}
                    </li>
                  ))}
                </ul>
                <Link href="/register" style={{ display:"block", padding:"12px", background:highlight?"#0F2942":"rgba(255,255,255,0.1)", color:highlight?"white":"white", borderRadius:"12px", textDecoration:"none", fontSize:"14px", fontWeight:"700", textAlign:"center" }}>
                  {plan==="Free"?"Bepul boshlash":plan==="Pro"?"Pro boshlash":"Team boshlash"}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding:"100px 24px", textAlign:"center", background:"#FAF8F4" }}>
        <h2 style={{ fontSize:"clamp(32px,5vw,56px)", fontWeight:"800", color:"#0F2942", marginBottom:"16px" }}>
          O'rganishni boshlang.<br /><span style={{ color:"#D4A024" }}>Bu safar — unutmaysiz.</span>
        </h2>
        <p style={{ fontSize:"18px", color:"#6B675D", marginBottom:"40px" }}>O'zbekistondagi birinchi AI mentor platformasi</p>
        <Link href="/register" style={{ display:"inline-flex", alignItems:"center", gap:"8px", padding:"18px 40px", background:"#0F2942", color:"white", borderRadius:"16px", fontSize:"18px", fontWeight:"700", textDecoration:"none", boxShadow:"0 12px 40px rgba(15,41,66,0.3)" }}>
          Hoziroq boshlash <ArrowRight size={22} />
        </Link>
      </section>

      <footer style={{ borderTop:"1px solid #E5DFD3", padding:"32px 24px" }}>
        <div style={{ maxWidth:"1200px", margin:"0 auto" }} className="flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left">
          <span style={{ fontSize:"20px", fontWeight:"800", color:"#0F2942" }}>MindOS</span>
          <span style={{ fontSize:"13px", color:"#A8A398" }}>© 2025 MindOS — O'rgan. Esla. O's.</span>
          <div style={{ display:"flex", gap:"24px" }}>
            <Link href="/pricing" style={{ fontSize:"13px", color:"#6B675D", textDecoration:"none" }}>Narxlar</Link>
            <Link href="/login" style={{ fontSize:"13px", color:"#6B675D", textDecoration:"none" }}>Kirish</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
