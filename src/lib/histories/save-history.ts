import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdministrativeInfo, CoreTaskInfo } from "@/types/task";

/**
 * user_histories에 결과를 저장한다 (F7 히스토리 조회는 M5에서 화면을 붙일 예정 —
 * 이 함수는 그 전에 데이터가 먼저 쌓이기 시작하도록 M4에서 미리 연결해둔다).
 *
 * 반드시 세션이 실린 supabase 클라이언트(getServerSupabase())를 넘길 것 —
 * service-client(service_role)로 부르면 RLS를 그냥 우회해버려서 이 파일의
 * 존재 의미(auth.uid() = user_id 보장)가 없어진다.
 *
 * 히스토리 저장은 부가 기능이라 실패해도 원고/계획 자체는 이미 학생에게 전달된
 * 뒤이므로, 에러를 던지지 않고 로그만 남긴다.
 */
export async function saveHistory(
  supabase: SupabaseClient,
  params: {
    userId: string;
    clusterId: string;
    submissionId: string;
    outputType: "essay" | "plan";
    rawTextResult: string;
    subject: string;
    title: string;
    coreTaskInfo: CoreTaskInfo;
    adminInfo: AdministrativeInfo | null;
    instructions?: string;
    /** M6 재생성 시 true — 같은 submissionId의 기존 행을 is_current=false로 내린 뒤 새 버전을 추가한다. */
    isRegeneration?: boolean;
  }
): Promise<void> {
  if (params.isRegeneration) {
    const { error: supersedeError } = await supabase
      .from("user_histories")
      .update({ is_current: false })
      .eq("submission_id", params.submissionId)
      .eq("is_current", true);
    if (supersedeError) console.error("[saveHistory] 이전 버전 처리 실패", supersedeError);
  }

  const { error } = await supabase.from("user_histories").insert({
    user_id: params.userId,
    cluster_id: params.clusterId,
    submission_id: params.submissionId,
    is_current: true,
    output_type: params.outputType,
    raw_text_result: params.rawTextResult,
    subject: params.subject,
    title: params.title,
    core_task_info: params.coreTaskInfo,
    admin_info: params.adminInfo,
    instructions: params.instructions ?? null,
  });
  if (error) console.error("[saveHistory] 저장 실패", error);
}

/** submissionId로 가장 최근(is_current=true) 히스토리 한 건을 가져온다 (M6 재생성용). */
export async function getCurrentHistoryBySubmission(supabase: SupabaseClient, submissionId: string) {
  const { data, error } = await supabase
    .from("user_histories")
    .select("*")
    .eq("submission_id", submissionId)
    .eq("is_current", true)
    .maybeSingle();
  if (error) throw new Error(`히스토리 조회 실패: ${error.message}`);
  return data as
    | {
        id: string;
        user_id: string;
        cluster_id: string;
        submission_id: string;
        output_type: "essay" | "plan";
        subject: string;
        title: string;
        core_task_info: CoreTaskInfo;
        admin_info: AdministrativeInfo | null;
        instructions: string | null;
        raw_text_result: string;
      }
    | null;
}
