import { generate } from "@/lib/llm";
import { buildSourceList, insertCitationMarkers, stripInvalidCitationMarkers } from "@/lib/gemini/citations";
import { FACTUAL_RIGOR_RULES, ACHIEVEMENT_INTERPRETATION_RULES } from "@/lib/gemini/prompts";
import { stripUnsupportedSuperlatives } from "@/lib/gemini/generate-essay";
import { validateSources } from "@/lib/links/validate-sources";
import { itemMatchesHeading } from "@/lib/research/research-items";
import { LEARNING_RESEARCH_RULES } from "./prompts";
import type { SectionResearch } from "@/types/learning";
import type { SourceRef } from "@/types/task";

export interface ResearchInput {
  subject: string;
  topic: string;
  requirements: string[];
  /** 항목 이름들(과제에서 학생이 작성해야 하는 항목). */
  labels: string[];
  focusSubject?: string | null;
  instructions?: string | null;
}

function buildPrompt(input: ResearchInput): string {
  return `
너는 한국 고등학생이 수행평가를 "직접" 해내도록 돕는 조교다. 학생이 아래 과제의 각 항목을
스스로 쓸 수 있도록, 항목마다 필요한 자료를 실시간 웹 검색으로 조사해서 정리해줘.

[과목] ${input.subject}
[과제 주제] ${input.topic}
[요구사항]
${input.requirements.map((r) => `- ${r}`).join("\n") || "(명시된 요구사항 없음)"}
${input.focusSubject ? `\n【조사 대상 고정】 이 과제에서 학생이 다루기로 한 대상은 "${input.focusSubject}" 하나다. 모든 항목의 자료는 이 대상에 대한 것만 조사할 것.\n` : ""}${input.instructions ? `\n[학생이 추가로 입력한 지침]\n${input.instructions}\n` : ""}
[학생이 작성할 항목 — 이 순서, 이 이름 그대로]
${input.labels.map((l) => `- ${l}`).join("\n")}

【출력 형식 — 반드시 지킬 것】
각 항목을 정확히 "## <항목명>"(항목명은 위 목록 그대로, 번호·기호를 붙이지 말 것) 제목으로 시작하고,
그 아래를 다음 네 개의 "### " 소제목으로 채울 것. 항목을 빼거나 합치지 말 것.

### 핵심 설명
(이 항목이 무엇을 묻는지, 그리고 이해에 필요한 배경·개념을 2~4문장으로 설명)
### 중요한 사실
- (검색으로 확인한 구체적 사실 3~5개, 사실마다 [n] 각주)
### 관련 인물·사건·용어
- (이 항목과 연결되는 인물·사건·용어와 한 줄 설명. 없으면 이 소제목은 "없음"으로)
### 작성할 때 생각해볼 점
- (학생이 스스로 답해볼 질문 2~3개 — 정답이나 완성 문장이 아니라 질문으로)

【검색 도구를 실제로 호출할 것】 인물·사건·연도·통계처럼 검증 가능한 사실은 쓰기 전에 반드시
실시간 웹 검색으로 확인하고, 항목마다 서로 다른 각도로 검색할 것. 정부기관·공공기관·대학·학술자료·
공식 기관 같은 신뢰도 높은 출처를 우선하고 개인 블로그는 근거로 쓰지 말 것.
${LEARNING_RESEARCH_RULES}
${FACTUAL_RIGOR_RULES}
${ACHIEVEMENT_INTERPRETATION_RULES}
`.trim();
}

/**
 * "## 항목" 기준으로 분해한다. 모델이 제목을 살짝 틀리게 쓰는 경우(실측: "인권 발달에
 * 미친 영향" → "인권 발달에 인친 영향")가 있어서 정확히 일치하는 제목만 찾으면 그 항목이
 * 앞 항목 본문에 통째로 묻힌다 — 항목명과 비슷한 제목(itemMatchesHeading)을 순서대로
 * 대응시키고, 어떤 항목과도 안 맞는 제목은 "제목 개수가 항목 개수와 같을 때만" 다음
 * 순서의 항목으로 간주한다(엉뚱한 제목이 항목 자리를 잘못 차지하는 걸 막기 위함).
 */
export function splitByLabels(annotated: string, labels: string[]): Map<string, string> {
  const headings = [...annotated.matchAll(/^##(?!#)[ 	]*(.+?)[ 	]*$/gm)].map((m) => ({
    text: m[1],
    start: m.index!,
    bodyStart: m.index! + m[0].length,
  }));
  const positional = headings.length === labels.length;
  const marks: { label: string; start: number; bodyStart: number }[] = [];
  let ptr = 0;
  for (const h of headings) {
    if (ptr >= labels.length) break;
    let j = -1;
    for (let k = ptr; k < labels.length; k++) {
      if (itemMatchesHeading(labels[k], h.text)) {
        j = k;
        break;
      }
    }
    if (j === -1) {
      if (!positional) continue;
      j = ptr;
    }
    marks.push({ label: labels[j], start: h.start, bodyStart: h.bodyStart });
    ptr = j + 1;
  }
  const result = new Map<string, string>();
  marks.forEach((mark, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].start : annotated.length;
    result.set(mark.label, annotated.slice(mark.bodyStart, end).trim());
  });
  return result;
}

/** 항목 본문에 남은 [n]만 등장 순서대로 1부터 다시 매기고, 그 출처만 골라낸다. */
function renumber(content: string, all: SourceRef[]): SectionResearch {
  const byN = new Map(all.map((s) => [s.n, s]));
  const oldToNew = new Map<number, number>();
  let next = 1;
  const text = content.replace(/\[(\d+)\]/g, (match, numStr: string) => {
    const old = Number(numStr);
    if (!byN.has(old)) return "";
    let n = oldToNew.get(old);
    if (n === undefined) {
      n = next++;
      oldToNew.set(old, n);
    }
    return `[${n}]`;
  });
  const sources = [...oldToNew.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([old, n]) => ({ ...byN.get(old)!, n }));
  return { content: text, sources };
}

/**
 * 과제 전체를 한 번의 그라운딩 호출로 조사해서 항목별 자료로 나눈다(항목마다 따로
 * 호출하면 하루 횟수 제한을 너무 빨리 쓰고 라우트 60초 제한도 위험하다). 검증 실패·
 * "블로그·개인" 등급 출처의 각주는 제거하고, 근거 없는 최초/유일류 문장은 지운다 —
 * 자동 작성 모드와 같은 공유 유틸을 읽기 전용으로 재사용한다.
 */
export async function researchLearningItems(input: ResearchInput): Promise<Map<string, SectionResearch>> {
  const prompt = buildPrompt(input);
  const run = (p: string) =>
    generate({
      label: "learning:research",
      role: "main",
      prompt: p,
      search: { force: true, maxCalls: 6 }, // 이 단계는 검색 자체가 목적(항목이 여러 개라 넉넉히)
    });

  let response = await run(prompt);
  let grounding = response.grounding;
  if ((grounding?.queries?.length ?? 0) === 0) {
    console.warn("[learning research] 검색 도구를 호출하지 않음 — 강하게 재지시하여 1회 재시도");
    const retry = await run(
      prompt + "\n\n【다시 한번 강조】 방금 검색 도구를 한 번도 호출하지 않았다. 이번에는 반드시 실시간 웹 검색을 실제로 호출한 뒤에 쓸 것."
    );
    if ((retry.grounding?.queries?.length ?? 0) > 0) {
      response = retry;
      grounding = retry.grounding;
    }
  }
  // 검색은 했는데 본문에 출처 링크가 하나도 안 붙은 응답(실측: 인물 조사 4개 항목 전부 출처 0개)은 자료 조사로서 쓸모가 없다 — 출처를 문장에 직접 붙이라고 한 번만 다시 요청한다.
  if ((grounding?.chunks?.length ?? 0) === 0) {
    console.warn("[learning research] 응답에 출처가 하나도 없음 — 출처 표기를 강조해 1회 재시도");
    const retry = await run(
      prompt + "\n\n【다시 한번 강조】 방금 응답에는 출처가 하나도 붙지 않았다. 검색으로 확인한 사실 문장마다 그 근거가 된 웹 페이지를 출처로 반드시 붙일 것."
    );
    if ((retry.grounding?.chunks?.length ?? 0) > 0) {
      response = retry;
      grounding = retry.grounding;
    }
  }
  const text = response.text;
  if (!text) throw new Error("자료 조사 응답이 비어 있습니다.");

  const { sources, chunkIndexToN } = buildSourceList(grounding?.chunks);
  let annotated = insertCitationMarkers(text, grounding?.supports, chunkIndexToN);
  const validated = await validateSources(sources);
  const badNs = new Set(validated.filter((s) => s.url_valid === false || s.tier === "weak").map((s) => s.n));
  annotated = stripInvalidCitationMarkers(annotated, badNs);

  const sections = splitByLabels(annotated, input.labels);
  const result = new Map<string, SectionResearch>();
  for (const [label, body] of sections) {
    const { content } = stripUnsupportedSuperlatives(body);
    result.set(label, renumber(content, validated));
  }
  if (result.size < Math.ceil(input.labels.length / 2)) {
    throw new Error(`자료 조사 결과를 항목별로 나누지 못했습니다(${result.size}/${input.labels.length}).`);
  }
  return result;
}
