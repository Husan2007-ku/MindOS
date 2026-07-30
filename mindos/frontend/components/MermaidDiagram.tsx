"use client";

import { useEffect, useRef, useState } from "react";

interface MermaidDiagramProps {
  code: string;
}

let mermaidInitialized = false;

export default function MermaidDiagram({ code }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  const [svg, setSvg] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function render() {
      try {
        const mermaid = (await import("mermaid")).default;

        if (!mermaidInitialized) {
          mermaid.initialize({
            startOnLoad: false,
            theme: "base",
            themeVariables: {
              primaryColor: "#EAF1F5",
              primaryTextColor: "#0F2942",
              primaryBorderColor: "#1D4E68",
              lineColor: "#5F93AB",
              secondaryColor: "#F6E8C8",
              tertiaryColor: "#FAF8F4",
              fontFamily: "var(--font-body)",
            },
          });
          mermaidInitialized = true;
        }

        const id = `mermaid-${Math.random().toString(36).slice(2)}`;
        const { svg: renderedSvg } = await mermaid.render(id, code);
        if (!cancelled) setSvg(renderedSvg);
      } catch {
        if (!cancelled) setError(true);
      }
    }

    render();
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (error) {
    return (
      <pre className="mt-3 rounded-lg bg-deep-50 p-3 text-xs text-ink-500 overflow-x-auto">
        {code}
      </pre>
    );
  }

  return (
    <div
      ref={containerRef}
      className="mt-3 overflow-x-auto rounded-lg bg-paper-50 p-3"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
