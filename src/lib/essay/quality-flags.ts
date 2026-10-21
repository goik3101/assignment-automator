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
