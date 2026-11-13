// **인터뷰 답변이 사람의 말인지, 신문 기사인지** 코드로 가른다.
//
// 왜(2026-11-13, 같은 분석을 고정하고 3회): 신문 과제가 세 번 모두 **같은 항목**에서 떨어졌다 —
// "인터뷰 답변이 왜 그랬는지와 당시 대응에 대한 생각을 말한다". 흔들림이 아니라 **매번 틀리는 고정 결함**이었다.
// 실제로 나온 답변: "미·영·소 외상이 1945년 12월 모여 전후 처리를 논의했다.[1] 한국에는 최대 5년 신탁통치안이
// 포함됐다.[1]" — 겪은 사람의 말이 아니라 연표다.
//
// 프롬프트에는 이미 맞는 지시가 있다(`newspaperSectionRole`: "그 일을 겪은 사람의 말", "연표나 제도 설명을
// 답변에 넣지 말 것"). **지시가 있는데도 3/3으로 어겼다** — 이 저장소가 여러 번 확인한 대로, 말로 더 시키는
// 쪽이 아니라 코드가 잡아 그 칸만 다시 쓰게 하는 쪽이 듣는다.
//
// 판정은 **문장 끝**으로 한다(뜻이 아니라 꼴이라 과제 유형과 무관하게 안정적이다):
//   - 사람의 말 = 존댓말 종결(…요/…습니다/…죠) 또는 1인칭(저·제가·우리·저희)
//   - 신문 문체 = 평서형 종결(…했다/…였다/…이다/…된다)
// 답변에 신문 문체가 있고 사람의 말 표지가 **하나도 없으면** 그 답변은 기사다.
//
// alias import 없음 — node:test에서 바로 불러옴.

export function isInterviewStep(label: string): boolean {
  return /인터뷰|대담|좌담/.test((label ?? "").replace(/\s/g, ""));
}

/**
 * 존댓말 종결 또는 1인칭 — "사람이 말하고 있다"는 표지.
 * `니다`를 따로 두는 이유: 평서형 판정이 "…다"로 끝나는 것이라, 존댓말(…습니다)도 그 꼴이다.
 */
const SPOKEN = /(?:요|죠|네|니다|니까|세요|셨어요)[.!?…]?$|(?:^|[\s(])(?:저는|저도|저희|제가|우리는|우리도|내가|나는)[\s,]/;
/** 신문 기사 종결 — "…다"로 끝나는 평서형(존댓말은 위에서 먼저 걸러진다). */
const REPORTED = /다[.!?…]?$/;

/** 각주 번호는 문장 끝 판정을 가린다("…논의했다.[1]") — 먼저 뗀다. */
const sentencesOf = (text: string) =>
  (text ?? "")
    .replace(/\[\d+(?:\s*,\s*\d+)*\]/g, "")
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

/** 이 답변 글이 "겪은 사람의 말"로 읽히는가. */
export function soundsSpoken(answer: string): boolean {
  const ss = sentencesOf(answer);
  if (ss.length === 0) return true; // 빈 칸은 분량 검사가 본다
  const spoken = ss.filter((s) => SPOKEN.test(s)).length;
  const reported = ss.filter((s) => REPORTED.test(s)).length;
  if (spoken > 0) return true;
  return reported === 0;
}

/** `### 답변1` 같은 소제목 아래 글을 모은다. 소제목이 없으면 "질문" 다음 줄들을 본다. */
export function answerBlocks(content: string): { heading: string; text: string }[] {
  const lines = (content ?? "").split("\n");
  const out: { heading: string; text: string }[] = [];
  let cur: { heading: string; text: string[] } | null = null;
  for (const raw of lines) {
    const h = /^#{3,4}\s*(.+?)\s*$/.exec(raw.trim());
    if (h) {
      if (cur) out.push({ heading: cur.heading, text: cur.text.join("\n").trim() });
      cur = /답변|대답|답\s*\d/.test(h[1]) ? { heading: h[1], text: [] } : null;
      continue;
    }
    if (cur) cur.text.push(raw);
  }
  if (cur) out.push({ heading: cur.heading, text: cur.text.join("\n").trim() });
  return out.filter((b) => b.text);
}

/** 기사처럼 쓴 답변의 소제목들. 전부 사람 말이면 빈 배열. */
export function reportLikeAnswers(content: string): string[] {
  return answerBlocks(content)
    .filter((b) => !soundsSpoken(b.text))
    .map((b) => b.heading);
}

export function interviewVoiceRepairText(label: string, headings: string[]): string {
  return (
    `"${label}" 칸의 ${headings.join("·")}이(가) **겪은 사람의 말이 아니라 신문 기사처럼** 쓰였다. ` +
    `그 답변을 인터뷰 대상이 직접 말하는 말투(존댓말, "저는…", "그때 저희는…")로 다시 쓸 것 — ` +
    `무엇을 보고 겪었는지, 왜 그렇게 했는지, 그때 무엇을 바랐는지를 말하게 한다. ` +
    `연표·제도 설명과 날짜 나열은 빼고(그건 머리기사가 한다), 꼭 필요한 연도나 수치만 한두 개 남긴다. ` +
    `각주 번호는 남은 사실에만 그대로 붙이고, 질문 줄과 다른 칸은 건드리지 말 것.`
  );
}

export function interviewVoiceOn(): boolean {
  return process.env.INTERVIEW_VOICE !== "off";
}
