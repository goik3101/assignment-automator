import type { CoreTaskInfo } from "@/types/task";

const PRESENTATION_KEYWORDS = ["발표", "구술", "프레젠테이션", "스피치", "말하기", "토론", "PT"];

/** 9-3: 예상 질문 생성은 "구술·발표형 과제일 때만" 조건부로 보여준다. 별도 분류 필드를
 * 새로 만들지 않고, 이미 있는 요구사항·산출물 설명 텍스트에서 키워드로 판별한다. */
export function isPresentationTask(coreTaskInfo: CoreTaskInfo): boolean {
  const text = [
    coreTaskInfo.topic,
    ...coreTaskInfo.requirements,
    ...coreTaskInfo.task_elements.flatMap((e) => [e.label, e.description]),
  ].join(" ");
  return PRESENTATION_KEYWORDS.some((k) => text.includes(k));
}
