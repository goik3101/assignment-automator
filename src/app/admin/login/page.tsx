"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
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
    router.push("/admin");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-sm px-6 py-24">
      <h1 className="mb-6 text-lg font-semibold tracking-tight">관리자 로그인</h1>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      <input
        type="password"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        placeholder="관리자 코드"
        className="mb-3 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
        autoFocus
      />
      <button
        onClick={handleSubmit}
        disabled={!code || loading}
        className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground disabled:opacity-40"
      >
        {loading ? "확인 중..." : "로그인"}
      </button>
    </div>
  );
}
