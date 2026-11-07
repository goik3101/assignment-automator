// 글 품질·출처 개선(2026-10-21 점검)의 되돌리기 스위치. 값은 호출할 때마다 읽는다(테스트·운영 중 전환).
// alias import 없음 — node:test에서 바로 불러올 수 있게.

/** ESSAY_QUALITY_FIXES=off면 이번 점검에서 바꾼 프롬프트·후처리를 모두 예전 방식으로 되돌린다. */
export function qualityFixesOn(): boolean {
  return process.env.ESSAY_QUALITY_FIXES !== "off";
}

/**
 * 조사→글쓰기의 글쓰기가 사실 노트 밖의 교과서 수준 일반 지식(대표 사건·인물·개념 설명)을 각주 없이 쓸 수 있게 할지.
 * **기본 켜짐**(2026-10-30). 금지해 두면 노트에 있는 10~14개 사실만으로 글을 채우느라 같은 사실이 되풀이되고 설명이 비었다 —
 * 사용자가 보고한 "길고 반복적", "통계 해석의 비약"의 구조적 원인이다. 실측(실제 사회 안내문 n=3): 원인·배경 설명이 살아나고,
 * 우려했던 "각주 없는 수치 문장"은 오히려 줄었다(금지 1회 2개 → 허용 3회 0·1·1개). 연도·수치·인용은 여전히 노트와 각주로만 쓴다.
 * ESSAY_WRITER_KNOWLEDGE=strict면 예전처럼 노트 밖 금지.
 */
export function writerGeneralKnowledgeOn(): boolean {
  return process.env.ESSAY_WRITER_KNOWLEDGE !== "strict";
}

/**
 * 안내문의 개수 조건(장면 수·문장 수·문단 수)을 생성 프롬프트에 전하고 생성 뒤 코드로 검사·보완할지(form-requirements.ts).
 * FORM_REQUIREMENTS=off면 예전 방식(조건은 텍스트로만 전달, 기본 분량 가이드 그대로).
 */
export function formRequirementsOn(): boolean {
  return process.env.FORM_REQUIREMENTS !== "off";
}

/**
 * 안내문이 요구한 "서로 다른 근거 N개"를 조사 프롬프트에 전하고, 확보한 근거가 N개 페이지에 못 미치면 한 번만 보강 조사를 할지(evidence-slots.ts).
 * 출처 정리 한도도 그 수에 맞춰 늘린다. ESSAY_EVIDENCE_SLOTS=off면 예전처럼 조사 규칙 고정·한도 3.
 */
export function evidenceSlotsOn(): boolean {
  return process.env.ESSAY_EVIDENCE_SLOTS !== "off";
}

/**
 * 안내문의 "약 5줄"·"3줄 분량"·"5줄로 작성"을 줄 수 조건으로 읽고, 줄 수 조건이 있는 단계에 "한 줄 ≈ 공백 포함 30자 안팎"이라는 환산 기준을 전한다.
 * **기본 꺼짐**(2026-11-06 도입) — 이 표현이 안 읽혀서 5줄 칸에 신문 기본 범위(900~1500자)가 붙었다. 실측으로 효과가 확인되기 전에는 켜지 않는다.
 * LINE_LENGTH=on으로 켠다.
 */
export function lineLengthOn(): boolean {
  return process.env.LINE_LENGTH === "on";
}

/**
 * 안내문에 분량이 없고 양식 칸도 없을 때, 과제 유형(서술형·의견·주장·탐구·심층 분석)과 평가 기준 개수로 분량을 추론한다(length-plan.ts).
 * **기본 꺼짐**(2026-11-06 도입) — 효과가 실측으로 확인되기 전에는 켜지 않는다. LENGTH_INFER=on으로 켠다.
 */
export function lengthInferOn(): boolean {
  return process.env.LENGTH_INFER === "on";
}

/**
 * 안내문이 "A를 바탕으로 B"라고 한 단계를 순서대로 쓰고, 뒤 단계에 앞 단계의 완성된 글을 넘길지(step-order.ts).
 * **기본 꺼짐** — 실측(2026-10-29, 같은 안내문 off 5회/on 5회)에서 노린 효과(스토리보드 각주 0개)는 1/5 → 0/5로 한 건 줄었을 뿐이고,
 * "개요에 없는 수치"는 오히려 0/5 → 1/5였으며, 생성 시간이 중앙 27.7초 → 31.7초로 늘어 30초를 4/5에서 넘겼다(글쓰기가 동시 8초 → 직렬 15.7초).
 * 2026-11-01에 기본 켜짐으로 바꿨다. 안내문 세부 평가 기준이 "개요에서 생성한 내용을 바탕으로 스토리보드를 작성하였는가"를
 * 직접 묻는데, 모든 단계를 동시에 쓰면 뒤 단계 호출이 앞 단계 글을 **물리적으로 볼 수 없어** 그 조건을 맞출 수단이 없다
 * (우연히 맞을 수는 있어도 보장되지 않는다). 순서는 안내문에 "바탕으로" 같은 의존 표현이 있을 때만 생긴다.
 * 비용은 그 두 단계가 직렬이 되는 것뿐이고 실측 generateEssay 27~34초(4회)로 30초 언저리를 지킨다.
 * 앞 단계가 쓰지 않은 출처를 뒤 단계가 들고 오는 것은 프롬프트로 막히지 않아 extraCitations로 코드가 센다.
 * 되돌리려면 ESSAY_STEP_ORDER=off.
 */
export function stepOrderOn(): boolean {
  return process.env.ESSAY_STEP_ORDER !== "off";
}

/**
 * "먼저 …를 설명한다"처럼 사실이 아니라 쓸 순서를 말하는 계획 문장의 각주를 뗄지(plan-citations.ts). PLAN_CITATIONS=off면 예전처럼 둔다.
 */
export function planCitationsOn(): boolean {
  return process.env.PLAN_CITATIONS !== "off";
}

/**
 * 읽은 출처 페이지에서 값을 못 찾아 각주를 지운 문장 뒤에 "[확인 필요]"를 남길지(claim-check.ts). UNVERIFIED_MARK=off면 예전처럼 각주만 지운다.
 */
export function unverifiedMarkOn(): boolean {
  return process.env.UNVERIFIED_MARK !== "off";
}

/**
 * 안내문 조건을 결과물과 한 문장씩 대조해, 어긴 단계만 보완할지(rubric-check.ts).
 * 생성 뒤 검사가 전부 "글이 망가졌나"(날조·되풀이·빈 항목…)만 보고 "안내문이 요구한 것을 했나"는
 * 아무도 보지 않던 빈 칸을 메운다 — 체크리스트를 코드에 적지 않고 안내문에서 그때그때 만들기 때문에
 * 과제 유형마다 규칙을 새로 쓰지 않아도 걸린다.
 *
 * **2026-11-03부터 기본 켬짐, 등급 critical**: 이것만이 과제 종류를 가리지 않는 검사다 — 체크리스트를
 * 안내문에서 그때그때 만들므로 처음 보는 수행평가에도 걸린다. 예전에 꺼 둔 이유는 "5회 중 1회만 실행"이었는데,
 * 그건 등급이 "required"여서 시간 예산에 밀렸기 때문이다(생성만으로 21~39초, 예산 22초).
 * 안내문이 요구한 것을 했는가는 품질 다듬기가 아니라 우리 서비스의 약속 자체라, 예산을 보지 않는 critical로 올렸다.
 * 글만 봐서 알 수 없는 조건(배점·기한·수업 운영)은 NOT_IN_TEXT가 체크리스트에서 뺀다 — 안 빼면 보완이 그 안내를 글에 적어 버린다.
 * RUBRIC_CHECK=off로 되돌린다. */
export function rubricCheckOn(): boolean {
  return process.env.RUBRIC_CHECK !== "off";
}

/**
 * 제출할 글이 **출처 0개**로 나가는 길을 막을지.
 *
 * 두 가지를 켠다.
 *  ① 책 조사가 실패하면 책을 빼고 일반 조사를 1회 더 한다 — 책이 아니어도 조사할 사실은 있다.
 *  ② "검색은 했는데 인용이 0개"일 때의 재시도를, **조사가 이미 실패한 경우에도** 돌린다.
 *
 * ②는 2026-10-24에 비용 때문에 껐던 것이다(조사 실패 → 대체 경로 → 재시도로 검색 8~10번, 1회 $0.15~0.22).
 * 그런데 **그때가 바로 출처가 0개일 가능성이 가장 큰 경우**다. 실측(2026-11-01, 인권 저널): 각주 0개·출처 0개짜리
 * 신문이 "우리는 기계가 아니다" 같은 인용까지 달고 그대로 나왔다. 수행평가에서 근거 없는 글은 치명적이다.
 * 지금은 researchFailed면 검색 상한이 2회라 늘어나는 검색은 최대 2회다 — 그래서 다시 켠다.
 */
export function sourceRetryOn(): boolean {
  return process.env.SOURCE_RETRY !== "off";
}

/**
 * 안내문이 알려 준 **양식 칸의 줄 수**를 글자 수 목표로 바꿔 프롬프트에 전할지(box-lines.ts).
 *
 * 실측(2026-11-07, 역사 신문): 안내문이 "내용 약 5줄"이라고 적어 두었는데 우리는 1102자·949자를 썼다.
 * 줄 수는 "프롬프트로만 전한다"고 해 두었지만 그 전달이 문장 그대로여서 모델이 글자 수로 환산하지 못했다.
 * 숫자로 바꿔 주면 분량이 내려간다 — 저장된 3회를 다시 센 값은 머리기사 881·272·313자(목표 135~234)로,
 * **2회는 범위에 들어왔고 1회만 3.8배로 벗어났다**(2026-11-08 재확인. 그 전에 보고한 1776·512·625자는
 * 출처 목록까지 포함해 잘못 센 값이었다). 즉 전달은 되지만 실행마다 지켜지지 않아, 크게 넘친 단계만
 * 코드로 찾아 줄인다(boxOverflows). 정답 채점은 11/11·10/11·11/11로 유지됐다.
 * 칸에 맞추는 것은 "바로 제출 가능한가"의 핵심이라 켜 두되, BOX_LENGTH=off로 되돌린다.
 */
export function boxLengthOn(): boolean {
  return process.env.BOX_LENGTH !== "off";
}

/**
 * 안내문에 분량이 없는 단계에 **범위 대신 목표 하나(±20%)**를 줄지(length-plan.ts의 narrowTarget).
 *
 * 실측(2026-11-08, 저장된 결과물 26편을 단계별로 센 것, 모델 호출 0): 우리가 준 범위가 넓은 단계일수록
 * 결과도 더 퍼졌다 — 범위 1.9배인 보고서·개요는 실행 간 1.3배로 안정적인데, 2.2배인 general 단계는
 * 588~2302자로 갈렸다. 저장된 안내문 20단계 중 **분량이 적힌 단계는 0개**라 이 추정 범위가 사실상 전부에 쓰인다.
 * 새 숫자를 만들지 않고 기존 역할 범위의 중앙값을 목표로 쓴다. LENGTH_TARGET=off로 되돌린다.
 */
export function lengthTargetOn(): boolean {
  return process.env.LENGTH_TARGET !== "off";
}
