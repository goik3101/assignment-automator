import test from "node:test";
import assert from "node:assert/strict";
import { soloDefault } from "./analysis-normalize.ts";

const core = () => ({
  requirements: [
    "관련 사진이나 그림을 하나 첨부한다.",
    "개인 진행은 1인 1보고서, 팀 진행은 2인 1보고서로 제출하며 팀 진행 시 팀원 간 토론을 요약해 작성한다. (A학생 의견 작성, B학생 의견 작성, 최종 결론 작성)",
  ],
  writing_guide: "보고서는 주제 선정 동기 순으로 구성한다. 팀 진행 시 A학생 의견, B학생 의견, 최종 결론을 작성한다. 사진을 첨부한다.",
  elements: [{ required_items: ["주제 선정 동기", "기술 탐구", "나의 결론 및 성찰", "A학생 의견", "B학생 의견", "최종 결론"] }],
});

test("학생이 팀을 말하지 않으면 팀 전용 칸·문장을 뺀다(정보-01)", () => {
  const r = soloDefault(core(), "주제는 딥페이크로 할게.");
  assert.deepEqual(r.elements[0].required_items, ["주제 선정 동기", "기술 탐구", "나의 결론 및 성찰"]);
  assert.deepEqual(r.requirements, ["관련 사진이나 그림을 하나 첨부한다.", "개인 진행(1인 1보고서)으로 작성한다."]);
  assert.ok(!/A학생/.test(r.writing_guide ?? ""));
  assert.match(r.writing_guide ?? "", /사진을 첨부한다/);
});

test("학생이 팀으로 한다고 하면 그대로 둔다", () => {
  const c = core();
  const r = soloDefault(c, "친구와 둘이 팀으로 할 거야.");
  assert.equal(r.elements, c.elements);
  assert.equal(r.dropped.length, 0);
});

test("팀 조건 문장이 없는 안내문은 건드리지 않는다", () => {
  const c = { requirements: ["모둠 활동으로 포스터를 만든다."], writing_guide: "", elements: [{ required_items: ["가", "나", "다"] }] };
  const r = soloDefault(c, "");
  assert.equal(r.elements, c.elements);
});
