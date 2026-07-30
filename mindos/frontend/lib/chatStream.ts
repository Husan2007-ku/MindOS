// MindOS — Chat va Code Mentor uchun SSE streaming helper.
// Backend /chat/message, /chat/code, /chat/voice barchasi shu formatda javob qaytaradi:
// data: {"token": "..."}\n\n  ... data: {"done": true}\n\n  yoki data: {"error": "..."}\n\n

import { getAccessToken } from "./api";

interface StreamCallbacks {
  onToken?: (token: string) => void;
  onTranscript?: (text: string) => void; // faqat /chat/voice da keladi
  onDone?: () => void;
  onError?: (message: string) => void;
}

async function consumeStream(res: Response, callbacks: StreamCallbacks) {
  if (!res.body) {
    callbacks.onError?.("Server javob bermadi");
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const jsonStr = line.slice(6).trim();
      if (!jsonStr) continue;

      try {
        const parsed = JSON.parse(jsonStr);
        if (parsed.token) callbacks.onToken?.(parsed.token);
        if (parsed.transcript) callbacks.onTranscript?.(parsed.transcript);
        if (parsed.done) callbacks.onDone?.();
        if (parsed.error) callbacks.onError?.(parsed.error);
      } catch {
        // Tugamagan JSON qatori — keyingi chunk bilan to'liqlanadi, e'tiborsiz qoldiramiz
      }
    }
  }
}

export async function streamChatMessage(message: string, callbacks: StreamCallbacks) {
  const token = getAccessToken();
  const res = await fetch("/api/v1/chat/message", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ message }),
  });

  if (!res.ok) {
    let detail = "Xabar yuborilmadi";
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {}
    callbacks.onError?.(detail);
    return;
  }

  await consumeStream(res, callbacks);
}

export async function streamCodeMessage(message: string, code: string, callbacks: StreamCallbacks) {
  const token = getAccessToken();
  const res = await fetch("/api/v1/chat/code", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ message, code }),
  });

  if (!res.ok) {
    let detail = "Xabar yuborilmadi";
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {}
    callbacks.onError?.(detail);
    return;
  }

  await consumeStream(res, callbacks);
}

export async function streamVoiceMessage(audioBlob: Blob, filename: string, callbacks: StreamCallbacks) {
  const token = getAccessToken();
  const formData = new FormData();
  formData.append("file", audioBlob, filename);

  const res = await fetch("/api/v1/chat/voice", {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });

  if (!res.ok) {
    let detail = "Ovoz yuborilmadi";
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {}
    callbacks.onError?.(detail);
    return;
  }

  await consumeStream(res, callbacks);
}
