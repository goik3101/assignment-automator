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
  /** 안내문에 이 단계의 분량 제약이 명시되어 있으면 담는다(예: "800자 내외
   * (±50자 허용)" → min=750, max=850). 안내문에 제약이 없으면 undefined —
   * generate-essay.ts가 이 필드가 있는 단계만 기계적으로 글자수를 검사한다. */
  target_length?: {
    min: number;
    max: number;
    /** 분량 기준이 공백 포함인지. 안내문에 명시 없으면 true(공백 포함). */
    counts_spaces: boolean;
  };
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
  /** 상단 핵심 요약 3줄 + 본문, 문장 뒤에 [n] 각주가 삽입된 마크다운 (모든 단계를
   * "## 라벨" 제목으로 이어붙인 하나의 문서 — 저장/재생성 연속성의 단일 진실 소스). */
  markdown: string;
  sources: SourceRef[];
  latency_ms: number;
  /** 로그인 사용자의 결과에만 붙는다 — F6 재생성 시 이 값으로 /api/tasks/{id}/regenerate 호출 */
  submissionId?: string;
  /** 과제에 완성 원고(text_submission) 요소가 여러 개면, markdown을 요소별로 미리
   * 분리해둔 것 (화면에 요소별 카드로 보여주기 위한 용도). 요소가 1개뿐이면
   * 길이 1인 배열이거나 생략될 수 있다. sources는 그 섹션 본문에 실제로 인용된
   * [n] 번호만 골라낸 부분집합 — 상위 sources(전체 목록)를 그대로 복붙하면
   * 인용 안 된 섹션에도 출처가 붙어버리는 문제가 있었다.
   * lengthWarning은 그 단계에 TaskElement.target_length가 지정돼 있었는데
   * 재시도까지 거치고도 범위를 못 맞췄을 때만 채워진다(정직하게 실패를 알리는
   * 용도 — 조용히 기준 미달 상태를 최종본인 척 내보내지 않기 위함).
   * authorWarning은 이 단계가 언급한 책의 저자를 검색으로 대조했는데 재시도
   * 후에도 실제 서지정보와 일치하지 않을 때만 채워진다(실제 사례: 『내가
   * 원하는 것을 나도 모를 때』를 "김나이"로 잘못 표기 — 실제 저자는 전승환.
   * 각주가 붙어 있어도 저자 자체가 틀렸을 수 있어서 별도로 대조·경고한다).
   * noSourcesWarning은 출처가 0개이면서 동시에 이 단계에 검증이 필요한
   * 구체적 사실 주장(책 제목/직접 인용/통계 등)이 실제로 있을 때만 true다 —
   * 실제 사례: 사실 주장이 전혀 없는 순수 격려 편지 섹션에도 "검증되지
   * 않았어요" 배너가 뜬 적이 있었다. 검증할 대상 자체가 없으면 출처가
   * 0개인 게 정상이므로 경고할 이유가 없다. */
  sections?: {
    label: string;
    markdown: string;
    sources: SourceRef[];
    lengthWarning?: string;
    authorWarning?: string;
    noSourcesWarning?: boolean;
  }[];
  /** 글 맨 위에 제시하는 불릿 3줄 요약(학생이 스스로 검증할 수 있도록). 여러
   * 단계가 있어도 전체를 아우르는 하나의 요약이라 섹션별이 아니라 여기(최상위)
   * 에 붙는다. 모델이 못 만들었으면 빈 배열이거나 생략될 수 있다. */
  summaryLines?: string[];
  /** 위 sections와 별개로, 이 EssayResult 전체가 단일 단계(요소 1개)만
   * 나타낼 때도(AssignmentFlow.tsx가 sections를 요소별로 나눠 이 필드 없이
   * 재구성해서 쓰므로) 그 단계의 분량 기준 미달 경고를 담을 수 있다. */
  lengthWarning?: string;
  /** 위 sections와 별개로 단일 단계 케이스에 쓰는 저자 불일치 경고(위 참고). */
  authorWarning?: string;
  /** 위 sections와 별개로 단일 단계 케이스에 쓰는 "검증할 사실 주장은 있는데
   * 출처가 없음" 경고(위 참고). */
  noSourcesWarning?: boolean;
  /** 이 생성에서 최종 확정된 책 제목(정확히 1권일 때만) — 추천 다양성 시스템
   * (recommendation-diversity.ts)이 이력을 기록할 때 쓴다. 책이 없거나
   * 여러 권이면 undefined. */
  recommendedBookTitle?: string;
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
  /** 이 생성에서 실제로 검증에 성공한 통계/사례 항목의 식별 문구(검색
   * 키워드 기반) 목록 — 추천 다양성 시스템(recommendation-diversity.ts)이
   * 이력을 기록할 때 쓴다. */
  verifiedItemNames?: string[];
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
