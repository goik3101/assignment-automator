import path from "node:path";
import { getServiceClient } from "@/lib/supabase/service-client";
import { summarizeTrace } from "@/lib/llm/usage";
import type { CallRecord } from "@/lib/llm/trace";

// 측정·테스트 스크립트의 모델 호출 전부를 ai_usage_log에 `script:<파일이름>` 한 줄로 남긴다(trace.ts의 LLM_LEDGER=script).
// 대시보드는 이 줄을 서비스 요청과 섞지 않고 "테스트·측정 비용"으로 따로 보여 준다. 마이그레이션 없음(route는 글자 칸).
// SUPABASE 환경변수가 없으면(단위 테스트) 아무것도 하지 않는다.
export const SCRIPT_ROUTE_PREFIX = "script:";

export async function flushScriptLedger(calls: CallRecord[]): Promise<void> {
  if (calls.length === 0) return;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const s = summarizeTrace({ name: "script", startedAt: Date.now(), calls });
  if (s.inputTokens + s.outputTokens === 0) return;
  const script = path.basename(process.argv[1] ?? "script").replace(/\.[a-z]+$/i, "");
  const { error } = await getServiceClient()
    .from("ai_usage_log")
    .insert({
      route: `${SCRIPT_ROUTE_PREFIX}${script}`.slice(0, 80),
      status: 200,
      ok: true,
      models: s.models.join(",") || null,
      calls: s.calls,
      failed_calls: s.failedCalls,
      search_calls: s.searchCalls,
      input_tokens: s.inputTokens,
      output_tokens: s.outputTokens,
      cost_usd: s.estimatedCostUsd,
      wall_ms: Math.round(s.sumCallMs),
    });
  if (error) console.warn("[script-ledger] 기록 실패", (error as { code?: string }).code ?? "unknown");
  else console.log(`[script-ledger] ${script}: 호출 ${s.calls}건 · 추정 $${s.estimatedCostUsd.toFixed(3)} → 대시보드 테스트 비용에 기록`);
}
