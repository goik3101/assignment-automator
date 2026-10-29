// 글 품질·출처 개선(2026-10-21 점검)의 되돌리기 스위치. 값은 호출할 때마다 읽는다(테스트·운영 중 전환).
// alias import 없음 — node:test에서 바로 불러올 수 있게.

/** ESSAY_QUALITY_FIXES=off면 이번 점검에서 바꾼 프롬프트·후처리를 모두 예전 방식으로 되돌린다. */
export function qualityFixesOn(): boolean {
  return process.env.ESSAY_QUALITY_FIXES !== "off";
}

/**
 * 조사→글쓰기의 글쓰기가 사실 노트 밖의 교과서 수준 일반 지식(대표 사건·인물·개념 설명)을 각주 없이 쓸 수 있게 할지.
 * 기본은 예전처럼 노트 밖 사실 금지(strict) — 출처 없는 문장이 늘어나는 위험이 있어 실측 확인 전까지는 켜지 않는다.
 */
export function writerGeneralKnowledgeOn(): boolean {
  return process.env.ESSAY_WRITER_KNOWLEDGE === "general";
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
 * 안내문이 "A를 바탕으로 B"라고 한 단계를 순서대로 쓰고, 뒤 단계에 앞 단계의 완성된 글을 넘길지(step-order.ts).
 * **기본 꺼짐** — 실측(2026-10-29, 같은 안내문 off 5회/on 5회)에서 노린 효과(스토리보드 각주 0개)는 1/5 → 0/5로 한 건 줄었을 뿐이고,
 * "개요에 없는 수치"는 오히려 0/5 → 1/5였으며, 생성 시간이 중앙 27.7초 → 31.7초로 늘어 30초를 4/5에서 넘겼다(글쓰기가 동시 8초 → 직렬 15.7초).
 * 효과가 확인되면 ESSAY_STEP_ORDER=on으로 켠다.
 */
export function stepOrderOn(): boolean {
  return process.env.ESSAY_STEP_ORDER === "on";
}

/**
 * 읽은 출처 페이지에서 값을 못 찾아 각주를 지운 문장 뒤에 "[확인 필요]"를 남길지(claim-check.ts). UNVERIFIED_MARK=off면 예전처럼 각주만 지운다.
 */
export function unverifiedMarkOn(): boolean {
  return process.env.UNVERIFIED_MARK !== "off";
}
