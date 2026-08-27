// studed 핵심 도메인 타입.
// core_task_info(핵심 요구사항)와 administrative_info(제출기한 등 행정정보)는
// 기획서 6-0에 따라 물리적으로 분리한다 — core_task_info만 "과제 임베딩"(클러스터
// 매칭용, M2에서 구현)의 재료가 되고, administrative_info는 화면 표시 외에는 쓰이지 않는다.

export type TaskElementType = "text_submission" | "external_production";

export interface TaskElement {
  /** 'text_submission' = AI가 만든 글을 그대로 제출 가능 (독서감상문 등)
   *  'external_production' = 캔바/감마 등 외부 툴로 별도 제작 필요 (PPT/포스터 등) */
  type: TaskElementType;
  /** 사람이 읽는 짧은 이름 (예: "독서감상문", "발표 PPT") */
  label: string;
  description: string;
}

export interface AdministrativeInfo {
  due_date: string | null;
  submission_method: string | null;
  grading_criteria: string | null;
  other_notes: string | null;
}

export interface CoreTaskInfo {
  topic: string;
  requirements: string[];
  task_elements: TaskElement[];
}

export interface AnalyzeResult {
  subject: string;
  administrative_info: AdministrativeInfo;
  core_task_info: CoreTaskInfo;
  /** 사진이 흐릿하거나 정보가 부족해 신뢰할 수 있는 분석이 어려운 경우 true (F13) */
  insufficient_data: boolean;
  insufficient_reason: string | null;
}

export interface SourceRef {
  /** 본문에 [n] 형태로 표기되는 번호 (1부터 시작) */
  n: number;
  title: string;
  url: string;
  /** 출처 링크 유효성 검증 결과 (N6). 검증 전에는 null */
  url_valid: boolean | null;
}

export interface EssayResult {
  type: "essay";
  /** 상단 핵심 요약 3줄 + 본문, 문장 뒤에 [n] 각주가 삽입된 마크다운 */
  markdown: string;
  sources: SourceRef[];
  latency_ms: number;
  /** 로그인 사용자의 결과에만 붙는다 — F6 재생성 시 이 값으로 /api/tasks/{id}/regenerate 호출 */
  submissionId?: string;
}

export interface PlanStep {
  order: number;
  task: string;
  estimated_minutes: number;
  search_keywords: string[];
  /** sources 배열의 n 값 (없으면 null) */
  source_n: number | null;
}

export interface PlanResult {
  type: "plan";
  steps: PlanStep[];
  sources: SourceRef[];
  latency_ms: number;
  /** 로그인 사용자의 결과에만 붙는다 — F6 재생성 시 이 값으로 /api/tasks/{id}/regenerate 호출 */
  submissionId?: string;
}

export interface InsufficientDataResult {
  type: "insufficient_data";
  reason: string;
}

/** F8/9-2: 암기노트 — 기존 결과물에서 뽑은 핵심 요약. */
export interface MemoNote {
  keywords: string[];
  summary_points: string[];
}
