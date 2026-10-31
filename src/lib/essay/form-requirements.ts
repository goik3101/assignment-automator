// 안내문·시험지의 "개수 조건"(8장면, 5문장 이내, 3문단, 10줄)을 글에서 뽑아 생성 프롬프트에 전하고, 생성 뒤 코드로 센다.
// 실측(2026-10-27, 합성 안내문 1건): "스토리보드를 8장면으로"가 필수 항목 "화면 설명·대사"로 쪼개져 장면 구조가 사라지고,
// "발표 대본 5문장 이내·10줄"은 텍스트로만 전달돼 기본 분량(발표 900~1700자)과 부딪혔다. 개수는 모델이 아니라 코드가 센다.
// alias import 없음 — node:test에서 바로 불러올 수 있게.

export type UnitKind = "scene" | "sentence" | "line" | "paragraph";

export interface CountReq {
  unit: UnitKind;
  /** 안내문에 쓰인 단위 낱말(장면·컷·칸·문장·줄·문단) */
  word: string;
  /** 0이면 하한 없음 */
  min: number;
  /** 0이면 상한 없음 */
  max: number;
}

const UNIT_KIND: Record<string, UnitKind> = { 장면: "scene", 컷: "scene", 칸: "scene", 씬: "scene", 문장: "sentence", 줄: "line", 문단: "paragraph" };
const KO_NUM: Record<string, number> = { 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10 };
const UNITS = "장면|컷|칸|씬|문장|줄|문단";
const NUM = "\\d{1,2}|두|세|네|다섯|여섯|일곱|여덟|아홉|열";
// "한 문장으로 요약"처럼 일부 안의 소규모 지시를 조건으로 오인하지 않게 "한"은 뺀다.
const RANGE = new RegExp(`(\\d{1,2})\\s*[~∼–-]\\s*(\\d{1,2})\\s*(?:개\\s*(?:의\\s*)?)?(${UNITS})`, "g");
const SINGLE = new RegExp(`(?<![\\d~∼–-])(${NUM})\\s*(?:개\\s*(?:의\\s*)?)?(${UNITS})\\s*\\)?\\s*(이상|이내|이하|내외|안팎|정도|가량|안에|까지)?`, "g");

const toNum = (s: string) => (/^\d+$/.test(s) ? Number(s) : KO_NUM[s]);

export interface PositionedReq extends CountReq {
  /** 글 안에서 조건 표현이 시작하는 위치 */
  index: number;
}

/** 글(요구사항·설명·작성 기준)에서 개수 조건을 위치와 함께 뽑는다. 문장·줄·문단은 "이내/이상/내외" 같은 한정어가 있을 때만(소규모 지시 오인 방지). */
export function extractPositionedRequirements(text: string): PositionedReq[] {
  const out: PositionedReq[] = [];
  const push = (r: PositionedReq) => {
    if (r.min > 50 || r.max > 50) return;
    if (!out.some((o) => o.unit === r.unit && o.min === r.min && o.max === r.max)) out.push(r);
  };
  const rangeSpans: [number, number][] = [];
  for (const m of text.matchAll(RANGE)) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    rangeSpans.push([m.index!, m.index! + m[0].length]);
    push({ unit: UNIT_KIND[m[3]], word: m[3], min: Math.min(a, b), max: Math.max(a, b), index: m.index! });
  }
  for (const m of text.matchAll(SINGLE)) {
    if (rangeSpans.some(([s, e]) => m.index! >= s && m.index! < e)) continue;
    const n = toNum(m[1]);
    if (!n || n < 1) continue;
    const unit = UNIT_KIND[m[2]];
    const suffix = m[3];
    if (!suffix && unit !== "scene") continue;
    const at = m.index!;
    if (suffix === "이상") push({ unit, word: m[2], min: n, max: 0, index: at });
    else if (suffix === "이내" || suffix === "이하" || suffix === "안에" || suffix === "까지") push({ unit, word: m[2], min: 0, max: n, index: at });
    else if (suffix) push({ unit, word: m[2], min: Math.max(1, n - 1), max: n + 1, index: at });
    else push({ unit, word: m[2], min: n, max: n, index: at });
  }
  return out;
}

const withoutIndex = ({ index: _index, ...r }: PositionedReq): CountReq => {
  void _index;
  return r;
};

export function extractCountRequirements(texts: string[]): CountReq[] {
  const out: CountReq[] = [];
  for (const raw of texts) {
    for (const r of extractPositionedRequirements(raw ?? "").map(withoutIndex)) {
      if (!out.some((o) => o.unit === r.unit && o.min === r.min && o.max === r.max)) out.push(r);
    }
  }
  return out;
}

const norm = (s: string) => s.replace(/[\s()\[\]{}<>"'`·・,.:;!?~\-–—/]/g, "").toLowerCase();

function splitSentences(text: string): string[] {
  return text.split(/(?<=[.。!?])\s+|\n+|;/).map((s) => s.trim()).filter(Boolean);
}

export interface FormElement {
  label: string;
  description: string;
  required_items?: string[];
  items_format?: "sections" | "flowing";
}

// 장면·컷·칸 조건은 그 모양의 산출물(스토리보드·카드뉴스·만화·영상 …)에만 걸린다. 실측(2026-10-27, 실제 안내문): "스토리보드는 개요의 내용을 바탕으로 8개의 장면을 구성"에서
// 이름이 더 가까운 "개요" 단계가 8장면 조건을 가져가 개요가 장면 1~8로 쓰였다. 단계 이름이 가까운 것만으로는 부족해서 산출물의 모양도 본다.
const SCENE_OWNER = /스토리보드|콘티|카드\s*뉴스|카드|만화|웹툰|영상|시나리오|그림|컷|장면|슬라이드|PPT|포스터|인포그래픽/;

/** 글 text 안에서 needle(정규화된 이름)이 나오는 위치들과 at 사이의 가장 짧은 거리. */
function nearest(text: string, needle: string, at: number): number {
  let best = Infinity;
  for (let i = text.indexOf(needle); i >= 0; i = text.indexOf(needle, i + 1)) best = Math.min(best, Math.abs(i - at));
  return best;
}

/**
 * 이 단계에 걸리는 개수 조건. 요구사항·작성 기준의 문장은 그 단계 이름을 언급할 때만 이 단계의 조건이다(단계가 하나뿐이면 전체가 이 단계의 조건).
 * 한 문장이 여러 단계 이름을 함께 언급하면("개요에서 생성한 내용을 바탕으로 8개의 장면으로 스토리보드를 작성") 조건 표현에 가장 가까운 이름의 단계 것이다.
 * 단계 설명에 적힌 조건은 항상 이 단계 것이다. labels는 이 과제의 모든 단계 이름.
 */
export function requirementsForElement(el: FormElement, requirements: string[], guide: string | undefined, labels: string[]): CountReq[] {
  const mine = norm(el.label);
  const others = labels.map(norm).filter((l) => l.length >= 2 && l !== mine);
  const out: CountReq[] = [];
  const add = (r: CountReq) => {
    if (!out.some((o) => o.unit === r.unit && o.min === r.min && o.max === r.max)) out.push(r);
  };
  extractCountRequirements([el.description]).forEach(add);
  const sceneOwner = labels.length <= 1 || SCENE_OWNER.test(`${el.label} ${el.description}`);
  const addFromSentence = (r: CountReq) => {
    if (r.unit === "scene" && !sceneOwner) return;
    add(r);
  };
  for (const sentence of [...requirements, ...splitSentences(guide ?? "")]) {
    if (labels.length <= 1) {
      extractPositionedRequirements(sentence).map(withoutIndex).forEach(addFromSentence);
      continue;
    }
    const text = norm(sentence);
    if (mine.length < 2 || !text.includes(mine)) continue;
    for (const pr of extractPositionedRequirements(sentence)) {
      // norm()으로 공백·기호가 빠진 글에서의 위치(앞쪽 글자 수 기준)
      const at = norm(sentence.slice(0, pr.index)).length;
      const dMine = nearest(text, mine, at);
      // 장면 조건은 그 모양의 산출물끼리만 겨룬다("스토리보드는 개요의 내용을 바탕으로 8개의 장면" — 개요는 장면 산출물이 아니다).
      const rivals = pr.unit === "scene" ? others.filter((o) => SCENE_OWNER.test(o)) : others;
      if (rivals.every((o) => nearest(text, o, at) >= dMine)) addFromSentence(withoutIndex(pr));
    }
  }
  return out;
}

/** 문장·줄·문단에 상한이 있는가(있으면 기본 분량 가이드를 주지 않는다 — 충돌). */
export function hasSizeLimit(reqs: CountReq[]): boolean {
  return reqs.some((r) => r.unit !== "scene" && r.max > 0);
}

export function describeReq(r: CountReq): string {
  const w = r.word;
  if (r.min > 0 && r.max > 0) return r.min === r.max ? `${r.min}${w}` : `${r.min}~${r.max}${w}`;
  if (r.min > 0) return `${r.min}${w} 이상`;
  return `${r.max}${w} 이내`;
}

// ── 장면(스토리보드·카드뉴스·만화) 목록 ─────────────────────────────

const SCENE_ITEM = /^(?:장면|컷|칸|씬)\s*\d+$/;
export function isSceneListElement(el: { required_items?: string[] }): boolean {
  const items = el.required_items ?? [];
  return items.length >= 2 && items.every((i) => SCENE_ITEM.test(i.trim()));
}

const SCENE_LABEL = /스토리보드|콘티|카드\s*뉴스|컷\s*만화|웹툰/;

/** 장면 번호로 쓰는 단계인가 — 장면 번호 항목이 펼쳐졌거나, 이름이 스토리보드·카드뉴스처럼 장면 산출물인 단계. */
export function isSceneLikeElement(el: { label: string; description?: string; required_items?: string[] }): boolean {
  return isSceneListElement(el) || SCENE_LABEL.test(el.label);
}

/**
 * "8장면으로 구성"처럼 개수가 정해진 반복 단위가 있는데 필수 항목이 그 개수만큼 없으면, 항목을 "장면 1…장면 N"으로 바꾼다.
 * 원래 항목(화면 설명·대사 같은 장면마다 쓸 칸 이름)은 단계 설명으로 옮겨 장면마다 쓰게 한다. 개수 N은 2~20일 때만, 하한이 있는 조건("N 이상" 포함)만 다룬다.
 */
export function expandSceneUnits<T extends FormElement>(el: T, reqs: CountReq[]): T {
  const scene = reqs.find((r) => r.unit === "scene" && r.min >= 2 && r.min <= 20 && (r.max === 0 || r.max === r.min));
  if (!scene) return el;
  const existing = el.required_items ?? [];
  if (isSceneListElement(el) || existing.length >= scene.min) return el;
  const n = scene.min;
  const items = Array.from({ length: n }, (_, i) => `${scene.word} ${i + 1}`);
  const fields = existing.filter((i) => i.trim());
  const description = fields.length > 0 ? `${el.description} (${scene.word}마다 ${fields.join("·")}를 쓴다)` : el.description;
  return { ...el, required_items: items, items_format: "sections", description };
}

// ── 세기 ────────────────────────────────────────────────────

const stripMarks = (s: string) => s.replace(/\[(?:\d+|F\d+)\]/g, "");

/** 본문에서 장면 번호 표지("### 장면 3", "컷 2:", "③", 표의 "| 4 |")를 찾아 서로 다른 번호의 개수를 센다. */
export function countScenes(content: string): number {
  const nums = new Set<number>();
  for (const line of stripMarks(content).split("\n")) {
    const t = line.trim().replace(/^[#>*\-\s]+/, "").replace(/^\*\*/, "");
    let m = /^(?:장면|컷|칸|씬|Scene|scene|S#|#)\s*(\d{1,2})\b/.exec(t);
    if (m) nums.add(Number(m[1]));
    m = /^(\d{1,2})\s*(?:번\s*)?(?:장면|컷|칸|씬)\b/.exec(t);
    if (m) nums.add(Number(m[1]));
    m = /^([①-⑳])/.exec(t);
    if (m) nums.add(m[1].charCodeAt(0) - 0x2460 + 1);
    m = /^\|\s*(\d{1,2})\s*\|/.exec(line.trim());
    if (m) nums.add(Number(m[1]));
  }
  return nums.size;
}

/** 소제목·표·목록 기호·"(학생 감상 초안…)" 표시를 뺀 본문을 문장으로 센다(소수점·약어는 공백이 뒤따를 때만 문장 끝으로 본다). */
export function countSentences(content: string): number {
  const body = stripMarks(content)
    .split("\n")
    .filter((l) => !/^\s*#{1,6}\s/.test(l) && !/^\s*\|/.test(l) && !/^\s*\(학생 감상 초안/.test(l))
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, ""))
    .join("\n");
  return body
    .split(/(?<=[.。!?…])["”'’)\]]*\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => /[가-힣A-Za-z0-9]/.test(s)).length;
}

export function countParagraphs(content: string): number {
  return stripMarks(content)
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter((b) => b && !/^#{1,6}\s/.test(b) && !/^\|/.test(b) && !/^\(학생 감상 초안/.test(b) && /[가-힣A-Za-z0-9]/.test(b)).length;
}

export interface FormIssue {
  req: CountReq;
  actual: number;
  problem: "below" | "above";
}

/**
 * 개수 조건을 어긴 것을 모은다. 줄 수는 손글씨 줄이라 마크다운으로 셀 수 없어 검사하지 않는다(프롬프트로만 전한다).
 * skipScene: 장면 목록 단계는 필수 항목 검사가 이미 장면 번호별로 보므로 중복 검사하지 않는다.
 */
export function checkFormRequirements(content: string, reqs: CountReq[], opts: { skipScene?: boolean } = {}): FormIssue[] {
  const issues: FormIssue[] = [];
  for (const req of reqs) {
    if (req.unit === "line") continue;
    if (req.unit === "scene" && opts.skipScene) continue;
    const actual = req.unit === "scene" ? countScenes(content) : req.unit === "sentence" ? countSentences(content) : countParagraphs(content);
    if (req.min > 0 && actual < req.min) issues.push({ req, actual, problem: "below" });
    else if (req.max > 0 && actual > req.max) issues.push({ req, actual, problem: "above" });
  }
  return issues;
}

export function describeFormIssue(i: FormIssue): string {
  const want = describeReq(i.req);
  if (i.req.unit === "scene") return `${i.req.word}이(가) ${want}으로 구성되어야 하는데 번호가 붙은 ${i.req.word}은 ${i.actual}개뿐이다 — "### ${i.req.word} 1"부터 "### ${i.req.word} ${Math.max(i.req.min, 1)}"까지 번호가 붙은 소제목으로 빠짐없이 쓸 것`;
  const noun = i.req.unit === "sentence" ? "문장" : "문단";
  return i.problem === "above"
    ? `안내문의 조건은 ${want}인데 현재 ${i.actual}${noun}이다 — 핵심만 남기고 합쳐서 ${i.req.max}${noun} 이하로 줄일 것`
    : `안내문의 조건은 ${want}인데 현재 ${i.actual}${noun}뿐이다 — ${i.req.min}${noun} 이상이 되게 내용을 보충할 것`;
}

/** 생성 프롬프트에 넣을 형식 조건 블록(문장·줄·문단 조건이 있는 단계만). 없으면 빈 문자열. */
export function buildFormLimitBlock(items: { label: string; reqs: CountReq[] }[]): string {
  const lines = items
    .map(({ label, reqs }) => {
      const parts = reqs.filter((r) => r.unit !== "scene").map(describeReq);
      return parts.length ? `- "${label}" 단계: ${parts.join(", ")}` : "";
    })
    .filter(Boolean);
  if (lines.length === 0) return "";
  return `\n【형식 조건 — 반드시 지킬 것】 시험지·안내문이 정한 조건이다. 아래 단계는 이 조건이 다른 모든 분량 지시보다 우선한다. 조건 안에서 필요한 내용만 짧게 쓰고, 줄 수 조건은 한 문장을 한 줄 안에 읽히게 짧게 써서 지킬 것.\n${lines.join("\n")}\n`;
}

/**
 * 장면 목록 단계의 작성 지시(장면 번호 소제목, 장면마다 짧게).
 * 장면 단계에는 글 종류 규칙(form-rules)이 하나도 붙지 않아 말투·화면 자료가 실행마다 달라졌다 —
 * 실측(2026-10-31, 같은 안내문 3회): 대사가 "~했어"(반말)·"~다"(평서문)·"~습니다"로 갈렸고,
 * 한 번은 장면 8개 중 6개가 모두 "표가 보인다"였다(안내문은 그림·그래프·표 세 가지를 허용).
 */
export function buildSceneBlock(items: { label: string; word: string; n: number; fields: string }[], speech = false): string {
  if (items.length === 0) return "";
  return (
    `\n【장면 구성 — 반드시 지킬 것】\n` +
    items
      .map(({ label, word, n, fields }) => `- "${label}" 단계는 "### ${word} 1"부터 "### ${word} ${n}"까지 ${n}개를 모두 번호 소제목으로 쓴다. ${word}을 합치거나 빼지 말고, ${word}마다 ${fields || "화면과 대사"}를 짧게(각 1~2문장) 쓴다.`)
      .join("\n") +
    // 실측(2026-10-27, 실제 안내문 생성 4회 중 2회): 화면 설명에 "발표 시간 2분30초~3분을 맞추라는 안내 문구", "'청중기록지 작성' 안내 문구"처럼 과제 진행 안내가 들어갔다.
    "\n- 화면 설명에는 영상·발표 화면에 실제로 보이는 모습만 쓴다. 발표 시간·청중기록지·제출·평가 같은 과제 진행 안내를 화면 문구나 자막으로 넣지 말 것." +
    "\n- 화면 설명은 쓸 수 있는 자료 종류 안에서 내용에 맞게 고를 것 — 장면마다 같은 종류(표만·그림만)로 몰지 말 것. 수치를 견주는 장면에만 표·그래프를 쓰고 나머지는 그림으로 쓴다." +
    "\n- 화면에 제목을 넣을 수 있는 과제면 제목은 명사형 낱말 한두 개로 짧게 쓴다(문장으로 쓰지 말 것)." +
    (speech
      ? "\n- 대사는 발표자가 청중 앞에서 실제로 말할 문장 그대로 쓴다. 듣는 사람에게 하는 말이므로 높임말(~습니다/~입니다)로 쓰고, 반말이나 혼잣말로 쓰지 말 것."
      : "") +
    "\n- 대사에서 자료를 주어로 삼지 말 것(\"자료에는 ~라고 나온다\", \"출처에 따르면\"). 확인된 사실은 바로 말하고 근거는 각주 번호로만 보인다.\n"
  );
}

/** 생성 시작 시 한 번: 개수가 정해진 장면 단위를 필수 항목("장면 1…N")으로 펼친다. 화면에 보이는 분석 결과는 건드리지 않는다. */
export function applyFormRequirements<T extends { requirements: string[]; writing_guide?: string; task_elements: FormElement[] }>(info: T): T {
  const labels = info.task_elements.map((e) => e.label);
  return {
    ...info,
    task_elements: info.task_elements.map((el) => expandSceneUnits(el, requirementsForElement(el, info.requirements, info.writing_guide, labels))),
  };
}

/** 장면 목록 단계의 블록 입력 — 항목에서 단위 낱말과 개수, 단계 설명에서 장면마다 쓸 칸 이름을 읽는다. */
export function sceneBlockInputs(els: FormElement[]): { label: string; word: string; n: number; fields: string }[] {
  return els.filter(isSceneListElement).map((el) => {
    const items = el.required_items ?? [];
    const word = items[0].trim().replace(/\s*\d+$/, "");
    // expandSceneUnits가 설명 끝에 붙인 "(장면마다 …를 쓴다)"만 읽는다 — 원래 설명에도 "장면마다"가 있을 수 있다.
    const tail = `(${word}마다 `;
    const at = el.description.lastIndexOf(tail);
    const fields = at >= 0 && el.description.endsWith("를 쓴다)") ? el.description.slice(at + tail.length, -"를 쓴다)".length) : "";
    return { label: el.label, word, n: items.length, fields };
  });
}
