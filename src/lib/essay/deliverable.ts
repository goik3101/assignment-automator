// 단계(task element)가 "조사 자료"인지 "실제로 제출할 산출물(신문 등)"인지 구분하고, 산출물 형식에 맞는 작성 지시를 만든다.
// 모델이 무엇을 쓸지는 안내문에서 오지만, "어떤 형식으로 쓸지"는 지금까지 모든 단계에 같은 조사 자료 규칙이 적용돼 신문 과제에서도 불릿 사실 나열이 나왔다.
// alias import 없음 — node:test에서 바로 불러올 수 있게.

export type DeliverableForm = "newspaper";

const NEWSPAPER_LABEL = /신문|뉴스레터|기사문?/;
// 라벨이 "자료 수집·조사·계획"처럼 재료 단계를 뜻하면, 설명에 "신문 제작에 쓸 자료"라고 적혀 있어도 신문 자체가 아니다.
const MATERIAL_LABEL = /자료\s*(?:수집|조사|정리)|조사|탐구\s*계획|구상|개요|계획|준비/;
const NEWSPAPER_DESC = /신문(?:을|\s*형식으로)?\s*(?:제작|작성|만들)|신문\s*형식/;

export function inferDeliverableForm(el: { label: string; description: string }): DeliverableForm | null {
  if (NEWSPAPER_LABEL.test(el.label) && !MATERIAL_LABEL.test(el.label)) return "newspaper";
  if (!MATERIAL_LABEL.test(el.label) && NEWSPAPER_DESC.test(el.description)) return "newspaper";
  return null;
}

export type RequiredItemKind = "content" | "visual" | "reflection";

const VISUAL_ITEM = /시각\s*자료|그림|도표|사진|삽화|이미지|그래프|인포그래픽|도식/;
const REFLECTION_ITEM = /인상\s*깊|느낀|소감|교훈|배운|깨달|성찰|후기|생각/;

export function classifyRequiredItem(item: string): RequiredItemKind {
  if (VISUAL_ITEM.test(item)) return "visual";
  if (REFLECTION_ITEM.test(item)) return "reflection";
  return "content";
}

/** 제출 글 안에 섞이면 안 되는 "제작 참고" 소제목(모델에게 이 이름으로 쓰게 한다). */
export const PRODUCTION_NOTES_HEADING = "제작 참고";

/**
 * "### 제작 참고 …" 블록(학생이 직접 구해 넣을 사진·그림 안내처럼 제출 내용이 아닌 부분)을 본문에서 떼어낸다.
 * 소제목부터 다음 같은 단계 이하 소제목 전까지가 블록이다.
 */
export function splitProductionNotes(content: string): { body: string; notes: string | null } {
  const lines = content.split("\n");
  const start = lines.findIndex((l) => new RegExp(`^#{3,4}[ \\t]*${PRODUCTION_NOTES_HEADING}`).test(l.trim()));
  if (start < 0) return { body: content, notes: null };
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{2,4}[ \t]+\S/.test(lines[i].trim())) {
      end = i;
      break;
    }
  }
  const notes = lines
    .slice(start + 1, end)
    .join("\n")
    .trim();
  const body = [...lines.slice(0, start), ...lines.slice(end)].join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { body, notes: notes || null };
}

const REFERENCE_HEADING = /^(?:#{1,4}[ \t]*)?(?:\*\*)?(참고\s*각주|참고\s*문헌|참고\s*자료|출처\s*목록|출처|각주|References?|Sources?)(?:\*\*)?[ \t]*[:：]?[ \t]*$/i;
const REFERENCE_ENTRY = /^(?:\[\d+\]|\d+[.)]|[-*•])\s*\S/;
// 제목 없이 "[1] 설명[1]." 꼴로만 이어진 목록(실측) — 번호가 지워져 앞이 공백뿐인 줄도 같은 목록의 일부다.
const NUMBERED_ENTRY = /^\[\d+\]\s+\S.{0,160}$/;
const ORPHAN_ENTRY = /^\s+\S.{0,160}\[\d+\]\.?\s*$/;
// 글 맨 끝에 "(위 내용은 각 문장 끝의 각주 번호로 연결된 자료를 근거로 작성되었음.)" 같은 작업 설명을 덧붙이는 경우
const TRAILING_META = /^\(?\s*(?:위|이)\s*(?:내용|글|자료)[^\n]{0,120}(?:각주|출처|근거)[^\n]{0,120}\)?\.?\s*$/;

/**
 * 모델이 글 끝에 스스로 써 붙인 "참고 각주/출처" 목록과 끝맺음 설명을 지운다. 번호가 실제 출처 번호와 어긋나기 쉽고(실측: [3]을 BBC라고 써 놓았지만 실제 [3]은 위키백과),
 * 출처는 화면이 검증 결과와 함께 따로 보여 주므로 제출 글 안에 둘 이유가 없다.
 */
export function stripModelReferenceBlock(content: string): { content: string; stripped: boolean } {
  const lines = content.replace(/\s+$/, "").split("\n");
  let end = lines.length;
  const dropTrailingBlank = () => {
    while (end > 0 && lines[end - 1].trim() === "") end--;
  };
  dropTrailingBlank();
  if (end > 0 && TRAILING_META.test(lines[end - 1].trim())) {
    end--;
    dropTrailingBlank();
  }
  // 1) 제목이 있는 목록: 제목 아래가 전부 목록 항목
  let i = end - 1;
  while (i >= 0 && (lines[i].trim() === "" || REFERENCE_ENTRY.test(lines[i].trim()) || ORPHAN_ENTRY.test(lines[i]))) i--;
  if (i >= 0 && i < end - 1 && REFERENCE_HEADING.test(lines[i].trim())) {
    if (lines.slice(i + 1, end).some((l) => REFERENCE_ENTRY.test(l.trim()))) {
      return { content: lines.slice(0, i).join("\n").replace(/\s+$/, ""), stripped: true };
    }
  }
  // 2) 제목 없는 목록: "[n] …"으로 시작하는 줄이 2개 이상 연달아 끝에 있을 때만(불릿 글머리는 본문일 수 있어 세지 않는다)
  let j = end - 1;
  let numbered = 0;
  while (j >= 0 && (lines[j].trim() === "" || NUMBERED_ENTRY.test(lines[j].trim()) || ORPHAN_ENTRY.test(lines[j]))) {
    if (NUMBERED_ENTRY.test(lines[j].trim())) numbered++;
    j--;
  }
  if (numbered >= 2 && j < end - 1) {
    return { content: lines.slice(0, j + 1).join("\n").replace(/\s+$/, ""), stripped: true };
  }
  if (end < lines.length) return { content: lines.slice(0, end).join("\n").replace(/\s+$/, ""), stripped: true };
  return { content, stripped: false };
}

const WORK_MARKERS = /^\s*\(해석\)\s*/;
/** 신문 기사 본문에 남은 작업용 표기("(해석)" 등)를 지운다. */
export function stripWorkMarkers(content: string): string {
  return content
    .split("\n")
    .map((l) => l.replace(/^(\s*(?:[-*•]\s+)?)\(해석\)\s*/, "$1"))
    .join("\n")
    .replace(WORK_MARKERS, "");
}

export interface NewspaperBlockInput {
  label: string;
  requiredItems: string[];
  /** 이 과제의 조사 자료 단계 이름들(뒤에서 문장을 그대로 반복하지 않아야 하는 대상). */
  materialLabels: string[];
}

/** 신문 단계에 줄 형식·역할 지시. 항목 이름은 안내문에서 온 것을 그대로 쓰고, 여기서는 "어떻게 쓸지"만 정한다. */
export function buildNewspaperBlock({ label, requiredItems, materialLabels }: NewspaperBlockInput): string {
  const content = requiredItems.filter((i) => classifyRequiredItem(i) === "content");
  const visual = requiredItems.filter((i) => classifyRequiredItem(i) === "visual");
  const reflection = requiredItems.filter((i) => classifyRequiredItem(i) === "reflection");
  const lines: string[] = [];
  lines.push(
    `【산출물 형식: 신문 — "${label}" 단계에서 반드시 지킬 것】`,
    `이 단계는 조사 자료를 다시 정리하는 곳이 아니라 학생이 제출할 "신문" 그 자체다. 독자가 신문을 읽는 것처럼 읽히게 쓸 것.`,
    `- 맨 위 첫 줄: 신문 이름(제호)을 "**〈이름〉**" 한 줄로(주제를 드러내는 가칭). 날짜·호수·기자 이름·기관 이름은 지어내지 말 것.`,
    `- 머리기사: 실제 헤드라인 문구를 "### "소제목 한 줄로 쓰고("헤드라인"이라는 단어를 소제목으로 쓰지 말 것), 그 아래에 굵은 부제 한 줄, 이어서 핵심을 2~3문장으로 요약한 첫 문단과 본문을 쓸 것. "리드:", "본문:" 같은 구조 이름표는 글에 쓰지 말 것.`
  );
  if (content.length > 0) {
    lines.push(
      `- 분야별 기사: 다음 내용을 각각 독립된 기사 하나로 쓰되, 항목 이름을 그대로 소제목으로 쓰지 말고 기사다운 헤드라인("### ...")을 붙일 것 — ${content.join(" / ")}. ` +
        `한 사실을 여러 기사에 되풀이하지 말고 항목마다 그 항목만의 내용을 쓸 것.`
    );
  }
  if (visual.length > 0) {
    lines.push(
      `- 시각 자료(${visual.join(" / ")}): 연표·표처럼 글로 만들 수 있는 것은 "연표" 같은 소제목 아래 마크다운 표(| 연도 | 사건 |)로 신문 안에 반드시 직접 써 넣을 것(연도는 조사로 확인된 것만 — 표를 "넣을 것"이라고 안내만 하지 말고 표 자체를 쓸 것).` +
        `사진·그림·인포그래픽처럼 학생이 직접 구해 넣어야 하는 것은 맨 끝에 "### ${PRODUCTION_NOTES_HEADING}" 소제목을 달고 "어느 기사 옆에 어떤 이미지를 넣을지"만 3줄 이내로 적을 것(제출 내용이 아니다). 이미지 주소·사진 설명을 지어내지 말 것.`
    );
  }
  if (reflection.length > 0) {
    lines.push(
      `- 제작 후기(${reflection.join(" / ")}): 신문 맨 아래에 "### 제작 후기"를 두고 그 바로 아래 첫 줄에 "(학생 감상 초안 — 본인 생각에 맞게 고쳐 쓰세요)"라고 쓴 뒤 초안을 쓸 것. ` +
        `학생이 밝히지 않은 경험·감정(직접 만났다, 울었다 등)은 지어내지 말고, 조사로 확인한 사실과 학생이 입력한 내용에서만 초안을 만들 것.`
    );
  }
  lines.push(
    `- 문체: 사실 보도 문체("~했다")로 쓰고 "(해석)", "[자료]" 같은 작업용 표기는 쓰지 말 것. 출처로 확인되지 않은 인터뷰·발언·통계를 따옴표나 수치로 만들지 말 것.`
  );
  if (materialLabels.length > 0) {
    lines.push(
      `- ${materialLabels.map((l) => `"${l}"`).join(", ")} 단계에 쓴 문장을 그대로 다시 쓰지 말 것. 같은 사실(연도·이름·수치는 일치시킬 것)을 신문 기사에 맞는 새 문장으로 풀어 쓸 것.`
    );
  }
  return lines.join("\n");
}

// 글 중간이나 끝에 모델이 덧붙인 "(연도와 사건은 공개된 출처로 확인된 사실만 기재했다.)" 같은 작업 설명 — 학생이 제출할 글에 섞이면 안 된다.
// 줄 전체가 괄호이고 작업 설명 표현이 있을 때만 지운다(대본의 "(박수)" 같은 지문은 건드리지 않는다).
const META_NOTE_LINE = new RegExp(
  "^\\s*\\((?!학생 감상 초안)(?:" +
    // 작업 설명 표현이 들어간 줄
    "[^()\\n]{0,160}(?:기재했|작성했|작성되었|표기했|반영해 표기|근거로 작성|확인된 사실만|출처로 확인된|참고하여 작성)[^()\\n]{0,80}" +
    // 또는 "(참고: …)", "(책 관련 각주 — …)" 처럼 모델이 스스로 붙인 주석 머리말로 시작하는 줄
    "|(?:참고|비고|각주|책 관련 각주|책 속 인상 깊은 구절)\\s*[:：—-][^()\\n]{0,160}" +
    ")\\)[\\[\\]\\d.\\s]*$"
);
// 괄호 없이 쓴 같은 종류의 작업 설명(실측 2026-10-21: "참고 근거: 위 문장들에 사용된 사실 근거는 본문에 괄호로 붙인 번호를 통해 확인할 수 있다.").
const BARE_META_LINE = /^\s*(?:참고\s*근거|근거\s*안내|출처\s*안내|작성\s*참고)\s*[:：].{0,200}$|^\s*(?:위|이)\s*(?:문장|내용|글)[^\n]{0,80}(?:번호|각주|출처)[^\n]{0,80}확인할\s*수\s*있다\.?\s*$/;
export function stripMetaNoteLines(content: string): { content: string; removed: number } {
  let removed = 0;
  const bare = process.env.ESSAY_QUALITY_FIXES !== "off";
  const kept = content.split("\n").filter((l) => {
    const line = l.replace(/\[\d+\]/g, "");
    const strip = META_NOTE_LINE.test(line) || (bare && BARE_META_LINE.test(line));
    if (strip) removed++;
    return !strip;
  });
  return { content: removed ? kept.join("\n").replace(/\n{3,}/g, "\n\n") : content, removed };
}

// 소제목 없이 이어서 읽히는 글(논설문·감상문·편지 등)을 분석 단계가 "항목별 조사 자료"(sections)로 분류하는 변동이 실측됐다(같은 안내문이 어떤 때는 flowing, 어떤 때는 sections).
// 이런 글을 불릿 사실 나열로 쓰면 글이 아니라 메모가 된다 — 단계 이름이 줄글을 가리키면 sections를 flowing으로 바로잡는다(필수 항목은 그대로 누락 검사에 쓴다).
const PROSE_LABEL = /논설|논술|에세이|수필|감상문|독후감|칼럼|비평|편지|일기|연설문|발표문|스피치|소설|짧은\s*글|서평/;
export function isProseForm(el: { label: string }): boolean {
  return PROSE_LABEL.test(el.label);
}

// "탐구 보고서"·"조사 보고서"처럼 학생이 제출할 보고서 자체인 단계. 소제목(필수 항목) 구조는 유지하되 내용은 불릿 사실 메모가 아니라 문단으로 쓴다.
// 실측(2026-10-20, 8건 중 2건): 이런 단계가 "조사 자료" 규칙을 받아 불릿 나열 + "(해석)" 표기로 나왔다. "보고서 계획"·"자료 수집"처럼 재료 단계는 제외한다.
const REPORT_LABEL = /보고서|리포트|소논문/;
const REPORT_MATERIAL_LABEL = /자료\s*(?:수집|조사|정리)|계획|구상|개요|준비|양식/;
export function isFinalReportForm(el: { label: string }): boolean {
  return REPORT_LABEL.test(el.label) && !REPORT_MATERIAL_LABEL.test(el.label);
}

// "조사 자료" 규칙(불릿 사실 메모 + "(해석)")을 받아야 하는 재료 단계 — 뒤 단계가 가져다 쓸 자료를 모으는 단계만.
// 실측(2026-10-22): "친구의 고민 분석하기", "문제 해결 방안 쓰기", "책 처방전 쓰기"처럼 제출용 글인 단계까지 이 규칙을 받아 "- - (해석)" 메모로 나왔다.
const MATERIAL_STEP_LABEL = /자료\s*(?:수집|조사|정리)|사실\s*정리|정보\s*(?:수집|정리)|조사\s*(?:노트|활동지?|하기)?\s*$|탐구\s*(?:노트|자료)/;
export function isResearchMaterialStep(el: { label: string }): boolean {
  return MATERIAL_STEP_LABEL.test(el.label) && !REPORT_LABEL.test(el.label);
}

// 필수 항목 중 "신뢰할 수 있는 출처 3개 이상", "참고 문헌" 같은 출처 목록 항목 — 글쓰기 모델에게 맡기면 확인 안 된 주소를 지어내거나(실측) 출처 목록 금지 규칙과 부딪혀 누락으로 잡힌다.
const SOURCE_LIST_ITEM = /출처|참고\s*(?:문헌|자료|사이트)|인용\s*자료|레퍼런스|references?/i;
export function isSourceListItem(item: string): boolean {
  return SOURCE_LIST_ITEM.test(item) && !/분석|비교|평가|신뢰도\s*(?:판단|비교)/.test(item);
}

/** 시스템이 실제로 확인한 출처로 출처 목록 항목을 채운다(모델이 쓰지 않는다). */
export function buildSourceListSection(item: string, sources: { title: string; url: string }[]): string {
  const lines = sources.map((s) => `- ${s.title?.trim() || hostOf(s.url)}: ${s.url}`);
  return `### ${item}\n${lines.join("\n")}`;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// 출처 확인 과정·면책을 적은 작업 메모(실측 2026-10-22, 외부 제작 경로): "(한국의 광복 날짜는 1945년 8월 15일임을 확인했다)",
// "(위 인터뷰는 … 재구성한 가상 대화입니다 …)", "### 인터뷰 출처·확인된 사실" 목록, "※ 위 세 출처는 …".
const WORK_NOTE_PAREN = /[ \t]*\((?:[^()\n]|\([^()\n]*\)){0,240}?(?:확인했|확인한\s*사실|확인된\s*사실|출처\s*[:：]|출처를\s*참|참고했|참조\s*[:：)]|재구성한|가상\s*(?:인터뷰|대화)|임을\s*밝힙니다)(?:[^()\n]|\([^()\n]*\)){0,240}?\)/g;
const WORK_NOTE_LINE = /^\s*(?:※|\*\s*참고|\(?\s*(?:위|이)\s*(?:인터뷰|대화|글|기사|만평|광고|문장들?|내용|칸)(?:은|는|중|에)?)[^\n]{0,300}(?:출처|자료|링크|재구성|가상|확인|다듬)[^\n]*$/;
// 챗봇식 제안·작성 안내 줄: "(필요하면 … 다듬어 드립니다)", "(추가 안내 — 각 칸의 구성 요약)" 와 그 아래 목록, "(약 30자)" 같은 글자 수 표시.
const ASSISTANT_OFFER_LINE = /^\s*\(?[^\n]{0,120}(?:(?:다듬어|고쳐|수정해|바꿔|추가해|만들어|작성해|정리해|맞춰)\s*(?:드립니다|드릴게요|드릴\s*수\s*있습니다)|원하시면|필요하시면|요청하시면)[^\n]{0,80}\)?\s*$/;
const GUIDE_BLOCK_HEAD = /^\s*\((?:추가\s*안내|작성\s*안내|편집\s*메모|디자인[^)]{0,10}메모)[^)]*\)\s*$|^\s*(?:설명|주석|편집자\s*메모|메모)\s*\([^)]*메모[^)]*\)\s*[:：]\s*$/;
// 사실 노트·각주 표기 방식을 설명하는 줄(실측: "(문장 끝에 사실 노트 표기는 넣지 않음; 본문 문장에만 위의 각주 표기를 사용함)").
const NOTATION_NOTE_LINE = /^\s*\(?[^\n]{0,60}(?:사실\s*노트|각주\s*표기|F\d+\s*표기)[^\n]*\)?\s*$/;
const CHAR_COUNT_NOTE = /\s*\(\s*(?:(?:약\s*|총\s*)?\d{1,4}\s*(?:자|단어|words?)\s*(?:내외|안팎)?|(?:word\s*count|글자\s*수|단어\s*수|총\s*단어)\s*[:：]?\s*\d{1,5}\s*(?:자|단어|words?)?)\s*\)/gi;
const SOURCE_HEADING = /^#{2,4}\s*[^\n]{0,30}(?:출처|확인된\s*사실|참고\s*자료)[^\n]{0,30}$|^\(?\s*본문에서\s*(?:인용|사용)한[^\n]{0,40}출처[^\n]*\)?\s*$/;
export function stripWorkNotes(content: string): { content: string; removed: number } {
  let removed = 0;
  const lines = content.split("\n");
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (SOURCE_HEADING.test(line.trim())) {
      // 출처 소제목과 그 아래 목록(다음 소제목·빈 줄 뒤 본문 전까지)
      removed++;
      while (i + 1 < lines.length && (/^\s*(?:[-*•]|\d+[.)])\s/.test(lines[i + 1]) || lines[i + 1].trim() === "")) i++;
      continue;
    }
    if ((WORK_NOTE_LINE.test(line) || ASSISTANT_OFFER_LINE.test(line) || NOTATION_NOTE_LINE.test(line)) && !/학생 감상 초안/.test(line)) {
      removed++;
      continue;
    }
    if (GUIDE_BLOCK_HEAD.test(line)) {
      removed++;
      while (i + 1 < lines.length && (/^\s*(?:[-*•]|\d+[.)])\s/.test(lines[i + 1]) || lines[i + 1].trim() === "")) i++;
      continue;
    }
    // "(학생 감상 초안 …)" 표시가 바로 다음 소제목 앞에 혼자 떠 있으면(그 소제목 아래에 같은 표시가 또 있다) 지운다 — 실측: 카드뉴스에 두 번 연달아 나옴.
    if (/^\s*\(학생 감상 초안[^)]*\)\s*$/.test(line)) {
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === "") j++;
      if (j < lines.length && /^#{2,4}\s/.test(lines[j].trim())) {
        removed++;
        continue;
      }
    }
    // "출처(사실 표기 문장 끝):[1]"처럼 번호만 든 출처 줄 — 번호는 바로 앞 줄 끝으로 옮긴다(실측: 카드뉴스 칸마다).
    const markerOnly = /^\s*(?:[-*•]\s*)?출처[^:：\n]{0,30}[:：]\s*((?:\[\d+\])+)\s*\.?\s*$/.exec(line);
    if (markerOnly && kept.length > 0) {
      removed++;
      kept[kept.length - 1] = kept[kept.length - 1].replace(/\s*$/, "") + markerOnly[1];
      continue;
    }
    kept.push(line);
  }
  let out = kept.join("\n");
  out = out.replace(WORK_NOTE_PAREN, () => {
    removed++;
    return "";
  });
  out = out.replace(CHAR_COUNT_NOTE, () => {
    removed++;
    return "";
  });
  // 화면(react-markdown)은 HTML 태그를 그리지 않는다 — 밑줄 표시 <u>…</u>는 굵게로 바꾼다(실측: 영어 글에 "<u>It is</u>"가 글자 그대로 남음).
  out = out.replace(/<u>([\s\S]*?)<\/u>/gi, (_m, inner: string) => {
    removed++;
    return `**${inner}**`;
  });
  if (removed === 0) return { content, removed };
  return { content: out.replace(/[ \t]+([.,])/g, "$1").replace(/\.\s*\./g, ".").replace(/\n{3,}/g, "\n\n").trim(), removed };
}

/**
 * 『책 제목』·《제목》 바로 뒤 조사를 제목 끝 글자의 받침에 맞춘다 — 실측(2026-10-22): "『사일구』은". 제목 끝이 한글이 아니면 건드리지 않는다.
 */
export function fixJosaAfterTitle(content: string): { content: string; changed: number } {
  const PAIRS: Record<string, [string, string]> = { 은: ["은", "는"], 는: ["은", "는"], 이: ["이", "가"], 가: ["이", "가"], 을: ["을", "를"], 를: ["을", "를"], 과: ["과", "와"], 와: ["과", "와"] };
  let changed = 0;
  const out = content.replace(/([『《])([^』》\n]{1,60})([』》])(은|는|이|가|을|를|과|와)(?![가-힣])/g, (m, open: string, title: string, close: string, josa: string) => {
    const last = title.trim().slice(-1);
    const code = last.charCodeAt(0) - 0xac00;
    if (code < 0 || code > 11171) return m;
    const hasBatchim = code % 28 !== 0;
    const right = PAIRS[josa][hasBatchim ? 0 : 1];
    if (right === josa) return m;
    changed++;
    return `${open}${title}${close}${right}`;
  });
  return { content: changed ? out : content, changed };
}

/**
 * 출처 번호가 붙은 사실 문장의 전달형 꼬리("…태어났다는 기록이 있다[3]")를 단정형("…태어났다[3]")으로 바꾼다.
 * 실측(2026-10-22, 30회 테스트): 프롬프트 규칙만으로는 8건 중 4건에서 이런 꼬리가 남았다. 각주가 근거를 이미 보여 주므로 뜻은 그대로다.
 * 각주가 없는 문장은 건드리지 않는다(근거가 안 붙은 내용을 단정으로 바꾸면 안 된다).
 */
export function reduceReportedSpeech(content: string): { content: string; changed: number } {
  let changed = 0;
  const out = content.replace(/([가-힣])다는\s*(?:기록|보도|분석|평가|설명|지적|연구\s*결과)(?:이|가)\s*(?:있다|남아\s*있다)((?:\[\d+\])+)/g, (_m, last: string, markers: string) => {
    changed++;
    return `${last}다${markers}`;
  });
  return { content: changed ? out : content, changed };
}

/**
 * 본문에 남은 주소 표기를 지운다 — "(UNEP: https://…)", "[제목](https://…)", 맨 주소. 출처는 화면이 검증 결과와 함께 따로 보여 주고,
 * 본문 속 주소는 검색이 실제로 연 페이지인지 확인되지 않은 것이다(실측: 출처 0개인 글에 주소 13개가 본문에 그대로 남음).
 */
export function stripInlineUrls(content: string): { content: string; removed: number } {
  let removed = 0;
  const count = () => {
    removed++;
    return "";
  };
  let out = content.replace(/\[([^\]\n]{1,160})\]\(https?:\/\/[^)\s]+\)/g, (_m, text: string) => {
    removed++;
    return text;
  });
  out = out.replace(/[ \t]*\((?:[^()\n]*?)https?:\/\/[^\s()]+(?:[^()\n]*)\)/g, count);
  out = out.replace(/[ \t]*https?:\/\/[^\s)\]]+/g, count);
  if (removed === 0) return { content, removed };
  return { content: out.replace(/[ \t]+([.,;:])/g, "$1").replace(/\(\s*\)/g, "").replace(/[ \t]+$/gm, ""), removed };
}
