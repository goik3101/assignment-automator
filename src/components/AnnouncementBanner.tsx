"use client";

import { useEffect, useState } from "react";

/** 메인 화면 오른쪽 아래 구석에 뜨는 공지 한 줄 — 관리자가 글을 올리면
 * 보이고, 삭제하면 다음 로드부터 자연스럽게 사라진다(별도 "숨김" 상태
 * 없이 서버에 남은 최신 글 유무만 그대로 반영). */
export default function AnnouncementBanner() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/announcements/latest")
      .then((res) => res.json())
      .then((data) => setMessage(data.announcement?.message ?? null))
      .catch(() => setMessage(null));
  }, []);

  if (!message) return null;

  return (
    <div className="fixed bottom-4 right-4 z-40 max-w-xs rounded-2xl border border-accent/30 bg-surface p-3 text-xs shadow-lg">
      <p className="mb-1 font-medium text-accent">공지</p>
      <p className="whitespace-pre-wrap text-foreground">{message}</p>
    </div>
  );
}
