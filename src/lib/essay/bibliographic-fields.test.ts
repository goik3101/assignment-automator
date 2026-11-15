import test from "node:test";
import assert from "node:assert/strict";
import { trimBibliographicFields } from "./bibliographic-fields.ts";

test("서지 칸은 첫 문장만 남긴다(과학-03)", () => {
  const t = "### 출판사\n이 책의 출판사는 빈티지(Vintage)이다.[1] 원서는 2001년에 처음 출간되었다.[1][2] 이 활동에서는 초점을 두었다.\n\n### 교과 관련 단원 주제\n원소의 주기적 성질이다. 주기율표에서 배열된다.";
  const r = trimBibliographicFields(t);
  assert.match(r.content, /### 출판사\n\n이 책의 출판사는 빈티지\(Vintage\)이다\.\[1\]\n\n### 교과/);
  assert.match(r.content, /원소의 주기적 성질이다\. 주기율표에서 배열된다\./); // 서지 칸이 아니면 그대로
  assert.deepEqual(r.trimmed, ["출판사"]);
});

test("출판사 칸이 작성 요령으로 차 있으면 빈칸으로 되돌린다(국어-01)", () => {
  const t = "### 출판사\n출판사는 내가 읽은 판본의 표지와 판권면에 적힌 이름을 기준으로 해야 한다. 지금 주어진 정보만으로 적으면 다른 판본이 섞인다.\n\n### ① 주제\n내용.";
  const r = trimBibliographicFields(t);
  assert.match(r.content, /### 출판사\n\n\[직접 작성: 출판사/);
  assert.match(r.content, /### ① 주제\n내용\./);
});

test("이미 짧은 서지 칸과 다른 소제목은 건드리지 않는다", () => {
  const t = "### 책 제목\n『엉클 텅스텐』\n\n### 저자\n올리버 색스\n\n### 느낀 점\n길게 쓴 글이다. 둘째 문장이다.";
  const r = trimBibliographicFields(t);
  assert.equal(r.content, t);
  assert.equal(r.trimmed.length, 0);
});

test("값 칸: 문장 하나로 설명한 책 이름 칸도 값이 아닌 것으로 찾는다(국어-01 재현)", async () => {
  const { findValueFieldOverflows, replaceValueFields } = await import("./bibliographic-fields.ts");
  const c = "### 책이름\n『하늘과 바람과 별과 시』는 윤동주의 시들을 모은 시집으로, 책장을 넘길 때마다 한 편씩 멈춰 읽게 한다.\n\n### 지은이(옮긴이)\n\n지은이는 윤동주이며 옮긴이는 없다.\n\n### 주제\n자신을 돌아보는 마음.";
  const found = findValueFieldOverflows(c);
  assert.deepEqual(found.map((f) => f.name), ["책이름", "지은이(옮긴이)"]);
  const next = replaceValueFields(c, new Map([["책이름", "하늘과 바람과 별과 시"], ["지은이(옮긴이)", "윤동주"]]));
  assert.match(next, /### 책이름\n\n하늘과 바람과 별과 시\n/);
  assert.match(next, /### 주제\n자신을 돌아보는 마음\./);
  // 이미 값인 칸·직접 작성 빈칸·정책 이름 칸
  assert.deepEqual(findValueFieldOverflows("### 저자\n올리버 색스\n### 출판사\n[직접 작성: 출판사]"), []);
  assert.deepEqual(findValueFieldOverflows("### 효과적인 정책의 정책 명칭\n육아휴직").length, 0);
  assert.equal(findValueFieldOverflows("### 효과적인 정책의 정책 명칭\n효과적인 정책으로 육아휴직을 선택했다. 육아휴직은 …").length, 1);
});
