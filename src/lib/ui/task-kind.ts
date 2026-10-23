// 사이드바 작업 목록 아이콘용 과제 유형 추정. 저장된 유형 필드가 없어서 제목·과목의 키워드로
// 추정한다(화면 표시 전용 — 다른 로직에 쓰지 않는다). 두 유형 이상이 걸리면 복합형.

export type TaskKind = "creative" | "research" | "memorize" | "mixed";

export const TASK_KIND_LABEL: Record<TaskKind, string> = {
  creative: "창작·작성형",
  research: "자료조사·분석형",
  memorize: "암기·정답형",
  mixed: "복합형",
};

// "시"처럼 한 글자 키워드는 "시험"·"시대" 등에 잘못 걸려서 넣지 않는다.
const KEYWORDS: Record<Exclude<TaskKind, "mixed">, string[]> = {
  creative: [
    "창작", "작성", "쓰기", "글쓰기", "감상문", "논설문", "수필", "소설", "편지", "신문", "포스터",
    "문구", "저널", "일기", "에세이", "비평", "서평", "연설문", "대본", "칼럼", "기사", "홍보",
    "카드뉴스", "캠페인", "표어", "자기소개", "독후감",
  ],
  research: ["조사", "탐구", "분석", "보고서", "비교", "출처", "자료", "연구", "실험", "리포트", "통계", "관찰"],
  memorize: ["암기", "퀴즈", "정답", "시험", "단어", "어휘", "문제 풀이", "문제풀이", "오답", "받아쓰기"],
};

export function classifyTaskKind(...texts: (string | null | undefined)[]): TaskKind {
  const text = texts.filter(Boolean).join(" ");
  const hits = (Object.keys(KEYWORDS) as (keyof typeof KEYWORDS)[]).filter((k) =>
    KEYWORDS[k].some((w) => text.includes(w))
  );
  if (hits.length > 1) return "mixed";
  // 키워드가 하나도 없으면 이 서비스에서 가장 흔한 글쓰기 과제로 본다.
  return hits[0] ?? "creative";
}
