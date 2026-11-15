import test from "node:test";
import assert from "node:assert/strict";
import { stripFlowingItemLabels } from "./item-label.ts";

const ITEMS = ["태평양 전쟁 당시의 국제 정세", "태평양 전쟁의 배경 및 전개 과정", "미국이 원자폭탄을 투하하게 된 경위", "원자폭탄 투하에 대한 자신의 입장"];

test("항목 이름이 문단 머리 라벨로 묻어 나온 것을 뗀다(역사-01)", () => {
  const text = [
    "태평양 전쟁 당시의 국제 정세와 전쟁의 배경: 일본은 동아시아에서 세력을 넓히며 중국과 전쟁을 벌였다.[1]",
    "전개: 태평양 전쟁은 일본의 공격으로 시작된 뒤 여러 지역에서 이어졌다.",
    "미국이 원자폭탄을 투하하게 된 경위: 미국은 일본의 항복을 앞당기려 했다.",
  ].join("\n\n");
  const r = stripFlowingItemLabels(text, ITEMS);
  assert.equal(r.stripped.length, 3);
  assert.ok(r.content.startsWith("일본은 동아시아에서"));
  assert.ok(!/전개:/.test(r.content));
});

test("일반 말머리·칸 이름표·항목과 무관한 앞머리는 그대로 둔다", () => {
  const text = "예를 들어: 학교 급식에서 과일을 눈에 띄는 곳에 두면 선택이 달라진다.\n제목: 원자폭탄 투하에 대한 나의 입장을 쓰다 보면\n결론: 짧다";
  const r = stripFlowingItemLabels(text, ITEMS);
  assert.equal(r.content, text);
  assert.equal(r.stripped.length, 0);
});

import { stripNoticeEcho } from "./item-label.ts";
const NOTICE = "정책의 대상과 방법을 포함하여 작성 보완이 필요한 정책 한 가지를 골라 고대 국가의 문화유산을 국가에 맞게 선정하고 명칭과 해당 국가를 포함하여 자료를 제시하고";
test("안내문 문구를 라벨처럼 베낀 머리말을 뗀다 (가정-01·역사-03)", () => {
  const t = [
    "### 정책 설명",
    "대상과 방법을 포함한 정책 설명: 돌봄교실은 초등학생을 대상으로 정규수업 이외 시간에 돌봄을 제공한다.",
    "",
    "고대 국가의 문화유산을 국가에 맞게 선정하고: 백제의 금동대향로와 금제관식을 골랐다.",
  ].join("\n");
  const r = stripNoticeEcho(t, NOTICE);
  assert.equal(r.stripped.length, 2);
  assert.match(r.content, /### 정책 설명\n돌봄교실은 초등학생을/);
  assert.match(r.content, /\n백제의 금동대향로와/);
});
test("문장 끝맺음 머리말·일반 말머리·칸 이름표는 건드리지 않는다", () => {
  const t = "예를 들어: 학교 급식에서 과일을 눈에 띄는 곳에 두면 선택이 달라진다.\n금동대향로는 백제의 유물이다: 충남 부여 능산리 절터에서 출토되었다.\n제목: 가족의 약속을 정하는 방법에 대하여 쓴다.";
  assert.equal(stripNoticeEcho(t, NOTICE).content, t);
});

import { stripInlineNoticeEcho } from "./item-label.ts";
test("줄 한가운데 끼어든 안내문 문구 라벨을 뗀다 (가정-01)", () => {
  const t = "육아휴직을 효과적인 정책으로 골랐다. 가정 양립 정책 한 가지를 고르고: 육아휴직은 근로자가 일정 기간 일을 쉬며 아이를 돌보는 제도다.";
  const r = stripInlineNoticeEcho(t, "일 가정 양립 정책 중 효과적인 것을 한 가지를 골라 가정 양립 정책 한 가지를 고르고 작성");
  assert.equal(r.stripped.length, 1);
  assert.equal(r.content, "육아휴직을 효과적인 정책으로 골랐다. 육아휴직은 근로자가 일정 기간 일을 쉬며 아이를 돌보는 제도다.");
});
test("일반 문장 속 콜론은 건드리지 않는다", () => {
  const t = "결과는 다음과 같다. 예를 들어: 학교 급식에서 과일을 눈에 띄게 두면 선택이 달라진다.";
  assert.equal(stripInlineNoticeEcho(t, "정책 가정 양립").content, t);
});
