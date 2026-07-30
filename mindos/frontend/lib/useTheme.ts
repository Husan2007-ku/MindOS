"use client";
import { useEffect, useState } from "react";
export type Theme = "light" | "dark";
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("light");
  useEffect(() => {
    const saved = (localStorage.getItem("mindos_theme") || "light") as Theme;
    apply(saved); setThemeState(saved);
  }, []);
  function apply(t: Theme) {
    if (t === "dark") document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme");
  }
  function setTheme(t: Theme) { apply(t); setThemeState(t); localStorage.setItem("mindos_theme", t); }
  function toggle() { setTheme(theme === "light" ? "dark" : "light"); }
  return { theme, setTheme, toggle };
}
