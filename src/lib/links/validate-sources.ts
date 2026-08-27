import { getServiceClient } from "@/lib/supabase/service-client";
import type { SourceRef } from "@/types/task";

const TIMEOUT_MS = 5000;

interface CheckResult {
  valid: boolean;
  /** 리다이렉트를 다 따라간 뒤의 최종 URL. 실패하면 원래 URL 그대로. */
  finalUrl: string;
}

async function checkUrl(url: string): Promise<CheckResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    // HEAD를 우선 시도 (더 가볍다). 일부 서버는 HEAD를 막아두므로 실패하면 GET으로 재시도.
    let res = await fetch(url, { method: "HEAD", signal: controller.signal, redirect: "follow" });
    if (res.status >= 400) {
      res = await fetch(url, { method: "GET", signal: controller.signal, redirect: "follow" });
    }
    // Gemini 검색 그라운딩이 주는 URL은 vertexaisearch.cloud.google.com의 리다이렉트
    // 링크다 — 학생에게는 실제 도착 사이트 주소를 보여줘야 하므로 리다이렉트를 다
    // 따라간 뒤의 최종 URL(res.url)을 쓴다.
    return { valid: res.status < 400, finalUrl: res.url || url };
  } catch {
    return { valid: false, finalUrl: url };
  } finally {
    clearTimeout(timer);
  }
}

/** 관리자 대시보드의 "출처 링크 유효성 검증 실패율" 지표용 로그. 실패해도 검증
 * 자체는 계속 진행해야 하므로 조용히 무시한다 (Supabase 미설정인 M1 단계 포함). */
async function logValidations(results: { valid: boolean }[]): Promise<void> {
  try {
    const supabase = getServiceClient();
    const rows = results.map((r) => ({ valid: r.valid }));
    const { error } = await supabase.from("source_validations").insert(rows);
    if (error) console.error("[validateSources] 통계 로그 실패", error);
  } catch {
    // Supabase 미설정 등 — 통계는 부가 기능이라 무시.
  }
}

/**
 * 출처 링크들의 HTTP 상태를 병렬로 검증한다 (N6). url_valid를 채우고,
 * url도 구글 그라운딩 리다이렉트 주소 대신 최종 도착 주소로 바꿔서 반환한다.
 */
export async function validateSources(sources: SourceRef[]): Promise<SourceRef[]> {
  const checks = await Promise.all(sources.map((s) => checkUrl(s.url)));
  if (checks.length > 0) void logValidations(checks);
  return sources.map((s, i) => ({ ...s, url_valid: checks[i].valid, url: checks[i].finalUrl }));
}
