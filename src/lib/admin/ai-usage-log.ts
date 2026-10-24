import { getServiceClient } from "@/lib/supabase/service-client";
import type { UsageSummary } from "@/lib/llm/usage";

// ai_usage_log(마이그레이션 0018)에 AI 요청 한 건을 남긴다. 표가 아직 없으면 조용히 건너뛴다(로그 한 번만).
// 사용자 응답을 늦추지 않도록 시간 제한을 두고, 어떤 실패도 요청 자체에는 영향을 주지 않는다.
// 서버리스는 응답 뒤 비동기 작업을 보장하지 않으므로 기다리되(최대 1.5초) 던지지는 않는다.
const WRITE_TIMEOUT_MS = 1500;
let missingUntil = 0;

/** 어떤 요청을 남길지: AI 호출이 있었거나, 서버 오류이거나, 횟수 제한(429)에 걸린 요청. 입력 오류(400)·미인증(401)은 잡음이라 뺀다. */
export function shouldRecord(summary: Pick<UsageSummary, "calls">, status: number, threw: boolean): boolean {
  return summary.calls > 0 || threw || status >= 500 || status === 429;
}

export async function recordAiUsage(info: { name: string; summary: UsageSummary; status: number; threw: boolean }): Promise<void> {
  if (Date.now() < missingUntil) return;
  if (!shouldRecord(info.summary, info.status, info.threw)) return;
  const { summary } = info;
  try {
    const insert = getServiceClient()
      .from("ai_usage_log")
      .insert({
        route: info.name,
        status: info.status,
        ok: !info.threw && info.status < 500,
        models: summary.models.join(",") || null,
        calls: summary.calls,
        failed_calls: summary.failedCalls,
        search_calls: summary.searchCalls,
        input_tokens: summary.inputTokens,
        output_tokens: summary.outputTokens,
        cost_usd: summary.estimatedCostUsd,
        wall_ms: Math.round(summary.wallMs),
      })
      .then(({ error }) => error);
    const error = await Promise.race([insert, new Promise<null>((resolve) => setTimeout(() => resolve(null), WRITE_TIMEOUT_MS))]);
    if (error) {
      const code = (error as { code?: string }).code;
      if (code === "42P01" || code === "PGRST205") {
        missingUntil = Date.now() + 10 * 60 * 1000; // 표가 아직 없다 — 10분 동안 다시 시도하지 않는다
        console.warn("[ai-usage-log] ai_usage_log 표가 없어 기록을 건너뜁니다(마이그레이션 0018 미적용).");
      } else {
        console.error("[ai-usage-log] 기록 실패", code ?? "unknown");
      }
    }
  } catch {
    /* 기록은 부가 기능 — 무시 */
  }
}
