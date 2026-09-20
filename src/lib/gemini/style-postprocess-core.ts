// 학생 문체 후처리 실험(기본 OFF)의 순수 부분 — 문장 분리, 후보 탐지, 수정안 검증. DB·LLM 호출 없음(테스트 가능).
// 원칙: 전체 재생성 금지, 무조건 삭제 금지, 문장 길이 증가 금지, 새 접속어·새 사실·새 평가 표현 금지, 사실/숫자/고유명사/출처 보존.
import { bigramSimilarity } from "../selection/canonical.ts";

export type PostKind = "connective" | "conclusion";

export interface Sentence {
  /** 문서 전체에서 유일한 번호. */
  id: number;
  line: number;
  text: string;
  prev: string | null;
  next: string | null;
}

export interface ParsedDoc {
  lines: string[];
  /** line → (접두사(불릿 등), 문장 배열) — 수정 대상이 될 수 있는 본문 줄만 있다. */
  bodies: Map<number, { prefix: string; sentences: string[] }>;
}

const SKIP_LINE = /^\s*(#{1,6}\s|\||```|>)/;

export function parseDoc(md: string): ParsedDoc {
  const lines = md.split("\n");
  const bodies = new Map<number, { prefix: string; sentences: string[] }>();
  lines.forEach((line, i) => {
    if (!line.trim() || SKIP_LINE.test(line)) return;
    const m = /^(\s*(?:[-*]|\d+[.)])\s+)?(.*)$/.exec(line)!;
    const body = m[2];
    const sentences = body.split(/(?<=[.!?。])\s+/).filter((s) => s.length > 0);
    if (sentences.length > 0) bodies.set(i, { prefix: m[1] ?? "", sentences });
  });
  return { lines, bodies };
}

export function flatSentences(doc: ParsedDoc): { id: number; line: number; idx: number; text: string }[] {
  const out: { id: number; line: number; idx: number; text: string }[] = [];
  let id = 0;
  for (const [line, b] of doc.bodies) b.sentences.forEach((text, idx) => out.push({ id: id++, line, idx, text }));
  return out;
}

export function render(doc: ParsedDoc): string {
  const lines = [...doc.lines];
  for (const [line, b] of doc.bodies) lines[line] = b.prefix + b.sentences.join(" ");
  return lines.join("\n");
}

// ---- 탐지 ----------------------------------------------------------------------------------

export const CONNECTIVE_START = /^(이러한|이는|또한|따라서|한편|이를 통해|이와 같은|이처럼)(?=\s|,)/;
// ~임을 알 수 있다 / ~임을 확인할 수 있다 / ~라는 점을 알 수 있다 / ~라고 볼 수 있다
export const CONCLUSION_FORMULA = /(?:[가-힣]+(?:임|음|함|됨))을 (?:알 수 있|확인할 수 있)|라는 점을 (?:알 수 있|확인할 수 있)|(?:라고|로) 볼 수 있/;

export function detectCandidates(doc: ParsedDoc, kind: PostKind): Sentence[] {
  const flat = flatSentences(doc);
  const re = kind === "connective" ? CONNECTIVE_START : CONCLUSION_FORMULA;
  return flat
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => re.test(s.text))
    .map(({ s, i }) => ({ id: s.id, line: s.line, text: s.text, prev: flat[i - 1]?.text ?? null, next: flat[i + 1]?.text ?? null }));
}

// ---- 검증 ----------------------------------------------------------------------------------

const ANY_CONNECTIVE = ["또한", "따라서", "즉", "그리고", "그래서", "하지만", "그러나", "한편", "나아가", "결국", "이처럼", "이러한", "이는", "이를 통해", "이와 같은", "이에", "더불어", "반면", "다만", "특히", "게다가", "뿐만 아니라", "이로써", "그런데", "그러므로"];
const EVAL_RE = /중요|의미|핵심|중대|시사|획기|혁신|압도|엄청|매우|가장|훌륭|뛰어|크게|깊은|대단|탁월|결정적|상당|큰 (?:영향|역할)/g;

const tokens = (s: string, re: RegExp) => (s.match(re) ?? []).map((x) => x.replace(/\s+/g, ""));
const NUM = /\d[\d,.]*/g;
const MARK = /\[\d+\]/g;
const LATIN = /[A-Za-z][A-Za-z'\-]*/g;
const QUOTED = /["“「『《][^"”」』》]{1,150}["”」』》]/g;

function sameSeq(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}
function connectivesIn(s: string): string[] {
  return ANY_CONNECTIVE.filter((c) => new RegExp(`(^|[\\s,(])${c}(?=[\\s,])`).test(s));
}
function evalsIn(s: string): string[] {
  return s.match(EVAL_RE) ?? [];
}

export interface Validation {
  ok: boolean;
  reasons: string[];
}

/** 수정안이 사실·숫자·이름·출처를 보존하고, 길어지지 않고, 새 접속어·평가어를 넣지 않았는지 기계적으로 검사한다. */
export function validateRewrite(original: string, rewritten: string, kind: PostKind): Validation {
  const reasons: string[] = [];
  const r = rewritten.trim();
  if (!r) return { ok: false, reasons: ["빈 결과"] };
  if (r === original.trim()) return { ok: false, reasons: ["변경 없음"] };
  if (r.length > original.trim().length) reasons.push(`길이 증가(${original.trim().length}→${r.length})`);
  if (!sameSeq(tokens(original, NUM), tokens(r, NUM))) reasons.push("숫자 변경");
  if (!sameSeq(tokens(original, MARK), tokens(r, MARK))) reasons.push("출처 번호 변경");
  if (!sameSeq(tokens(original, LATIN), tokens(r, LATIN))) reasons.push("영문 표기 변경");
  if (!sameSeq(tokens(original, QUOTED), tokens(r, QUOTED))) reasons.push("인용/제목 변경");
  const origConn = new Set(connectivesIn(original));
  const newConn = connectivesIn(r).filter((c) => !origConn.has(c));
  if (newConn.length > 0) reasons.push(`새 접속어/지시어(${newConn.join(",")})`);
  if (kind === "connective" && CONNECTIVE_START.test(r)) reasons.push("여전히 연결 표현으로 시작");
  if (kind === "conclusion" && CONCLUSION_FORMULA.test(r)) reasons.push("결론 공식 잔존");
  const origEval = new Set(evalsIn(original));
  const newEval = evalsIn(r).filter((e) => !origEval.has(e));
  if (newEval.length > 0) reasons.push(`새 평가 표현(${newEval.join(",")})`);
  if (!/[.!?。"”\]]$/.test(r)) reasons.push("문장 종결 부호 없음");
  if (/\s{2,}/.test(r) || /[.]{2,}/.test(r.replace(/\.\.\./g, ""))) reasons.push("공백/부호 이상");
  // 원문에서 문두 연결 표현만 제거한 것과 내용어가 거의 같아야 한다.
  const stem = kind === "connective" ? original.replace(CONNECTIVE_START, "").trim() : original.replace(CONCLUSION_FORMULA, "").trim();
  const overlap = bigramSimilarity(stem.replace(/\[\d+\]/g, ""), r.replace(/\[\d+\]/g, ""));
  if (overlap < 0.55) reasons.push(`내용 유사도 낮음(${overlap.toFixed(2)})`);
  // 서법 보존: "볼 수 있다"(판단)를 단정으로 바꾸지 않는다.
  if (kind === "conclusion" && /(?:라고|로) 볼 수 있/.test(original) && !/(보인다|본다|보였다|듯|것 같|해석된다)/.test(r)) reasons.push("판단(볼 수 있다)이 단정으로 바뀜");
  return { ok: reasons.length === 0, reasons };
}

export function applyRewrites(doc: ParsedDoc, rewrites: Map<number, string>): ParsedDoc {
  const next: ParsedDoc = { lines: doc.lines, bodies: new Map() };
  const flat = flatSentences(doc);
  const byLine = new Map<number, { prefix: string; sentences: string[] }>();
  for (const [line, b] of doc.bodies) byLine.set(line, { prefix: b.prefix, sentences: [...b.sentences] });
  for (const f of flat) {
    const rw = rewrites.get(f.id);
    if (rw !== undefined) byLine.get(f.line)!.sentences[f.idx] = rw.trim();
  }
  next.bodies = byLine;
  return next;
}
