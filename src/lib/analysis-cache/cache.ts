import { getServiceClient } from "@/lib/supabase/service-client";
import { noticeSignature, signatureSimilarity } from "./signature";

// 같은 안내문의 분석 결과를 저장해 다음 학생이 그대로 쓴다(마이그레이션 0021). ANALYSIS_CACHE=on일 때만 쓰인다(기본 꺼짐).
// 왜: 같은 사진을 분석해도 단계 수·칸 이름·개수 조건이 실행마다 달랐고(CLAUDE.md "분석 흔들림"), 그 위의 규칙 190여 개가 전부 그 구조를 읽는다.
// 같은 안내문이 같은 분석을 받으면 흔들림이 없어지고 한 번 확인한 분석을 모두가 쓰며, 분석 12~20초가 두 번째 학생부터 빠진다.
//
// 개인정보: 저장하는 것은 분석 결과(안내문에서 뽑은 조건)와 MinHash 지문(숫자 배열 — 글을 되살릴 수 없다)뿐이다.
// 분석 안의 전사 원문(notice_text)은 저장하지 않고, 재사용할 때 그 학생 자신의 전사로 채운다.
// 이 표는 service_role로만 읽고 쓴다(RLS 켜고 정책 없음). 학생 지침·주제를 넣은 분석은 캐시하지 않는다(학생마다 달라진다).

/** 같은 안내문 전사끼리는 0.81~0.99, 다른 안내문끼리는 ≤0.15였다(2026-11-16, 8종 16회 — transcribe-sim.ts). 틀에 박힌 양식 변형을 피하려 문턱을 높게 둔다. */
export const SIMILARITY_THRESHOLD = Number(process.env.ANALYSIS_CACHE_THRESHOLD ?? 0.75);
const SCAN_LIMIT = 500;

export interface CachedAnalysis {
  id: string;
  analysis: Record<string, unknown>;
  similarity: number;
}

export async function lookupAnalysis(transcript: string): Promise<{ hit: CachedAnalysis | null; sig: number[] | null }> {
  const sig = noticeSignature(transcript);
  if (!sig) return { hit: null, sig: null };
  const { data, error } = await getServiceClient().from("analysis_cache").select("id, sig, analysis").order("last_used_at", { ascending: false }).limit(SCAN_LIMIT);
  if (error || !data) return { hit: null, sig };
  let best: CachedAnalysis | null = null;
  for (const row of data as { id: string; sig: number[]; analysis: Record<string, unknown> }[]) {
    const sim = signatureSimilarity(sig, row.sig);
    if (sim >= SIMILARITY_THRESHOLD && (!best || sim > best.similarity)) best = { id: row.id, analysis: row.analysis, similarity: sim };
  }
  if (best) {
    // 사용 기록(조회수·최근 사용) — 실패해도 결과에는 영향 없다.
    // supabase 호출은 then/await 해야 실행된다(void만으로는 안 나간다).
    await getServiceClient()
      .rpc("analysis_cache_touch", { row_id: best.id })
      .then(
        () => undefined,
        () => undefined
      );
  }
  return { hit: best, sig };
}

/** 분석 결과를 저장한다. 단계가 하나도 없는 분석은 저장하지 않는다(나쁜 분석이 모두에게 퍼지지 않게). */
export async function storeAnalysis(sig: number[], analysis: Record<string, unknown>): Promise<void> {
  const core = analysis.core_task_info as { task_elements?: unknown[]; notice_text?: string } | undefined;
  if (!core?.task_elements || core.task_elements.length === 0) return;
  const { notice_text: _drop, ...coreRest } = core;
  void _drop;
  const clean = { ...analysis, core_task_info: coreRest };
  await getServiceClient().from("analysis_cache").insert({ sig, analysis: clean });
}
