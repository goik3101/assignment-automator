import test from "node:test";
import assert from "node:assert/strict";
import { wantsSourceList, sourceListHeading } from "./source-list-need.ts";

test("글 끝 출처 목록 요구를 읽는다(정보-01)", () => {
  assert.equal(wantsSourceList(["참고한 기사 제목과 URL을 보고서 맨 아래에 기재한다."]), true);
  assert.equal(wantsSourceList(["참고 문헌을 마지막에 적는다."]), true);
  assert.equal(wantsSourceList(["출처 목록을 작성하여 제출한다."]), true);
  assert.equal(sourceListHeading(["참고한 기사 제목과 URL을 기재"]), "참고한 기사 제목과 URL");
  assert.equal(sourceListHeading(["참고 문헌을 마지막에 적는다."]), "참고문헌");
});

test("관련 없는 문장은 읽지 않는다", () => {
  assert.equal(wantsSourceList(["참고문헌의 신뢰성을 고려할 것."]), false);
  assert.equal(wantsSourceList(["출처를 확인하며 글을 쓴다."]), false);
  assert.equal(wantsSourceList(["관련 뉴스 기사를 3개 이상 정독한다."]), false);
});
