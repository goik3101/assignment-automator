// OpenAI Responses API용 순수 함수들 — 요청 만들기, 응답 정규화(본문 링크 → 출처 위치), 오류 분류. 네트워크 호출 없음(테스트 가능).
import { toOpenAiSchema } from "../schema-convert.ts";
import { LlmError, type GroundingChunkLike, type GroundingSupportLike, type LlmRequest, type SearchGrounding } from "../types.ts";

// ---- 요청 ---------------------------------------------------------------------------------

/** gpt-5 계열·o 시리즈는 추론 모델이라 temperature를 거부하고 reasoning.effort를 쓴다. */
export function isReasoningModel(model: string): boolean {
  return /^(gpt-5|o\d)/.test(model);
}

export const DEFAULT_MAX_OUTPUT = { plain: 6000, search: 10000 };

export function buildRequestBody(req: LlmRequest, model: string, opts: { maxOutputTokens?: number; searchContextSize?: string } = {}): Record<string, unknown> {
  const parts = typeof req.prompt === "string" ? [{ text: req.prompt }] : req.prompt;
  const content = parts.map((p) =>
    "text" in p ? { type: "input_text", text: p.text } : { type: "input_image", image_url: `data:${p.image.mimeType};base64,${p.image.base64}` }
  );
  const body: Record<string, unknown> = {
    model,
    input: [{ role: "user", content }],
    max_output_tokens: opts.maxOutputTokens ?? req.maxOutputTokens ?? (req.search ? DEFAULT_MAX_OUTPUT.search : DEFAULT_MAX_OUTPUT.plain),
    store: false, // 학생 안내문 등을 OpenAI 쪽에 저장하지 않도록 한다
  };
  if (req.system) body.instructions = req.system;
  if (isReasoningModel(model)) {
    // 웹 검색은 reasoning.effort "minimal"과 함께 쓸 수 없다(400) — 검색 요청은 최소 low로 올린다.
    let effort = req.effort ?? "low";
    if (req.search && effort === "minimal") effort = "low";
    body.reasoning = { effort };
  } else if (req.temperature !== undefined) {
    body.temperature = req.temperature;
  }
  if (req.schema) {
    body.text = { format: { type: "json_schema", name: sanitizeName(req.label), strict: true, schema: toOpenAiSchema(req.schema) } };
  }
  if (req.search) {
    body.tools = [{ type: "web_search", search_context_size: opts.searchContextSize ?? "low" }];
    body.tool_choice = req.search.force ? "required" : "auto";
  }
  return body;
}

function sanitizeName(label: string): string {
  return label.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60) || "out";
}

// ---- 응답 정규화 ---------------------------------------------------------------------------

interface OutputAnnotation {
  type: string;
  start_index?: number;
  end_index?: number;
  url?: string;
  title?: string;
}
interface OutputItem {
  type: string;
  content?: { type: string; text?: string; refusal?: string; annotations?: OutputAnnotation[] }[];
  action?: { type?: string; query?: string; queries?: string[] };
}
export interface OpenAiResponse {
  status?: string;
  incomplete_details?: { reason?: string } | null;
  error?: { code?: string; message?: string } | null;
  output?: OutputItem[];
  usage?: { input_tokens?: number; output_tokens?: number; output_tokens_details?: { reasoning_tokens?: number } };
}

/** 추적 파라미터(utm_source=openai 등)를 지우고 URL을 정리한다. 파싱 못 하면 원문 그대로. */
export function cleanUrl(raw: string): string {
  try {
    const u = new URL(raw);
    for (const k of [...u.searchParams.keys()]) if (/^utm_/i.test(k)) u.searchParams.delete(k);
    return u.toString().replace(/\?$/, "");
  } catch {
    return raw.replace(/[?&]utm_source=openai/i, "");
  }
}

// 본문에 모델이 스스로 끼워 넣는 인라인 링크: ([도메인](URL)) 또는 [제목](URL)
const INLINE_LINK = /\(?\[[^\]\n]{1,120}\]\(https?:\/\/[^)\s]+\)\)?/g;

interface Span {
  start: number;
  end: number;
  url?: string;
  title?: string;
}

/**
 * 본문 텍스트와 annotation에서 (1) 인라인 링크 구간을 지운 깨끗한 본문, (2) 출처 목록, (3) 각 링크가 있던 자리(= 그 앞 문장 끝)를 뽑는다.
 * annotation의 start/end_index는 UTF-16 글자 위치라 JS 문자열 인덱스와 같다(바이트 아님). 위치를 문자열 치환으로 찾지 않고 그 값을 그대로 쓴다.
 * annotation이 없는 인라인 링크는 정규식으로 보충한다(URL은 링크 자체에서 읽는다).
 */
export function extractCitations(text: string, annotations: OutputAnnotation[]): { text: string; chunks: GroundingChunkLike[]; supports: GroundingSupportLike[] } {
  const spans: Span[] = [];
  for (const a of annotations) {
    if (a.type !== "url_citation" || a.start_index === undefined || a.end_index === undefined || !a.url) continue;
    if (a.start_index < 0 || a.end_index > text.length || a.end_index <= a.start_index) continue;
    spans.push({ start: a.start_index, end: a.end_index, url: a.url, title: a.title });
  }
  // annotation이 커버하지 못한 인라인 링크 보충
  for (const m of text.matchAll(INLINE_LINK)) {
    const s = m.index ?? 0;
    const e = s + m[0].length;
    if (spans.some((x) => s < x.end && e > x.start)) continue;
    const url = /\((https?:\/\/[^)\s]+)\)/.exec(m[0])?.[1];
    const title = /\[([^\]]+)\]/.exec(m[0])?.[1];
    if (url) spans.push({ start: s, end: e, url, title });
  }
  spans.sort((a, b) => a.start - b.start);

  // 겹치는 구간 병합(같은 링크를 가리키는 여러 annotation) — 출처는 모두 유지
  const merged: { start: number; end: number; refs: { url: string; title?: string }[] }[] = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    if (last && s.start < last.end) {
      last.end = Math.max(last.end, s.end);
      last.refs.push({ url: s.url!, title: s.title });
    } else merged.push({ start: s.start, end: s.end, refs: [{ url: s.url!, title: s.title }] });
  }

  const chunks: GroundingChunkLike[] = [];
  const urlToIdx = new Map<string, number>();
  const idxOf = (url: string, title?: string) => {
    const u = cleanUrl(url);
    let i = urlToIdx.get(u);
    if (i === undefined) {
      i = chunks.length;
      urlToIdx.set(u, i);
      chunks.push({ web: { uri: u, title: title || undefined } });
    }
    return i;
  };

  // 깨끗한 본문 만들기 + 링크 자리(정리된 본문 기준 위치) 계산
  let out = "";
  let cursor = 0;
  const raw: { pos: number; idx: number[] }[] = [];
  for (const m of merged) {
    out += text.slice(cursor, m.start);
    cursor = m.end;
    // 링크 앞의 공백은 링크와 함께 지운다 — "…했다. ([x](y))" → "…했다."
    const trimmed = out.replace(/[ \t]+$/, "");
    out = trimmed;
    const idx = [...new Set(m.refs.map((r) => idxOf(r.url, r.title)))];
    raw.push({ pos: out.length, idx });
  }
  out += text.slice(cursor);

  // 각주는 문장부호 앞에 붙인다(기존 Gemini 흐름: "…되었다[1]."). 자리 바로 앞이 문장부호면 그 앞으로 옮긴다.
  const supports: GroundingSupportLike[] = [];
  for (const r of raw) {
    let p = r.pos;
    while (p > 0 && /["”')」』]/.test(out[p - 1] ?? "")) p--; // 닫는 따옴표는 문장부호 뒤에 있으므로 건너뛰고
    if (p > 0 && /[.!?。]/.test(out[p - 1] ?? "")) p--;
    else p = r.pos;
    supports.push({ segment: { startIndex: 0, endIndex: p }, groundingChunkIndices: r.idx, unit: "utf16" });
  }
  // 같은 위치의 supports는 하나로 합친다
  const byPos = new Map<number, Set<number>>();
  for (const s of supports) {
    const k = s.segment!.endIndex!;
    const set = byPos.get(k) ?? new Set<number>();
    (s.groundingChunkIndices ?? []).forEach((i) => set.add(i));
    byPos.set(k, set);
  }
  const mergedSupports: GroundingSupportLike[] = [...byPos.entries()].map(([pos, set]) => ({ segment: { startIndex: 0, endIndex: pos }, groundingChunkIndices: [...set], unit: "utf16" as const }));
  return { text: out.replace(/[ \t]{2,}/g, " "), chunks, supports: mergedSupports };
}

export interface Normalized {
  text: string;
  grounding?: SearchGrounding;
  usage: { inputTokens: number; outputTokens: number; reasoningTokens: number; searchCalls: number };
  refusal?: string;
}

export function normalizeResponse(resp: OpenAiResponse, wantsSearch: boolean): Normalized {
  const output = resp.output ?? [];
  const messages = output.filter((o) => o.type === "message").flatMap((o) => o.content ?? []);
  const textParts = messages.filter((c) => c.type === "output_text");
  const refusal = messages.find((c) => c.type === "refusal")?.refusal;
  const rawText = textParts.map((c) => c.text ?? "").join("");
  const annotations = textParts.flatMap((c) => c.annotations ?? []);
  const searchItems = output.filter((o) => o.type === "web_search_call");
  const queries = searchItems.flatMap((o) => (o.action?.queries ?? (o.action?.query ? [o.action.query] : [])));
  const usage = {
    inputTokens: resp.usage?.input_tokens ?? 0,
    outputTokens: resp.usage?.output_tokens ?? 0,
    reasoningTokens: resp.usage?.output_tokens_details?.reasoning_tokens ?? 0,
    searchCalls: searchItems.length,
  };
  if (!wantsSearch) return { text: rawText, usage, refusal };
  // 검색 응답: 인라인 링크를 걷어내고 출처 위치로 바꾼다. 출처가 하나도 없어도(모델이 안 썼을 때) grounding은 채워서 돌려준다.
  const ex = extractCitations(rawText, annotations);
  return { text: ex.text, grounding: { queries, chunks: ex.chunks, supports: ex.supports, searchCalls: searchItems.length }, usage, refusal };
}

// ---- 오류 분류 -----------------------------------------------------------------------------

export function classifyHttpError(status: number, body: { error?: { code?: string; type?: string; message?: string } } | null, retryAfterMs?: number): LlmError {
  const code = body?.error?.code ?? "";
  const msg = (body?.error?.message ?? `HTTP ${status}`).slice(0, 300);
  let err: LlmError;
  if (status === 429 && /insufficient_quota|billing/i.test(code + " " + msg)) err = new LlmError(msg, "quota", false, status);
  else if (status === 429) err = new LlmError(msg, "rate_limit", true, status);
  else if (status === 401 || status === 403) err = new LlmError(msg, "auth", false, status);
  else if (status === 408) err = new LlmError(msg, "timeout", true, status);
  else if (status === 400 && /tool/i.test(msg)) err = new LlmError(msg, "tool", false, status);
  else if (status === 400 || status === 404 || status === 422) err = new LlmError(msg, "bad_request", false, status);
  else if (status >= 500) err = new LlmError(msg, "server", true, status);
  else err = new LlmError(msg, "unknown", false, status);
  if (retryAfterMs !== undefined) err.retryAfterMs = retryAfterMs;
  return err;
}

/** 응답 본문 수준의 문제(status failed/incomplete, 거절, 빈 출력)를 오류로 바꾼다. 문제 없으면 null. */
export function checkBody(resp: OpenAiResponse, n: Normalized): LlmError | null {
  if (resp.status === "failed" || resp.error) {
    const code = resp.error?.code ?? "";
    const msg = resp.error?.message ?? "응답 생성 실패";
    return new LlmError(msg, /rate_limit/.test(code) ? "rate_limit" : /server|overloaded/.test(code) ? "server" : "unknown", /rate_limit|server|overloaded/.test(code));
  }
  if (n.refusal && !n.text.trim()) return new LlmError(`모델이 응답을 거절했습니다: ${n.refusal.slice(0, 120)}`, "invalid_output", false);
  if (resp.status === "incomplete" && resp.incomplete_details?.reason === "max_output_tokens" && !n.text.trim()) {
    return new LlmError("추론이 출력 한도를 모두 써서 본문이 비었습니다(max_output_tokens).", "empty_output", true);
  }
  if (!n.text.trim()) return new LlmError("응답 본문이 비어 있습니다.", "empty_output", true);
  return null;
}
