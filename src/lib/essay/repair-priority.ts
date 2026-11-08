// 생성 뒤 보완이 **시간 예산에 밀려 안 돌 때 무엇부터 고칠지**를 가른다. alias import 없음 — node:test에서 바로 불러옴.
//
// 왜(2026-11-09, 저장된 생성 로그 31건 전수 + 정답 채점 3건):
//   - "단계 부분 보완"이 **17건에서 건너뛰어졌다**(55%). 생성(조사+글쓰기)만으로 19~39초를 쓰므로
//     30초 목표에 남는 시간이 없다. 즉 보완 단계는 사실상 **없는 기능**이었다.
//   - 그중 10건은 "정직성" 결함을 안고 나갔다(안 한 활동·없는 수치·거절문).
//   - 그리고 정답 채점에서 국어 발표가 **9/12**였는데, 떨어진 세 항목이 **전부 감지된 뒤 건너뛰어진 것**이었다
//     (근거를 "기관이 무슨 말을 했다"로 씀 / 스토리보드가 개요에 없는 출처를 들고 옴 / 근거를 한 문장으로 끝냄).
//     사용자가 1순위로 말한 "안내문에 나와 있는 대로 생성되는가"가 바로 이 항목들이다.
//
// 그래서 보완을 한 묶음으로 보지 않고 **반드시 고칠 것과 여유가 있을 때 고칠 것**으로 가른다.
//
//   - `"honesty"` — 고치지 않으면 결과물이 "덜 좋은" 게 아니라 **거짓**이 된다.
//     안 한 일을 했다고 쓰고, 없는 숫자를 쓰고, 제출 글에 "못 하겠다"가 들어간다.
//   - `"notice"` — **안내문이 글에 요구한 조건**을 어겼다(안내문 조건 대조, 근거 서술 방식, 앞 단계를 바탕으로 쓰기,
//     요구한 표, 금지한 자료, 다룰 기간). 못 지키면 그대로 감점이고, 이것이 이 서비스의 존재 이유다.
//   - 표시가 없는 것 — 형식·분량·문체·되풀이. 예산이 있을 때만 고친다. 못 고쳐도 "덜 좋은" 수준이다.
//
// 예산이 이미 없으면 **표시가 있는 것만** 고친다 — 전부 고치려 하면 단계마다 호출이 붙어 30초를 크게 넘긴다.
// 표시가 있는 보완은 시간 예산을 무시하고 한 번 돌리되, 추가 허용은 `GRACE_MS`까지다(실측 보완 1회 4.8초).
// 즉 **결함이 없는 실행은 30초 안에 끝나고, 결함이 있는 실행만 32~36초를 쓴다.**
// 되돌리기: `HONESTY_REPAIR=off`(예전처럼 전부 "필수" 한 묶음).

export type RepairMust = "honesty" | "notice";

export interface Rewrite {
  label: string;
  instruction: string;
  /** 비어 있으면 "여유가 있을 때". 값이 있으면 예산을 무시하고 한 번은 고친다. */
  must?: RepairMust;
}

/** 예산 특례를 쓰는가. 되돌리려면 `HONESTY_REPAIR=off`. */
export function honestyRepairOn(): boolean {
  return process.env.HONESTY_REPAIR !== "off";
}

/**
 * 예산을 무시해도 되는 보완만 고른다. 스위치가 꺼져 있으면 빈 배열 —
 * 그러면 호출하는 쪽이 예전처럼 "필수" 등급으로 한 묶음을 다룬다.
 */
export function mustRepairs(all: Rewrite[]): Rewrite[] {
  if (!honestyRepairOn()) return [];
  return all.filter((r) => !!r.must);
}

/** 무엇 때문에 예산을 넘기는지 로그에 적기 위한 요약("거짓 2건, 안내문 조건 1건"). */
export function describeMust(picked: Rewrite[]): string {
  const h = picked.filter((r) => r.must === "honesty").length;
  const n = picked.filter((r) => r.must === "notice").length;
  return [h ? `거짓 ${h}건` : "", n ? `안내문 조건 ${n}건` : ""].filter(Boolean).join(", ");
}

/**
 * 남은 시간이 보완 한 번을 시작할 만큼도 안 되는가(= 표시가 있는 것만 고쳐야 하는 상황인가).
 * `roomMs`는 전체 목표 시간에서 지금까지 쓴 시간을 뺀 값이고, `minRoomMs`는 보완 한 번의 최소 여유다.
 */
export function onlyMustAffordable(roomMs: number, minRoomMs: number): boolean {
  return roomMs < minRoomMs;
}

/**
 * 표시가 있는 보완에 허용하는 추가 시간. 보완 한 번이 실측 4.8초(글쓰기 역할)라 8초를 준다 —
 * 30초를 넘기지만, 안내문을 어긴 글이나 거짓 문장을 그대로 내보내는 것보다 낫다는 판단이다.
 * 0이면 `withDeadline`이 남은 시간 안에 못 끝난 보완을 버리므로 예전과 같아진다.
 */
export const GRACE_MS = Number(process.env.ESSAY_REPAIR_GRACE_MS ?? 8000);
