import { getServiceClient } from "@/lib/supabase/service-client";
import type { SourceRef } from "@/types/task";
import { classifySourceTier } from "./source-quality";
import { classifyFetchError, classifyHttpStatus, toUrlValid, type LinkStatus } from "./url-status";

const TIMEOUT_MS = 5000;

// 링크 확인 때 이미 받아 온 페이지 본문(태그를 걷어낸 글자만)을 잠시 들고 있다가, 문장이 인용 페이지에 실제로 있는지 대조하는 데 쓴다(claim-check.ts).
// 같은 요청 안에서 쓰고 버리는 값이라 크기와 개수를 제한한다.
const PAGE_TEXT_MAX_CHARS = 300_000;
const PAGE_TEXT_MAX_ENTRIES = 80;
const pageTextCache = new Map<string, string>();

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function rememberPageText(urls: string[], html: string): void {
  const text = htmlToText(html).slice(0, PAGE_TEXT_MAX_CHARS);
  if (text.length < 200) return;
  for (const u of urls) {
    if (pageTextCache.size >= PAGE_TEXT_MAX_ENTRIES) pageTextCache.delete(pageTextCache.keys().next().value as string);
    pageTextCache.set(u, text);
  }
}

/** 출처 검증 때 받아 둔 페이지 본문. 못 받았거나(차단·시간 초과·PDF 등) 오래돼 밀려났으면 null. */
export function getCachedPageText(url: string): string | null {
  return pageTextCache.get(url) ?? null;
}

interface CheckResult {
  status: LinkStatus;
  /** 리다이렉트를 다 따라간 뒤의 최종 URL. 실패하면 원래 URL 그대로. */
  finalUrl: string;
}

// 봇 차단(403)을 줄이려고 일반 브라우저처럼 요청한다 — 그래도 막히면 죽은 링크가 아니라 "확인 불가"로 처리한다(url-status.ts).
const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
};

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
    let res = await fetch(url, { method: "HEAD", signal: controller.signal, redirect: "follow", headers: BROWSER_HEADERS });
    let haveBody = false;
    if (res.status >= 400) {
      res = await fetch(url, { method: "GET", signal: controller.signal, redirect: "follow", headers: BROWSER_HEADERS });
      haveBody = true;
    }
    // 검색 그라운딩이 주는 URL이 리다이렉트 링크일 수 있어서(Gemini의 vertexaisearch 등) 리다이렉트를 다 따라간 최종 URL을 쓴다.
    let finalUrl = res.url || url;
    const byStatus = classifyHttpStatus(res.status);
    if (byStatus !== "valid") return { status: byStatus, finalUrl };

    // HTTP 상태는 정상이어도 내용이 없는 오류/주차 페이지일 수 있으므로 본문을 확인한다(같은 5초 예산 안에서).
    try {
      const bodyRes = haveBody ? res : await fetch(url, { method: "GET", signal: controller.signal, redirect: "follow", headers: BROWSER_HEADERS });
      finalUrl = bodyRes.url || finalUrl;
      const bodyText = await bodyRes.text();
      if (looksLikeJunkPage(finalUrl, bodyText)) return { status: "invalid", finalUrl };
      if (/html|text\//i.test(bodyRes.headers.get("content-type") ?? "")) rememberPageText([url, finalUrl], bodyText);
      return { status: "valid", finalUrl };
    } catch {
      // 본문 확인만 실패(느린 서버 등) — 상태 코드는 정상이었으니 과도하게 엄격해지지 않게 valid로 둔다.
      return { status: "valid", finalUrl };
    }
  } catch (err) {
    return { status: classifyFetchError(err), finalUrl: url };
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
  // 통계에는 확정된 결과(유효/무효)만 남긴다 — 확인 불가(403·시간 초과 등)를 실패율에 섞지 않는다.
  const definitive = checks.filter((c) => c.status !== "unverifiable").map((c) => ({ valid: c.status === "valid" }));
  if (definitive.length > 0) void logValidations(definitive);
  return sources.map((s, i) => ({
    ...s,
    url_valid: toUrlValid(checks[i].status),
    url: checks[i].finalUrl,
    tier: classifySourceTier(checks[i].finalUrl),
  }));
}
