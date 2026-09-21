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
    /** 분량의 단위. 생략하면 글자수("chars"). 영어 과제의 "120~150 words"는 "words". */
    unit?: "chars" | "words";
  };
  /** 안내문이 이 단계에서 "반드시 조사/작성하라"고 명시적으로 나열한 필수 항목
   * (항목명만, 안내문 순서대로). analyze.ts가 안내문에서 동적으로 뽑는다 —
   * 어떤 과제에도 하드코딩된 항목은 없다(예: 인권 선구자 탐구는 "인물 선정
   * 이유/인물 배경/주요 활동/활동의 성과/인권 발달에 미친 영향", 과학 실험은
   * "가설/준비물/실험 방법/..."). 안내문이 항목을 나열하지 않았거나 항목이 2개
   * 미만이면 undefined — 이 경우 기존 방식(자유 서술)으로 생성된다. */
  required_items?: string[];
  /** "sections" = 조사·탐구·보고서·계획서처럼 항목별로 나눠 적는 산출물 — 항목마다
   * "### 항목명" 소제목으로 생성하고 코드가 누락을 검사한다. "flowing" = 편지·
   * 감상문·비평문·발표 대본처럼 하나의 글로 이어 쓰는 산출물 — 소제목을 강제하지
   * 않고 항목을 빠짐없이 다루라고만 지시한다(기계적 누락 검사 불가). */
  items_format?: "sections" | "flowing";
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
  /** 도메인 기반 출처 품질 등급(source-quality.ts). "연결이 된다"와 "핵심 사실의
   * 근거로 쓸 만하다"는 다르다 — 검증 전에는 undefined. */
  tier?: "official" | "reliable" | "reference" | "general" | "weak";
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
    /** 안내문의 필수 항목(TaskElement.required_items, sections 형식)이 재시도
     * 후에도 소제목으로 존재하지 않거나 비어 있을 때만 채워진다. */
    structureWarning?: string;
  }[];
  /** 조사 자료(sections 형식 단계)를 항목별로 분리한 구조화 사실 — 코드가 "### "
   * 소제목 기준으로 순수 문자열 처리로 만든다(LLM 재생성 아님). plan 생성이 이
   * 사실(연도·수치·사건)을 그대로 재사용하고 독립적으로 다시 만들지 않게 하는
   * 단일 진실 소스. sections 형식 단계가 없으면 undefined. */
  researchFacts?: { label: string; items: { item: string; lines: string[] }[] }[];
  /** 위 sections와 별개로 단일 단계 케이스에 쓰는 필수 항목 누락 경고. */
  structureWarning?: string;
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
  /** 이 과제가 인물/사건 등을 자유롭게 선정하는 유형이라 이 생성에서 대상을
   * 하나 확정했다면 그 이름(예: "마틴 루터 킹 주니어"). 선정할 필요가 없는
   * 과제거나 못 뽑았으면 undefined. text_submission과 external_production
   * 요소가 함께 있는 과제에서, 두 종류가 서로 다른 API 호출로 독립 생성되면서
   * 각자 다른 대상을 골라버리는 인물 혼입 버그를 막기 위해 essay 쪽에서 먼저
   * 확정한 값을 plan 생성(generate-plan.ts의 fixedSubject)에 그대로 넘긴다. */
  confirmedSubject?: string;
  /** 자동 선정(src/lib/selection/)이 실제로 대상을 골랐을 때의 결과 — 라우트가 이력 기록에 쓴다. 학생이 직접 지정했거나 선정 대상이 아니면 undefined. */
  selection?: {
    name: string;
    key: string;
    group?: string | null;
    tier?: string;
    fallbackUsed?: boolean;
    /** 생성 결과가 선정된 대상과 다른 대상을 다뤘는지(재시도 후에도) — true면 기록은 실제로 다룬 대상 기준으로 한다. */
    violated?: boolean;
  };
}

/** 학생이 AI 대신 직접 손으로 해야 하는 물리적 제작 단계만 담는다(그림
 * 그리기, 배치, 오려붙이기, 색칠, 인쇄 등) — 글로 쓸 수 있는 부분은 이제
 * PlanResult.content에 직접 완성해서 담기 때문에 여기엔 포함하지 않는다. */
export interface ProductionStep {
  order: number;
  task: string;
  estimated_minutes: number;
}

export interface PlanResult {
  type: "plan";
  /** 이 산출물(PPT/포스터/신문 등)에 들어갈, 글로 쓸 수 있는 부분을 실제로
   * 완성한 결과(기사문·사설·헤드라인·슬라이드 문구·발표 대본 등, [n] 각주
   * 포함 마크다운) — EssayResult.markdown과 같은 역할. 예전엔 "무엇을
   * 조사/작성할지"만 안내하는 계획이었지만, 사용자 요청(2026-09-13)에 따라
   * 글로 쓸 수 있는 부분은 계획만 세우지 않고 여기서 전부 완성해서 준다. */
  content: string;
  /** 위 content로 대신할 수 없는, 학생이 직접 손으로 해야 하는 단계만 남긴
   * 짧은 체크리스트. */
  productionSteps: ProductionStep[];
  sources: SourceRef[];
  latency_ms: number;
  /** 로그인 사용자의 결과에만 붙는다 — F6 재생성 시 이 값으로 /api/tasks/{id}/regenerate 호출 */
  submissionId?: string;
  /** 이 생성에서 실제로 검증에 성공한 통계/사례 항목의 식별 문구 목록 —
   * 추천 다양성 시스템(recommendation-diversity.ts)이 이력을 기록할 때 쓴다. */
  verifiedItemNames?: string[];
  /** 안내문의 필수 항목(TaskElement.required_items, sections 형식)이 재시도 후에도
   * 소제목으로 존재하지 않을 때만 채워진다. */
  structureWarning?: string;
  /** 자료 수집(조사 자료)에서 확정된 연도가 아닌 연도가 이 산출물에 남았을 때만
   * 채워진다 — 조사 자료와 최종 산출물의 사실이 어긋났다는 정직한 표시. */
  factConsistencyWarning?: string;
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
