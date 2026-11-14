import test from "node:test";
import assert from "node:assert/strict";
import { tidyOutputText } from "./citations.ts";

test("문장 끝과 각주 사이의 공백을 붙인다(역사-02)", () => {
  assert.equal(tidyOutputText("1450년까지 다스렸다. [1] 이어서 썼다. [2]"), "1450년까지 다스렸다.[1] 이어서 썼다.[2]");
});

test("줄머리 출처 번호와 목록 표기는 건드리지 않는다", () => {
  const t = "## 출처\n[1] 제목 — https://a.kr\n- [2] 항목\n자료 출처: [1] 제목";
  assert.equal(tidyOutputText(t), t);
});
