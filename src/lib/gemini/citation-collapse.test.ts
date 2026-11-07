import { test } from "node:test";
import assert from "node:assert/strict";
import { collapseMarkersToBlockEnd } from "./citation-cleanup.ts";

test("문단 안의 각주를 끝에 한 번으로 모은다", () => {
  const src = "히로히토 일왕은 항복을 발표했다.[1] 조선은 국권을 되찾았다.[2] 방송은 알아듣기 어려웠다.[3][1]";
  assert.equal(
    collapseMarkersToBlockEnd(src),
    "히로히토 일왕은 항복을 발표했다. 조선은 국권을 되찾았다. 방송은 알아듣기 어려웠다. [1,2,3]"
  );
});

test("문단마다 따로 모은다", () => {
  const src = "첫 문단이다.[1] 이어진다.[2]\n\n둘째 문단이다.[3]";
  assert.equal(collapseMarkersToBlockEnd(src), "첫 문단이다. 이어진다. [1,2]\n\n둘째 문단이다. [3]");
});

test("목록 항목은 항목마다 하나를 남긴다(근거마다 출처 요구를 그대로 충족)", () => {
  const src = "- 첫 근거다.[1] 뒷받침한다.[2]\n- 둘째 근거다.[3]";
  assert.equal(collapseMarkersToBlockEnd(src), "- 첫 근거다. 뒷받침한다. [1,2]\n- 둘째 근거다. [3]");
});

test("소제목·표·코드 블록은 건드리지 않는다", () => {
  const src = "### 머리기사[1]\n\n| 연도 | 사건[2] |\n|---|---|\n\n```\n코드[3]\n```";
  assert.equal(collapseMarkersToBlockEnd(src), src);
});

test("각주가 없는 글은 그대로 둔다", () => {
  const src = "각주가 없다.\n\n두 번째 문단.";
  assert.equal(collapseMarkersToBlockEnd(src), src);
});

test("이미 합쳐진 표기도 다시 모은다", () => {
  assert.equal(collapseMarkersToBlockEnd("앞 문장이다.[1,2] 뒤 문장이다.[2,5]"), "앞 문장이다. 뒤 문장이다. [1,2,5]");
});

test("여러 줄 문단도 한 묶음으로 본다", () => {
  const src = "첫 줄이다.[1]\n같은 문단 둘째 줄이다.[2]";
  assert.equal(collapseMarkersToBlockEnd(src), "첫 줄이다.\n같은 문단 둘째 줄이다. [1,2]");
});
