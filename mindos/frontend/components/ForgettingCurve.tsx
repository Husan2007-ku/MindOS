"use client";

// MindOS signature element: Ebbinghaus unutish egri chizig'i.
// Chap egri chiziq (qizg'ish) — odatdagi unutish: 1 hafta=50%, 1 oy=20% qoladi.
// O'ng "zigzag" egri chiziq (amber) — MindOS bilan: har takrorlashda saqlanish ko'tariladi.
// Sahifa yuklanganda chiziladi (stroke-dashoffset animatsiyasi), keyin raqamlar fade-up bo'ladi.

export default function ForgettingCurve() {
  return (
    <div>
      <svg
        width="100%"
        viewBox="0 0 480 280"
        role="img"
        aria-label="Ebbinghaus unutish egri chizig'i: vaqt o'tishi bilan bilim qanday yo'qolishi va MindOS bilan qanday saqlanib qolishi"
      >
        <title>Unutish va eslab qolish solishtirmasi</title>
        <desc>
          Takrorlashsiz bilim bir oy ichida 80 foizga unutiladi. MindOS spaced repetition
          bilan har eslatishda saqlanish darajasini yuqori ushlab turadi.
        </desc>

        {/* Grid chiziqlar */}
        <line x1="40" y1="40" x2="40" y2="220" stroke="#E5DFD3" strokeWidth="1" />
        <line x1="40" y1="220" x2="440" y2="220" stroke="#E5DFD3" strokeWidth="1" />

        {/* Y o'qi belgilari */}
        <text x="30" y="44" textAnchor="end" fontSize="11" fill="#A8A398" fontFamily="var(--font-mono)">100%</text>
        <text x="30" y="132" textAnchor="end" fontSize="11" fill="#A8A398" fontFamily="var(--font-mono)">50%</text>
        <text x="30" y="222" textAnchor="end" fontSize="11" fill="#A8A398" fontFamily="var(--font-mono)">0%</text>

        {/* X o'qi belgilari */}
        <text x="40" y="238" fontSize="11" fill="#A8A398" fontFamily="var(--font-mono)">Kun 0</text>
        <text x="220" y="238" textAnchor="middle" fontSize="11" fill="#A8A398" fontFamily="var(--font-mono)">1 hafta</text>
        <text x="430" y="238" textAnchor="end" fontSize="11" fill="#A8A398" fontFamily="var(--font-mono)">1 oy</text>

        {/* Unutish egri chizig'i — takrorlashsiz */}
        <path
          d="M 40,40 C 90,90 110,140 140,165 C 200,205 320,212 440,216"
          fill="none"
          stroke="#C2A48A"
          strokeWidth="2.5"
          strokeDasharray="1000"
          className="animate-curve-draw"
        />

        {/* MindOS egri chizig'i — har takrorlashda ko'tariladi (spaced repetition) */}
        <path
          d="M 40,40 C 70,75 90,110 110,130 L 110,95 C 140,118 160,140 175,150 L 175,100 C 220,118 250,135 270,145 L 270,80 C 320,95 360,108 400,115 L 400,70 C 415,75 425,80 440,85"
          fill="none"
          stroke="#D4A024"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="1400"
          className="animate-curve-draw"
          style={{ animationDelay: "0.3s" }}
        />

        {/* Takrorlash nuqtalari */}
        {[110, 175, 270, 400].map((x, i) => (
          <circle
            key={x}
            cx={x}
            cy={[95, 100, 80, 70][i]}
            r="4"
            fill="#D4A024"
            className="animate-fade-up"
            style={{ animationDelay: `${1.6 + i * 0.15}s`, opacity: 0 }}
          />
        ))}

        {/* Yorliqlar */}
        <text x="445" y="219" fontSize="12" fill="#C2A48A" fontFamily="var(--font-body)">Oddiy o'rganish</text>
        <text x="445" y="88" fontSize="12" fill="#B0801A" fontWeight="600" fontFamily="var(--font-body)">MindOS bilan</text>
      </svg>

      <p className="mt-4 text-center font-mono text-sm text-ink-500">
        Har nuqta — to'g'ri vaqtda kelgan takrorlash eslatmasi
      </p>
    </div>
  );
}
