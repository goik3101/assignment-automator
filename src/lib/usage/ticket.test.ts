import { test } from "node:test";
import assert from "node:assert/strict";
import { consumeTicketUse, issueTicket, TICKET_MAX_USES, TICKET_TTL_MS, verifyTicket } from "./ticket.ts";

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
