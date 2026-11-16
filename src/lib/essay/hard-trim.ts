// 분량이 **상한을 넘었는데 모델 보정이 시간 때문에 건너뛰어졌을 때** 코드가 문단을 덜어 상한 안으로 넣는다. alias import 없음.
//
// 왜(2026-11-15, 사용자 실사용 역사 신문): 분량 가이드는 칸마다 "약 600자"였는데 결과는 966·901·1,163자(한 지면 3,250~3,600자)였고,
// 로그는 "시간 예산 초과 — 분량 보정 건너뜀"이었다. 이 프로젝트의 원칙은 "분량은 모델에 맡기지 않는다"인데 상한 지키기만은 모델 호출(보정)에
// 맡겨 두었고 그 호출은 시간 예산에 밀린다. 학생은 한 차시에 손으로 쓸 수 없는 양을 받았다 — 그래서 **마지막 안전장치는 코드**다.
//
// 지키는 선:
//  - 소제목·표·목록 줄은 건드리지 않고 **본문 문단**만 덜어 낸다. 첫 문단(주제)과 마지막 문단(맺음)은 남긴다.
//  - 가운데 문단 중 **각주가 없거나 적은 문단, 긴 문단**부터 덜어 내되, 덜어 낸 뒤 글에서 각주가 하나도 안 남게 되면 그 문단은 남긴다.
//  - 본문 문단이 둘 이하이면 덜지 않는다(문단 안을 자르면 문장이 끊긴다).

import { submittedLength } from "./submitted-length.ts";

const isBody = (p: string) => !/^\s*(?:#|\||[-*•]\s|\d+[.)]\s|\*\*[^*]+\*\*\s*$)/.test(p.trim()) && p.trim().length > 0;
const notes = (s: string) => (s.match(/\[\d+(?:\s*,\s*\d+)*\]/g) ?? []).length;

export function trimToCeiling(content: string, ceiling: number): { content: string; removed: number } {
  if (ceiling <= 0 || submittedLength(content) <= ceiling) return { content, removed: 0 };
  const paras = content.split(/\n{2,}/);
  // 소제목이 셋 이상이면 칸 하나하나가 필수 항목(인터뷰의 질문·답변 등)이라 문단을 덜면 항목이 빈다 — 덜지 않는다.
  if ((content.match(/^#{2,4}\s/gm) ?? []).length >= 3) return { content, removed: 0 };
  // 소제목 바로 아래 문단은 그 항목의 본문이므로 덜 후보에서 뺀다.
  const afterHeading = (i: number) => i > 0 && /^\s*#{2,4}\s/.test(paras[i - 1]);
  const bodyIdx = paras.map((p, i) => (isBody(p) ? i : -1)).filter((i) => i >= 0);
  if (bodyIdx.length <= 2) return { content, removed: 0 };
  const first = bodyIdx[0];
  const last = bodyIdx[bodyIdx.length - 1];
  // 덜어 낼 후보: 가운데 본문 문단. 각주가 적고 긴 것부터.
  const candidates = bodyIdx
    .filter((i) => i !== first && i !== last && !afterHeading(i))
    .sort((a, b) => notes(paras[a]) - notes(paras[b]) || paras[b].length - paras[a].length);
  const dropped = new Set<number>();
  let text = content;
  for (const i of candidates) {
    if (submittedLength(text) <= ceiling) break;
    const trial = new Set(dropped).add(i);
    const next = paras.filter((_, k) => !trial.has(k)).join("\n\n");
    if (notes(content) > 0 && notes(next) === 0) continue; // 출처가 통째로 사라지면 남긴다
    dropped.add(i);
    text = next;
  }
  return { content: text, removed: dropped.size };
}

/**
 * **항목 소제목이 여럿인 글**(위 `trimToCeiling`이 손대지 않는 모양)을 **문장 단위로** 줄인다 — 항목은 하나도 지우지 않는다.
 *
 * 왜(2026-11-16 사용자 테스트, 과학 3차시 포트폴리오): "매 차시 나눠주는 종이에만 작성"인 손글씨 과제의 1차시가 약 2,000자로 나왔다.
 * 한 차시에 손으로 쓸 수 있는 양(≈1,350자)의 1.5배다. 목표를 줘도 모델이 1.5배로 쓰는데, 줄이는 쪽 `trimToCeiling`은
 * 소제목이 셋 이상이면 "항목이 빈다"며 **아예 안 돌아서** 아무도 줄이지 못했다.
 * 방법: 가장 긴 항목의 **마지막 문장**부터 한 문장씩 뺀다. 항목마다 앞 두 문장은 지키고, 각주가 글 전체에서 하나도 안 남게 되면 그 문장은 남긴다.
 * 손으로 쓸 시간이라는 **물리적 한계**가 있는 단계에만 쓴다(추정 칸 크기로는 쓰지 않는다 — FIELD_FIT은 점수를 떨어뜨려 기각).
 */
export function trimItemSentences(content: string, ceiling: number): { content: string; removed: number } {
  if (ceiling <= 0 || submittedLength(content) <= ceiling) return { content, removed: 0 };
  const lines = content.split("\n");
  // 본문 줄(소제목·빈 줄 제외)마다 문장 목록
  const isBodyLine = (l: string) => l.trim() !== "" && !/^\s*#{1,6}\s/.test(l) && !/^\s*[|>]/.test(l);
  const sentencesOf = (l: string) => l.split(/(?<=[.!?。](?:\[\d+(?:,\s*\d+)*\])*)\s+/).filter(Boolean);
  const bodies = lines.map((l) => (isBodyLine(l) ? sentencesOf(l) : null));
  const total = () => submittedLength(lines.map((l, i) => (bodies[i] ? bodies[i]!.join(" ") : l)).join("\n"));
  const allText = () => lines.map((l, i) => (bodies[i] ? bodies[i]!.join(" ") : l)).join("\n");
  let removed = 0;
  for (let guard = 0; guard < 400 && total() > ceiling; guard++) {
    // 이어 붙인 한 항목(소제목 다음 본문 줄들) 중 가장 긴 줄을 고른다. 문장이 3개 이상이어야 뺄 수 있다(앞 두 문장 보호).
    let pick = -1;
    let best = 0;
    bodies.forEach((b, i) => {
      if (b && b.length >= 3) {
        const len = b.join(" ").length;
        if (len > best) {
          best = len;
          pick = i;
        }
      }
    });
    if (pick < 0) break;
    const last = bodies[pick]!.pop()!;
    // 이 문장이 글 전체의 마지막 각주 문장이면 되돌려 놓고 그 줄은 더 줄이지 않는다.
    if (notes(allText()) === 0 && notes(last) > 0) {
      bodies[pick]!.push(last);
      bodies[pick] = bodies[pick]!.slice(0, 2).concat(bodies[pick]!.slice(2)); // 변화 없음
      break;
    }
    removed++;
  }
  return { content: allText(), removed };
}
