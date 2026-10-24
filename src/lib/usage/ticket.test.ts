import { test } from "node:test";
import assert from "node:assert/strict";
import { assignmentKey, consumeTicketUse, issueTicket, planUseCap, TICKET_MAX_USES, TICKET_TTL_MS, verifyTicket } from "./ticket.ts";

test("같은 과제 표: 같은 사용자·30분 안에서만 통하고, 위조·남의 표·만료는 거절", () => {
  const t = issueTicket("u:1", "secret", 1000);
  assert.equal(verifyTicket(t, "u:1", "secret", 2000), true);
  assert.equal(verifyTicket(t, "u:2", "secret", 2000), false);
  assert.equal(verifyTicket(t, "u:1", "other", 2000), false);
  assert.equal(verifyTicket(t, "u:1", "secret", 1000 + TICKET_TTL_MS + 1), false);
  assert.equal(verifyTicket(t.replace(/.$/, (c) => (c === "A" ? "B" : "A")), "u:1", "secret", 2000), false);
  assert.equal(verifyTicket(undefined, "u:1", "secret"), false);
});

test("한 표로는 정해진 횟수까지만 쓴다", () => {
  const t = issueTicket("g:abc", "s", Date.now());
  for (let i = 0; i < TICKET_MAX_USES; i++) assert.equal(consumeTicketUse(t), true);
  assert.equal(consumeTicketUse(t), false);
});

test("표는 같은 과제에만 통하고, 그 과제의 계획 수만큼만 쓴다", () => {
  const news = { topic: "현대사 신문", task_elements: [{ type: "external_production", label: "머리기사" }, { type: "text_submission", label: "인터뷰" }, { type: "external_production", label: "만평/광고" }] };
  const other = { topic: "다른 과제", task_elements: [{ type: "external_production", label: "포스터" }] };
  const t = issueTicket("u:1", "s", 1000, assignmentKey(news));
  assert.equal(verifyTicket(t, "u:1", "s", 2000, assignmentKey(news)), true);
  assert.equal(verifyTicket(t, "u:1", "s", 2000, assignmentKey(other)), false);
  // 계획을 부풀려 보내면 과제 키가 달라진다.
  const inflated = { ...news, task_elements: [...news.task_elements, { type: "external_production", label: "추가" }] };
  assert.equal(verifyTicket(t, "u:1", "s", 2000, assignmentKey(inflated)), false);
  assert.equal(planUseCap(news), 2);
  const t2 = issueTicket("u:1", "s", Date.now(), assignmentKey(news));
  assert.equal(consumeTicketUse(t2, Date.now(), planUseCap(news)), true);
  assert.equal(consumeTicketUse(t2, Date.now(), planUseCap(news)), true);
  assert.equal(consumeTicketUse(t2, Date.now(), planUseCap(news)), false);
});
