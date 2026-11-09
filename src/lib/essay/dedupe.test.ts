import { test } from "node:test";
import assert from "node:assert/strict";
import { dropRepeatedSentences, duplicateStepLabels, stripDefinitionPrefix } from "./dedupe.ts";
import { findRepeatedStatements } from "./repetition.ts";

// 결과물20(한국사 신문)에서 실제로 네 영역에 되풀이된 문장
const DUP = "제주4·3사건은 1947년 3월 1일을 기점으로 1948년 4월 3일 이후 제주도에서 벌어진 무력충돌과 진압 과정에서 주민 희생이 발생한 사건이다.";

test("영역 사이 되풀이 문장은 뒤쪽 것을 지운다", () => {
  const sections = [
    { label: "머리기사", content: `제주도에서 충돌이 시작됐다.[1]\n${DUP}[1]\n새 정부가 출범한다.[2]` },
    { label: "사설/칼럼", content: `${DUP}[1]\n주민의 생명을 먼저 살펴야 한다.[2]\n책임도 외면하지 말아야 한다.[3]` },
  ];
  const r = dropRepeatedSentences(sections, sections.map((s) => s.label));
  assert.equal(r.removed.length, 1);
  assert.equal(r.removed[0].label, "사설/칼럼"); // 앞 영역이 그 사실의 주인
  assert.ok(r.sections[0].content.includes("제주4·3사건은"));
  assert.ok(!r.sections[1].content.includes("제주4·3사건은"));
  // 지운 뒤에는 되풀이가 남지 않는다
  assert.equal(findRepeatedStatements(r.sections).length, 0);
});

test("지우면 칸이 비는 영역은 건드리지 않는다", () => {
  const sections = [
    { label: "머리기사", content: `${DUP}[1]\n다른 문장이 있다.[1]\n또 다른 문장도 있다.[2]` },
    { label: "만평/광고", content: `${DUP}[1]` },
  ];
  const r = dropRepeatedSentences(sections, sections.map((s) => s.label));
  assert.equal(r.removed.length, 0);
  assert.ok(r.sections[1].content.includes("제주4·3사건은"));
});

test("그 영역의 각주가 통째로 사라지면 지우지 않는다", () => {
  const sections = [
    { label: "머리기사", content: `${DUP}[1]\n다른 문장.[1]\n또 다른 문장.[2]` },
    { label: "사설/칼럼", content: `${DUP}[1]\n각주 없는 의견 문장이다 그래서 이 영역의 출처는 하나뿐이다.\n또 각주 없는 문장이다 그래서 지우면 출처가 사라진다.` },
  ];
  const r = dropRepeatedSentences(sections, sections.map((s) => s.label));
  assert.equal(r.removed.length, 0);
});

test("같은 영역 안의 반복은 건드리지 않는다(문체 문제라 다른 규칙이 본다)", () => {
  const sections = [{ label: "머리기사", content: `${DUP}[1]\n${DUP}[1]\n세 번째 문장이 여기 있다.[2]` }];
  const r = dropRepeatedSentences(sections, sections.map((s) => s.label));
  assert.equal(r.removed.length, 0);
});

test("안내문 정의를 라벨로 베껴 쓴 앞부분을 뗀다 (결과물20 실측)", () => {
  const { content, stripped } = stripDefinitionPrefix(
    "사설은 신문사의 주장에 해당하고: 우리 신문은 제주 주민의 피해를 줄이는 일이 먼저라고 주장한다.\n" +
      "칼럼은 필자의 주관적인 의견이나 견해: 나는 새 정부의 첫걸음이 주민의 목소리를 듣는 데서 시작되어야 한다고 본다."
  );
  assert.equal(stripped.length, 2);
  assert.ok(content.startsWith("우리 신문은"));
  assert.ok(content.includes("나는 새 정부의"));
});

test("정의처럼 보여도 뒤에 내용이 없으면 그대로 둔다(글쓴이의 소제목일 수 있다)", () => {
  const { content, stripped } = stripDefinitionPrefix("사설은 신문사의 주장에 해당하는 글:");
  assert.equal(stripped.length, 0);
  assert.equal(content, "사설은 신문사의 주장에 해당하는 글:");
});

test("평범한 문장은 건드리지 않는다", () => {
  const keep = "사설은 이번 사건의 책임을 묻는다.\n이 기사는 1947년의 일을 다룬다.";
  assert.equal(stripDefinitionPrefix(keep).content, keep);
  assert.equal(stripDefinitionPrefix(keep).stripped.length, 0);
});

test("한 지면을 나눠 맡은 영역이 아니면 지우지 않는다 (따로 제출하는 글은 저마다 말이 돼야 한다)", () => {
  const sections = [
    { label: "책 처방전", content: `친구는 성적이 계속 떨어지면서 불안해지고 자존감도 낮아졌다고 했다.[1]
그래서 이 책을 골랐다.[1]
이 책이 도움이 될 것이다.[2]` },
    { label: "친구에게 편지 쓰기", content: `친구는 성적이 계속 떨어지면서 불안해지고 자존감도 낮아졌다고 했다.[1]
네게 이 책을 권하고 싶은 이유는 주인공이 너와 비슷한 고민을 지나왔기 때문이야.[1]
다음 주에 같이 읽고 어떤 장면이 기억에 남았는지 이야기해 보자고 말하고 싶어.[2]` },
  ];
  assert.equal(dropRepeatedSentences(sections, []).removed.length, 0);
  // 한 지면이라고 알려 주면 그때만 지운다
  assert.equal(dropRepeatedSentences(sections, sections.map((s) => s.label)).removed.length, 1);
});

test("한 단계를 나눠 쓴 두 몫 사이의 되풀이도 지운다 (국어 발표 실측: 되풀이 5쌍)", () => {
  // 단계가 하나뿐이라 항목을 둘로 나눠 동시에 쓴 경우. 두 호출은 서로의 글을 못 보므로 같은 사실을 둘 다 쓴다.
  const halves = [
    { label: "몫1", content: `헌법재판소는 2012년 8월 23일 인터넷 실명제가 표현의 자유를 과도하게 제한한다고 판단했다.[1]\n그래서 이 제도는 폐지됐다.[1]\n발표는 이 결정을 먼저 소개한다.[2]` },
    { label: "몫2", content: `헌법재판소는 2012년 8월 23일 인터넷 실명제가 표현의 자유를 과도하게 제한한다고 판단했다.[1]\n실명제는 악성 댓글을 의미 있게 줄이지 못했다.[2]\n대안으로 자율규제를 제시한다.[2]` },
  ];
  const r = dropRepeatedSentences(halves, halves.map((h) => h.label));
  assert.equal(r.removed.length, 1);
  assert.equal(r.removed[0].label, "몫2"); // 앞 몫이 그 사실의 주인
  assert.equal(findRepeatedStatements(r.sections).length, 0);
});

test("같은 산출물이 두 단계로 쪼개지면 그 둘을 한 지면으로 본다 (국어 발표 실측: 되풀이 8쌍)", () => {
  const same = [
    "말할 핵심: 헌법재판소가 2012년 8월 23일 인터넷 실명제를 위헌으로 결정했다는 내용이다.[1]",
    "말할 핵심: 불법 게시물이 의미 있게 줄지 않고 해외 사이트로 옮겨 가는 부작용이 있었다.[2]",
    "말할 핵심: 국내 사업자와 해외 사업자 사이에 역차별이 생겼다는 지적이 있었다.[3]",
  ];
  const sections = [
    { label: "개요", content: "글의 목적: 인터넷 실명제 도입에 반대하는 발표를 한다.\n예상 독자: 같은 반 학생들이다.\n주제: 표현의 자유를 지켜야 한다." },
    { label: "스토리보드", content: same.join("\n") },
    { label: "발표용 그림 자료", content: same.join("\n") },
  ];
  const dups = duplicateStepLabels(sections);
  assert.ok(dups.includes("발표용 그림 자료"), "쪼개진 뒤 단계를 못 찾았다");
  assert.ok(dups.includes("스토리보드"), "짝이 되는 앞 단계가 빠졌다");
  assert.ok(!dups.includes("개요"), "겹치지 않는 단계가 섞였다");
  // 그 라벨들을 한 지면으로 넘기면 뒤 단계의 되풀이가 지워진다
  const r = dropRepeatedSentences(sections, dups);
  assert.ok(r.removed.length >= 1);
  assert.ok(r.removed.every((x) => x.label === "발표용 그림 자료"));
});

test("따로 제출하는 글이 사실 하나를 겹치는 것은 쪼개진 것이 아니다", () => {
  const sections = [
    { label: "책 처방전", content: "친구는 성적이 떨어져 불안하다고 했다.[1]\n그래서 이 책을 골랐다.[1]\n주인공이 비슷한 고민을 지나간다.[2]\n읽고 나면 마음이 조금 가벼워질 것이다.[2]" },
    { label: "친구에게 편지 쓰기", content: "친구는 성적이 떨어져 불안하다고 했다.[1]\n네게 이 책을 권하고 싶은 이유를 적어 볼게.[1]\n다음 주에 같이 읽자고 말하고 싶어.[2]\n네가 혼자가 아니라는 걸 알아주면 좋겠어.[2]" },
  ];
  assert.deepEqual(duplicateStepLabels(sections), []);
});
