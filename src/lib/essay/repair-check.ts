// 보완을 돌린 뒤 **실제로 고쳐졌는지** 다시 본다.
//
// 왜(실측 2026-11-02, 공통영어2): 누락을 감지했고(필수 어법) 보완도 돌았는데(1682→1803자) 밑줄은 끝내 안 붙었다.
// 우리는 "감지 → 보완 1회 → 끝"이고, 보완이 제 일을 했는지 아무도 보지 않는다. 0점짜리 조건이 모델의 협조에 걸려 있다.
// 이 검사는 과제 종류를 가리지 않는다 — 무엇을 보완하라고 했든 "그 단계가 바뀌었나"와 "요구한 말이 글에 들어왔나"만 본다.
// alias import 없음 — node:test에서 바로 불러올 수 있게.

export interface RepairTarget {
  label: string;
  missing: string[];
}

export interface Residual {
  label: string;
  /** 보완을 요청했는데 글이 한 글자도 안 바뀐 경우. */
  unchanged: boolean;
  /** 요구한 말이 여전히 글에서 안 보이는 것들. */
  stillMissing: string[];
}

// 지시문에서 따온 낱말 중 글에서 찾을 만한 것만 남긴다(조사·따옴표·지시 문구 제거).
const STOP = /^(?:그|이|저|것|수|등|및|또는|그리고|해당|관련|내용|부분|표현|문장|단계|사용|작성|표시|추가|포함|구체적|올바르게|반드시|각각)$/;
const CLEAN = /[「」『』"'“”‘’()（）[\]{}·,./!?:;~\-—]/g;

/** 지시문에서 "글에 들어왔는지" 확인할 낱말을 뽑는다. 뽑을 게 없으면 빈 배열(= 확인 못 함). */
export function keywordsOf(instruction: string): string[] {
  return [
    ...new Set(
      instruction
        .replace(CLEAN, " ")
        .split(/\s+/)
        .map((w) => w.replace(/(?:을|를|이|가|은|는|의|에|로|으로|와|과|도|만|에서|에게)$/, ""))
        .filter((w) => w.length >= 2 && w.length <= 20 && !STOP.test(w) && !/^\d+$/.test(w))
    ),
  ];
}

/** 요구한 말이 글에 들어왔는가 — 낱말의 절반 이상이 보이면 다뤄진 것으로 본다(문구는 바뀔 수 있으므로 느슨하게). */
export function covered(instruction: string, text: string): boolean {
  const words = keywordsOf(instruction);
  if (words.length === 0) return true; // 확인할 수 없으면 통과로 둔다(거짓 경고를 만들지 않는다)
  const body = text.replace(CLEAN, " ");
  const hit = words.filter((w) => body.includes(w)).length;
  return hit * 2 >= words.length;
}

/** 보완 전후를 비교해, 아직 남은 것을 돌려준다. */
export function residualsAfterRepair(
  before: { label: string; content: string }[],
  after: { label: string; content: string }[],
  targets: RepairTarget[]
): Residual[] {
  const out: Residual[] = [];
  for (const t of targets) {
    const b = before.find((s) => s.label === t.label)?.content ?? "";
    const a = after.find((s) => s.label === t.label)?.content ?? "";
    const stillMissing = t.missing.filter((m) => !covered(m, a));
    const unchanged = b.trim() === a.trim();
    if (unchanged || stillMissing.length > 0) out.push({ label: t.label, unchanged, stillMissing });
  }
  return out;
}
