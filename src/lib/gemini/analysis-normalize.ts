// 분석 결과를 코드로 안정화하는 순수 함수들. 같은 안내문을 여러 번 분석해도 구조가 흔들리지 않게(실측: 같은 사회탐구가 글/외부제작으로 번갈아 분류) 한다.

// 외부 툴·물리적 제작이 실제로 필요하다는 뜻이 분명한 표현. 이게 하나도 없으면 "글로 그대로 제출 가능한" 산출물로 본다.
// ("표·그래프 계획", "기획서", "보고서"는 글이지 외부 제작물이 아니다.)
const EXTERNAL_PRODUCTION_HINT =
  /PPT|피피티|슬라이드|파워포인트|프레젠테이션 자료|캔바|미리캔버스|망고보드|포스터|현수막|카드뉴스|인포그래픽|영상|동영상|촬영|편집|모형|실물|도화지|그림을? 그|그려|손으로|직접 만들|만들기|제작물|UCC|웹사이트|홈페이지|앱을? (?:개발|제작|구현)|코딩|프로그래밍|3D|도안|디자인 시안|작품 제작|공예/i;

// 과제 제목에는 "신문 만들기", "감상문 만들기"처럼 **만든다는 말**이 흔히 들어간다. 그 말을 외부 제작 신호로 보면
// 그 과제의 단계가 전부 external_production으로 남아 학생이 글을 받지 못한다.
// 실측(2026-11-01, 한국사 현대사 신문): topic이 "…현대사 신문 만들기"라서 머리기사가 external_production이 됐고
// 기사 글이 생성되지 않았다(같은 사진 3회 중 1회). "독서 감상문 만들기"도 같은 모양으로 걸린다.
// 그래서 **제목에서는 도구·물건 이름만** 본다. "만들기·제작·그려" 같은 일반 동사는 그 단계의 label·description에서만 본다.
const EXTERNAL_TOOL_ONLY =
  /PPT|피피티|슬라이드|파워포인트|프레젠테이션 자료|캔바|미리캔버스|망고보드|포스터|현수막|카드뉴스|인포그래픽|영상|동영상|모형|실물|도화지|UCC|웹사이트|홈페이지|3D|공예/i;

export function forceTextSubmissionIfNoExternalHint<T extends { type: string; label: string; description: string }>(
  el: T,
  topic: string
): T {
  if (el.type !== "external_production") return el;
  if (EXTERNAL_PRODUCTION_HINT.test(`${el.label} ${el.description}`)) return el;
  if (EXTERNAL_TOOL_ONLY.test(topic)) return el;
  return { ...el, type: "text_submission" };
}

/**
 * 채울 칸이 있는 제작물은 "글 + 만들기"가 섞인 단계다 — 칸에 들어갈 말은 학생이 **써야** 한다.
 *
 * 우리 스키마가 required_items를 "써야 할 내용 항목"으로 정의한다(analyze.ts의 지시문). 그러니 칸이 있으면
 * 글 단계다. 산출물 이름이 외부 제작물이라는 이유만으로 external_production에 두면 학생은 아무 글도 못 받는다.
 *
 * 실측(2026-11-01, 역사 카드뉴스): 저장된 분석 3회가 **전부** external_production인데 required_items는
 * ["책 제목","카드 뉴스 제목","전달하고자 하는 메시지","①"…"⑥"] 9개였다. 생성이 글 경로를 타면 8/8,
 * 안 타면 "글 단계 없음"이 된다 — 같은 안내문인데 실행마다 달랐다.
 * 칸이 없는 순수 제작물("포스터를 그려 제출")은 그대로 둔다 — 그건 실행 계획 경로가 맞다.
 */
export function textWhenBoxesToFill<T extends { type: string; required_items?: string[] }>(el: T): T {
  if (el.type !== "external_production") return el;
  if ((el.required_items ?? []).filter((i) => i.trim()).length < 2) return el;
  return { ...el, type: "text_submission" };
}

// 칸이 없어도 "무엇을 써라"고 말하는 설명. 칸 목록이 비어 돌아온 실행을 위한 마지막 그물이다.
const WRITE_CUE = /작성|서술|쓴다|쓰시오|쓰기|적는다|적을|문구|대사|메시지|소개|설명|분석|주장|근거|감상|소감/;

/**
 * 마지막 안전장치: 글 단계가 하나도 없으면 학생은 빈손으로 받는다.
 * 쓸 거리가 있는 단계(칸이 있거나 설명이 쓰라고 하는 단계) 중 칸이 가장 많은 하나를 글 단계로 올린다.
 * 쓸 거리가 전혀 없으면 올리지 않는다 — 그 과제는 실행 계획으로 가는 게 맞다.
 */
export function ensureSomeTextStep<T extends { type: string; label: string; description: string; required_items?: string[] }>(els: T[]): T[] {
  if (els.some((e) => e.type === "text_submission")) return els;
  const writable = els.filter((e) => (e.required_items ?? []).some((i) => i.trim()) || WRITE_CUE.test(`${e.label} ${e.description}`));
  if (writable.length === 0) return els;
  const best = writable.reduce((a, b) => ((b.required_items ?? []).length > (a.required_items ?? []).length ? b : a));
  return els.map((e) => (e === best ? { ...e, type: "text_submission" } : e));
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

// 듣고 파악하는 평가(강연·대화를 듣고 내용 파악하기)는 학생이 시험 시간에 하는 것이지 AI가 쓸 글이 아니다.
// 실측(2026-11-01, 2학기 화작 수행평가): "② 화법의 원리 파악하기 — 강연 또는 대화를 듣고 맥락을 고려하여
// 말하기의 내용 파악하기"가 글 단계가 되어, 듣지도 않은 강연의 "말하기 상황과 맥락"·"핵심 내용"을 지어냈다.
// 듣고 **쓰는** 과제(감상문·요약문·기록지)는 글이 맞으므로 빼지 않는다.
// "듣고"만 보면 신문의 인터뷰 단계("겪은 사람의 이야기를 듣고 질문 2개와 답변 2개로 정리")까지 지워 버린다
// (실측 2026-11-01, 규칙을 넣자마자 확인). 세 가지가 다 맞을 때만 듣기 평가로 본다:
//   ① 듣는 상황이고 ② 결과가 "파악·이해"뿐이고 ③ 글로 낼 것을 만들라는 말이 없다.
const LISTEN = /(?:강연|강의|대화|담화|이야기|방송)[^.\n]{0,20}(?:듣고|들으며|들은|청취)|듣기\s*평가/;
const COMPREHEND = /파악|이해|듣기\s*평가/;
const LISTEN_WRITE = /작성|서술|쓴다|쓰시오|쓰기|기록|감상문|요약문|보고서|평가지|글로|정리|구성|구상|만든다|제작|그린다/;

export function isListeningTest(el: { label: string; description: string }): boolean {
  const text = `${el.label} ${el.description}`;
  return LISTEN.test(text) && COMPREHEND.test(text) && !LISTEN_WRITE.test(text);
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

// 희망자만 하는 활동("발표는 희망자만", "원하는 학생만 제출")은 **필수 결과물이 아니다** — 만들면 대부분의 학생에게는 쓸모없는 호출이고,
// 실측(2026-11-14, 거대 안내문 점검 정보-01): "발표(희망자만)"의 발표 자료 계획까지 생성해 한 과제가 60.3초가 됐다(글 보고서만이면 약 36초).
// "희망 진로"처럼 다른 뜻의 '희망'은 보지 않도록 사람을 가리키는 꼴(희망자·희망하는 학생·원하는 학생)만 본다.
const OPTIONAL_MARK = /희망자(?:만|에\s*한|는)|희망하는\s*(?:학생|사람)|원하는\s*학생|희망\s*시|자율\s*참여|선택\s*(?:과제|사항|활동)/;

export function isOptionalActivity(el: { label: string; description: string }, context: string[] = []): boolean {
  if (OPTIONAL_MARK.test(`${el.label} ${el.description}`)) return true;
  // 설명에는 없고 요구사항 한 줄에만 "발표는 희망자만"이 있는 경우 — 그 단계 이름이 문장에 함께 있을 때만 본다.
  const key = el.label.replace(/\s+/g, "").replace(/자료$/, "");
  return key.length >= 2 && context.some((c) => OPTIONAL_MARK.test(c) && c.replace(/\s+/g, "").includes(key));
}

// 앞 단계에서 쓴 글을 **그대로 옮겨 입력**하는 단계("작성한 포트폴리오를 토대로 슈퍼스쿨에 입력")는 새로 만들 결과물이 아니다.
// 실측(2026-11-14, 과학-08): 분석이 이 단계를 "3차시 PPT 슬라이드"로 읽어 PPT 제작 계획을 만들었다(65.1초·$0.141 — 이번 점검에서 가장 비싼 생성).
const TRANSCRIBE_STEP = /(?:작성한|쓴|앞에서\s*쓴)[^.\n]{0,30}(?:토대로|바탕으로|그대로)[^.\n]{0,30}(?:입력|옮겨\s*적|옮겨\s*쓰|옮겨\s*입력)/;

export function isTranscriptionStep(el: { label: string; description: string }): boolean {
  return TRANSCRIBE_STEP.test(`${el.label} ${el.description}`);
}

/** 만들 결과물에서 뺀 이유를 학생이 볼 수 있게 요구사항에 남기는 한 줄. */
export function dropNote(el: { label: string; description: string; required_items?: string[] }): string {
  if (isObservationSheet(el)) return `수업 중 직접 작성: ${el.label} (AI가 만들지 않음)`;
  if (isCollectedArtifact(el)) return `직접 준비: ${el.label} (학생이 실제 자료를 찾아 붙이는 활동 — AI가 만들지 않음)`;
  if (isListeningTest(el)) return `수업 중 직접 수행: ${el.label} (듣고 파악하는 평가 — AI가 만들지 않음)`;
  if (isTranscriptionStep(el)) return `직접 수행: ${el.label} (앞 단계에서 쓴 글을 옮겨 입력하는 활동 — AI가 따로 만들지 않음)`;
  if (isOptionalActivity(el)) return `선택 활동(희망자만): ${el.label} (필수 결과물이 아니라 AI가 만들지 않음)`;
  return `직접 수행: ${el.label} (대본 없이 말하기 — AI가 만들지 않음)`;
}

/** 수업 중 작성하는 기록지, 대본 없는 발표, 학생이 실물을 구해 붙이는 단계를 만들 결과물에서 뺀다. 그것밖에 없는 과제면 그대로 둔다. */
export function dropNonSubmissionActivities<T extends { label: string; description: string; required_items?: string[] }>(els: T[], context: string[] = []): { kept: T[]; dropped: T[] } {
  const skip = (e: T) => isObservationSheet(e) || isScriptlessSpeech(e, context) || isCollectedArtifact(e) || isListeningTest(e) || isTranscriptionStep(e) || isOptionalActivity(e, context);
  const kept = els.filter((e) => !skip(e));
  if (kept.length === 0) return { kept: els, dropped: [] };
  return { kept, dropped: els.filter(skip) };
}

// 채점 기준의 "누가·언제·어디서·무엇을·어떻게·왜가 잘 드러나게끔 작성하면 됨"은 **글에 담길 내용의 조건**이지
// 칸 목록이 아니다. 그런데 분석이 이것을 required_items로 올리면, 생성 단계가 그대로 "### 누가" "### 언제"처럼
// 소제목 구조로 쓴다.
// 실측(2026-11-01, 사용자 결과물.10 — 한국사 현대사 신문): 머리기사가 "봉기 주체는 …", "날짜는 1948년 4월 3일",
// "무대는 제주도"처럼 여섯 토막으로 쪼개져 나왔다. 신문 기사는 흐르는 글이어야 한다.
const INTERROGATIVE_ITEM =
  /^(?:누가|누구(?:와|를|에게)?|언제|어디(?:서|에서|에)?|무엇(?:을|이|인지)?|어떻게|왜|어느\s*것|얼마나)[?？]?$/;

/** 5W1H처럼 "글에 드러나야 할 것"을 늘어놓은 목록인가(칸 목록이 아니라). */
export function isInterrogativeItemList(items: string[] | undefined): boolean {
  if (!items || items.length < 2) return false;
  const hits = items.filter((i) => INTERROGATIVE_ITEM.test((i ?? "").replace(/\s+/g, " ").trim())).length;
  // 절반 이상이 의문사면 그 목록은 칸이 아니라 "담을 내용" 안내다.
  return hits >= Math.ceil(items.length / 2);
}

/**
 * 의문사 항목만 빼고 **진짜 칸은 남긴다**. 남은 것이 2개 미만이면 목록 자체를 버린다.
 *
 * 실측(2026-11-01, 역사 신문 양식지): 모델이 머리기사에 ["제목","내용","누가","언제","어디서","무엇을","어떻게","왜"]를
 * 넣었다 — 앞의 둘은 **양식지의 진짜 칸**이고 뒤의 여섯은 채점 기준 설명이다. 처음엔 절반 이상이 의문사라고 목록을
 * 통째로 버렸는데, 그 바람에 "제목"·"내용" 칸까지 사라져 머리기사가 칸 없이 생성됐다. 가려서 버려야 한다.
 */
export function dropInterrogativeItems<T extends { label: string; required_items?: string[] }>(el: T): T {
  if (!isInterrogativeItemList(el.required_items)) return el;
  const kept = (el.required_items ?? []).filter((i) => !INTERROGATIVE_ITEM.test((i ?? "").replace(/\s+/g, " ").trim()));
  if (kept.length >= 2) return { ...el, required_items: kept };
  const { required_items: _dropped, ...rest } = el;
  return rest as T;
}

/**
 * 안내문에 실린 **문항**(객관식·○×·보기 고르기)에 답하는 글 단계가 분석에서 빠졌으면 하나 붙인다.
 *
 * 왜(2026-11-14, 거대 안내문 점검 사회-05): 문항 원문을 provided_materials로 옮기게 하자(analyze 스키마 설명),
 * 분석이 "자료로 옮겼으니 단계는 필요 없다"고 보고 확인 문제 단계를 **같은 안내문 3회 중 1회** 뺐다.
 * 프롬프트 문구로는 못 잡았다(문구를 보강해도 1/3) — 코드가 보정한다. 문항을 자료로만 갖고 답할 단계가 없으면
 * 학생은 그 문항의 답을 받지 못한다.
 * 자료 이름은 "<이름>: <본문>"이고, 이름에 문제·문항·퀴즈·확인이 들어 있고 본문이 "고르시오·표시하시오…"로 시킬 때만 본다.
 */
const QUESTION_MATERIAL_LABEL = /문제|문항|퀴즈|물음|확인/;
const QUESTION_MATERIAL_BODY = /고르시오|표시하시오|쓰시오|구하시오|답하시오|서술하시오|옳은\s*것|옳지\s*않은|○|보기/;
const stripSpaces = (s: string) => s.replace(/\s+/g, "");

export function questionGroupsFromMaterials(materials: string[] | undefined): string[] {
  const groups: string[] = [];
  for (const m of materials ?? []) {
    const idx = m.indexOf(":");
    if (idx < 2 || idx > 30) continue;
    const label = m.slice(0, idx).trim();
    const body = m.slice(idx + 1);
    if (!QUESTION_MATERIAL_LABEL.test(label) || !QUESTION_MATERIAL_BODY.test(body)) continue;
    const group = label.replace(/\s*\d+(?:\s*[~∼-]\s*\d+)?\s*(?:번)?\s*$/, "").trim(); // "탐구 확인 문제 1" → "탐구 확인 문제", "이론 평가 문항 1~3" → "이론 평가 문항"
    if (group && !groups.includes(group)) groups.push(group);
  }
  return groups;
}

export function ensureQuestionSteps<T extends { type: string; label: string; description: string; required_items?: string[] }>(
  els: T[],
  materials: string[] | undefined
): { steps: T[]; added: string[] } {
  const added: string[] = [];
  const out = [...els];
  for (const group of questionGroupsFromMaterials(materials)) {
    const key = stripSpaces(group);
    // 설명에 "탐구 확인 문제에도 답한다"가 적혀 있어도 **단계의 이름이나 칸이 아니면** 덮인 것으로 보지 않는다 —
    // 2026-11-15 사회-05: 그 한 줄 때문에 단계를 안 붙였고 글에는 문항 답이 하나도 없었다(채점 11/11 → 8/10).
    // 단계 이름·칸이 그룹 이름을 담거나 **낱말이 60% 이상 겹치면**("이론 평가 답안" ↔ "이론 평가 문항") 그 단계가 문항을 맡은 것이다.
    // 겹침을 안 보고 이름만 보면 과학-09에서 이미 문항에 답하는 "이론 평가 답안"이 있는데 단계를 두 개 더 붙여 생성이 통째로 실패했다(25자, 2/12).
    const gTokens = group.split(/\s+/).filter((t) => t.length >= 2);
    const covers = (e: { label: string; required_items?: string[] }) => {
      const text = `${e.label} ${(e.required_items ?? []).join(" ")}`;
      if (stripSpaces(text).includes(key)) return true;
      const hit = gTokens.filter((t) => text.includes(t)).length;
      return gTokens.length >= 2 && hit >= Math.ceil(gTokens.length * 0.6);
    };
    if (out.some(covers)) continue;
    out.push({
      type: "text_submission",
      label: group,
      description: `안내문에 실린 ${group}의 문항(문항 원문은 자료에 있다)에 문항마다 답하고 그 이유를 짧게 쓴다.`,
    } as T);
    added.push(group);
  }
  return { steps: out, added };
}

/**
 * 안내문의 **형식 뼈대**(서론·본론·결론·참고문헌·요약)와 **내용 항목**이 한 목록에 섞여 오면 뼈대만 칸으로 둔다.
 *
 * 왜(2026-11-15, 거대 안내문 점검 과학-01): 분석이 required_items를 ["현재 사회의 문제점 분석", …(내용 7개),
 * "서론","본론","결론","참고문헌","요약"] 12개로 냈고, 생성은 그것을 전부 소제목으로 받아 **보고서를 두 번** 썼다 —
 * 내용 7칸 다음에 다시 서론·본론·결론, 참고문헌이 두 번, 요약이 참고문헌 뒤에. 안내문은 "서론-본론-결론-참고문헌-요약의
 * 형식으로 작성"이라 했을 뿐이고 내용 항목은 **그 본론 안에서 다룰 것**이다. 프롬프트로 "합쳐 쓰라"고 하는 길 대신
 * 코드가 목록을 바로잡는다: 뼈대는 안내문 순서 그대로 칸으로, 내용 항목은 설명에 "본론에서 다룰 내용"으로 옮긴다.
 * 뼈대 낱말이 3개 미만이거나 내용 항목이 2개 미만이면 건드리지 않는다("제목"·"초록"만 있는 양식지 등).
 */
const SKELETON_ITEM = /^(?:서론|서\s*론|본론|본\s*론|결론|결\s*론|참고\s*문헌|요약|초록|머리말|맺음말)$/;

export function foldSkeletonItems<T extends { description: string; required_items?: string[] }>(el: T): T {
  const items = (el.required_items ?? []).map((i) => (i ?? "").trim()).filter(Boolean);
  const skeleton = items.filter((i) => SKELETON_ITEM.test(i));
  const content = items.filter((i) => !SKELETON_ITEM.test(i));
  if (skeleton.length < 3 || content.length < 2) return el;
  const note = ` 본론에서 다룰 내용: ${content.join("; ")}.`;
  return { ...el, required_items: skeleton, description: `${el.description.trim()}${note}` };
}

/**
 * "팀 진행 시 …"처럼 **짝·모둠으로 할 때만 해당하는 항목**은 혼자 하는 학생에게서 뺀다.
 *
 * 왜(2026-11-15, 거대 안내문 점검 정보-01): 안내문이 "개인 진행은 1인 1보고서, 팀 진행은 2인 1보고서 — 팀 진행 시 A학생 의견,
 * B학생 의견, 최종 결론을 작성"이라 했고, 분석이 그 세 칸을 required_items에 넣어 글이 "A학생 의견: A학생은 …말했다"를 **지어냈다**
 * — 학생은 혼자 하는데 있지도 않은 팀원의 의견을 쓴 것이다. 두 갈래 중 어느 쪽인지는 학생만 안다. 학생이 지침에 팀·모둠·친구를
 * 말하지 않았으면 혼자 하는 쪽을 기본으로 하고 팀 전용 칸·문장을 뺀다(학생이 팀이라고 했으면 그대로 둔다).
 */
const TEAM_WORD = /팀|모둠|짝\s*활동|친구와|같이\s*(?:하|진행)|둘이|2\s*인/;
const TEAM_COND = /(?:팀|모둠|조|짝)[^.。\n]{0,6}(?:진행|활동|참여)\s*(?:시|할\s*경우|하는\s*경우)/;
const sentencesOf = (t: string) => (t ?? "").split(/(?<=[.。!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
const isTeamConditional = (s: string) => TEAM_COND.test(s) || (/개인/.test(s) && /(?:팀|모둠)/.test(s) && /진행|활동|제출/.test(s));

export function soloDefault<T extends { required_items?: string[] }>(
  core: { requirements: string[]; writing_guide?: string; elements: T[] },
  studentText: string | undefined
): { requirements: string[]; writing_guide?: string; elements: T[]; dropped: string[] } {
  const unchanged = { requirements: core.requirements, writing_guide: core.writing_guide, elements: core.elements, dropped: [] as string[] };
  if (studentText && TEAM_WORD.test(studentText)) return unchanged;
  const teamSentences = [...core.requirements.flatMap(sentencesOf), ...sentencesOf(core.writing_guide ?? "")].filter(isTeamConditional);
  if (teamSentences.length === 0) return unchanged;
  const flat = teamSentences.map((s) => s.replace(/\s+/g, "")).join("|");
  const dropped: string[] = [];
  const elements = core.elements.map((el) => {
    const items = el.required_items ?? [];
    const keep = items.filter((i) => {
      const k = (i ?? "").replace(/\s+/g, "");
      const hit = k.length >= 3 && flat.includes(k);
      if (hit) dropped.push(i);
      return !hit;
    });
    // 칸이 둘 이하로 줄면 잘못 본 것이다 — 건드리지 않는다.
    return keep.length >= 2 && keep.length < items.length ? { ...el, required_items: keep } : el;
  });
  if (dropped.length === 0) return unchanged;
  const requirements = core.requirements.flatMap((r) => {
    if (!isTeamConditional(r) && !sentencesOf(r).some(isTeamConditional)) return [r];
    return /개인/.test(r) ? ["개인 진행(1인 1보고서)으로 작성한다."] : [];
  });
  const writing_guide = core.writing_guide
    ? sentencesOf(core.writing_guide).filter((s) => !isTeamConditional(s)).join(" ")
    : core.writing_guide;
  return { requirements, writing_guide, elements, dropped };
}
