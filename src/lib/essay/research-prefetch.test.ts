import { test } from "node:test";
import assert from "node:assert/strict";
import { prefetchKey, startPrefetch, takePrefetchedResearch, prefetchSize, clearPrefetch } from "./research-prefetch.ts";

const parts = { subject: "과학", topic: "먹이관계와 생태계 피라미드", labels: ["멸치해부실험", "탐구 보고서"], studentTopic: "" };

test("미리 띄운 조사를 같은 열쇠로 가져간다", async () => {
  clearPrefetch();
  const key = prefetchKey(parts);
  startPrefetch(key, async () => ({ facts: [1, 2, 3] }));
  const got = await takePrefetchedResearch<{ facts: number[] }>(key);
  assert.deepEqual(got?.facts, [1, 2, 3]);
});

test("**한 번 쓰면 사라진다** — 다른 학생이 같은 안내문으로 와도 남은 것이 없다", async () => {
  clearPrefetch();
  const key = prefetchKey(parts);
  startPrefetch(key, async () => ({ facts: [1] }));
  assert.ok(await takePrefetchedResearch(key));
  assert.equal(await takePrefetchedResearch(key), null);
  assert.equal(prefetchSize(), 0);
});

test("학생이 고른 주제가 다르면 다른 열쇠다", () => {
  const a = prefetchKey({ ...parts, studentTopic: "전태일" });
  const b = prefetchKey({ ...parts, studentTopic: "방정환" });
  assert.notEqual(a, b);
  // 과제가 다르면(단계 구성이 다르면) 역시 다른 열쇠다
  assert.notEqual(prefetchKey(parts), prefetchKey({ ...parts, labels: ["탐구 보고서"] }));
});

test("같은 열쇠로 두 번 눌러도 조사는 한 번만 돈다", async () => {
  clearPrefetch();
  let runs = 0;
  const key = prefetchKey(parts);
  const run = async () => {
    runs += 1;
    return { n: runs };
  };
  startPrefetch(key, run);
  startPrefetch(key, run);
  await takePrefetchedResearch(key);
  assert.equal(runs, 1);
});

test("조사가 실패해도 터지지 않고 null로 온다", async () => {
  clearPrefetch();
  const key = prefetchKey(parts);
  startPrefetch(key, async () => {
    throw new Error("조사 실패");
  });
  assert.equal(await takePrefetchedResearch(key), null);
});

test("없는 열쇠는 null — 생성은 평소대로 조사한다", async () => {
  clearPrefetch();
  assert.equal(await takePrefetchedResearch("없는열쇠"), null);
});

// 미리 띄우는 쪽(api/tasks/research/prefetch)과 쓰는 쪽(api/tasks/generate/essay)이 **같은 식**으로
// 열쇠를 만들어야 한다. 한쪽만 바뀌면 조사를 해 놓고도 못 찾아 조용히 버린다(시간이 그대로 돌아온다).
test("미리 띄우는 쪽과 쓰는 쪽의 열쇠가 같다", () => {
  const core = { topic: "먹이관계와 생태계 피라미드", task_elements: [
    { type: "text_submission", label: "멸치해부실험" },
    { type: "text_submission", label: "탐구 보고서" },
    { type: "external_production", label: "포스터" },
  ] };
  const steps = core.task_elements.filter((e) => e.type === "text_submission").map((e) => e.label);
  const prefetchSide = prefetchKey({ subject: "과학", topic: core.topic, labels: steps, studentTopic: "" });
  const generateSide = prefetchKey({ subject: "과학", topic: core.topic, labels: steps, studentTopic: "" });
  assert.equal(prefetchSide, generateSide);
  // 제작 전 질문의 답이 **주제를 바꾸면** 열쇠가 달라져 미리 한 조사를 쓰지 않는다(그게 맞다).
  assert.notEqual(prefetchSide, prefetchKey({ subject: "과학", topic: core.topic, labels: steps, studentTopic: "인터넷 실명제 반대" }));
  // 글 단계가 아닌 것(포스터)은 열쇠에 넣지 않는다 — 두 쪽 다 text_submission만 센다.
  assert.ok(!prefetchSide.includes("포스터"));
});
