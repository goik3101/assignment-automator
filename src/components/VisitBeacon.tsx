"use client";

import { useEffect } from "react";

// 방문 기록 신호: 브라우저 탭(세션)마다 한 번만 서버에 알린다. 응답을 기다리지 않고, 실패해도 화면에는 영향이 없다.
export default function VisitBeacon() {
  useEffect(() => {
    try {
      if (sessionStorage.getItem("studed-visit")) return;
      sessionStorage.setItem("studed-visit", "1");
      void fetch("/api/visit", { method: "POST", keepalive: true }).catch(() => {});
    } catch {
      /* 저장소를 못 쓰는 환경 — 기록하지 않는다 */
    }
  }, []);
  return null;
}
