"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { apiGet, apiPost } from "@/lib/api";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { RotateCcw, PartyPopper, Brain, WifiOff, RefreshCw } from "lucide-react";

interface Item { id:number; front:string; back:string; }
interface PendingReview { itemId: number; quality: number; queuedAt: number; }

const Q = [
  {value:1,label:"Unutdim",bg:"#FEE2E2",color:"#991B1B"},
  {value:3,label:"Qiyin",bg:"#FEF3C7",color:"#92400E"},
  {value:4,label:"Yaxshi",bg:"#DBEAFE",color:"#1E40AF"},
  {value:5,label:"Oson",bg:"#DCFCE7",color:"#166534"},
];

// Offline-first spaced repetition (TZ'dan tashqari qo'shilgan funksiya).
// Internet uzilgan joyda ham kunlik takrorlash davom etadi: oxirgi yuklangan
// kartochkalar localStorage'da saqlanadi, javoblar esa navbatga qo'yiladi va
// internet qaytganda avtomatik yuboriladi.
const CACHE_KEY = "mindos_sr_cache_v1";
const QUEUE_KEY = "mindos_sr_pending_reviews_v1";

function loadCachedItems(): Item[] {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "[]"); } catch { return []; }
}
function saveCachedItems(items: Item[]) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(items)); } catch {}
}
function loadQueue(): PendingReview[] {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); } catch { return []; }
}
function saveQueue(q: PendingReview[]) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch {}
}

export default function SpacedRepPage() {
  const { checking } = useRequireAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (checking) return;

    async function loadItems() {
      try {
        const d = await apiGet("/spaced-repetition/due");
        setItems(d.items || []);
        saveCachedItems(d.items || []);
        setOffline(false);
      } catch {
        // Tarmoq yo'q — oxirgi keshlangan kartochkalarni ko'rsatamiz
        setItems(loadCachedItems());
        setOffline(true);
      } finally {
        setLoading(false);
      }
    }
    loadItems();
    setPendingCount(loadQueue().length);

    function handleOnline() { flushQueue(); loadItems(); }
    function handleOffline() { setOffline(true); }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    if (!navigator.onLine) setOffline(true); else flushQueue();
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking]);

  async function flushQueue() {
    const queue = loadQueue();
    if (queue.length === 0) return;
    const remaining: PendingReview[] = [];
    for (const q of queue) {
      try {
        await apiPost(`/spaced-repetition/${q.itemId}/review`, { quality: q.quality });
      } catch {
        remaining.push(q); // hali ham muvaffaqiyatsiz — navbatda qoldiramiz
      }
    }
    saveQueue(remaining);
    setPendingCount(remaining.length);
  }

  if (checking||loading) return <div className="flex h-screen items-center justify-center bg-paper-100"><div className="h-10 w-10 animate-spin rounded-full border-4 border-deep-100 border-t-deep-900"/></div>;

  const current=items[idx], done=idx>=items.length;

  async function review(quality: number) {
    if(!current) return;
    setReviewing(true);
    if (navigator.onLine) {
      try {
        await apiPost(`/spaced-repetition/${current.id}/review`,{quality});
      } catch {
        // So'nggi lahzada uzildi — navbatga qo'yamiz
        const q = loadQueue(); q.push({ itemId: current.id, quality, queuedAt: Date.now() });
        saveQueue(q); setPendingCount(q.length);
      }
    } else {
      const q = loadQueue(); q.push({ itemId: current.id, quality, queuedAt: Date.now() });
      saveQueue(q); setPendingCount(q.length);
    }
    setFlipped(false); setIdx(i=>i+1); setReviewing(false);
  }

  return (
    <div className="flex min-h-screen bg-paper-100">
      <Sidebar/>
      <main className="flex flex-1 flex-col items-center justify-center px-8 py-8">
        {(offline || pendingCount > 0) && (
          <div className="mb-4 flex w-full max-w-lg items-center gap-2 rounded-xl border border-amber-300 bg-amber-100 px-4 py-2.5 text-xs font-medium text-amber-800">
            {offline ? <WifiOff size={14}/> : <RefreshCw size={14}/>}
            {offline
              ? "Offline rejim — oxirgi yuklangan kartochkalar ko'rsatilmoqda. Javoblaringiz internet qaytganda yuboriladi."
              : `${pendingCount} ta javob sinxronlanmoqda...`}
          </div>
        )}
        {items.length===0||done?(
          <div className="rounded-3xl bg-white border border-deep-100 p-12 text-center shadow-sm max-w-md">
            <PartyPopper size={48} className="mx-auto text-amber-500 mb-4"/>
            <h2 className="font-display text-2xl font-bold text-deep-950">{items.length===0?"Bugun takrorlash yo'q!":"Barakalla! 🎉"}</h2>
            <p className="mt-2 text-ink-500">{items.length===0?"Barcha bilimlar mustahkamlangan.":`${items.length} ta kartochka ko'rib chiqildi!`}</p>
          </div>
        ):(
          <div className="w-full max-w-lg">
            <div className="mb-4 flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm text-ink-500"><Brain size={16} className="text-deep-700"/><span>{idx+1}/{items.length}</span></div>
              <div className="h-2 flex-1 rounded-full bg-deep-100"><div className="h-2 rounded-full bg-deep-900 transition-all" style={{width:`${(idx/items.length)*100}%`}}/></div>
            </div>
            <button onClick={()=>setFlipped(!flipped)} className="w-full">
              <div className="min-h-64 rounded-3xl border-2 border-deep-100 bg-white p-10 text-center shadow-lg hover:shadow-xl transition-all hover:border-deep-300 cursor-pointer">
                <p className="mb-3 font-mono text-xs uppercase tracking-widest text-ink-300">{flipped?"Javob":"Savol"}</p>
                <p className="font-display text-xl font-semibold text-deep-950 leading-relaxed">{flipped?current.back:current.front}</p>
                {!flipped&&<p className="mt-6 flex items-center justify-center gap-1.5 text-sm text-ink-300"><RotateCcw size={14}/>Javobni ko'rish uchun bosing</p>}
              </div>
            </button>
            {flipped&&(
              <div className="mt-4 grid grid-cols-4 gap-2">
                {Q.map(q=>(
                  <button key={q.value} onClick={()=>review(q.value)} disabled={reviewing}
                    className="rounded-xl py-3 text-sm font-semibold transition-all hover:scale-105 disabled:opacity-50"
                    style={{background:q.bg,color:q.color}}>
                    {q.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
