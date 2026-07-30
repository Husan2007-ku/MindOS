"use client";

import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import MermaidDiagram from "./MermaidDiagram";
import clsx from "clsx";

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  messageType?: string;
}

export default function MessageBubble({ role, content, messageType }: MessageBubbleProps) {
  const isUser = role === "user";

  // Mermaid blokini ajratib olish (TZ 5.2: AI flowchart/diagram kodi avtomatik render bo'ladi)
  const mermaidMatch = content.match(/```mermaid\n([\s\S]*?)```/);
  const mermaidCode = mermaidMatch?.[1];
  const textWithoutMermaid = mermaidMatch
    ? content.replace(mermaidMatch[0], "").trim()
    : content;

  return (
    <div className={clsx("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={clsx(
          "max-w-[85%] rounded-2xl px-4 py-3",
          isUser
            ? "bg-deep-900 text-paper-50"
            : "bg-white border border-deep-100 text-ink-900"
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{content}</p>
        ) : (
          <>
            <div className="prose-mentor">
              <ReactMarkdown rehypePlugins={[rehypeHighlight]}>
                {textWithoutMermaid || "..."}
              </ReactMarkdown>
            </div>
            {mermaidCode && <MermaidDiagram code={mermaidCode} />}
          </>
        )}
      </div>
    </div>
  );
}
