// **모델이 자기가 쓴 칸을 설명한 줄**을 제출할 글에서 뗀다.
//
// 왜(2026-11-14 실측, 수학 수리논술 출제 10/12): 채점 기준표 칸 안에 이런 줄들이 섞여 나왔다 —
//   "분석적 채점 기준표: '평가 요소': 연속성·도함수 계산, 단조성·극값 분석 …"
//   "분석적 채점 기준표: '배점' 열과 '합계' 칸: 각 소문항별 배점을 합산하여 **총 30점**으로 제시하였고 …"
// 학생이 종이에 옮겨 적을 글이 아니라 **무엇을 어떻게 썼는지 설명**이고, 게다가 마지막 줄은 선생님이
// 적어 둔 총점(총 30점)을 글 안으로 끌고 들어왔다. 정답 채점에서 두 항목이 그래서 떨어졌다.
//
// 가려내는 기준은 뜻이 아니라 꼴이다: **그 줄이 자기 칸 이름으로 시작하고 콜론이 따라오면** 설명이다.
// 칸 이름은 학생이 양식에 옮겨 적는 제목이지, 본문 문장의 주어가 아니다.
// 표 줄(`|`)과 소제목(`#`)은 건드리지 않는다 — 거기 있는 칸 이름은 제자리에 있는 것이다.
//
// alias import 없음 — node:test에서 바로 불러옴.

const flat = (s: string) => (s ?? "").replace(/[\s'"'"“”‘’·]/g, "");

/** 이 줄이 "<칸 이름>: …" 꼴로 자기 칸을 설명하는가. */
export function echoesLabel(line: string, label: string): boolean {
  const raw = line.trim();
  if (!raw || /^[|#>]/.test(raw)) return false;
  const m = /^([^:：\n]{2,40})\s*[:：]\s*(.*)$/.exec(raw);
  if (!m) return false;
  const head = flat(m[1]);
  const name = flat(label);
  if (name.length < 3 || head.length < 3) return false;
  // 머리말이 칸 이름이거나, 칸 이름으로 시작하는 경우("분석적 채점 기준표", "분석적 채점 기준표 작성")
  if (!head.startsWith(name) && !name.startsWith(head)) return false;
  // 뒤에 내용이 있어야 설명이다 — "제목:"처럼 비어 있으면 학생이 채울 기입란이다.
  return m[2].trim().length > 0;
}

export function stripLabelEcho(content: string, label: string): { content: string; removed: string[] } {
  const removed: string[] = [];
  const kept = (content ?? "").split("\n").filter((line) => {
    if (!echoesLabel(line, label)) return true;
    removed.push(line.trim().slice(0, 60));
    return false;
  });
  if (removed.length === 0) return { content, removed };
  return { content: kept.join("\n").replace(/\n{3,}/g, "\n\n").trim(), removed };
}

export function labelEchoOn(): boolean {
  return process.env.LABEL_ECHO !== "off";
}
