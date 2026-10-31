import { test } from "node:test";
import assert from "node:assert/strict";
import { countEvidenceItems, evidenceSectionText, evidenceWritingBlock, findSourceSubjectSentences, isEvidenceHeading , findUsePlanSentences, usePlanRepairText } from "./evidence-items.ts";

const 실측 = `## 개요

### 중심 내용과 세부 내용
중심 주장은 인터넷 실명제가 적절한 해결책이 아니라는 것이다.

### 뒷받침하는 정보 3가지 이상
헌법재판소는 2012년 게시판 본인확인제가 익명표현의 자유를 침해한다고 결정했다.[1] 법령정보센터에 등재된 결정문은 본인확인 의무가 과잉금지 원칙에 어긋난다고 판단했다.[2] 국가법령정보센터 심판문은 개인정보가 모이고 사생활 침해 우려가 생길 수 있다고 밝혔다.[2]

### 출처
- 헌법재판소 판례정보: https://ccourt.go.kr/x`;

test("근거 항목을 찾고, 세어지게 나뉘었는지 본다(실측 2026-10-31)", () => {
  assert.equal(isEvidenceHeading("뒷받침하는 정보 3가지 이상"), true);
  assert.equal(isEvidenceHeading("근거자료 출처"), false);
  const sec = evidenceSectionText(실측)!;
  assert.match(sec, /헌법재판소는 2012년/);
  assert.ok(!/ccourt\.go\.kr/.test(sec), "출처 항목까지 가져오면 안 된다");
  assert.equal(countEvidenceItems(sec), 0, "한 문단으로 뭉쳐 있으면 0개");
  assert.equal(countEvidenceItems("1) 첫째다.[1]\n2) 둘째다.[2]\n3) 셋째다.[3]"), 3);
  assert.equal(evidenceSectionText("### 주제\n글이다."), null);
});

test("문서·매체를 주어로 쓴 문장을 찾되 기관이 한 일은 건드리지 않는다", () => {
  const found = findSourceSubjectSentences(실측);
  assert.equal(found.length, 2, `찾은 것: ${JSON.stringify(found)}`);
  assert.match(found[0], /결정문은/);
  assert.deepEqual(findSourceSubjectSentences("헌법재판소는 2012년 위헌으로 결정했다.[1] 국가인권위원회는 익명성이 중요하다고 보았다.[2]"), []);
  assert.equal(findSourceSubjectSentences("자료에는 실명제가 2007년 도입되었다고 나온다.[4]").length, 1);
});

test("근거 블록은 개수와 항목 이름을 함께 말한다", () => {
  assert.equal(evidenceWritingBlock(null, 3), "");
  assert.equal(evidenceWritingBlock("개요", 1), "");
  assert.match(evidenceWritingBlock("개요", 3), /3개 이상을 각각 한 덩어리로/);
});

test("근거 항목의 쓰임 설명 꼬리를 찾는다", () => {
  const found = findUsePlanSentences(
    [
      "1) 인터넷 실명제는 2007년 7월 도입되었다.[2] 실명 확인 의무가 처음부터 기본 조건이었던 것은 아니라는 점을 설명할 때 쓴다.",
      "2) 헌법재판소는 본인확인 의무 조항을 위헌으로 판단했다.[3] 제도가 헌법적 한계를 넘었다는 발표의 근거로 삼는다.",
      "3) 2018년에는 여론조작 문제가 논의되었다.[4] 적절한 방법인지 따져 보는 데 활용한다.",
    ].join("\n")
  );
  assert.equal(found.length, 3);
});

test("평범한 사실 서술은 쓰임 설명으로 보지 않는다", () => {
  assert.deepEqual(
    findUsePlanSentences(
      [
        "헌법재판소는 2012년 8월 23일 제한적 본인확인제를 위헌으로 판단했다.[1]",
        "2008년 옥션에서 약 1,081만 건의 회원정보가 유출됐다.[2]",
        "리트머스 종이는 산성 용액에서 붉게 변한다.[3]",
      ].join("\n")
    ),
    []
  );
});

test("출처 목록 줄은 보지 않는다", () => {
  assert.deepEqual(findUsePlanSentences("- 통계로 보는 자료: https://example.com/a-를-근거로-삼는다"), []);
});

test("쓰임 설명 보완 지시는 사실만 쓰라고 하고 각주는 두라고 한다", () => {
  const t = usePlanRepairText("개요", ["제도가 한계를 넘었다는 발표의 근거로 삼는다."]);
  assert.ok(t.includes("개요"));
  assert.ok(t.includes("각주"));
  assert.ok(t.includes("사실"));
});
