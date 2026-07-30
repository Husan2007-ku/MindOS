/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Registon gumbazlari ko'k-yashili — chuqur, ishonchli
        deep: {
          50: "#EAF1F5",
          100: "#C7DBE5",
          300: "#5F93AB",
          500: "#1D4E68",
          700: "#143850",
          900: "#0F2942",
          950: "#0A1D30",
        },
        // Samarqand kahrabosi — iliq aksent
        amber: {
          100: "#F6E8C8",
          300: "#E8C168",
          500: "#D4A024",
          600: "#B0801A",
          700: "#8C6414",
        },
        // Sahifa/qog'oz foni
        paper: {
          50: "#FDFCFA",
          100: "#FAF8F4",
          200: "#F0ECE3",
        },
        ink: {
          900: "#1A1814",
          700: "#3D3A33",
          500: "#6B675D",
          300: "#A8A398",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "serif"],
        body: ["var(--font-body)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      backgroundImage: {
        "dome-pattern": "radial-gradient(circle at 50% 0%, rgba(212,160,36,0.08), transparent 60%)",
      },
      keyframes: {
        "curve-draw": {
          "0%": { strokeDashoffset: "1000" },
          "100%": { strokeDashoffset: "0" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "curve-draw": "curve-draw 2.4s ease-out forwards",
        "fade-up": "fade-up 0.6s ease-out forwards",
      },
    },
  },
  plugins: [],
};
