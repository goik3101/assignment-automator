import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRubric, rubricMisses, rubricPrompt, rubricRepairText } from "./rubric-check.ts";

const KOREAN = {
  shared: [
    "개요와 스토리보드를 작성하고, 시각이미지를 탑재한다.",
    "발표는 찬반을 세트로 진행하며, 찬성 먼저 발표한 뒤 반대 입장이 바로 다음에 발표한다.",
  ],
  byLabel: {
    개요: [
      "개요에는 글의 목적·주제·예상 독자를 구체적으로 설정하고, 중심 내용과 세부 내용을 구상하며, 내용을 뒷받침하는 정보를 3가지 이상 수집하고 출처를 밝힌다.",
    ],
    스토리보드: [
      "개요의 내용을 바탕으로 8개의 장면으로 스토리보드를 작성한다.",
      "스토리보드의 그림 자료는 그림·그래프·표만 가능하다.",
      "제출 기한은 5월 30일까지이며 배점은 20점이다.",
    ],
  },
};

test("안내문 조건을 단계별 체크리스트로 만든다", () => {
  const items = buildRubric(KOREAN);
  const texts = items.map((i) => i.text);
  assert.ok(texts.some((t) => t.includes("3가지 이상")));
  assert.ok(texts.some((t) => t.includes("8개의 장면")));
  assert.ok(texts.some((t) => t.includes("그림·그래프·표만")));
  // 단계가 붙은 조건은 그 단계로, shared는 null로.
  assert.equal(items.find((i) => i.text.includes("8개의 장면"))!.label, "스토리보드");
  assert.equal(items.find((i) => i.text.includes("시각이미지"))!.label, null);
});

test("글만 봐서는 알 수 없는 조건은 체크리스트에서 뺀다", () => {
  const texts = buildRubric(KOREAN).map((i) => i.text);
  assert.ok(!texts.some((t) => t.includes("배점")), "배점·기한은 글에서 확인할 수 없다");
  assert.ok(!texts.some((t) => t.includes("찬성 먼저")), "발표 순서는 글에서 확인할 수 없다");
});

test("지시가 없는 설명 문장과 너무 짧은 줄은 뺀다", () => {
  const items = buildRubric({ shared: ["인터넷 실명제란 무엇인가.", "참고.", "" ], byLabel: {} });
  assert.deepEqual(items, []);
});

test("같은 조건이 두 번 들어오면 한 번만 남는다", () => {
  const same = buildRubric({ shared: ["근거를 3가지 이상 수집한다.", "근거를  3가지 이상 수집한다."], byLabel: {} });
  assert.equal(same.length, 1);
  // 공통(전체)으로도 단계로도 같은 조건이 들어오면 한 번만 본다 — 두 번 지적할 일이 아니다.
  const both = buildRubric({ shared: ["근거를 3가지 이상 수집한다."], byLabel: { 개요: ["근거를 3가지 이상 수집한다."] } });
  assert.equal(both.length, 1);
});

test("ok=false인 조건만 그 단계의 보완 지시가 된다", () => {
  const items = buildRubric(KOREAN);
  const scene = items.find((i) => i.text.includes("8개의 장면"))!;
  const outline = items.find((i) => i.text.includes("3가지 이상"))!;
  const misses = rubricMisses(
    {
      results: [
        { id: scene.id, ok: false, fix: "장면이 6개뿐이니 2개를 더 쓸 것" },
        { id: outline.id, ok: true },
      ],
    },
    items,
    ["개요", "스토리보드"]
  );
  assert.deepEqual(misses, [{ label: "스토리보드", missing: [`${scene.text} → 장면이 6개뿐이니 2개를 더 쓸 것`] }]);
});

test("전체 조건은 첫 단계(또는 지정한 단계)에 붙는다", () => {
  const items = buildRubric(KOREAN);
  const shared = items.find((i) => i.label === null)!;
  const misses = rubricMisses({ results: [{ id: shared.id, ok: false, fix: "시각이미지 설명이 없다" }] }, items, ["개요", "스토리보드"]);
  assert.equal(misses[0].label, "개요");
  const picked = rubricMisses({ results: [{ id: shared.id, ok: false }] }, items, ["개요", "스토리보드"], "스토리보드");
  assert.equal(picked[0].label, "스토리보드");
});

test("글에 없는 단계로 판정이 오면 첫 단계로 돌린다", () => {
  const items = buildRubric(KOREAN);
  const scene = items.find((i) => i.text.includes("8개의 장면"))!;
  const misses = rubricMisses({ results: [{ id: scene.id, ok: false }] }, items, ["개요"]);
  assert.equal(misses[0].label, "개요");
});

test("한 단계에 너무 많이 몰리면 3개까지만 보완한다", () => {
  const items = buildRubric({
    shared: [],
    byLabel: { 개요: ["머리말에 받는 사람 이름을 쓴다.", "실험 과정을 표로 정리한다.", "참고한 책의 출처를 밝힌다.", "마지막 문단에 자기 생각을 담을 것"] },
  });
  assert.equal(items.length, 4);
  const misses = rubricMisses({ results: items.map((i) => ({ id: i.id, ok: false })) }, items, ["개요"]);
  assert.equal(misses[0].missing.length, 3);
});

test("모르는 id와 ok 누락은 보완으로 치지 않는다", () => {
  const items = buildRubric(KOREAN);
  assert.deepEqual(rubricMisses({ results: [{ id: "없는id", ok: false }, { id: items[0].id }] }, items, ["개요"]), []);
  assert.deepEqual(rubricMisses({}, items, ["개요"]), []);
});

test("프롬프트에는 조건과 단계 글이 함께 들어간다", () => {
  const items = buildRubric(KOREAN);
  const p = rubricPrompt(items, [{ label: "개요", content: "목적은 …" }]);
  assert.ok(p.includes("[스토리보드]"));
  assert.ok(p.includes("[전체]"));
  assert.ok(p.includes("## 개요"));
  assert.ok(p.includes("목적은 …"));
});

test("보완 지시는 번호를 붙이고 각주를 건드리지 말라고 한다", () => {
  const t = rubricRepairText(["장면 8개 → 2개 부족", "표만 가능 → 사진을 썼다"]);
  assert.ok(t.includes("(1)") && t.includes("(2)"));
  assert.ok(t.includes("각주"));
});

test("수업 운영·채점 안내는 체크리스트에 넣지 않는다", () => {
  const texts = buildRubric({
    shared: [
      "1차시에는 교과서 등의 자료를 볼 수 없으므로 미리 공부한다.",
      "2차시는 미리 시험 대형으로 책상 간격을 띄우고 개별 작성한다.",
      "채점 기준은 핵심 내용을 정확하고 정합성 있게 서술하는지 본다.",
      "실험 결과를 표로 정리하고 중화 반응의 원리를 설명한다.",
    ],
    byLabel: {},
  }).map((i) => i.text);
  assert.deepEqual(texts, ["실험 결과를 표로 정리하고 중화 반응의 원리를 설명한다."]);
});

test("요구사항과 작성 기준이 같은 조건을 두 번 말하면 한 번만 넣는다", () => {
  const items = buildRubric({
    shared: [],
    byLabel: {
      스토리보드: [
        "개요의 내용을 바탕으로 8개의 장면으로 스토리보드를 작성한다.",
        "스토리보드는 8개의 장면으로 작성하며 개요의 내용을 바탕으로 한다.",
        "그림 자료는 그림·그래프·표만 가능하다.",
      ],
    },
  });
  assert.equal(items.length, 2);
  assert.ok(items[1].text.includes("그림·그래프·표만"));
});
