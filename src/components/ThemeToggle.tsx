"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "studed-theme";

function getSystemTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** 라이트/다크 수동 토글. 설정 페이지에서 사용. layout.tsx의 인라인 스크립트가
 * hydration 전에 이미 data-theme를 반영해뒀으므로, 여기서는 그 값을 읽어와
 * 버튼 상태만 맞춘다. */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    Promise.resolve().then(() => {
      const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
      setTheme(stored ?? getSystemTheme());
    });
  }, []);

  function toggle() {
    const next: Theme = (theme ?? getSystemTheme()) === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.setAttribute("data-theme", next);
  }

  if (theme === null) return null; // hydration 전 깜빡임 방지 — 값 정해지면 바로 렌더

  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium">화면 테마</p>
        <p className="text-xs text-muted">{theme === "dark" ? "다크 모드" : "라이트 모드"}</p>
      </div>
      <button
        onClick={toggle}
        aria-label={theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"}
        title={theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"}
        className="flex items-center gap-2 rounded-full border border-border px-3 py-2 text-sm text-foreground transition-colors hover:bg-background"
      >
        <span className="shrink-0">
          {theme === "dark" ? (
            <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
              <circle cx="10" cy="10" r="4" stroke="currentColor" strokeWidth="1.6" />
              <path
                d="M10 2v1.6M10 16.4V18M18 10h-1.6M3.6 10H2M15.5 4.5l-1.1 1.1M5.6 14.4l-1.1 1.1M15.5 15.5l-1.1-1.1M5.6 5.6 4.5 4.5"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          ) : (
            <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
              <path
                d="M17 11.2A7 7 0 1 1 8.8 3a5.6 5.6 0 0 0 8.2 8.2Z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </span>
        <span>{theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"}</span>
      </button>
    </div>
  );
}
