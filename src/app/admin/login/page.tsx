"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import { Input } from "@/components/ui/input";

export default function AdminLoginPage() {
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, password }),
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
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      <Input
        type="text"
        value={id}
        onChange={(e) => setId(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        placeholder="ID"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={100}
        className="mb-3 h-11"
        autoFocus
      />
      <Input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        placeholder="비밀번호"
        autoComplete="current-password"
        maxLength={200}
        className="mb-3 h-11"
      />
      <Button variant="primary" size="lg" onClick={handleSubmit} disabled={!id || !password || loading} className="w-full">
        {loading ? "확인 중..." : "로그인"}
      </Button>
    </div>
  );
}
