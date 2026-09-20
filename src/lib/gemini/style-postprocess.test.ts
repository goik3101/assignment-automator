import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDoc, detectCandidates, validateRewrite, applyRewrites, render } from "./style-postprocess-core.ts";

const MD = `## 자료 수집
앙리 뒤낭은 1828년에 태어났다[1]. 이러한 가정환경 속에서 그는 자연스럽게 약자를 돕는 태도를 익혔다[2]. 이는 국가 간 폭력을 제도화한 사건이었다.
- 세계 경제 지표는 3.5% 늘었으며 이 실험에서 압력 차이가 원인임을 알 수 있었다[3].
| 표 | 값 |
따라서 그는 1863년에 위원회를 만들었다.`;

test("문장 분리·후보 탐지: 제목/표는 건드리지 않고 문두 접속어만 잡는다", () => {
  const doc = parseDoc(MD);
  const c = detectCandidates(doc, "connective");
  assert.deepEqual(c.map((x) => x.text.slice(0, 6)), ["이러한 가정", "이는 국가 ", "따라서 그는"]);
  assert.ok(c[0].prev?.startsWith("앙리 뒤낭"));
});

test("결론 공식 탐지: 불릿 줄과 소수점(3.5%)에도 문장이 잘못 쪼개지지 않는다", () => {
  const doc = parseDoc(MD);
  const c = detectCandidates(doc, "conclusion");
  assert.equal(c.length, 1);
  assert.ok(c[0].text.includes("3.5%"));
});

test("검증: 지시어만 뺀 수정은 통과", () => {
  const v = validateRewrite("이러한 가정환경 속에서 그는 자연스럽게 약자를 돕는 태도를 익혔다[2].", "가정환경 속에서 그는 자연스럽게 약자를 돕는 태도를 익혔다[2].", "connective");
  assert.equal(v.ok, true, v.reasons.join(","));
});

test("검증: 길어짐/숫자·출처 변경/새 접속어/새 평가어는 거부", () => {
  const o = "이러한 활동은 1863년에 시작되었다[2].";
  assert.equal(validateRewrite(o, "이러한 활동은 1863년에 시작되었으며 매우 중요한 사건이었다[2].", "connective").ok, false);
  assert.ok(validateRewrite(o, "활동은 1864년에 시작되었다[2].", "connective").reasons.includes("숫자 변경"));
  assert.ok(validateRewrite(o, "활동은 1863년에 시작되었다[3].", "connective").reasons.includes("출처 번호 변경"));
  assert.ok(validateRewrite(o, "그래서 활동은 1863년에 시작되었다[2].", "connective").reasons.some((r) => r.startsWith("새 접속어")));
  assert.ok(validateRewrite(o, "활동은 1863년에 시작된 큰 영향을 준 일이었다[2].", "connective").reasons.some((r) => r.startsWith("새 평가") || r.startsWith("길이")));
});

test("검증: 결론 공식 제거는 통과, 공식이 남거나 판단이 단정으로 바뀌면 거부", () => {
  const o = "압력 차이가 양력의 원인임을 알 수 있었다[3].";
  assert.equal(validateRewrite(o, "압력 차이가 양력의 원인이었다[3].", "conclusion").ok, true);
  assert.equal(validateRewrite(o, "압력 차이가 양력의 원인임을 알 수 있다[3].", "conclusion").ok, false);
  const j = "이 사례는 인권 문제라고 볼 수 있다.";
  assert.ok(validateRewrite(j, "이 사례는 인권 문제다.", "conclusion").reasons.includes("판단(볼 수 있다)이 단정으로 바뀜"));
  assert.equal(validateRewrite(j, "이 사례는 인권 문제로 보인다.", "conclusion").ok, true);
});

test("교체는 대상 문장만 바꾸고 나머지 줄·제목·표는 그대로다", () => {
  const doc = parseDoc(MD);
  const c = detectCandidates(doc, "connective")[0];
  const out = render(applyRewrites(doc, new Map([[c.id, "가정환경 속에서 그는 자연스럽게 약자를 돕는 태도를 익혔다[2]."]])));
  const before = MD.split("\n"), after = out.split("\n");
  assert.equal(after[0], before[0]);
  assert.equal(after[3], before[3]);
  assert.equal(after[4], before[4]);
  assert.ok(after[1].includes("가정환경 속에서") && !after[1].includes("이러한 가정환경"));
});
