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
  // 머리말이 칸 이름의 **앞부분만**("문제 구상" vs "문제 구상 및 알고리즘 설계")이면 칸 이름의 메아리가 아니라 그 칸 안의 진짜 내용이다 —
  // 2026-11-23 정보: "문제 구상: …" 한 줄이 통째로 지워져 "실생활 문제" 항목이 비었다. 칸 이름의 70% 이상을 말할 때만 메아리로 본다.
  if (name.startsWith(head) && head.length < name.length * 0.7) return false;
  // 칸 이름 뒤에 붙은 말이 **작성·표·칸 같은 군더더기**일 때만 메아리다. 그 밖의 말("인터뷰 대상", "머리기사 제목")은 그 칸 안의 **진짜 항목**이다 —
  // 2026-11-15 역사 신문: 인터뷰 칸의 "인터뷰 대상: 서울에 사는 가상의 시민입니다…"가 메아리로 지워져 인터뷰 대상 칸이 비었다.
  if (head.startsWith(name) && head.length > name.length && !/^(?:작성|표|칸|내용|설명|기준)+$/.test(head.slice(name.length))) return false;
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

/**
 * 소제목 바로 아래 줄이 **그 소제목을 다시 말하며** 시작하면("### 질문1" 다음 "질문 1: …") 반복된 머리말만 뗀다.
 * 2026-11-15 역사 신문 재생성에서 인터뷰 칸 네 곳이 전부 이렇게 나왔다 — 학생이 옮겨 적으면 "질문1 / 질문 1:"이 두 번 적힌다.
 */
export function stripHeadingEcho(content: string): { content: string; fixed: number } {
  const lines = (content ?? "").split("\n");
  let fixed = 0;
  for (let i = 0; i < lines.length; i++) {
    const h = /^#{2,4}\s+(.+?)\s*$/.exec(lines[i]);
    if (!h) continue;
    const name = flat(h[1].replace(/\*\*/g, ""));
    if (name.length < 2) continue;
    // 소제목 아래 **그 칸 안의 모든 줄**을 본다("### 정책 명칭" 아래 둘째 줄의 "정책 명칭: 돌봄교실이다."도 같은 되풀이다).
    for (let j = i + 1; j < lines.length && !/^#{2,4}\s/.test(lines[j]); j++) {
      const m = /^(\s*(?:\*\*)?)([^:：\n]{2,30}?)(?:\*\*)?\s*[:：]\s+(\S[\s\S]*)$/.exec(lines[j] ?? "");
      if (m && flat(m[2]) === name) {
        lines[j] = m[3];
        fixed++;
      }
    }
  }
  return { content: lines.join("\n"), fixed };
}
