// 양식 사진의 **칸 높이(쪽 높이 대비 %)**로 항목(칸)마다 알맞은 글자 수를 낸다. alias import 없음.
//
// 왜(2026-11-26~27, 안내문 사진 대조): 분석의 거대한 한 호출에 "칸마다 줄 수를 적어라"를 시켰더니 큰 칸을 줄여 읽었다(수학-02 큰 칸 15줄을 6~7줄, 사회-03 같은 크기 칸 6개를 3·4·3·3·4·5줄).
// **칸 크기만 묻는 전용 질문**으로 바꾸니 사진에서 직접 잰 값과 거의 같았다 — 사회-03 12·14·14·14·13·15%(상대오차 4%, 3회 모두 같은 답),
// 수학-02 19·5·6·29·15%(내가 잰 값과 일치), 과학-05 9·33·31·14%. 줄이 없는 큰 칸도 높이는 읽는다. 양식이 아닌 안내문(역사-02·한문-01)은 빈 목록이 나온다.
// 이 값을 한 쪽(A4 약 40줄×30자 = 1,200자)의 비율로 환산해 칸마다 글자 수를 내고, 칸 안내 문구(hint)로 칸이 요구하는 뜻을 글쓰기에 전한다(국어-01 "② 구성"의 오독).
// 되돌리기: FORM_BOXES=off

import { similarity } from "./repetition.ts";

export interface FormBox {
  name: string;
  /** 칸 세로 높이 ÷ 사진 전체 높이 × 100(정수). */
  pct: number;
  /** 칸 안 인쇄 안내가 "무엇을 쓰라는 뜻인지"(예시 내용 제외, 짧게). */
  hint?: string;
}

/** 높이 1%당 글자 수 — A4 한 쪽 약 45줄 × 한 줄 30~35자. 사회-03 14% ≈ 6줄(≈13자/%), 국어-01 점선 칸 10% ≈ 5줄(≈15자/%)의 사이. */
const CHARS_PER_PCT = 14;
/** 칸을 가득 채우지 않는다 — 칸 안에 인쇄된 이름표·안내 문구와 손글씨 여백이 있다. */
const FILL = 0.85;

export function formBoxesOn(): boolean {
  return process.env.FORM_BOXES !== "off";
}

/** 분석 응답(믿을 수 없는 JSON)을 쓸 수 있는 칸 목록으로 다듬는다. 칸이 2개 미만이면 빈 배열(양식이 아니다). */
export function sanitizeFormBoxes(raw: unknown): FormBox[] {
  if (!Array.isArray(raw)) return [];
  const out: FormBox[] = [];
  for (const b of raw.slice(0, 16)) {
    const o = b as { name?: unknown; pct?: unknown; hint?: unknown };
    if (typeof o?.name !== "string" || typeof o.pct !== "number" || !Number.isFinite(o.pct)) continue;
    const name = o.name.replace(/\s+/g, " ").trim().slice(0, 80);
    const pct = Math.round(o.pct);
    if (name.length < 2 || pct < 1 || pct > 70) continue;
    const hint = typeof o.hint === "string" ? o.hint.replace(/\s+/g, " ").trim().slice(0, 40) : "";
    out.push({ name, pct, ...(hint ? { hint } : {}) });
  }
  const sum = out.reduce((s, b) => s + b.pct, 0);
  // 사진이 여러 장이면 칸 높이 합이 100%를 넘는다(장마다 100%) — 안내문 사진은 최대 4장.
  return out.length >= 2 && sum <= 400 ? out : [];
}

export interface ItemBox {
  item: string;
  box: string;
  pct: number;
  hint?: string;
  /** 이 칸에 쓸 글자 수(칸을 여럿이 나눠 쓰면 나눈 몫). */
  target: number;
  min: number;
  max: number;
}

const norm = (s: string) => s.replace(/[\s\d.()（）①-⑩,·:：'"「」『』]/g, "").toLowerCase();

/** 항목 이름에 가장 알맞은 칸을 찾는다. 이름이 칸 이름에 들어 있거나(칸 하나를 여러 항목이 나눠 쓰는 양식) 낱말이 비슷할 때만. */
function bestBox(item: string, boxes: FormBox[]): FormBox | null {
  const ni = norm(item);
  if (ni.length < 2) return null;
  let best: { b: FormBox; score: number } | null = null;
  for (const b of boxes) {
    const nb = norm(b.name);
    if (nb.length < 2) continue;
    // 항목 이름 "탐구를 통해 느낀 점"이 칸 이름 "…탐구를 통하여 느낀 점, 성장한 점…"에 통째로 들어 있진 않으니 낱말 겹침으로도 본다.
    const contains = nb.includes(ni) || ni.includes(nb);
    // 둘 다 들어맞으면 이름 길이가 더 비슷한 칸이 우선("나의 탐구 주제 분석내용"은 "나의 탐구 주제"보다 "(2) 나의 탐구 주제 분석내용 :" 칸).
    const score = contains ? 0.7 + 0.3 * (Math.min(ni.length, nb.length) / Math.max(ni.length, nb.length)) : similarity(ni, nb);
    if (score >= 0.5 && (!best || score > best.score)) best = { b, score };
  }
  return best?.b ?? null;
}

/** 이 단계의 항목마다 칸을 맞춘다. 항목의 60% 이상·2개 이상이 칸과 맞아야 쓴다(아니면 null — 추측하지 않는다). */
// 이름만 적는 칸은 안내가 이름과 같은 말이라 붙이지 않는다("책이름=읽은 책의 제목을 쓰기").
const TRIVIAL_ITEM = /^(?:책s*(?:이름|제목)|지은이.*|저자|출판사|단원명|이름|성명|학번|날짜|일시)$/;

export function itemBoxPlan(items: string[] | undefined, boxes: FormBox[] | undefined): { boxes: ItemBox[]; total: number; min: number } | null {
  if (!formBoxesOn() || !boxes || boxes.length < 2) return null;
  const list = (items ?? []).filter((i) => i.trim());
  if (list.length < 2) return null;
  const matched = list.map((item) => ({ item, box: bestBox(item, boxes) })).filter((m): m is { item: string; box: FormBox } => m.box !== null);
  if (matched.length < 2 || matched.length < Math.ceil(list.length * 0.6)) return null;
  const perBox = new Map<string, number>();
  for (const m of matched) perBox.set(m.box.name, (perBox.get(m.box.name) ?? 0) + 1);
  const out: ItemBox[] = matched.map(({ item, box }) => {
    const share = perBox.get(box.name) ?? 1;
    const cap = (box.pct * CHARS_PER_PCT) / share;
    const r10 = (x: number) => Math.max(10, Math.round(x / 10) * 10);
    return { item, box: box.name, pct: box.pct, ...(box.hint ? { hint: box.hint } : {}), target: r10(cap * FILL), min: r10(cap * 0.5), max: r10(cap) };
  });
  const sorted = out.map((o) => o.target).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const unmatched = list.length - out.length;
  const total = out.reduce((s, o) => s + o.target, 0) + unmatched * median;
  const min = out.reduce((s, o) => s + o.min, 0) + unmatched * Math.round(median * 0.6);
  return { boxes: out, total, min };
}

/** 필수 항목 블록 끝에 붙일 문장. 칸마다 크기와 칸 안내를 말한다. */
export function itemBoxNote(plan: { boxes: ItemBox[] } | null): string {
  if (!plan) return "";
  const sizes = plan.boxes.map((b) => `"${b.item}" 약 ${b.target}자(${b.min}~${b.max}자)`).join(", ");
  const hints = plan.boxes
    .filter((b) => b.hint && norm(b.hint) !== norm(b.item) && !TRIVIAL_ITEM.test(b.item.trim()))
    .slice(0, 8)
    .map((b) => `"${b.item}"=${b.hint}`)
    .join(" / ");
  return (
    `\n  양식 칸 크기(학생이 이 칸에 손으로 옮겨 적는다 — 칸을 넘기지 말고 칸의 절반 이상은 채울 것): ${sizes}.` +
    (hints ? `\n  칸이 요구하는 내용: ${hints}.` : "")
  );
}
