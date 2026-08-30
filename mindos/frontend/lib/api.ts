// Production'da Vercel muhit o'zgaruvchisi orqali sozlanadi (masalan: https://api.mindos.uz/api/v1).
// Sozlanmasa — lokal development uchun localhost fallback ishlatiladi.
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000/api/v1";
// Ba'zi sahifalar to'liq domensiz endpoint (masalan "/api/v1/chat/message") bilan ishlaydi —
// ular uchun /api/v1 qismisiz "ildiz" manzil.
export const API_ROOT = API_BASE.replace(/\/api\/v1\/?$/, "");

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("mindos_access_token");
}

function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("mindos_refresh_token");
}

export function setTokens(access: string, refresh: string) {
  localStorage.setItem("mindos_access_token", access);
  localStorage.setItem("mindos_refresh_token", refresh);
}

export function clearTokens() {
  localStorage.removeItem("mindos_access_token");
  localStorage.removeItem("mindos_refresh_token");
}

async function refreshToken(): Promise<string | null> {
  const refresh = getRefreshToken();
  if (!refresh) return null;
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refresh }),
  });
  if (!res.ok) { clearTokens(); return null; }
  const data = await res.json();
  setTokens(data.access_token, data.refresh_token);
  return data.access_token;
}

interface Opts extends RequestInit { skipAuth?: boolean; }

export async function apiFetch(path: string, options: Opts = {}) {
  const { skipAuth, ...fetchOpts } = options;
  const headers = new Headers(fetchOpts.headers);
  if (!skipAuth) {
    const token = getAccessToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }
  if (fetchOpts.body && !headers.has("Content-Type") && typeof fetchOpts.body === "string") {
    headers.set("Content-Type", "application/json");
  }
  let res = await fetch(`${API_BASE}${path}`, { ...fetchOpts, headers });
  if (res.status === 401 && !skipAuth) {
    const newToken = await refreshToken();
    if (newToken) {
      headers.set("Authorization", `Bearer ${newToken}`);
      res = await fetch(`${API_BASE}${path}`, { ...fetchOpts, headers });
    }
  }
  if (!res.ok) {
    let detail = "Xatolik yuz berdi";
    try { const b = await res.json(); detail = b.detail || detail; } catch {}
    throw new ApiError(detail, res.status);
  }
  const ct = res.headers.get("content-type");
  if (ct?.includes("application/json")) return res.json();
  return res;
}

export const apiGet = (path: string, opts?: Opts) => apiFetch(path, { method: "GET", ...opts });
export const apiPost = (path: string, body?: unknown, opts?: Opts) => apiFetch(path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined, ...opts });
export const apiPut = (path: string, body?: unknown, opts?: Opts) => apiFetch(path, { method: "PUT", body: body !== undefined ? JSON.stringify(body) : undefined, ...opts });
export const apiDelete = (path: string, opts?: Opts) => apiFetch(path, { method: "DELETE", ...opts });

export { ApiError, getAccessToken, API_BASE };
