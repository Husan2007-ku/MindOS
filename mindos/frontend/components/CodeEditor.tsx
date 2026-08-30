"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { ChevronDown } from "lucide-react";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex h-40 items-center justify-center text-sm text-ink-400">
      Muharrir yuklanmoqda...
    </div>
  ),
});

const LANGUAGES = [
  { value: "python", label: "Python" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "java", label: "Java" },
  { value: "cpp", label: "C++" },
  { value: "csharp", label: "C#" },
  { value: "go", label: "Go" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
  { value: "sql", label: "SQL" },
  { value: "plaintext", label: "Oddiy matn" },
];

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language: string;
  onLanguageChange: (lang: string) => void;
  placeholder?: string;
}

export default function CodeEditor({
  value,
  onChange,
  language,
  onLanguageChange,
  placeholder,
}: CodeEditorProps) {
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const currentLang = LANGUAGES.find((l) => l.value === language) || LANGUAGES[0];

  return (
    <div className="overflow-hidden rounded-xl border border-deep-100" style={{ background: "var(--input-bg, #1e1e1e)" }}>
      {/* Til tanlash panel */}
      <div className="flex items-center justify-between border-b border-deep-100/20 bg-deep-950 px-3 py-1.5">
        <div className="relative">
          <button
            onClick={() => setLangMenuOpen(!langMenuOpen)}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-deep-100 hover:bg-white/10"
          >
            {currentLang.label}
            <ChevronDown size={12} />
          </button>
          {langMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setLangMenuOpen(false)}
              />
              <div className="absolute left-0 top-full z-20 mt-1 max-h-60 w-40 overflow-y-auto rounded-lg border border-deep-700 bg-deep-900 py-1 shadow-lg">
                {LANGUAGES.map((lang) => (
                  <button
                    key={lang.value}
                    onClick={() => {
                      onLanguageChange(lang.value);
                      setLangMenuOpen(false);
                    }}
                    className={`block w-full px-3 py-1.5 text-left text-xs hover:bg-white/10 ${
                      lang.value === language ? "text-amber-400" : "text-deep-100"
                    }`}
                  >
                    {lang.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <span className="text-[10px] text-deep-300">Kod muharrir</span>
      </div>

      {/* Monaco Editor */}
      <MonacoEditor
        height="180px"
        language={language}
        value={value}
        onChange={(val) => onChange(val || "")}
        theme="vs-dark"
        options={{
          minimap: { enabled: false },
          fontSize: 13,
          lineNumbers: "on",
          scrollBeyondLastLine: false,
          padding: { top: 12, bottom: 12 },
          wordWrap: "on",
          tabSize: 4,
          automaticLayout: true,
          renderLineHighlight: "none",
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          scrollbar: { vertical: "auto", horizontal: "auto" },
        }}
      />
    </div>
  );
}
