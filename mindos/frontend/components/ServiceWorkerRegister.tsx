"use client";
import { useEffect } from "react";

// Offline-first spaced repetition uchun service worker ro'yxatdan o'tkazish
// (TZ'dan tashqari qo'shilgan funksiya — bo'sh joyda ham kunlik takrorlash ishlashi uchun).
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Jim ketamiz — SW ishlamasa ham ilova online rejimda normal ishlayveradi
    });
  }, []);
  return null;
}
