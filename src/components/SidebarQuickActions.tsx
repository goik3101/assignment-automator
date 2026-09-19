"use client";

import Link from "next/link";

const STORAGE_KEY = "studed-theme";

// Figma 사이드바 하단의 "휴지통", "피드백/문의", "테마 변경". 테마 전환은 ThemeToggle(설정 페이지)과
// 같은 저장 키·data-theme 속성을 그대로 쓰므로 두 곳 중 어디서 바꿔도 동일하게 동작한다.
// 상태를 들고 있지 않고 클릭 시점의 data-theme를 읽어 뒤집기만 한다.
export default function SidebarQuickActions({ onNavigate }: { onNavigate?: () => void }) {
  function toggleTheme() {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // 저장소를 못 쓰는 환경에서는 이번 방문에만 적용된다.
    }
  }

  const item = "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors hover:bg-accent/10";

  return (
    <div className="mb-2 space-y-0.5">
      <Link href="/trash" onClick={onNavigate} className={item}>
        <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0">
          <path d="M4 6h12M8 6V4h4v2M6 6l.7 10h6.6L14 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        휴지통
      </Link>
      <Link href="/settings#feedback" onClick={onNavigate} className={item}>
        <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0">
          <circle cx="10" cy="10" r="7.2" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 8a2 2 0 1 1 3 1.7c-.7.4-1 .8-1 1.6M10 14v.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        피드백/문의
      </Link>
      <button onClick={toggleTheme} className={item}>
        <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0">
          <circle cx="10" cy="10" r="3.6" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M10 2v1.6M10 16.4V18M18 10h-1.6M3.6 10H2M15.5 4.5l-1.1 1.1M5.6 14.4l-1.1 1.1M15.5 15.5l-1.1-1.1M5.6 5.6 4.5 4.5"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
        테마 변경
      </button>
    </div>
  );
}
