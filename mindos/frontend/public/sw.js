// MindOS Service Worker — offline-first spaced repetition (TZ'dan tashqari qo'shildi)
//
// Maqsad: internet uzilgan/sekin joylarda (O'zbekiston qishloq hududlari kabi)
// foydalanuvchi kunlik takrorlashni (spaced repetition) davom ettira olsin.
// Faqat GET /spaced-repetition/due javobini keshlaydi (stale-while-revalidate).
// Javob yuborish (review) offline navbati esa sahifa darajasida (localStorage)
// boshqariladi — Background Sync barcha brauzerlarda qo'llab-quvvatlanmagani uchun
// bu yondashuv ancha ishonchli.

const CACHE_NAME = "mindos-sr-cache-v1";
const SR_DUE_PATH = "/api/v1/spaced-repetition/due";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || !request.url.includes(SR_DUE_PATH)) return;

  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        const copy = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return networkResponse;
      })
      .catch(() =>
        caches.match(request).then((cached) => {
          if (cached) return cached;
          return new Response(
            JSON.stringify({ items: [], total_due: 0, offline_no_cache: true }),
            { headers: { "Content-Type": "application/json" } }
          );
        })
      )
  );
});

// ─── Web Push bildirishnomalari (offline SR keshidan mustaqil) ───────────────
self.addEventListener("push", (event) => {
  let data = { title: "MindOS", body: "Yangi bildirishnoma", url: "/" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (e) {
    if (event.data) data.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon.svg",
      badge: "/icon.svg",
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
