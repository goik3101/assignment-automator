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
  [/산업혁명|역사|한국사|세계사|조선|왕조|전쟁|민주화|독립운동|혁명|항쟁|현대사|근대사/, "역사"],
  // "법"은 독립된 낱말일 때만("방법·해결방법" 등 속에 낀 글자에 걸리지 않게) — search-policy.ts의 같은 문제와 같은 해법.
  [/인권|사회|정치|경제|(?<![가-힣])법(?=[을이은는의과와도에]|\s|$|[,.)])|지리|시민/, "사회"],
  [/앱|프로그래밍|코딩|정보|알고리즘/, "정보"],
  [/포스터|미술|그림|디자인/, "미술"],
  [/음악|작곡|악기|노래/, "음악"],
  [/체육|운동|건강|스포츠/, "체육"],
  [/독서|감상문|비평|토론|신조어|글쓰기|발표문|국어|문학|시를|소설/, "국어"],
];

const EXTRA_SUBJECTS = ["역사", "화법과작문", "확률과통계", "미적분", "영어독해와작문", "논술", "정치와법", "경제수학", "기하", "대수", "물리", "생물", "환경", "보건", "일본어", "중국어", "제2외국어", "창의적체험활동"];

/** 알려진 과목명이 아니면(주제 문장의 첫 단어일 가능성) 의심한다 — "스마트폰을", "매주", "학교", "'My" 등. */
export function isSuspiciousSubject(subject: string): boolean {
  const s = subject.trim();
  if (!s || s.length < 2 || /^['"“‘]/.test(s) || SUBJECT_JOSA_END.test(s)) return true;
  const key = s.replace(/\s/g, "");
  return ![...KNOWN_SUBJECTS, ...EXTRA_SUBJECTS].some((k) => key === k || key.startsWith(k));
}

/** 모델이 준 과목이 의심스러우면 주제·항목 이름에서 과목을 추정한다. 못 찾으면 "과제"(뒤 단계가 요구하는 필수값 — 화면에 과목 칩으로 보인다). */
export function fallbackSubject(subject: string, ...texts: string[]): string {
  if (!isSuspiciousSubject(subject)) return subject;
  const t = texts.join(" ");
  for (const [re, name] of SUBJECT_KEYWORDS) if (re.test(t)) return name;
  // 못 찾았다: 짧고 조사로 끝나지 않는 값이면 모델의 값을 존중(예: 처음 보는 과목명), 아니면 필수값 기본값
  const s = subject.trim();
  return s.length >= 2 && s.length <= 8 && !SUBJECT_JOSA_END.test(s) && !/^['"“‘]/.test(s) ? s : "과제";
}

// 수업 중 다른 사람의 발표·활동을 듣거나 보면서 그 자리에서 적는 기록지(청중 기록지·동료/상호 평가지·듣기 활동지)는
// 학생이 미리 만들어 제출하는 결과물이 아니다 — 아직 일어나지 않은 발표를 지어내게 되므로 만들 결과물에서 뺀다.
// 실측(2026-10-27, 합성 안내문): 분석이 "청중 기록지"를 글로 제출하는 단계로 뽑아 그대로 생성 대상이 됐다.
const OBSERVER_LABEL = /청중\s*(?:기록|평가|반응|의견)|동료\s*평가|상호\s*평가|모둠원?\s*평가|듣기\s*활동지|관찰\s*기록지/;
const SHEET_LABEL = /기록지|평가지|활동지|학습지/;
const OBSERVE_DESC = /(?:다른|타|상대)\s*(?:모둠|조|팀|친구|학생|반)[^.\n]{0,40}(?:발표|활동|공연|토론|시연)[^.\n]{0,30}(?:듣|보|관람|시청|관찰)/;

export function isObservationSheet(el: { label: string; description: string }): boolean {
  return OBSERVER_LABEL.test(el.label) || (SHEET_LABEL.test(el.label) && OBSERVE_DESC.test(el.description));
}

// 대본 없이 말로 하는 발표("대본은 없어야 하며 자연스럽게 말해야 한다")는 글로 제출하는 결과물이 아니다 — 만들면 안내문이 금지한 대본이 된다.
// 발표 준비 단계(개요·스토리보드·발표 자료·대본 작성)는 이름에 그런 낱말이 있으므로 그대로 둔다.
const NO_SCRIPT = /대본\s*(?:은|을|이)?\s*(?:없|쓰지|사용하지|작성하지|읽지)|대본\s*없이/;
const ORAL_LABEL = /발표|말하기|스피치|연설|토론/;
const WRITTEN_LABEL = /대본|원고|개요|스토리보드|계획|기획|보고서|자료|정리|메모|요약/;

export function isScriptlessSpeech(el: { label: string; description: string }, context: string[] = []): boolean {
  return ORAL_LABEL.test(el.label) && !WRITTEN_LABEL.test(el.label) && NO_SCRIPT.test(`${el.description} ${context.join(" ")}`);
}

// 학생이 실물을 구해 붙이는 단계(신문 기사 스크랩, 사진 촬영·캡처, 인쇄해 부착)는 AI가 만들 수 있는 글이 아니다 —
// 그대로 두면 모델이 "스마트폰으로 촬영했다", "캡처해 보관했다"처럼 학생이 하지도 않은 행동을 지어낸다(실측 2026-10-29, 실제 제출 결과물).
// 쓸 항목(required_items)이 있거나 서술을 요구하면 글이 섞인 단계이므로 빼지 않는다 — 그쪽은 생성 규칙이 행동 날조만 막는다.
const ARTIFACT_LABEL = /스크랩|기사\s*(?:찾기|수집|출력)|사진\s*(?:촬영|찍기|수집)|자료\s*사진/;
const ARTIFACT_DESC = /스크랩|붙인다|붙여|부착|출력(?:해|하여|한다)|인쇄|촬영(?:해|하여|한다)|캡처|오려/;
const WRITE_DESC = /작성|서술|쓴다|쓰시오|기록한다|정리한다|분석|설명/;

export function isCollectedArtifact(el: { label: string; description: string; required_items?: string[] }): boolean {
  if ((el.required_items?.length ?? 0) >= 2) return false;
  const text = `${el.label} ${el.description}`;
  return (ARTIFACT_LABEL.test(el.label) || ARTIFACT_DESC.test(text)) && ARTIFACT_DESC.test(text) && !WRITE_DESC.test(el.description);
}

/** 만들 결과물에서 뺀 이유를 학생이 볼 수 있게 요구사항에 남기는 한 줄. */
export function dropNote(el: { label: string; description: string; required_items?: string[] }): string {
  if (isObservationSheet(el)) return `수업 중 직접 작성: ${el.label} (AI가 만들지 않음)`;
  if (isCollectedArtifact(el)) return `직접 준비: ${el.label} (학생이 실제 자료를 찾아 붙이는 활동 — AI가 만들지 않음)`;
  return `직접 수행: ${el.label} (대본 없이 말하기 — AI가 만들지 않음)`;
}

/** 수업 중 작성하는 기록지, 대본 없는 발표, 학생이 실물을 구해 붙이는 단계를 만들 결과물에서 뺀다. 그것밖에 없는 과제면 그대로 둔다. */
export function dropNonSubmissionActivities<T extends { label: string; description: string; required_items?: string[] }>(els: T[], context: string[] = []): { kept: T[]; dropped: T[] } {
  const skip = (e: T) => isObservationSheet(e) || isScriptlessSpeech(e, context) || isCollectedArtifact(e);
  const kept = els.filter((e) => !skip(e));
  if (kept.length === 0) return { kept: els, dropped: [] };
  return { kept, dropped: els.filter(skip) };
}
