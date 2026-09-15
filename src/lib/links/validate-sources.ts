import { getServiceClient } from "@/lib/supabase/service-client";
import type { SourceRef } from "@/types/task";

const TIMEOUT_MS = 5000;

interface CheckResult {
  valid: boolean;
  /** 리다이렉트를 다 따라간 뒤의 최종 URL. 실패하면 원래 URL 그대로. */
  finalUrl: string;
}

// 라에네크 결과물 감사(2026-09-16)에서 실제로 재확인된 문제: 죽었거나 만료된
// 도메인이 HTTP 200으로 응답하면서 내용은 없는 "오류/주차 페이지"인 경우가
// 있다(예: se-cu.com/ndsoft/error.html — 방정환 감사 때도 같은 도메인이
// 두 번 다른 제목으로 나타남). HTTP 상태만 보면 "연결됨"으로 통과하지만
// 실제로는 학생에게 보여줄 내용이 없는 페이지다. URL 경로만으로 먼저
// 걸러내는 값싼 1차 필터.
const JUNK_URL_PATTERN = /\/(error|404|not[-_]?found)(\.\w+)?(\?|$)|\/(search|signin|login)(\?|$)/i;

// 위 URL 패턴을 피해가는 오류 페이지(경로에 "error"가 없는 경우)까지 잡기
// 위한 2차 필터 — 응답 본문에서 태그를 대충 걷어낸 뒤 실제 글자 수가 너무
// 적거나(빈 페이지·주차 페이지 특징), 흔한 오류 문구가 있으면 무효로 본다.
// 완벽한 본문 파서가 아니라 "명백한 오류 페이지"만 걸러내는 값싼 휴리스틱이다.
const ERROR_PAGE_PHRASE_PATTERN =
  /페이지를\s*찾을\s*수\s*없습니다|요청하신\s*페이지가\s*존재하지\s*않습니다|존재하지\s*않는\s*페이지|page\s*not\s*found|404\s*error|this\s*domain\s*(may\s*be\s*for\s*sale|is\s*parked)/i;
const MIN_BODY_TEXT_LENGTH = 80;

function looksLikeJunkPage(finalUrl: string, bodyText: string): boolean {
  if (JUNK_URL_PATTERN.test(finalUrl)) return true;
  const visibleText = bodyText
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (ERROR_PAGE_PHRASE_PATTERN.test(visibleText.slice(0, 3000))) return true;
  return visibleText.length < MIN_BODY_TEXT_LENGTH;
}

async function checkUrl(url: string): Promise<CheckResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    // HEAD를 우선 시도 (더 가볍다). 일부 서버는 HEAD를 막아두므로 실패하면 GET으로 재시도.
    let res = await fetch(url, { method: "HEAD", signal: controller.signal, redirect: "follow" });
    let haveBody = false;
    if (res.status >= 400) {
      res = await fetch(url, { method: "GET", signal: controller.signal, redirect: "follow" });
      haveBody = true;
    }
    // Gemini 검색 그라운딩이 주는 URL은 vertexaisearch.cloud.google.com의 리다이렉트
    // 링크다 — 학생에게는 실제 도착 사이트 주소를 보여줘야 하므로 리다이렉트를 다
    // 따라간 뒤의 최종 URL(res.url)을 쓴다.
    let finalUrl = res.url || url;
    if (res.status >= 400) return { valid: false, finalUrl };

    // HTTP 상태는 정상이어도 내용이 없는 오류/주차 페이지일 수 있으므로, 본문을
    // 확인한다(HEAD로 끝났으면 body가 없으니 GET을 한 번 더 호출; 위에서 이미
    // GET을 했으면 그 응답을 재사용). 같은 컨트롤러(같은 5초 예산) 안에서 처리 —
    // 느린 페이지는 어차피 타임아웃으로 invalid 처리되던 기존 동작과 동일하다.
    try {
      const bodyRes = haveBody ? res : await fetch(url, { method: "GET", signal: controller.signal, redirect: "follow" });
      finalUrl = bodyRes.url || finalUrl;
      const bodyText = await bodyRes.text();
      if (looksLikeJunkPage(finalUrl, bodyText)) {
        return { valid: false, finalUrl };
      }
      return { valid: true, finalUrl };
    } catch {
      // 본문 확인 자체가 실패해도(느린 서버 등) 이미 HEAD/GET으로 상태 코드는
      // 정상 확인했으니 기존처럼 valid로 처리한다 — 과도하게 엄격해지지 않게.
      return { valid: true, finalUrl };
    }
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
