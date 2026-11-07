// 안내문에 분량이 **적혀 있지 않을 때** 분석 단계(사진을 직접 본 호출)가 정한 분량을 받아 둔다.
// alias import 없음 — node:test에서 바로 불러옴.
//
// 왜(2026-11-08, 사용자: "ChatGPT는 안내문에 몇 줄 쓰라고 없어도 알아서 적당히 맞추던데"):
// 저장된 분석 12건에서 분량이 명시된 단계는 **0개**였고(85%가 우리 추정), 그 추정은 코드에 박힌
// 역할 표(length-plan.ts)에서 나왔다. 역할 표가 틀리면 결과물이 통째로 어긋난다 — 실측으로
// `신문 기사 스크랩`은 표가 900~1,500자를 주지만 정답 채점 만점 결과물은 170~202자였다(붙일 기사가 본체다).
//
// 채점된 결과물 7편에서 "항목당 글자 수"를 재 보니 72~465자로 흩어져(scripts/measure/length-truth.ts)
// **항목 수로도 분량을 정할 수 없다**는 것이 확인됐다. 안내문이 "제목/내용"처럼 한 칸에 글 전체를 담게
// 하면 항목 수가 무게를 전혀 못 나타낸다.
//
// 그래서 분량을 아는 유일한 호출에 맡긴다: analyze는 **사진을 보고 있다** — 칸 크기·줄 수·배점·예시 글까지.
// ChatGPT가 사람이 보여 준 양식지를 보고 "이 칸엔 이만큼"을 아는 것과 같은 자리다.
//
// 지키는 선 두 개:
//  ① 안내문에 **적힌** 분량(target_length)과 절대 섞지 않는다. 적힌 것은 어기면 감점인 조건이고,
//     이것은 **추정**이다 — 생성 가이드로만 쓰고 경고·"분량 미달" 판정에는 쓰지 않는다
//     (2026-11-03: 우리가 지어낸 상한으로 거짓 경고를 띄운 사건).
//  ② 모델이 준 숫자를 그대로 믿지 않는다. 터무니없는 값과 근거 없는 값은 버리고 역할 표로 돌아간다.

/** 사람이 한 번에 제출할 글의 상식적인 범위. 이 밖은 읽기 오류로 본다. */
const MIN_CHARS = 80;
const MAX_CHARS = 4000;

export interface LengthEstimate {
  chars: number;
  basis: string;
}

/**
 * **기본 꺼짐.** 실측(2026-11-08, 분석만 5회·생성 0)에서 분석의 추정이 정답 채점 만점 결과물의
 * 0.14~0.88배(중앙 약 0.4배)로 **체계적으로 짧았다**:
 *   카드뉴스 250자(만점 1,750) / 신문 머리기사 180자(만점 930) / 국어 개요 800자(만점 1,356) /
 *   과학 보고서 1,200자(만점 1,358 — 이것만 0.88배로 맞았다)
 * 원인은 분석이 **사진의 칸 크기에 충실**하기 때문이다("장면별 '들어갈 말' 6칸, 각 약 1줄").
 * 그런데 칸에 들어가는 분량과 채점에서 만점 받는 분량은 **같지 않다** — 카드뉴스는 같은 안내문에서
 * 660자 → 6/9, 1,750자 → 9/9였다. 켜면 그 글을 250자로 깎는다.
 * 코드는 남겨 둔다: 사진을 읽는 유일한 경로이고, 양식 칸이 없는 과제(과학)에서는 꽤 맞았다.
 */
export function lengthFromAnalyzeOn(): boolean {
  return process.env.LENGTH_FROM_ANALYZE === "on";
}

/**
 * 분석 결과의 추정 분량을 쓸 수 있는 값으로 다듬는다. 쓸 수 없으면 undefined(역할 표로 돌아간다).
 * `hasExplicit`가 참이면(안내문에 분량이 적힌 단계) 추정은 버린다 — 기준이 둘이 되면 안 된다.
 */
export function sanitizeLengthEstimate(
  chars: unknown,
  basis: unknown,
  hasExplicit: boolean
): LengthEstimate | undefined {
  if (hasExplicit) return undefined;
  const n = typeof chars === "number" ? Math.round(chars) : NaN;
  if (!Number.isFinite(n) || n < MIN_CHARS || n > MAX_CHARS) return undefined;
  // 근거 없는 숫자는 쓰지 않는다 — 어디서 나온 값인지 로그에 남아야 틀렸을 때 고칠 수 있다.
  const why = typeof basis === "string" ? basis.trim().slice(0, 120) : "";
  if (why.length < 2) return undefined;
  return { chars: n, basis: why };
}
