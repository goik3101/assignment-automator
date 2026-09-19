"use client";

import { useState } from "react";

export default function AdminLoginPage() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    setLoading(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "로그인에 실패했습니다.");
      return;
    }
    // 소프트 네비게이션(router.push)으로는 사이드바(AuthBar)가 이미 마운트
    // 시점에 한 번만 관리자 상태를 확인해둔 채라 새로고침 전까지 반영이
    // 안 된다 — 로그인 직후엔 드물게 일어나는 동작이라 그냥 완전히 새로
    // 불러와서 확실히 최신 상태로 만든다.
    window.location.href = "/admin";
  }

  return (
    <div className="mx-auto max-w-sm px-6 py-24">
      <h1 className="mb-6 text-[22px] font-bold tracking-tight">관리자 로그인</h1>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      <input
        type="password"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        placeholder="관리자 코드"
        className="mb-3 w-full rounded-full border border-border bg-surface px-3 py-2 text-sm"
        autoFocus
      />
      <button
        onClick={handleSubmit}
        disabled={!code || loading}
        className="w-full rounded-full bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground disabled:opacity-40"
      >
        {loading ? "확인 중..." : "로그인"}
      </button>
    </div>
  );
}
