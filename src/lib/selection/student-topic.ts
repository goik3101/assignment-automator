// 학생이 이미 정한 주제·대상을 지침에서 코드로 찾는다(자동 선정보다 먼저). alias import 없음 — node:test에서 바로 불러올 수 있게.
// 실측(2026-10-24): 지침에 "청소년 SNS 사용 시간 제한 찬성"을 정해 두었는데 AI 판정이 이를 못 알아봐 자동 선정이 "iOS 스크린 타임 기능"으로
// 바꿔 버렸고, 다른 실행에서는 주제 대신 매체("슬라이드(파워포인트/구글슬라이드)")를 학생이 고른 대상으로 잡았다.

/** 무엇을 다룰지(주제·대상)를 묻는 질문/항목. */
const TOPIC_Q = /주제|인물|대상|소재|사례|사건|작품|기업|국가|지역|정책|쟁점|사회\s*문제|다룰|탐구할/;
/** 어떻게 만들지(매체·형식)를 묻는 질문 — 주제가 아니다. */
const MEDIUM_Q = /매체|형식|방식|도구|프로그램|플랫폼|분량|시간|디자인|구성|순서|말투|어조|자료\s*형태|발표\s*방법/;
/** 책은 책 선정(presetBook)이 따로 맡는다. */
const BOOK_Q = /책|도서|작가/;
/**
 * 결과물의 **한 영역**에만 걸리는 질문 — 그 답은 글 전체의 주제가 아니다.
 * 실측(2026-11-02, 한국사 신문): 제작 전 질문이 "인터뷰 대상을 누구로 할까요? → 당시 신문기자"였는데
 * 이 답이 신문 **전체의 대상**으로 잡혀, 광복~정부수립 현대사를 다뤄야 할 신문이 통째로 그 소재로 쏠렸다.
 * 머리기사는 신문의 중심 기사라 전체 주제와 같으므로 여기 넣지 않는다.
 */
const SECTION_Q = /인터뷰|만평|광고|사설|칼럼|표지|장면|카드|컷|슬라이드|삽화|문단|코너/;
/** 영역 이름이 나와도 "중심·전체"를 묻고 있으면 글 전체의 주제가 맞다. */
const GLOBAL_CUE = /중심|전체|머리기사|메인|초점/;
/** 매체·형식 이름 — 값 전체가 이것들로만 이루어진 답은 주제가 아니다("신문 기사 속 혐오 표현"처럼 매체 이름으로 시작하는 주제는 주제다). */
const MEDIUM_WORD = /^(?:슬라이드|파워포인트|PPT|구글슬라이드|구글|프레젠테이션|키노트|프레지|캔바|영상|동영상|유튜브|포스터|카드뉴스|카드|뉴스|인포그래픽|리플릿|팸플릿|신문|보고서|만화|웹툰|그림|사진|활용|형식|자료|제작|발표)$/i;

function mediumOnly(value: string): boolean {
  const words = value
    .replace(/[(（][^)）]*[)）]/g, " ")
    .split(/[\s/,·]+/)
    .filter(Boolean);
  return words.length > 0 && words.every((w) => MEDIUM_WORD.test(w));
}
/** 찬성·반대 같은 입장만 있는 답은 주제가 아니다. */
const STANCE_ONLY = /^(?:찬성|반대|중립|찬성\s*측|반대\s*측)$/;


/**
 * 학생이 말하듯 쓴 주제에서 대화 말꼬리를 뗀다.
 * 실측(2026-10-31): 지침 "노인 빈곤과 기초연금 문제로 할게."가 다룰 대상 이름으로 그대로 확정돼
 * 프롬프트의 「…」에 들어갔고, 완성 원고 본문 첫 줄이 "노인 빈곤과 기초연금 문제로 할게. 시장에서…"로 나왔다.
 */
const TRAILING_TALK =
  /\s*(?:(?:으?로|을|를|에\s*대해|에\s*관해|는|은)?\s*(?:발표|조사|작성|글쓰기|글|제작|정리|탐구|분석)?\s*(?:하고\s*싶어요?|하고\s*싶다|할게요?|할래요?|하자|하겠어요?|하겠다|할\s*거(?:야|예요|에요)|하려고요?|하려\s*한다|쓸게요?|쓰고\s*싶어요?|쓰겠어요?|쓰겠다|다룰게요?|정했어요?|정할게요?|골랐어요?|고를게요?|해\s*줘|해\s*주세요|으로요?|이에요|예요|입니다|이다))[.!~\s]*$/;
// 앞에 붙는 항목 이름("주제는 …", "발표 주제: …")도 대상 이름이 아니다.
const LEADING_LABEL = /^(?:발표|탐구|연구|토론|글)?\s*(?:주제|소재|대상)\s*(?:는|은|로|으로|를|을)?\s*[:：]?\s*/;

/**
 * 이 질문의 답이 **글 전체의 주제·대상**으로 읽히는가. findStudentTopic이 답을 읽는 조건과 **같은 함수**여야 한다 —
 * 질문을 만들 때와 답을 읽을 때의 기준이 어긋나면, 물어 놓고 그 답을 무시하는 일이 생긴다.
 * 책은 책 선정 경로가 따로 맡으므로 여기서는 주제 질문으로 보지 않는다.
 */
export function isTopicQuestion(question: string): boolean {
  if (!TOPIC_Q.test(question) || MEDIUM_Q.test(question) || BOOK_Q.test(question)) return false;
  if (SECTION_Q.test(question) && !GLOBAL_CUE.test(question)) return false;
  return true;
}

export function cleanSubjectName(value: string): string {
  let t = value.trim().replace(LEADING_LABEL, "").trim() || value.trim();
  for (let i = 0; i < 3; i++) {
    const next = t.replace(TRAILING_TALK, "").replace(/[\s.·,!~]+$/, "").trim();
    if (next === t || next.length < 2) break;
    t = next;
  }
  return t || value.trim();
}

// 학생이 항목 형식("주제: …")이 아니라 말하듯 한 문장으로 적은 주제.
// 실측(2026-10-31): 지침 "인터넷 실명제 도입에 반대하는 입장으로 발표할게."를 아무 규칙도 못 읽어
// 자동 선정이 돌았고(17.4초), 고른 주제가 "터키 소셜미디어법"이 되어 조사가 그쪽으로 갔다.
// 판정은 낱말이 아니라 **문장 구조**로 한다: 끝이 "~할게/~하고 싶어" 같은 선언이고, 무엇을 할지 말하는 낱말이 있고,
// 문체·분량·재생성 요청이 아닐 때만 주제로 본다.
const DECLARE_TAIL =
  /(?:하고\s*싶어요?|하고\s*싶다|할게요?|할래요?|하겠어요?|하겠다|하겠습니다|할\s*거(?:야|예요|에요)|하려고요?|쓸게요?|쓰겠어요?|쓰겠다|다룰게요?|정했어요?|정할게요?|골랐어요?|고를게요?)[.!~\s]*$/;
/** 무엇을 다룰지 말하는 낱말 — 이게 없으면 주제 선언이 아니다. */
const DECLARE_SUBJECT = /발표|조사|작성|글|쓰|다루|탐구|분석|만들|제작|주제|소재|입장|찬성|반대/;
/** 주제가 아니라 "이렇게 써 달라"는 요청. */
const STYLE_REQUEST =
  /쉽게|짧게|길게|자세히|문체|말투|어조|분량|글자\s*수|빨리|다시|수정|고쳐|바꿔|사진|이미지|흐려|안\s*보여|업로드|다운로드|오류|안\s*돼|느려/;

export function findDeclaredTopic(instructions?: string | null): string | null {
  for (const raw of (instructions ?? "").split(/[\n]+/)) {
    const line = raw.trim().replace(/^\s*[-*•]\s*/, "");
    if (line.length < 6 || line.length > 90) continue;
    if (!DECLARE_TAIL.test(line) || !DECLARE_SUBJECT.test(line) || STYLE_REQUEST.test(line)) continue;
    const v = usableAnswer(line);
    if (v && v.length >= 4) return v;
  }
  return null;
}

function usableAnswer(a: string): string | null {
  const t = a.trim().replace(/^["'“”‘’]|["'“”‘’]$/g, "").trim();
  if (t.length < 2 || t.length > 80) return null;
  if (t.startsWith("(")) return null; // "(학생이 나중에 직접 쓰겠다고 함)", "(학생이 AI에게 맡김)"
  if (mediumOnly(t) || STANCE_ONLY.test(t)) return null;
  return cleanSubjectName(t);
}

/**
 * 지침에서 학생이 정한 주제·대상을 찾는다. 찾지 못하면 null.
 * - 제작 전 질문 답변(answersToInstructions 형식: "- 질문: …\n  답: …") 중 주제·대상을 묻는 질문의 답
 * - "발표 주제: …", "주제: …", "인물: …" 같은 항목 줄
 * "주제"를 직접 묻는 질문/항목을 먼저 고른다.
 */
export function findStudentTopic(instructions?: string | null): string | null {
  if (!instructions?.trim()) return null;
  const found: { value: string; rank: number }[] = [];

  for (const m of instructions.matchAll(/^\s*-\s*질문:\s*(.+)\n\s*답:\s*(.+)$/gm)) {
    const q = m[1];
    if (!isTopicQuestion(q)) continue;
    const v = usableAnswer(m[2]);
    if (v) found.push({ value: v, rank: /주제/.test(q) ? 0 : 1 });
  }
  for (const m of instructions.matchAll(/^\s*(?:[-*•]\s*)?((?:발표|탐구|연구|토론|글)?\s*주제|인물|대상|소재)\s*[:：]\s*(.+)$/gm)) {
    const v = usableAnswer(m[2]);
    if (v) found.push({ value: v, rank: /주제/.test(m[1]) ? 0 : 1 });
  }
  if (found.length > 0) return found.sort((a, b) => a.rank - b.rank)[0].value;
  // 항목 형식이 없으면 말하듯 쓴 한 문장을 본다.
  return findDeclaredTopic(instructions);
}

/** AI가 "학생이 고른 대상"으로 뽑은 값이 매체·형식 이름뿐이면 대상이 아니다. */
export function isMediumOnly(value: string): boolean {
  return mediumOnly(value);
}
