// 안내문 사진을 보고 고쳐 온 단계 글을 **받아도 되는지** 코드가 가린다. alias import 없음 — node:test에서 바로 불러온다.
// 모델이 고쳤다고 해서 믿지 않는다: 새 수치·새 각주를 만들거나, 글이 지나치게 줄고 늘면 원문을 그대로 쓴다.
import { submittedLength } from "./submitted-length.ts";

const markers = (t: string) => new Set((t.match(/\[\d+(?:,\s*\d+)*\]/g) ?? []).flatMap((m) => m.replace(/[[\]\s]/g, "").split(",")));
const numbers = (t: string) => new Set((t.replace(/\[\d+(?:,\s*\d+)*\]/g, "").match(/\d[\d,.]*/g) ?? []).map((n) => n.replace(/[,.]+$/, "")));

export function acceptReviewedSection(original: string, revised: string): { ok: boolean; why?: string } {
  const r = revised.trim();
  if (!r) return { ok: false, why: "빈 글" };
  const a = submittedLength(original);
  const b = submittedLength(r);
  if (b < a * 0.45) return { ok: false, why: `너무 줄었다(${a}→${b})` };
  if (b > a * 1.3) return { ok: false, why: `너무 늘었다(${a}→${b})` };
  const om = markers(original);
  for (const m of markers(r)) if (!om.has(m)) return { ok: false, why: `없던 각주 [${m}]` };
  const on = numbers(original);
  for (const n of numbers(r)) if (!on.has(n)) return { ok: false, why: `없던 수치 ${n}` };
  // 소제목은 하나도 새로 만들지 않는다(빼는 것만 허용).
  const heads = (t: string) => new Set((t.match(/^#{2,4}[ \t]+.+$/gm) ?? []).map((h) => h.replace(/\s+/g, " ").trim()));
  const oh = heads(original);
  for (const h of heads(r)) if (!oh.has(h)) return { ok: false, why: `새 소제목 ${h}` };
  return { ok: true };
}
