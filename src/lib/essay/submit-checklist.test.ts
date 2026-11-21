import { test } from "node:test";
import assert from "node:assert/strict";
import { buildChecklist, type ChecklistInput } from "./submit-checklist.ts";

const base = (over: Partial<ChecklistInput> = {}): ChecklistInput => ({
  markdown: "## 서론\n해양 쓰레기는 2023년에 크게 늘었다.[1]",
  sources: [],
  claimChecks: [],
  ...over,
});
const kinds = (i: ChecklistInput) => buildChecklist(i).map((r) => r.kind);

test("출처도 검증도 없는 글은 행을 만들지 않는다(판단 보류)", () => {
  assert.deepEqual(kinds(base()), []);
});

test("링크가 전부 열리면 ok, 하나라도 안 열리면 todo, 검증 전(null)뿐이면 말하지 않는다", () => {
  assert.deepEqual(kinds(base({ sources: [{ url_valid: true }, { url_valid: true }] })), ["sourcesOpen", "length"]);
  const broken = buildChecklist(base({ sources: [{ url_valid: true }, { url_valid: false }] }));
  assert.equal(broken[0].kind, "sourcesBroken");
  assert.equal((broken[0] as { n: number }).n, 1);
  assert.deepEqual(kinds(base({ sources: [{ url_valid: null }] })), []);
  // 일부만 검증된 경우도 "전부 열림"이라고 하지 않는다
  assert.deepEqual(kinds(base({ sources: [{ url_valid: true }, { url_valid: null }] })), []);
});

test("서버가 붙인 경고는 todo 행으로 옮기고 문구는 그대로 둔다", () => {
  const rows = buildChecklist(base({ lengthWarning: "분량이 모자라요", structureWarning: "항목 누락", authorWarning: "저자 불일치", noSourcesWarning: true }));
  assert.deepEqual(
    rows.map((r) => r.kind),
    ["structureWarning", "lengthWarning", "authorWarning", "noSources", "length"]
  );
  assert.ok(rows.filter((r) => r.kind !== "length").every((r) => r.status === "todo"));
});

test("출처 없음 경고가 있으면 출처 ok 행은 만들지 않는다", () => {
  assert.ok(!kinds(base({ noSourcesWarning: true, sources: [{ url_valid: true }] })).includes("sourcesOpen"));
});

test("직접 작성 빈칸은 세고, 날짜·시간 칸은 세지 않는다", () => {
  const rows = buildChecklist(base({ markdown: "이름: [직접 작성: 이름]\n날짜: [직접 작성: 날짜]\n학교: [직접 작성: 학교]" }));
  const blanks = rows.find((r) => r.kind === "blanks") as { n: number } | undefined;
  assert.equal(blanks?.n, 2);
});

test("값을 확인한 문장이 있어야 claimsOk가 나오고, 확인 못 한 문장은 todo로 따로 나온다", () => {
  const ok = buildChecklist(base({ claimChecks: [{ checked: 3, supported: 2, repointed: 1, unverified: 0, unsupported: [] }] }));
  assert.equal((ok.find((r) => r.kind === "claimsOk") as { n: number }).n, 3);
  assert.ok(!ok.some((r) => r.kind === "claimsUnsupported"));

  const bad = buildChecklist(
    base({ claimChecks: [{ checked: 2, supported: 1, repointed: 0, unverified: 1, unsupported: [{ text: "2011년 3,500만 건", tokens: "3500만" }], marked: true }] })
  );
  const u = bad.find((r) => r.kind === "claimsUnsupported") as { items: unknown[]; marked: boolean };
  assert.equal(u.items.length, 1);
  assert.equal(u.marked, true);
  assert.ok(bad.some((r) => r.kind === "claimsUnread"));
});

test("대조한 문장이 0개면 어떤 claim 행도 만들지 않는다", () => {
  assert.ok(!kinds(base({ claimChecks: [{ checked: 0, supported: 0, repointed: 0, unverified: 0, unsupported: [] }], sources: [{ url_valid: true }] })).some((k) => k.startsWith("claims")));
});

test("글자 수는 각주·소제목 표시를 빼고 세며, 다른 행이 있을 때만 맨 뒤에 붙는다", () => {
  const rows = buildChecklist(base({ markdown: "## 제목\n가나다라마[1]", sources: [{ url_valid: true }] }));
  const last = rows[rows.length - 1] as { kind: string; chars: number };
  assert.equal(last.kind, "length");
  assert.equal(last.chars, 8); // "제목 가나다라마" (공백 포함 8자)
});
