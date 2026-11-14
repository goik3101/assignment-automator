import test from "node:test";
import assert from "node:assert/strict";
import { isSourceListItem, isUrlOnlyItem } from "./deliverable.ts";

test("'참고한 기사 제목'과 'URL' 칸은 출처 목록 항목이다(정보-01: 지어낸 기사 제목)", () => {
  assert.equal(isSourceListItem("참고한 기사 제목"), true);
  assert.equal(isSourceListItem("URL"), true);
  assert.equal(isUrlOnlyItem("URL"), true);
  assert.equal(isUrlOnlyItem("웹 주소"), true);
});

test("출처를 분석·비교하는 칸이나 일반 칸은 아니다", () => {
  assert.equal(isSourceListItem("출처 신뢰도 판단"), false);
  assert.equal(isSourceListItem("기술 탐구"), false);
  assert.equal(isUrlOnlyItem("URL 구조의 이해"), false);
});
