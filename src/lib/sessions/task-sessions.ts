import type { SupabaseClient } from "@supabase/supabase-js";
import type { CoreTaskInfo } from "@/types/task";

// 다단계 수행평가 세션(예: 고민쓰기 → 책처방전 → 편지)의 단일 진실 소스.
// 반드시 세션이 실린 supabase 클라이언트(getServerSupabase())로 호출할 것 —
// user_histories와 같은 이유로 RLS(auth.uid() = user_id)가 그대로 적용돼야 한다.

export interface TaskSession {
  id: string;
  user_id: string;
  subject: string;
  core_task_info: CoreTaskInfo;
  cluster_id: string | null;
  created_at: string;
}

export interface TaskSessionStage {
  id: string;
  session_id: string;
  stage_order: number;
  stage_name: string;
  output_text: string;
  output_facts: Record<string, unknown>;
  created_at: string;
}

export async function createTaskSession(
  supabase: SupabaseClient,
  params: { userId: string; subject: string; coreTaskInfo: CoreTaskInfo; clusterId?: string }
): Promise<TaskSession> {
  const { data, error } = await supabase
    .from("task_sessions")
    .insert({
      user_id: params.userId,
      subject: params.subject,
      core_task_info: params.coreTaskInfo,
      cluster_id: params.clusterId ?? null,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(`세션 생성 실패: ${error?.message}`);
  console.log(`[task-sessions] 세션 생성됨 id=${data.id}`);
  return data as TaskSession;
}

export async function getTaskSession(
  supabase: SupabaseClient,
  sessionId: string
): Promise<TaskSession | null> {
  const { data, error } = await supabase
    .from("task_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw new Error(`세션 조회 실패: ${error.message}`);
  return data as TaskSession | null;
}

/** 이 세션의 지금까지 확정된 단계들을 순서대로 전부 가져온다 (단일 진실 소스 —
 * 대화 맥락이나 프론트 상태가 아니라 항상 이 DB 조회 결과만 신뢰할 것). */
export async function listStages(
  supabase: SupabaseClient,
  sessionId: string
): Promise<TaskSessionStage[]> {
  const { data, error } = await supabase
    .from("task_session_stages")
    .select("*")
    .eq("session_id", sessionId)
    .order("stage_order", { ascending: true });
  if (error) throw new Error(`단계 조회 실패: ${error.message}`);
  const stages = (data ?? []) as TaskSessionStage[];
  console.log(
    `[task-sessions] session=${sessionId} 기존 단계 ${stages.length}개 조회됨: ` +
      stages.map((s) => `#${s.stage_order} ${s.stage_name}`).join(", ")
  );
  return stages;
}

export async function addStage(
  supabase: SupabaseClient,
  params: {
    sessionId: string;
    stageOrder: number;
    stageName: string;
    outputText: string;
    outputFacts: Record<string, unknown>;
  }
): Promise<TaskSessionStage> {
  const { data, error } = await supabase
    .from("task_session_stages")
    .insert({
      session_id: params.sessionId,
      stage_order: params.stageOrder,
      stage_name: params.stageName,
      output_text: params.outputText,
      output_facts: params.outputFacts,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(`단계 저장 실패: ${error?.message}`);
  console.log(
    `[task-sessions] session=${params.sessionId} 단계 저장됨 #${params.stageOrder} ${params.stageName} facts=${JSON.stringify(params.outputFacts)}`
  );
  return data as TaskSessionStage;
}

/**
 * 이전 단계들을 프롬프트에 넣을 텍스트 블록으로 직렬화한다. 모델에게 "기억해서
 * 참고하라"고 하지 않고, 매 호출마다 이 함수로 DB에서 다시 읽어온 값을 그대로
 * 다시 박아 넣는 방식 — 요청하신 "명시적으로 다시 넣어주는 방식"에 해당.
 *
 * 각주 표기([1], [2] 등)는 일부러 지우고 넣는다 — 안 그러면 이번 호출에서는
 * 실제로 검색을 안 했는데도 모델이 이전 단계에 있던 각주 "모양"만 흉내 내서
 * 근거 없는 각주를 답는 문제가 실제로 발견됐다 (source 0개인데 [1][2][3]이
 * 본문에 붙는 케이스). 각주는 각 단계 자신의 그라운딩 결과에만 붙어야 한다.
 */
export function serializePriorStages(stages: TaskSessionStage[]): string {
  if (stages.length === 0) return "";
  return stages
    .map((s) => {
      const facts = Object.keys(s.output_facts).length
        ? `\n확정된 사실: ${JSON.stringify(s.output_facts)}`
        : "";
      const textWithoutCitations = s.output_text.replace(/\[\d+\]/g, "");
      return `[${s.stage_order}단계: ${s.stage_name} — 이미 확정됨, 절대 바꾸지 말 것]\n${textWithoutCitations}${facts}`;
    })
    .join("\n\n");
}

/** 여러 단계에 걸쳐 같은 키가 나오면, 가장 최근(나중) 단계의 값을 "확정된 값"으로 본다. */
export function mergeEstablishedFacts(stages: TaskSessionStage[]): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const s of stages) Object.assign(merged, s.output_facts);
  return merged;
}

function normalizeForCompare(s: string): string {
  return s.replace(/\s+/g, "").toLowerCase();
}

/**
 * 새로 생성된 output_facts가 이미 확정된 사실과 어긋나는 게 있는지 확인한다
 * (9-5/사후 검증). 완전히 똑같은 문자열이 아니어도, 한쪽이 다른 쪽을 포함하면
 * 같은 값으로 본다 (예: "새는 알에서 나오려고 투쟁한다" vs "...알에서 나오려고
 * 사투를 벌인다"처럼 표현만 다른 경우까지 전부 "불일치"로 잡으면 오탐이 너무
 * 많아진다 — 완전히 다른 값(다른 책 제목 등)만 잡아내는 게 목적).
 */
export function findFactMismatches(
  newFacts: Record<string, string>,
  establishedFacts: Record<string, string>
): { key: string; expected: string; got: string }[] {
  const mismatches: { key: string; expected: string; got: string }[] = [];
  for (const [key, gotValue] of Object.entries(newFacts)) {
    const expected = establishedFacts[key];
    if (!expected) continue;
    const a = normalizeForCompare(expected);
    const b = normalizeForCompare(gotValue);
    if (a !== b && !a.includes(b) && !b.includes(a)) {
      mismatches.push({ key, expected, got: gotValue });
    }
  }
  return mismatches;
}
