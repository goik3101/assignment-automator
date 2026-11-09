// 영역 사이에 **거의 같은 문장**이 되풀이되면 뒤쪽 것을 코드로 지운다. alias import 없음 — node:test에서 바로 불러옴.
//
// 왜(2026-11-09, 사용자가 웹사이트에서 받은 결과물20 — 한국사 현대사 신문):
// "제주4·3사건은 1947년 3월 1일을 기점으로 … 주민 희생이 발생한 사건이다"가 **네 영역 모두**에 들어갔다
// (머리기사·인터뷰·사설/칼럼·만평). 되풀이 검사기(`repetition.ts`)는 그 4쌍을 **정확히 잡았는데**
// 고치는 쪽이 모델 보완이라 시간 예산에 밀려 돌지 않았고, 그대로 학생에게 나갔다.
//
// 그래서 모델에게 다시 쓰라고 하지 않고 **코드가 지운다** — 호출이 없으니 시간 예산이 건너뛸 수 없고 비용도 0이다.
// 프롬프트로 "되풀이하지 말 것"을 말하는 길은 이미 기각됐다(2026-11-01: 영역 중복은 프롬프트로 안 고쳐졌고,
// 영역 순차 생성도 재 보니 중복 3/3 그대로에 분량만 줄었다).
//
// 지키는 선:
//  - **뒤쪽** 영역의 문장만 지운다(앞 영역이 그 사실의 주인이다).
//  - 지우고 나서 그 영역에 문장이 2개 미만으로 남으면 지우지 않는다(칸을 비워 버리면 더 나쁘다).
//  - 그 영역의 **마지막 각주**를 없애게 되면 지우지 않는다(출처 없는 영역이 되면 안 된다).
//  - 소제목·표 줄은 건드리지 않는다.

import { findRepeatedStatements, type RepeatedPair } from "./repetition.ts";

export interface DedupeResult {
  sections: { label: string; content: string }[];
  removed: { label: string; text: string }[];
}

const markers = (s: string): string[] => s.match(/\[\d+(?:,\d+)*\]/g) ?? [];

/**
 * 이 문장을 지우고도 그 영역에 글이 남는가.
 * `toStatements`로 세면 안 된다 — 그쪽은 18자 미만을 버리므로 "주민의 생명을 먼저 살펴야 한다" 같은
 * 멀쩡한 짧은 문장이 0개로 세어져 멀쩡한 지우기를 막는다(테스트에서 잡음).
 */
function keepsContent(content: string, sentence: string): boolean {
  const rest = content
    .split(sentence)
    .join(" ")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && !l.startsWith("|"));
  return rest.length >= 1 && rest.join("").length >= 40;
}

/**
 * `sharedPage`: **한 지면을 나눠 맡은 영역들의 이름**. 이 안에 둘 다 들어 있는 쌍만 지운다.
 *
 * 왜 좁히는가(저장된 결과물 40편 전수, 비용 0): 아무 영역이나 지우게 두면 과하게 지운다 —
 * 카드뉴스 한 단계의 칸 ①~⑥에서 12문장, "책 처방전 → 친구에게 편지"에서 친구의 고민 문장을 지웠다.
 * 칸마다·따로 제출하는 글마다 같은 사실을 다시 쓰는 것은 **자연스럽다**(편지는 그것만 읽어도 말이 돼야 한다).
 * 정말 나쁜 것은 **한 장에 나란히 실리는 영역**이 같은 문장을 네 번 쓰는 것이다(결과물20의 신문).
 */
export function dropRepeatedSentences(
  sections: { label: string; content: string }[],
  sharedPage: string[] = [],
  threshold = 0.72
): DedupeResult {
  const page = new Set(sharedPage);
  if (page.size < 2) return { sections: sections.map((s) => ({ ...s })), removed: [] };
  const order = new Map(sections.map((s, i) => [s.label, i]));
  const out = sections.map((s) => ({ ...s }));
  const removed: { label: string; text: string }[] = [];

  // 점수가 높은 쌍부터. 한 번 지울 때마다 글이 바뀌므로 쌍마다 다시 확인한다.
  for (const pair of findRepeatedStatements(sections, threshold)) {
    if (!page.has(pair.a.label) || !page.has(pair.b.label)) continue;
    if (pair.a.label === pair.b.label) continue; // 같은 영역 안(칸 사이)의 반복은 건드리지 않는다
    const later: RepeatedPair["a"] = (order.get(pair.a.label) ?? 0) >= (order.get(pair.b.label) ?? 0) ? pair.a : pair.b;
    const sec = out.find((s) => s.label === later.label);
    if (!sec || !sec.content.includes(later.text)) continue; // 이미 지웠거나 모양이 달라졌다
    if (!keepsContent(sec.content, later.text)) continue; // 칸이 비어 버린다
    const before = markers(sec.content);
    const next = sec.content
      .split(later.text)
      .join("")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/^[ \t]+$/gm, "")
      .trim();
    const after = markers(next);
    // 이 영역의 출처가 통째로 사라지면 지우지 않는다.
    if (before.length > 0 && after.length === 0) continue;
    sec.content = next;
    removed.push({ label: later.label, text: later.text });
  }
  return { sections: out, removed };
}

/**
 * 안내문의 **정의 문장**을 소제목처럼 앞에 붙여 쓴 줄에서 그 앞부분을 뗀다.
 *
 * 실측(결과물20, 사설/칼럼 칸):
 *   "사설은 신문사의 주장에 해당하고: 우리 신문은 제주 주민의 피해를 …"
 *   "칼럼은 필자의 주관적인 의견이나 견해: 나는 새 정부의 첫걸음이 …"
 * 안내문 채점 기준에 적힌 "사설: …견해를 밝히는 글 / 칼럼: …주관적인 의견"을 모델이 **라벨로 베껴** 썼다.
 * 학생이 그대로 옮기면 신문에 "사설은 신문사의 주장에 해당하고:"라는 줄이 들어간다.
 */
const DEFINITION_PREFIX =
  /^(?:사설|칼럼|머리기사|기사|인터뷰|만평|광고|표어|기고)(?:은|는|이란|란)\s[^\n:：]{0,60}(?:글|주장|의견|견해|것|내용)(?:에\s*해당하고|이고|입니다|이다)?\s*[:：]\s*/;

export function stripDefinitionPrefix(content: string): { content: string; stripped: string[] } {
  const stripped: string[] = [];
  const lines = content.split("\n").map((line) => {
    const m = line.match(DEFINITION_PREFIX);
    // 뗀 뒤에 실제 내용이 남아 있을 때만 뗀다(그 줄이 통째로 정의뿐이면 글쓴이의 소제목일 수 있다).
    if (!m || line.slice(m[0].length).trim().length < 10) return line;
    stripped.push(m[0].trim());
    return line.slice(m[0].length).trim();
  });
  return { content: lines.join("\n"), stripped };
}

/**
 * **같은 산출물이 두 단계로 쪼개진 경우**를 글만 보고 찾는다.
 *
 * 왜(2026-11-10, 국어 발표 1회): 분석이 "스토리보드"와 "발표용 그림 자료"를 **따로** 만들었고
 * 되풀이가 **8쌍**이었다 — 여덟 쌍 전부 그 두 단계 사이였다. 안내문이 요구한 것은 개요와 스토리보드
 * 둘뿐인데, 분석의 단계 수가 실행마다 1·2·3개로 흔들린다(저장된 국어 실행 6회에서 모두 관찰).
 * 단계 이름으로는 가릴 수 없다("발표용 그림 자료"가 스토리보드와 같은 것인지 이름만 봐서는 모른다).
 *
 * 그래서 **그 단계 문장의 절반 이상이 앞 단계와 거의 같은지**로 본다. 처방전↔편지처럼 따로 제출하는
 * 글은 같은 사실을 한두 번 겹칠 뿐이라(실측 1쌍) 이 문턱에 걸리지 않는다.
 */
export function duplicateStepLabels(
  sections: { label: string; content: string }[],
  threshold = 0.72,
  ratio = 0.5
): string[] {
  if (sections.length < 2) return [];
  const pairs = findRepeatedStatements(sections, threshold);
  const order = new Map(sections.map((s, i) => [s.label, i]));
  const dupCount = new Map<string, Set<string>>();
  for (const p of pairs) {
    if (p.a.label === p.b.label) continue;
    const later = (order.get(p.a.label) ?? 0) >= (order.get(p.b.label) ?? 0) ? p.a : p.b;
    const set = dupCount.get(later.label) ?? new Set<string>();
    set.add(later.text);
    dupCount.set(later.label, set);
  }
  const out: string[] = [];
  for (const sec of sections) {
    const dup = dupCount.get(sec.label);
    if (!dup || dup.size < 2) continue;
    const lines = sec.content
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#") && !l.startsWith("|"));
    if (lines.length === 0) continue;
    if (dup.size / lines.length >= ratio) out.push(sec.label);
  }
  // 겹치는 짝의 **앞 단계**도 같은 지면으로 다뤄야 뒤쪽을 지울 수 있다(dropRepeatedSentences는 둘 다 요구한다).
  if (out.length === 0) return [];
  const partners = new Set(out);
  for (const p of pairs) {
    if (partners.has(p.a.label)) partners.add(p.b.label);
    else if (partners.has(p.b.label)) partners.add(p.a.label);
  }
  return [...partners];
}
