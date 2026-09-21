// 분석 결과를 코드로 안정화하는 순수 함수들. 같은 안내문을 여러 번 분석해도 구조가 흔들리지 않게(실측: 같은 사회탐구가 글/외부제작으로 번갈아 분류) 한다.

// 외부 툴·물리적 제작이 실제로 필요하다는 뜻이 분명한 표현. 이게 하나도 없으면 "글로 그대로 제출 가능한" 산출물로 본다.
// ("표·그래프 계획", "기획서", "보고서"는 글이지 외부 제작물이 아니다.)
const EXTERNAL_PRODUCTION_HINT =
  /PPT|피피티|슬라이드|파워포인트|프레젠테이션 자료|캔바|미리캔버스|망고보드|포스터|현수막|카드뉴스|인포그래픽|영상|동영상|촬영|편집|모형|실물|도화지|그림을? 그|그려|손으로|직접 만들|만들기|제작물|UCC|웹사이트|홈페이지|앱을? (?:개발|제작|구현)|코딩|프로그래밍|3D|도안|디자인 시안|작품 제작|공예/i;

export function forceTextSubmissionIfNoExternalHint<T extends { type: string; label: string; description: string }>(
  el: T,
  topic: string
): T {
  if (el.type !== "external_production") return el;
  if (EXTERNAL_PRODUCTION_HINT.test(`${el.label} ${el.description} ${topic}`)) return el;
  return { ...el, type: "text_submission" };
}

// "스마트폰을", "'My", "학교" 같은 값은 과목이 아니라 주제 문장의 첫 단어다(안내문에 과목명이 없으면 모델이 이렇게 채운다).
import { KNOWN_SUBJECTS } from "./normalize-subject.ts";

const SUBJECT_JOSA_END = /[을를이가은는의에로와과도]$/;
const SUBJECT_KEYWORDS: [RegExp, string][] = [
  [/영어|English|My Favorite|speech/i, "영어"],
  [/수학|저축|수식|방정식|함수|확률/, "수학"],
  [/과학|실험|물리|화학|생명|지구과학|변인/, "과학"],
  [/산업혁명|역사|한국사|세계사|조선|왕조|전쟁/, "역사"],
  [/인권|사회|정치|경제|법|지리|시민/, "사회"],
  [/앱|프로그래밍|코딩|정보|알고리즘/, "정보"],
  [/포스터|미술|그림|디자인/, "미술"],
  [/음악|작곡|악기|노래/, "음악"],
  [/체육|운동|건강|스포츠/, "체육"],
  [/독서|감상문|비평|토론|신조어|글쓰기|발표문|국어|문학|시를|소설/, "국어"],
];

const EXTRA_SUBJECTS = ["화법과작문", "확률과통계", "미적분", "영어독해와작문", "논술", "정치와법", "경제수학", "기하", "대수", "물리", "생물", "환경", "보건", "일본어", "중국어", "제2외국어", "창의적체험활동"];

/** 알려진 과목명이 아니면(주제 문장의 첫 단어일 가능성) 의심한다 — "스마트폰을", "매주", "학교", "'My" 등. */
export function isSuspiciousSubject(subject: string): boolean {
  const s = subject.trim();
  if (!s || s.length < 2 || /^['"“‘]/.test(s) || SUBJECT_JOSA_END.test(s)) return true;
  const key = s.replace(/\s/g, "");
  return ![...KNOWN_SUBJECTS, ...EXTRA_SUBJECTS].some((k) => key === k || key.startsWith(k));
}

/** 모델이 준 과목이 의심스러우면 주제·항목 이름에서 과목을 추정한다. 못 찾으면 "수행평가"(뒤 단계가 요구하는 필수값). */
export function fallbackSubject(subject: string, ...texts: string[]): string {
  if (!isSuspiciousSubject(subject)) return subject;
  const t = texts.join(" ");
  for (const [re, name] of SUBJECT_KEYWORDS) if (re.test(t)) return name;
  // 못 찾았다: 짧고 조사로 끝나지 않는 값이면 모델의 값을 존중(예: 처음 보는 과목명), 아니면 필수값 기본값
  const s = subject.trim();
  return s.length >= 2 && s.length <= 8 && !SUBJECT_JOSA_END.test(s) && !/^['"“‘]/.test(s) ? s : "수행평가";
}
