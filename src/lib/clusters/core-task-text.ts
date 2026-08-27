import type { CoreTaskInfo } from "@/types/task";

/**
 * core_task_info를 "과제 임베딩" 계산용 텍스트로 직렬화한다.
 * administrative_info는 절대 섞지 않는다 (기획서 6-0).
 */
export function coreTaskInfoToClusteringText(info: CoreTaskInfo): string {
  const elements = info.task_elements.map((e) => `${e.label}: ${e.description}`).join(" / ");
  return [
    `주제: ${info.topic}`,
    info.requirements.length ? `요구사항: ${info.requirements.join(", ")}` : null,
    elements ? `산출물: ${elements}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}
