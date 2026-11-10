import { test } from "node:test";
import assert from "node:assert/strict";
import { hasProvidedMaterials, providedMaterialsBlock, researchFocusLine } from "./provided-materials.ts";

const M = [
  "사례1(《뉴스케이프》 2026.04.09): 청년 근로자들의 미래 자산 형성을 돕기 위해 파격적인 수익률을 제공하는 '정책형 적금'이 큰 인기를 끌고 있다. 최대 연 12% 수준의 높은 수익을 얻을 수 있다.",
  "사례2(《이데일리》 2026.01.01): 노쇼로 소상공인이 평균 44만 원이 넘는 손실을 본다. 공정거래위원회는 예약 기반 음식점은 총 이용 금액의 최대 40%를 위약금으로 설정할 수 있게 했다.",
];

test("자료가 있으면 블록에 그대로 들어가고, '위 사례'가 그것임을 못 박는다", () => {
  const b = providedMaterialsBlock(M);
  assert.ok(b.includes("연 12%"), "기사의 수치가 빠졌다");
  assert.ok(b.includes("40%"), "기사의 수치가 빠졌다");
  assert.ok(b.includes("위 사례"), "'위 사례'가 이 자료라는 말이 없다");
  assert.ok(b.includes("다른 소재를 가져오거나 지어내지 말 것"));
});

test("자료가 없으면 아무것도 더하지 않는다", () => {
  assert.equal(providedMaterialsBlock([]), "");
  assert.equal(providedMaterialsBlock(undefined), "");
  assert.equal(hasProvidedMaterials([]), false);
  // 너무 짧은 것은 자료가 아니다(칸 이름 같은 것이 섞여 들어오는 것을 막는다)
  assert.equal(hasProvidedMaterials(["사례1"]), false);
  assert.equal(hasProvidedMaterials(M), true);
});

test("조사에 소재를 알려 엉뚱한 검색을 막는다 (실측: '학교 급식 잔반'으로 검색했다)", () => {
  const r = researchFocusLine(M);
  assert.ok(r.includes("정책형"), "자료의 소재가 조사에 전해지지 않는다");
  assert.ok(r.includes("검색은 그 소재를 벗어나지 말 것"));
  assert.equal(researchFocusLine([]), "");
});
