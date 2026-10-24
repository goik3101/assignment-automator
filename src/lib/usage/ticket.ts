import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// "같은 과제" 표. 과제 하나가 원고 1 + 외부 제작 계획 N개로 나뉘어 요청돼도 하루 생성 횟수는 한 번만 센다.
// 실측(2026-10-24): 신문(원고 + 만평/광고 계획 2)이 3회로 세여 하루 2회 한도에서는 끝까지 만들 수 없었다.
// 처음 센 요청이 표를 돌려주고, 같은 사용자의 이어지는 요청이 30분 안에 그 표를 내면 다시 세지 않는다(한 표로 최대 6회).
// DB 없이 서명으로 확인한다 — alias import 없음(node:test에서 바로 불러온다).

export const TICKET_TTL_MS = 30 * 60 * 1000;
export const TICKET_MAX_USES = 6;

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

// 표는 그 과제에만 쓴다: 주제와 산출물 목록으로 만든 키를 표에 넣는다(사람에게만 묶으면 표 하나로 30분 동안 아무 과제의 계획이나 6번까지 무료였다).
// 산출물 목록이 키에 들어가므로 요청에서 계획 개수를 부풀리면 키가 달라져 표가 통하지 않는다.
type AssignmentShape = { topic?: string; task_elements?: { label?: string; type?: string }[] };

export function assignmentKey(info: AssignmentShape): string {
  const text = [info.topic ?? "", ...(info.task_elements ?? []).map((e) => `${e.type ?? ""}:${e.label ?? ""}`)].join("|");
  return createHash("sha256").update(text).digest("base64url").slice(0, 22);
}

/** 이 과제에서 표로 이어서 만들 수 있는 계획 수 = 외부 제작 산출물 수(최대 TICKET_MAX_USES). */
export function planUseCap(info: AssignmentShape): number {
  const n = (info.task_elements ?? []).filter((e) => e.type === "external_production").length;
  return Math.min(TICKET_MAX_USES, Math.max(1, n));
}

/** owner는 "u:<userId>" 또는 "g:<guestId>", scope는 assignmentKey(과제). */
export function issueTicket(owner: string, secret: string, now = Date.now(), scope = ""): string {
  const payload = `${owner}.${scope}.${now}`;
  return `${Buffer.from(payload).toString("base64url")}.${sign(payload, secret)}`;
}

/** 서명·주인·유효 시간을 확인한다. 맞으면 표 자체를 사용 횟수 집계용 키로 돌려준다. */
export function verifyTicket(ticket: unknown, owner: string, secret: string, now = Date.now(), scope = ""): boolean {
  if (typeof ticket !== "string" || ticket.length > 500) return false;
  const [b64, mac] = ticket.split(".");
  if (!b64 || !mac) return false;
  const payload = Buffer.from(b64, "base64url").toString();
  const expected = sign(payload, secret);
  if (mac.length !== expected.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return false;
  const cut = payload.lastIndexOf(".");
  const issuedAt = Number(payload.slice(cut + 1));
  return payload.slice(0, cut) === `${owner}.${scope}` && Number.isFinite(issuedAt) && now - issuedAt >= 0 && now - issuedAt <= TICKET_TTL_MS;
}

// 한 표로 무한히 생성하지 못하게 서버 메모리로 사용 횟수를 센다(인스턴스마다 따로 세지만 표가 30분이면 끝나 충분하다).
const uses = new Map<string, { n: number; at: number }>();

export function consumeTicketUse(ticket: string, now = Date.now(), max = TICKET_MAX_USES): boolean {
  for (const [k, v] of uses) if (now - v.at > TICKET_TTL_MS) uses.delete(k);
  const cur = uses.get(ticket) ?? { n: 0, at: now };
  if (cur.n >= max) return false;
  uses.set(ticket, { n: cur.n + 1, at: cur.at });
  return true;
}

export function ticketSecret(): string {
  return process.env.GENERATION_TICKET_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}
