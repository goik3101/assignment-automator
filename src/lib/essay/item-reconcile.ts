// 분석이 사진에서 **잘못 읽은 칸 이름**을 원문 전사와 맞춰 바로잡는다. alias import 없음 — node:test에서 바로 불러옴.
//
// 왜(2026-11-15, 5종 직접 대조 과학-06): 안내문은 "행정 구역"·"지층이 생성된 시대"인데 분석이 "형성 구역"·"지층이 형성된 시기"로 읽었다.
// 칸 이름은 소제목이 되어 학생이 그대로 옮겨 쓴다 — 선생님 양식과 이름이 다르면 그 칸은 점수를 잃는다. 분석(구조화 호출)과 전사(글자 그대로 옮기는
// 별도 호출)는 **서로 다른 호출이라 같은 글자를 다르게 읽을 수 있고**, 칸 이름이 전사에 없으면서 전사에 **한두 글자만 다른 줄**이 있으면
// 분석이 잘못 읽은 것이다. 전사가 기준이 되는 이유: 요약하지 말고 옮기라는 호출이라 글자를 바꿀 동기가 없다.
//
// 지키는 선: ① 전사에 이미 그대로 있으면 건드리지 않는다 ② 4글자 이상만(짧은 이름은 오합병 위험) ③ 한 후보가 분명할 때만(동률이면 그대로)
// ④ 이미 다른 칸 이름인 후보로는 바꾸지 않는다.

const flat = (s: string) => s.replace(/[\s·・:：()（）'"‘’“”\-_,.]/g, "");

function lev(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 3) return 99;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

/** 전사에서 "칸 이름처럼 생긴" 조각(줄·표 칸·콜론 앞)을 모은다. */
function candidates(transcript: string): { text: string; key: string }[] {
  const out = new Map<string, string>();
  for (const line of transcript.split("\n")) {
    for (const cell of line.split(/[|｜]/)) {
      for (const part of [cell, cell.split(/[:：]/)[0]]) {
        const text = part.replace(/^\s*(?:[-•*①-⑩\d.)]+\s*)/, "").trim();
        const key = flat(text);
        if (key.length >= 4 && key.length <= 30 && !out.has(key)) out.set(key, text);
      }
    }
  }
  return [...out].map(([key, text]) => ({ key, text }));
}

export function reconcileItemLabels(items: string[], transcript: string | undefined): { items: string[]; changed: { from: string; to: string }[] } {
  if (!transcript || transcript.trim().length < 20) return { items, changed: [] };
  const whole = flat(transcript);
  const cands = candidates(transcript);
  const taken = new Set(items.map(flat));
  const changed: { from: string; to: string }[] = [];
  const next = items.map((item) => {
    const key = flat(item);
    if (key.length < 4 || whole.includes(key)) return item;
    // 4글자는 두 글자까지("행정구역"↔"형성구역"), 5~7글자는 한 글자, 8글자 이상은 1/4까지 — 길이가 중간인 이름이 다른 말로 바뀌지 않게 보수적으로.
    const limit = key.length <= 4 ? 2 : key.length <= 7 ? 1 : Math.floor(key.length / 4);
    const scored = cands
      .filter((c) => !taken.has(c.key))
      .map((c) => ({ c, d: lev(key, c.key) }))
      .filter((x) => x.d >= 1 && x.d <= limit)
      .sort((a, b) => a.d - b.d);
    if (scored.length === 0) return item;
    if (scored.length > 1 && scored[1].d === scored[0].d && scored[1].c.key !== scored[0].c.key) return item; // 동률이면 그대로
    const to = scored[0].c.text;
    changed.push({ from: item, to });
    taken.add(scored[0].c.key);
    return to;
  });
  return { items: next, changed };
}
