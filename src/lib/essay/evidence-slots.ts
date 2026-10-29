// 안내문이 요구한 "서로 다른 근거 N개"를 조사 단계에 전한다.
// 지금까지 조사 호출은 과제가 근거를 몇 개 요구하는지, 학생의 입장이 어느 쪽인지 모른 채 사실만 모았다 —
// 글쓰기는 사실 노트 밖으로 나갈 수 없으므로(factSheetRules) 노트의 다양성이 그대로 근거 다양성의 상한이 된다.
// 실제 안내문(공통국어2 매체 활용 주제발표): "내용을 뒷받침하는 정보(근거)를 3가지 이상 수집"인데 조사 규칙은
// "논설·토론이면 찬성·반대 양쪽"이라 반대 입장 과제에서도 절반이 반대편 근거로 채워졌다.
// 항목·개수·입장은 전부 안내문과 학생 입력에서 동적으로 온다 — 특정 과제에 대한 하드코딩은 없다.
// alias import 없음 — node:test에서 바로 불러올 수 있게.
import { isSourceListItem } from "./deliverable.ts";

export interface EvidenceElement {
  label: string;
  description: string;
  required_items?: string[];
}

export interface EvidenceInfo {
  topic: string;
  requirements: string[];
  writing_guide?: string;
  task_elements: EvidenceElement[];
}

export interface EvidencePlan {
  /** 서로 달라야 하는 근거의 개수. 0이면 이 과제에는 해당 없음(조사 동작이 예전 그대로). */
  slots: number;
  /** 학생이 정한 입장("찬성"·"반대"). 못 찾으면 null — 예전처럼 양쪽 근거를 모은다. */
  stance: string | null;
  /** 근거를 쓰는 단계 이름(로그·프롬프트용). */
  label: string | null;
}

export const NO_EVIDENCE_PLAN: EvidencePlan = { slots: 0, stance: null, label: null };

/** 항목 이름이 "근거 1", "논거 2"처럼 번호가 붙은 근거 칸인가. */
const NUMBERED_EVIDENCE = /^(?:근거|논거|주장)\s*\d{1,2}$/;
/** 항목·설명이 근거를 가리키는가("근거 정보", "뒷받침하는 자료"). 출처 목록 항목("근거자료 출처")은 호출부에서 뺀다. */
const EVIDENCE_WORD = /근거|논거|뒷받침/;
/** "근거를 3가지 이상", "정보(근거)를 3가지", "논거 2개" — 숫자가 붙은 근거 개수 조건. */
const EVIDENCE_COUNT = /(?:근거|논거|뒷받침하는\s*(?:정보|자료))\s*[)）]?\s*(?:를|을|은|는)?\s*(\d{1,2})\s*(?:가지|개|건|편)/;
/** 근거를 세는 것이 의미 있는 글인가(주장·설득·찬반). */
const ARGUMENT_TEXT = /논설|논술|주장|설득|찬반|찬성|반대|토론|논제|쟁점|사설|칼럼|의견/;
/** 학생이 고른 입장. "반대로"처럼 낱말 속 글자가 걸리지 않게 뒤에 한글이 이어지면 보지 않는다. */
const STANCE = /(?:^|[\s,.·()（）"'「」『』\-–—])(찬성|반대)(?![가-힣])/g;

const MIN_SLOTS = 2;
const MAX_SLOTS = 5;

function evidenceItems(el: EvidenceElement): string[] {
  return (el.required_items ?? []).filter((i) => EVIDENCE_WORD.test(i) && !isSourceListItem(i));
}

/** 입장은 학생이 입력한 지침에서 먼저 찾고(과제 주제는 "찬반 발표"처럼 양쪽을 다 적는 일이 많다), 여러 번 나오면 마지막 것을 쓴다. */
function findStance(texts: (string | undefined)[]): string | null {
  for (const text of texts) {
    if (!text) continue;
    const hits = [...text.matchAll(STANCE)].map((m) => m[1]);
    if (hits.length > 0) return hits[hits.length - 1];
  }
  return null;
}

/**
 * 이 과제가 "서로 다른 근거 몇 개"를 요구하는지 판정한다.
 * ① 번호가 붙은 필수 항목("근거 1"…) → 그 개수, ② 요구사항·작성 기준·단계 설명의 개수 조건("3가지 이상") → 그 수,
 * ③ 근거 항목은 있는데 개수가 없음 → 최소 2, ④ 아무것도 없음 → 0(이 기능이 꺼진 것과 같다).
 */
export function planEvidence(info: EvidenceInfo, instructions?: string): EvidencePlan {
  const elements = info.task_elements ?? [];
  if (elements.length === 0) return NO_EVIDENCE_PLAN;

  const owner =
    elements.find((el) => evidenceItems(el).length > 0) ??
    elements.find((el) => EVIDENCE_WORD.test(el.description)) ??
    null;

  let slots = 0;
  for (const el of elements) {
    const numbered = (el.required_items ?? []).filter((i) => NUMBERED_EVIDENCE.test(i.trim())).length;
    if (numbered >= MIN_SLOTS && numbered > slots) slots = numbered;
  }
  if (slots === 0) {
    const texts = [...info.requirements, info.writing_guide ?? "", ...elements.map((e) => e.description)];
    for (const text of texts) {
      const m = EVIDENCE_COUNT.exec(text ?? "");
      if (m) {
        slots = Number(m[1]);
        break;
      }
    }
  }
  if (slots === 0 && owner && evidenceItems(owner).length > 0) slots = MIN_SLOTS;
  if (slots === 0) return NO_EVIDENCE_PLAN;
  slots = Math.min(MAX_SLOTS, Math.max(MIN_SLOTS, slots));

  // 주장하는 글인지는 안내문으로만 판단한다 — 학생 입력에 "반대"가 있다는 것만으로 탐구 보고서까지 찬반 과제로 보면 안 된다.
  const argumentText = [info.topic, ...info.requirements, info.writing_guide ?? "", ...elements.flatMap((e) => [e.label, e.description])].join(" ");
  const stance = ARGUMENT_TEXT.test(argumentText) ? findStance([instructions, info.topic]) : null;
  return { slots, stance, label: owner?.label ?? null };
}

/** 조사 프롬프트에 넣을 근거 블록. slots가 없으면 빈 문자열(프롬프트가 예전 그대로다). */
export function evidenceResearchBlock(plan: EvidencePlan): string {
  if (plan.slots < MIN_SLOTS) return "";
  const n = plan.slots;
  const lines = [
    `[이 글이 채워야 할 근거 — 반드시 지킬 것]`,
    `- 서로 다른 근거 ${n}개가 필요하다${plan.label ? `("${plan.label}" 단계)` : ""}. 근거마다 다른 사실을 서로 다른 페이지에서 가져올 것 — 같은 판결·같은 사건·같은 통계를 표현만 바꿔 ${n}개로 늘리지 말 것.`,
    `- 근거는 성격이 다른 축에서 ${n}개를 고를 것: 법·제도 / 통계·피해 규모 / 실제 사례·사건 / 해외 사례 / 전문가·기관의 평가처럼 서로 다른 축.`,
  ];
  if (plan.stance) {
    const other = plan.stance === "찬성" ? "반대" : "찬성";
    lines.push(
      `- 학생의 입장은 "${plan.stance}"다. ${plan.stance} 쪽 근거를 ${n}개 담고, ${other} 쪽 근거는 재반박에 쓸 1~2개만 담을 것.`
    );
  }
  return lines.join("\n");
}

/** 근거가 부족할 때 한 번만 보내는 보강 조사 지시. 이미 확보한 사실을 보여 주고 다른 축만 더 모으게 한다. */
export function evidenceTopUpBlock(plan: EvidencePlan, have: string[]): string {
  const n = Math.max(1, plan.slots - 1);
  return [
    `[이미 확보한 근거 — 다시 담지 말 것]`,
    ...have.slice(0, 10).map((f) => `- ${f}`),
    ``,
    `위 근거와 성격이 다른 축의 근거를 ${n}개만 더 모아줘. 같은 판결·같은 사건·같은 통계를 다룬 다른 기사도 쓰지 말 것${plan.stance ? `, 입장은 "${plan.stance}" 그대로` : ""}.`,
    `출력 형식은 위에 적힌 JSON 그대로다(설명·코드펜스 금지).`,
  ].join("\n");
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return url.trim().toLowerCase();
  }
}

/** 근거로 쓸 수 있는 서로 다른 페이지(호스트) 수. 의미는 코드가 판정할 수 없어 "같은 매체로 몰렸는가"를 대리 지표로 쓴다. */
export function distinctHostCount(urls: string[]): number {
  return new Set(urls.map(hostOf).filter(Boolean)).size;
}

/** 확보한 사실이 요구된 근거 수만큼 서로 다른 페이지에서 나왔는가 — 아니면 보강 조사를 한 번 한다. */
export function needsMoreEvidence(plan: EvidencePlan, urls: string[]): boolean {
  return plan.slots >= MIN_SLOTS && distinctHostCount(urls) < plan.slots;
}
