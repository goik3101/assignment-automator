import { test } from "node:test";
import assert from "node:assert/strict";
import { insertCitationMarkers, type GroundingSupportLike } from "./citations.ts";

// 실제로 발견된 심각한 버그: 각주([n]) 삽입 과정에서 원문 글자가 사라지는
// 사고가 있었다("스스로를[1][2]" → "[1][2]스로를"처럼 "스"가 증발, "허지원
// 교수는" → "허지원 [1][3]수는"처럼 "교"가 증발). 근본 원인은 이 파일이 아니라
// stage B(작은 모델이 본문을 "그대로 옮겨 적기")였던 것으로 확인됐지만
// (generate-essay.ts가 이제 stage B의 재현에 의존하지 않고 원문에서 직접
// 잘라내도록 고쳤다), insertCitationMarkers() 자체도 "바이트 오프셋 삽입"이라는
// 원래도 위험한 연산을 하고 있으므로, 이 함수가 절대 글자를 잃어버리지 않는다는
// 것을 기계적으로 못박아 두는 회귀 테스트다.
//
// 검증 방식: segment.endIndex는 UTF-8 "바이트" 오프셋이라는 게 이 프로젝트의
// 문서화된 규칙이다(CLAUDE.md 참고) — 그래서 테스트도 "몇 번째 글자 뒤에
// 각주가 붙어야 하는가"를 문자 인덱스로 정한 뒤 Buffer.byteLength()로 정확한
// 바이트 오프셋으로 변환해서 넘긴다. 기대값은 같은 문자 인덱스로 만든 순수
// JS 문자열 slice(전혀 다른 방식의 독립적인 계산)라서, 두 계산이 정확히
// 일치해야만 테스트가 통과한다 — 우연히 같은 버그를 재현해서 통과하는 걸
// 방지한다.

function byteOffsetAt(text: string, charIndex: number): number {
  return Buffer.byteLength(text.slice(0, charIndex), "utf-8");
}

function support(charIndex: number, text: string, chunkIndices: number[]): GroundingSupportLike {
  return { segment: { endIndex: byteOffsetAt(text, charIndex) }, groundingChunkIndices: chunkIndices };
}

test("각주가 없으면 원문을 글자 하나 안 바꾸고 그대로 반환한다", () => {
  const text = "왜 그렇게 스스로를 꽉 조아매고 살아야 했을까.";
  assert.equal(insertCitationMarkers(text, undefined, new Map()), text);
  assert.equal(insertCitationMarkers(text, [], new Map()), text);
});

test("실제 사고 재현 — '스스로를' 앞에 각주가 붙어도 '스'가 사라지지 않는다", () => {
  const text = "왜 그렇게 스스로를 꽉 조아매고 살아야 했을까.";
  const charIndex = text.indexOf("스스로를"); // "스스로를" 바로 앞에 각주 2개가 붙는 상황 재현
  const supports = [support(charIndex, text, [0, 1])];
  const chunkIndexToN = new Map([[0, 1], [1, 2]]);

  const result = insertCitationMarkers(text, supports, chunkIndexToN);
  const expected = text.slice(0, charIndex) + "[1][2]" + text.slice(charIndex);

  assert.equal(result, expected);
  assert.ok(result.includes("스스로를"), `"스스로를"이 온전히 남아있어야 하는데 못 찾음: ${result}`);
  assert.equal(result.length, text.length + "[1][2]".length, "길이 불변식(원본 길이 + 삽입된 각주 문자 수 = 결과 길이) 위반");
});

test("실제 사고 재현 — '허지원 교수는'에서 '교'가 사라지지 않는다", () => {
  const text = "저자인 허지원 교수는 스트레스를 다루는 법을 안내한다.";
  const charIndex = text.indexOf("교수는"); // "교수는" 바로 앞에 각주가 붙는 상황 재현
  const supports = [support(charIndex, text, [0, 2])];
  const chunkIndexToN = new Map([[0, 1], [2, 3]]);

  const result = insertCitationMarkers(text, supports, chunkIndexToN);
  const expected = text.slice(0, charIndex) + "[1][3]" + text.slice(charIndex);

  assert.equal(result, expected);
  // 마커가 "허지원 "과 "교수는" 사이에 정확히 끼어들 뿐, "교"를 포함한 어떤
  // 글자도 삼키지 않아야 한다 — 실제 사고에서는 "교"가 통째로 사라졌었다.
  assert.ok(result.includes("교수는"), `"교"가 사라진 것으로 보임(교수는을 못 찾음): ${result}`);
  assert.ok(result.includes("허지원 "), `"허지원 " 뒤쪽이 훼손된 것으로 보임: ${result}`);
});

test("여러 각주를 서로 다른 위치에 삽입해도 그 사이 원문 글자가 전부 보존된다", () => {
  const text =
    "이런 고민에 빠진 친구에게 허지원 교수의 『나도 아직 나를 모른다』를 처방한다. " +
    "책 속에서 저자는 마음을 다스리는 구체적인 방법을 제시한다.";
  const firstIdx = text.indexOf("허지원");
  const secondIdx = text.indexOf("책 속에서");
  const thirdIdx = text.length; // 문장 맨 끝

  const supports = [support(firstIdx, text, [0]), support(secondIdx, text, [1]), support(thirdIdx, text, [2])];
  const chunkIndexToN = new Map([[0, 1], [1, 2], [2, 3]]);

  const result = insertCitationMarkers(text, supports, chunkIndexToN);
  const expected =
    text.slice(0, firstIdx) +
    "[1]" +
    text.slice(firstIdx, secondIdx) +
    "[2]" +
    text.slice(secondIdx, thirdIdx) +
    "[3]" +
    text.slice(thirdIdx);

  assert.equal(result, expected);
  assert.equal(
    result.length,
    text.length + "[1]".length + "[2]".length + "[3]".length,
    "길이 불변식 위반 — 여러 각주 삽입 시 원문 글자가 소실됨"
  );
});

test("문장 맨 앞(문자 인덱스 0)에 각주가 붙어도 첫 글자가 사라지지 않는다", () => {
  const text = "이런 고민에 빠진 친구에게 필요한 것은 위로다.";
  const supports = [support(0, text, [0, 1])];
  const chunkIndexToN = new Map([[0, 1], [1, 2]]);

  const result = insertCitationMarkers(text, supports, chunkIndexToN);
  assert.equal(result, "[1][2]" + text);
});

test("영문·숫자·이모지처럼 바이트 폭이 다른 문자가 섞여도 길이 불변식이 성립한다", () => {
  const text = "K-POP 스타 지수(智秀)는 2024년에 정규 1집을 발표했다 🎤.";
  const idx = text.indexOf("정규 1집");
  const supports = [support(idx, text, [0])];
  const chunkIndexToN = new Map([[0, 5]]);

  const result = insertCitationMarkers(text, supports, chunkIndexToN);
  const expected = text.slice(0, idx) + "[5]" + text.slice(idx);

  assert.equal(result, expected);
  assert.equal(result.length, text.length + "[5]".length);
});

// 여러 개의 실제 톤(문체) 문장에 대해 무작위에 가까운 여러 삽입 지점을 돌며
// "결과 길이 = 원본 길이 + 삽입된 각주 문자 수"가 예외 없이 성립하는지
// 기계적으로 반복 검증한다 — 사용자가 요청한 "글자 수 불변식" 검증.
test("길이 불변식 반복 검증 — 다양한 문장 x 다양한 삽입 지점 전부 통과해야 한다", () => {
  const samples = [
    "나는 반에서 특정 무리에 깊숙이 소속되지 못한 채 이리저리 끼어 있는 어중간한 위치에 있다.",
    "황영미의 장편소설 『체리새우: 비밀글입니다』를 추천한다. 주인공 다현이는 결국 스스로를 인정하게 된다.",
    "허지원 교수는 저서에서 스스로를 다그치기보다 있는 그대로 받아들이라고 조언한다.",
    "발표 불안은 누구에게나 찾아올 수 있는 자연스러운 감정이다.",
  ];

  for (const text of samples) {
    // 3, 6, 9번째 글자 뒤 등 여러 지점에 각주를 붙여본다(문장 길이를 넘지 않게 클램프).
    const insertPoints = [3, 6, 9, 15, Math.floor(text.length / 2), text.length]
      .filter((n) => n <= text.length)
      .filter((n, i, arr) => arr.indexOf(n) === i)
      .sort((a, b) => a - b);

    const supports = insertPoints.map((charIndex, i) => support(charIndex, text, [i]));
    const chunkIndexToN = new Map(insertPoints.map((_, i) => [i, i + 1]));
    const totalMarkerChars = insertPoints.reduce((sum, _, i) => sum + `[${i + 1}]`.length, 0);

    const result = insertCitationMarkers(text, supports, chunkIndexToN);

    assert.equal(
      result.length,
      text.length + totalMarkerChars,
      `길이 불변식 위반: "${text.slice(0, 20)}..." (삽입 지점=${JSON.stringify(insertPoints)})`
    );
  }
});
