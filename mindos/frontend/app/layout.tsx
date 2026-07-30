import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title:"MindOS — O'rgan. Esla. O's.", description:"AI mentor platformasi" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uz">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
        <script dangerouslySetInnerHTML={{ __html:`(function(){try{var t=localStorage.getItem('mindos_theme');if(t==='dark')document.documentElement.setAttribute('data-theme','dark');}catch(e){}})();` }} />
      </head>
      <body style={{ margin:0, fontFamily:"'Inter',-apple-system,sans-serif" }}>{children}</body>
    </html>
  );
}
