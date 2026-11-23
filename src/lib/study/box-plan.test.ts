import { test } from "node:test";
import assert from "node:assert/strict";
import { alignSkeleton, firstSentence, planBoxes } from "./box-plan.ts";

const scenes = (n: number) => Array.from({ length: n }, (_, i) => `### 장면 ${i + 1}\n장면 ${i + 1} 내용이다.`).join("\n\n");
const SILMYEONG = [
  "## 개요",
  "### 글의 목적\n목적 글이다.",
  "### 주제\n주제 글이다.",
  "### 예상 독자\n독자 글이다.",
  "### 중심 내용\n중심 글이다.",
  "### 세부 내용\n세부 글이다.",
  "## 근거 자료(3가지 이상)\n근거 하나다.[1] 근거 둘이다.[2]",
  "## 출처\n- 링크",
  "## 스토리보드",
  scenes(8),
].join("\n");

test("이름 있는 항목은 항목마다 한 칸, 장면은 4개씩 묶고, 출처는 뺀다 — 인터넷 실명제 모양", () => {
  const plan = planBoxes(SILMYEONG, 8)!;
  assert.deepEqual(plan.map((p) => p.name), ["글의 목적", "주제", "예상 독자", "중심 내용", "세부 내용", "근거 자료(3가지 이상)", "장면 1~4", "장면 5~8"]);
  assert.ok(plan[5].text.includes("근거 하나다.") && !plan[5].text.includes("[1]")); // 각주 번호는 뗀다
  assert.ok(plan[6].text.includes("[장면 1]") && plan[6].text.includes("장면 4 내용"));
});

test("같은 결과물은 몇 번을 불러도 같은 칸 목록이다(모델이 칸을 못 흔든다)", () => {
  assert.deepEqual(planBoxes(SILMYEONG, 8), planBoxes(SILMYEONG, 8));
});

test("칸이 한도를 넘으면 항목이 가장 많은 단계부터 한 칸으로 합치고, 마지막 단계는 남긴다", () => {
  const plan = planBoxes(SILMYEONG, 5)!;
  // 개요(5칸)와 스토리보드(2칸) 중 개요를 먼저 합친다 → 1+1+2 = 4칸
  assert.deepEqual(plan.map((p) => p.name), ["개요", "근거 자료(3가지 이상)", "장면 1~4", "장면 5~8"]);
  const tighter = planBoxes(SILMYEONG, 3)!;
  assert.deepEqual(tighter.map((p) => p.name), ["개요", "근거 자료(3가지 이상)", "스토리보드"]);
  // 더 합칠 수 없으면 null(모델이 고른다)
  assert.equal(planBoxes(SILMYEONG, 2), null);
});

test("장면 7개는 4+3이 아니라 4+3 중 고르게(4,3), 9개는 3,3,3", () => {
  const seven = planBoxes(["## 가", "글", "## 스토리보드", scenes(7)].join("\n"), 8)!;
  assert.deepEqual(seven.map((p) => p.name), ["가", "장면 1~4", "장면 5~7"]);
  const nine = planBoxes(["## 가", "글", "## 스토리보드", scenes(9)].join("\n"), 8)!;
  assert.deepEqual(nine.map((p) => p.name), ["가", "장면 1~3", "장면 4~6", "장면 7~9"]);
});

test("항목 없는 결과물은 단계마다 한 칸이고 마지막 칸(결론)을 빼먹지 않는다", () => {
  const plan = planBoxes(["## 탐구 주제", "글", "## 자료조사", "글", "## 결론 및 느낀점", "마무리 글"].join("\n"), 6)!;
  assert.deepEqual(plan.map((p) => p.name), ["탐구 주제", "자료조사", "결론 및 느낀점"]);
});

test("단계가 하나이고 항목이 여럿이면 항목이 칸이다(역사 인물 평전 모양)", () => {
  const plan = planBoxes(["## 역사 인물 평전", "### 시대 배경", "가", "### 인물의 생애", "나", "### 업적", "다"].join("\n"), 6)!;
  assert.deepEqual(plan.map((p) => p.name), ["시대 배경", "인물의 생애", "업적"]);
});

test("소제목이 없거나 칸이 하나뿐이면 null — 예전처럼 모델이 칸을 고른다", () => {
  assert.equal(planBoxes("그냥 글이다. 소제목이 없다.", 6), null);
  assert.equal(planBoxes("## 하나\n글", 6), null);
  assert.equal(planBoxes("", 6), null);
});

test("번호 하나뿐인 항목이나 번호가 아닌 이름은 묶지 않는다", () => {
  const plan = planBoxes(["## 가", "### 장면 1", "a", "### 해결방법", "b", "## 나", "글"].join("\n"), 8)!;
  assert.deepEqual(plan.map((p) => p.name), ["장면 1", "해결방법", "나"]);
});

test("alignSkeleton: 이름이 맞으면 이름으로, 어긋나면 같은 순번으로, 비면 칸 글의 첫 문장으로 채운다", () => {
  const plan = [
    { name: "글의 목적", text: "첫 문장이다. 둘째다." },
    { name: "주제", text: "주제 글이다." },
    { name: "예상 독자", text: "독자 글이다." },
  ];
  const out = alignSkeleton(plan, [
    { box: "예상 독자", line: "독자 줄", keywords: ["독자"] }, // 순서가 바뀌어도 이름으로 맞춘다
    { box: "글의 목적", line: "목적 줄", keywords: [] },
    // 주제는 빠졌다
  ]);
  assert.deepEqual(out.map((o) => o.box), ["글의 목적", "주제", "예상 독자"]);
  assert.equal(out[0].line, "목적 줄");
  assert.equal(out[1].line, "주제 글이다."); // 모델이 빼먹은 칸 → 코드가 대신 채움
  assert.deepEqual(out[2].keywords, ["독자"]);
  // 칸 이름을 바꿔 써도 같은 순번이 비어 있으면 받아 준다
  const renamed = alignSkeleton(plan, [{ box: "목적(바뀐 이름)", line: "x", keywords: [] }]);
  assert.equal(renamed[0].line, "x");
  // 합쳐서 한 줄만 낸 경우: 남는 칸은 코드가 채워 칸 개수는 항상 계획과 같다
  assert.equal(alignSkeleton(plan, [{ box: "글의 목적 / 주제", line: "합친 줄" }]).length, 3);
  assert.equal(alignSkeleton(plan, undefined).length, 3);
});

test("firstSentence: 첫 문장만, 길면 자른다", () => {
  assert.equal(firstSentence("첫 문장이다. 둘째 문장이다."), "첫 문장이다.");
  assert.ok(firstSentence("가".repeat(100)).endsWith("…"));
  assert.equal(firstSentence("[장면 1] 내용이다."), "내용이다.");
});

test("줄 끝이 \r\n인 글도 같은 칸 목록이다(윈도우에서 저장한 글)", () => {
  assert.deepEqual(planBoxes(SILMYEONG.replace(/\n/g, "\r\n"), 8)?.map((p) => p.name), planBoxes(SILMYEONG, 8)?.map((p) => p.name));
});

test("이름·반 번호·날짜 같은 인적 사항 칸은 칸으로 세지 않는다", () => {
  const plan = planBoxes(["## 역할극", "### 주제", "가", "### 해결방법", "나", "### 반 번호", "1반 3번", "### 이름", "홍길동"].join("\n"), 8)!;
  assert.deepEqual(plan.map((p) => p.name), ["주제", "해결방법"]);
});
