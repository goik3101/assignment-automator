import { test } from "node:test";
import assert from "node:assert/strict";
import { renumberAcrossSections } from "./section-citations.ts";

const SRC = [
  { n: 1, title: "법령정보센터" },
  { n: 2, title: "전자신문" },
  { n: 3, title: "경향신문" },
  { n: 9, title: "목록에 없는 번호 아님" },
];

test("같은 번호는 모든 단계에서 같은 출처를 가리킨다(실측 2026-10-31, 결과물.6)", () => {
  // 개요는 전자신문을 먼저, 스토리보드는 경향신문을 먼저 인용한다.
  const { sections } = renumberAcrossSections(["판결이다.[2] 침해다.[3]", "위헌이다.[3] 규제다.[2] 조사다.[1]"], SRC);
  assert.equal(sections[0].content, "판결이다.[1] 침해다.[2]");
  assert.equal(sections[1].content, "위헌이다.[2] 규제다.[1] 조사다.[3]");
  // 두 단계의 [1]이 같은 출처여야 한다
  assert.equal(sections[0].sources.find((s) => s.n === 1)!.title, "전자신문");
  assert.equal(sections[1].sources.find((s) => s.n === 1)!.title, "전자신문");
});

test("그 단계가 쓴 번호만 목록에 넣고, 출처 목록에 없는 번호는 지운다", () => {
  const { sections, sources } = renumberAcrossSections(["하나다.[1]", "둘이다.[2] 모르는 번호다.[7]"], SRC);
  assert.deepEqual(sections[0].sources.map((s) => s.title), ["법령정보센터"]);
  assert.equal(sections[1].content, "둘이다.[2] 모르는 번호다.");
  assert.deepEqual(sources.map((s) => [s.n, s.title]), [[1, "법령정보센터"], [2, "전자신문"]]);
});
