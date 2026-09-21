import { generate } from "@/lib/llm";
import { Type, type Schema } from "@google/genai";
import { applyRewrites, detectCandidates, parseDoc, render, validateRewrite, type PostKind, type Sentence } from "./style-postprocess-core";

// 학생 문체 후처리 실험 — 기본 OFF.
//   STYLE_POSTPROCESS_CONNECTIVES=1  : 문두 접속어/지시어(이러한·이는·또한·따라서·한편·이를 통해·이와 같은·이처럼)
//   STYLE_POSTPROCESS_CONCLUSION=1   : "~임을 알 수 있다"류 결론 공식
// 흐름: 생성 완료 → 문장별 탐지 → (LLM) 불필요 판단 + 그 문장만 재작성 → (코드) 길이·숫자·출처·이름·새 접속어·새 평가어 검증
//       → (LLM) 의미 동일성 검증 → 통과한 문장만 교체. 전체 재생성은 하지 않고, 불확실하면 원문을 유지한다.
export const STYLE_POSTPROCESS_FLAGS = {
  connective: () => process.env.STYLE_POSTPROCESS_CONNECTIVES === "1",
  conclusion: () => process.env.STYLE_POSTPROCESS_CONCLUSION === "1",
};

const MAX_PER_CALL = 12;

export const PROPOSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.INTEGER },
          action: { type: Type.STRING, enum: ["keep", "rewrite"] },
          rewritten: { type: Type.STRING, nullable: true },
        },
        required: ["id", "action"],
      },
    },
  },
  required: ["items"],
};
export const VERIFY_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { id: { type: Type.INTEGER }, same: { type: Type.BOOLEAN }, confidence: { type: Type.STRING, enum: ["high", "low"] } },
        required: ["id", "same", "confidence"],
      },
    },
  },
  required: ["items"],
};

function proposePrompt(kind: PostKind, items: Sentence[]): string {
  const rules =
    kind === "connective"
      ? `각 문장은 문두에 연결 표현(이러한/이는/또한/따라서/한편/이를 통해/이와 같은/이처럼)이 붙어 있다. 앞 문장과의 관계를 보고 그 연결 표현이 실제로 필요한지 판단해라.
- 필요 없으면(연결 표현을 빼도 앞 문장과의 흐름·논리·주어가 그대로 이해되면) action="rewrite"로 그 문장만 고쳐 쓴다. 가장 짧은 방법: 연결 표현만 빼거나, "이러한 X" → "X"처럼 지시어만 뺀다.
- 지시어가 앞 문장의 내용을 가리켜 주어 역할을 하거나(예: "이는 …이었다"), 인과·대조·순서 관계가 연결 표현에만 담겨 있으면 action="keep".`
      : `각 문장은 "~임을 알 수 있다/확인할 수 있다", "~라는 점을 알 수 있다", "~라고 볼 수 있다" 같은 결론 공식으로 끝난다.
- 뜻을 그대로 두면서 더 짧고 평범한 문장(예: "~였다", "~다", "~로 보인다")으로 바꿀 수 있을 때만 action="rewrite".
- "볼 수 있다"처럼 판단·해석을 나타내는 표현은 단정으로 바꾸지 말고 "보인다/본다"처럼 판단의 강도를 유지해라. 추측을 사실로 바꾸면 안 된다.
- 조금이라도 의미·어조가 달라질 것 같으면 action="keep".`;
  return `아래 [문장들]은 고등학생 수행평가 글의 일부다. 각 문장을 검토해 필요한 경우에만 그 문장 하나만 고쳐 써라.

${rules}

공통 규칙(어기면 안 됨):
- 원문보다 글자 수가 많아지면 안 된다. 새 접속어·지시어를 넣지 마라(그리고/그래서/특히/즉/이처럼 등 포함).
- 새 사실·새 평가 표현(중요한/의미 있는/큰 영향/핵심 등)을 넣지 마라. 어려운 단어로 바꾸지 마라.
- 숫자, 연도, 이름, 책 제목, 영문 표기, 따옴표 안의 글, [1] 같은 출처 번호는 글자 그대로 유지해라.
- 확신이 없으면 keep.

[문장들]
${items.map((s) => `#${s.id}\n앞 문장: ${s.prev ?? "(없음)"}\n대상 문장: ${s.text}`).join("\n\n")}`;
}

async function propose(kind: PostKind, items: Sentence[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  for (let i = 0; i < items.length; i += MAX_PER_CALL) {
    const chunk = items.slice(i, i + MAX_PER_CALL);
    const res = await generate({
      label: "style-postprocess:propose",
      role: "main",
      prompt: proposePrompt(kind, chunk),
      temperature: 0,
      schema: PROPOSE_SCHEMA,
    });
    const parsed = JSON.parse(res.text ?? "{}") as { items?: { id: number; action: string; rewritten?: string | null }[] };
    for (const it of parsed.items ?? []) if (it.action === "rewrite" && it.rewritten) out.set(it.id, it.rewritten);
  }
  return out;
}

async function verifyMeaning(pairs: { id: number; a: string; b: string }[]): Promise<Set<number>> {
  const ok = new Set<number>();
  if (pairs.length === 0) return ok;
  for (let i = 0; i < pairs.length; i += MAX_PER_CALL) {
    const chunk = pairs.slice(i, i + MAX_PER_CALL);
    const res = await generate({
      label: "style-postprocess:verify",
      role: "main",
      prompt: `각 쌍의 원문 A와 수정문 B가 사실·의미·어조(단정/추측의 강도)까지 완전히 같은지 엄격하게 판정해라. 조금이라도 다르면 same=false. 확신이 높을 때만 confidence="high".\n\n${chunk.map((p) => `#${p.id}\nA: ${p.a}\nB: ${p.b}`).join("\n\n")}`,
      temperature: 0,
      schema: VERIFY_SCHEMA,
    });
    const parsed = JSON.parse(res.text ?? "{}") as { items?: { id: number; same: boolean; confidence: string }[] };
    for (const it of parsed.items ?? []) if (it.same && it.confidence === "high") ok.add(it.id);
  }
  return ok;
}

export interface PostprocessReport {
  kind: PostKind;
  candidates: number;
  proposed: number;
  rejectedByRules: { id: number; reasons: string[] }[];
  rejectedByMeaning: number;
  applied: { id: number; before: string; after: string }[];
}

/** 한 종류(kind)의 후처리를 마크다운에 적용한다. 실패해도 원문을 그대로 돌려준다. */
export async function postprocessKind(md: string, kind: PostKind): Promise<{ text: string; report: PostprocessReport }> {
  const report: PostprocessReport = { kind, candidates: 0, proposed: 0, rejectedByRules: [], rejectedByMeaning: 0, applied: [] };
  try {
    const doc = parseDoc(md);
    const cands = detectCandidates(doc, kind);
    report.candidates = cands.length;
    if (cands.length === 0) return { text: md, report };

    const proposals = await propose(kind, cands);
    report.proposed = proposals.size;
    const passRules: { id: number; a: string; b: string }[] = [];
    for (const c of cands) {
      const rw = proposals.get(c.id);
      if (!rw) continue;
      const v = validateRewrite(c.text, rw, kind);
      if (v.ok) passRules.push({ id: c.id, a: c.text, b: rw.trim() });
      else report.rejectedByRules.push({ id: c.id, reasons: v.reasons });
    }
    const same = await verifyMeaning(passRules);
    const accepted = new Map<number, string>();
    for (const p of passRules) {
      if (same.has(p.id)) {
        accepted.set(p.id, p.b);
        report.applied.push({ id: p.id, before: p.a, after: p.b });
      } else report.rejectedByMeaning++;
    }
    if (accepted.size === 0) return { text: md, report };
    return { text: render(applyRewrites(doc, accepted)), report };
  } catch (err) {
    console.error(`[style-postprocess] ${kind} 실패 — 원문 유지`, err);
    return { text: md, report };
  }
}

/** 켜진 플래그의 후처리만 순서대로(접속어 → 결론 공식) 적용한다. 둘 다 꺼져 있으면 즉시 원문 반환. */
export async function postprocessStyle(md: string, kinds?: PostKind[]): Promise<{ text: string; reports: PostprocessReport[] }> {
  const active = kinds ?? (["connective", "conclusion"] as PostKind[]).filter((k) => STYLE_POSTPROCESS_FLAGS[k]());
  let text = md;
  const reports: PostprocessReport[] = [];
  for (const k of active) {
    const r = await postprocessKind(text, k);
    text = r.text;
    reports.push(r.report);
  }
  return { text, reports };
}
