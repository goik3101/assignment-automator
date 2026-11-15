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
