import { Type, type Schema } from "@google/genai";
import { generate, type LlmPart } from "@/lib/llm";
import { normalizeSubject } from "./normalize-subject";
import { parseLengthConstraint, distributeSharedLength } from "./length-parse";
import { fallbackSubject, forceTextSubmissionIfNoExternalHint } from "./analysis-normalize";
import type { AnalyzeResult } from "@/types/task";

// 기획서 6-0 1단계: 안내문에서 administrative_info(제출기한 등)와
// core_task_info(주제·요구사항 등)를 "물리적으로 분리"해서 추출한다.
// 이 스키마 강제는 그라운딩 없는 이미지 분석 단계에 적용되는 것으로,
// 검색+생성 단계(5-1)의 그라운딩+JSON 이슈와는 별개다.
export const ANALYZE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    subject: {
      type: Type.STRING,
      description:
        "과목명 (예: 국어, 과학). 안내문에 과목명이 직접 적혀 있지 않아도, 과제 내용으로 보아 " +
        "가장 그럴듯한 과목을 추론해서 채울 것(예: 신조어 만들기→국어, 앱 기획→정보, 포스터 제작→미술). " +
        "이 필드는 뒤 단계에서 프롬프트에 그대로 쓰이므로 빈 문자열로 두면 안 된다 — " +
        "다른 필드(행정정보 등)의 '모르면 빈 문자열' 규칙과 달리 이 필드만은 예외로 항상 채울 것.",
    },
    insufficient_data: {
      type: Type.BOOLEAN,
      description:
        "사진이 흐릿하거나 정보가 부족해 신뢰할 수 있는 분석이 불가능하면 true",
    },
    insufficient_reason: {
      type: Type.STRING,
      description: "insufficient_data가 true일 때 그 이유. 아니면 빈 문자열.",
    },
    administrative_info: {
      type: Type.OBJECT,
      properties: {
        due_date: { type: Type.STRING, description: "제출기한. 모르면 빈 문자열." },
        submission_method: { type: Type.STRING, description: "제출 방법. 모르면 빈 문자열." },
        grading_criteria: { type: Type.STRING, description: "감점/채점 기준. 모르면 빈 문자열." },
        other_notes: { type: Type.STRING, description: "기타 행정 안내사항. 모르면 빈 문자열." },
      },
      required: ["due_date", "submission_method", "grading_criteria", "other_notes"],
    },
    core_task_info: {
      type: Type.OBJECT,
      properties: {
        topic: { type: Type.STRING, description: "과제의 핵심 주제" },
        requirements: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "구체적으로 요구되는 조건들 (분량, 형식 등)",
        },
        task_elements: {
          type: Type.ARRAY,
          description:
            "이 과제가 요구하는 산출물 요소들. 한 과제에 여러 개가 섞일 수 있음 (예: 감상문+PPT)",
          items: {
            type: Type.OBJECT,
            properties: {
              type: {
                type: Type.STRING,
                enum: ["text_submission", "external_production"],
                description:
                  "text_submission = 글로 그대로 제출 가능 (감상문/서술/대본 등). " +
                  "external_production = 캔바·감마 등 외부 툴이나 물리적 제작이 필요 (PPT/포스터/모형 등)",
              },
              label: { type: Type.STRING, description: "짧은 이름 (예: 독서감상문, 발표 PPT)" },
              description: { type: Type.STRING, description: "이 요소에 대한 구체적 설명" },
              target_length_text: {
                type: Type.STRING,
                description:
                  "이 단계에 분량(글자수·단어수·발표 시간) 제약이 안내문에 명시되어 있으면, 그 표현을 최대한 " +
                  "안내문에 적힌 그대로 옮겨 적을 것(숫자를 계산하거나 바꾸지 말고 원문 그대로) — " +
                  "예: '800자 내외 (±50자 허용)', '500자 이내', '200자 내외', '120~150 words', '약 3분 분량'. 분량 제약이 전혀 " +
                  "없으면 빈 문자열.",
              },
              target_length_counts_spaces: {
                type: Type.BOOLEAN,
                description: "분량 기준이 공백 포함인지 여부. 안내문에 명시가 없으면 true(공백 포함)로 할 것.",
              },
              required_items: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description:
                  "안내문이 이 요소에서 '반드시 조사/작성하라'고 명시적으로 나열한 세부 항목들을, 안내문에 " +
                  "나온 순서대로, 짧은 항목명(명사구)만 적은 배열. 예: 인권 선구자 탐구 자료 수집 → " +
                  "['인물 선정 이유','인물 배경','주요 활동','활동의 성과','인권 발달에 미친 영향'], " +
                  "과학 실험 설계 → ['탐구 주제','가설','준비물','실험 방법','예상 결과','결론']. " +
                  "안내문에 세부 항목이 2개 이상 명시적으로 나열되어 있을 때만 채울 것 — 안내문에 없는 항목을 " +
                  "추측해서 만들지 말 것. 자유 서술형 과제(신조어 만들기, 글쓰기 등)나 항목 나열이 없으면 빈 배열.",
              },
              items_format: {
                type: Type.STRING,
                enum: ["sections", "flowing"],
                description:
                  "required_items가 있을 때만 의미가 있다. 'sections' = 조사·탐구·자료수집·보고서·실험 설계·" +
                  "계획서·토론 개요·기획서처럼 항목별로 나눠 적는 산출물. 'flowing' = 편지·일기·시·소설·" +
                  "감상문·비평문·발표 대본·책처방전 카드처럼 하나의 글로 이어 쓰는 산출물(항목이 나열돼 있어도 " +
                  "소제목으로 쪼개면 어색한 글). required_items가 비어 있으면 'flowing'.",
              },
            },
            required: ["type", "label", "description"],
          },
        },
      },
      required: ["topic", "requirements", "task_elements"],
    },
  },
  required: [
    "subject",
    "insufficient_data",
    "insufficient_reason",
    "administrative_info",
    "core_task_info",
  ],
};

const SYSTEM_INSTRUCTION = `
너는 한국 고등학교 수행평가 안내문을 분석하는 도우미다.
입력으로 안내문 사진 또는 학생이 직접 입력한 주제 텍스트, 그리고 선택적으로 학생이 추가한 지침을 받는다.
아래 스키마에 맞춰 정확히 JSON으로만 응답하라.

규칙:
- administrative_info(제출기한, 제출방법, 채점기준 등 "행정정보")와
  core_task_info(주제, 요구사항, 산출물 요소 등 "핵심정보")를 절대 섞지 말고 분리해서 채울 것.
- 사진 속 글씨가 흐릿하거나 손글씨라 읽기 어렵거나, 핵심 정보가 부족하면
  추측해서 채우지 말고 insufficient_data를 true로, insufficient_reason에 이유를 한 문장으로 적을 것.
- task_elements는 과제가 실제로 요구하는 만큼 빠짐없이 나열할 것. 여러 차시에
  걸쳐 진행되는 과제라면(예: 1차시 A쓰기 → 2차시 B분석 → 3차시 C작성 → 4차시
  D쓰기), 개수를 임의로 줄이거나 비슷해 보이는 차시를 하나로 합치지 말고
  안내문에 적힌 차시 수만큼 각각 별도의 task_element로 나열할 것. 대부분의
  과제는 1~2개지만, 그건 결과일 뿐 목표가 아니다 — 안내문에 몇 개가 적혀
  있는지가 유일한 기준이다.
- 알 수 없는 필드는 빈 문자열이나 빈 배열로 둘 것 (추측 금지).
- task_elements[].description에는 **안내문 자체에 적힌 그 단계의 활동 내용/형식
  설명만** 담을 것. [이번 과제 한정 지침]에 학생이 적은 구체적 사실(예: 특정
  친구의 이름, 실제로 뽑은 고민 원문, 특정 인용문 등)을 요약해서 다른(또는 여러)
  단계의 description에 끼워 넣지 말 것 — 그 지침은 원본 그대로 별도로 이미
  전달되고 있으니, 여기서 다시 요약해서 섞으면 안 되는 특정 단계의 내용이 엉뚱한
  단계에도 새어 들어가는 문제가 생긴다.
- target_length_text는 그 단계에 **분량(글자수·단어수·발표 시간) 제약이 명시된 경우에만**
  채울 것 — "800자 내외", "500자 이내", "1000자 이상", "120~150 words", "약 3분" 처럼 숫자로 된 분량
  기준이 안내문에 실제로 적혀 있을 때만 그 표현을 원문 그대로 옮겨 적고,
  그런 언급이 전혀 없으면 빈 문자열로 둘 것(추측 금지, 숫자를 계산하거나
  바꿔 쓰지 말 것 — 그대로 베끼기만 할 것). 분량 기준이 특정 단계(예: "2차시
  본문")에만 적용되는 게 명확하면 그 단계에만 채우고, 다른 단계(예: "1차시
  개요")에 별도로 다른 분량 기준이 있으면 그 단계에는 그 표현을 따로 채울
  것 — 안내문 전체에 적용되는 공통 분량이면 해당하는 모든 단계에 같은
  표현을 채울 것.
- required_items는 그 단계에 대해 안내문이 "이 항목들을 조사/작성하라"고 **직접
  나열한 세부 항목**만 안내문 순서대로 짧은 항목명으로 담을 것. 안내문 문장에
  "A, B, C, D에 대한 자료를 수집", "가설·준비물·방법을 쓰고"처럼 항목이 실제로
  적혀 있어야 하며, 없는 항목을 과제 유형으로부터 추측해서 만들지 말 것. 학생이
  고르거나 정하는 것 자체가 요구되면(예: "인물을 선정하고 이유를 작성") 그것도
  항목으로 넣을 것(예: "인물 선정 이유"). 항목이 2개 미만이거나 자유 서술형
  (신조어 만들기, 자유 글쓰기 등)이면 빈 배열. items_format은 조사·탐구·보고서·
  계획서처럼 항목별로 나눠 쓰는 산출물이면 "sections", 편지·감상문·비평문·발표
  대본처럼 한 편의 글로 이어 쓰는 산출물이면 "flowing" — 애매하면 "flowing".
`.trim();

const FLOWING_LABEL_PATTERN = /대본|발표문|연설|비평문|감상문|독후감|서평|편지|일기|소설|에세이|칼럼|소감/;

// required_items 후처리: 모델이 채운 값을 그대로 믿지 않고 코드가 정리한다 —
// 공백/중복 제거, 지나치게 긴 항목 제거(항목명이 아니라 문장이면 제외), 최대 10개,
// 2개 미만이면 "항목 나열 없음"으로 취급해서 통째로 버린다(항목 1개짜리 구조화는
// 의미가 없고 오히려 자유 서술을 해친다).
function normalizeRequiredItems(items: string[] | undefined): string[] | undefined {
  if (!items) return undefined;
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const raw of items) {
    const item = raw.replace(/\s+/g, " ").trim();
    if (!item || item.length > 40) continue;
    const key = item.replace(/\s/g, "");
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(item);
    if (cleaned.length >= 10) break;
  }
  return cleaned.length >= 2 ? cleaned : undefined;
}

// 처음엔 모델에게 min/max 정수 두 개를 직접 계산해서 채우게 했는데, 실제
// 테스트 중 flashLite가 드물게 토큰 반복 루프에 빠져 정수 필드에 자릿수
// 수백~수천 개짜리 값을 뱉는 사고가 3~5회 테스트 중 2번 발생했다(JS Number로
// 파싱하면 Infinity가 되고, 심한 경우엔 JSON 구문 자체가 깨져서 요청이 통째로
// 실패했다). 그래서 모델에게는 안내문에 적힌 분량 표현을 "그대로 베끼기"만
// 시키고(target_length_text — 자유 텍스트라 아무리 길어도 파싱이 깨지지
// 않는다), 실제 숫자 범위 계산은 여기서 정규식으로 코드가 직접 한다 —
// 정수 계산을 모델에게 맡기지 않는 게 핵심 방어다.
export interface AnalyzeInput {
  /** base64 인코딩된 이미지 데이터 (data URL 접두사 제외) */
  imageBase64?: string;
  imageMimeType?: string;
  /** 이미지 대신 주제를 텍스트로 직접 입력한 경우 (F1) */
  topicText?: string;
  /** 이번 과제 한정 지침 (F2) */
  instructions?: string;
}

export async function analyzeAssignment(
  input: AnalyzeInput
): Promise<AnalyzeResult> {
  if (!input.imageBase64 && !input.topicText) {
    throw new Error("imageBase64 또는 topicText 중 하나는 반드시 있어야 합니다.");
  }

  const parts: LlmPart[] = [];

  if (input.imageBase64 && input.imageMimeType) {
    parts.push({ image: { base64: input.imageBase64, mimeType: input.imageMimeType } });
  }

  const userTextLines = [
    input.topicText ? `[학생이 입력한 주제]\n${input.topicText}` : null,
    input.instructions ? `[이번 과제 한정 지침]\n${input.instructions}` : null,
    !input.imageBase64 && !input.topicText ? null : "위 내용을 분석해서 JSON으로 응답해줘.",
  ].filter(Boolean);
  parts.push({ text: userTextLines.join("\n\n") });

  const runAnalyze = () =>
    generate({
      label: "analyze",
      role: "lite",
      prompt: parts,
      system: SYSTEM_INSTRUCTION,
      schema: ANALYZE_SCHEMA,
    });
  let response = await runAnalyze();
  // 실측(같은 안내문 4회 분석 중 1회): 항목 나열이 통째로 8~9개의 별개 "단계"로 쪼개지는 오분석. 이런 모양(5개 이상, 항목 나열 없음)이면 한 번만 다시 분석하고 단계가 더 적은 쪽을 쓴다.
  try {
    const first = JSON.parse(response.text || "{}") as { core_task_info?: { task_elements?: { required_items?: string[] }[] } };
    const els = first.core_task_info?.task_elements ?? [];
    if (els.length >= 5 && els.every((e) => (e.required_items?.length ?? 0) < 2)) {
      console.warn(`[analyzeAssignment] 단계가 ${els.length}개로 쪼개진 것으로 의심되어 한 번 더 분석함`);
      const second = await runAnalyze();
      const n2 = (JSON.parse(second.text || "{}") as typeof first).core_task_info?.task_elements?.length ?? Infinity;
      if (n2 < els.length) response = second;
    }
  } catch {
    // 재분석은 보조 수단 — 실패해도 첫 결과를 그대로 쓴다
  }

  const raw = response.text;
  if (!raw) {
    throw new Error("Gemini 분석 응답이 비어 있습니다.");
  }
  console.log("[analyzeAssignment] raw response:\n" + raw);

  interface RawTaskElement {
    type: "text_submission" | "external_production";
    label: string;
    description: string;
    target_length_text?: string;
    target_length_counts_spaces?: boolean;
    required_items?: string[];
    items_format?: "sections" | "flowing";
  }
  const parsed = JSON.parse(raw) as Omit<AnalyzeResult, "core_task_info"> & {
    insufficient_reason: string;
    core_task_info: Omit<AnalyzeResult["core_task_info"], "task_elements"> & {
      task_elements: RawTaskElement[];
    };
  };

  // 스키마는 min/max/counts_spaces를 평평한 필드로 받는다(Gemini 구조화
  // 출력은 중첩 optional보다 이런 형태가 더 안정적으로 채워짐) — 둘 다 0이면
  // "분량 제약 없음"이므로 target_length 자체를 생략해서, generate-essay.ts가
  // 이 필드의 존재 여부만으로 검사 대상인지 바로 판단할 수 있게 한다.
  const task_elements_raw = parsed.core_task_info.task_elements.map((e) => {
    const { target_length_text, target_length_counts_spaces, required_items, items_format, ...rest } = e;
    const range = target_length_text ? parseLengthConstraint(target_length_text, { english: /영어|English/i.test(`${parsed.subject} ${e.label}`) }) : null;
    const items = normalizeRequiredItems(required_items);
    // 모델이 분류한 items_format을 그대로 믿지 않는다 — 실제 테스트에서 "영어 발표
    // 대본"·"독서 비평문"이 sections로 분류돼 말하는 대본/한 편의 비평문이 "### 항목"
    // 소제목으로 쪼개졌다. 한 편의 글로 이어 읽히는 산출물(라벨 기준)은 코드가
    // flowing으로 강제한다(항목은 빠짐없이 다루되 소제목은 강제하지 않음).
    const forcedFlowing = FLOWING_LABEL_PATTERN.test(e.label);
    return {
      ...rest,
      target_length: range ? { ...range, counts_spaces: target_length_counts_spaces ?? true } : undefined,
      _lengthText: target_length_text || undefined,
      required_items: items,
      items_format: items
        ? items_format === "sections" && !forcedFlowing
          ? ("sections" as const)
          : ("flowing" as const)
        : undefined,
    };
  });

  const task_elements = distributeSharedLength(task_elements_raw).map((e) => forceTextSubmissionIfNoExternalHint(e, parsed.core_task_info.topic));

  // 최종 안전장치: 프롬프트로 "빈 문자열 금지"를 지시해도(위 스키마 설명 참고)
  // 실제로 빈 문자열이 돌아올 수 있다는 게 이 프로젝트에서 반복 확인된
  // 패턴이다. subject는 다른 행정정보 필드와 달리 뒤에서 essay/plan
  // 생성 라우트가 "필수값 없음"으로 보고 요청 자체를 거부해버리는 값이라
  // (10종 수행평가 교차 테스트에서 실제로 신조어/앱 기획/포스터 3건이
  // 이렇게 생성 실패했다), 빈 문자열로 남기지 않고 코드가 결정론적으로
  // 채워 넣는다.
  const subject =
    fallbackSubject(normalizeSubject(parsed.subject), parsed.core_task_info.topic, ...task_elements.map((e) => e.label)) || "수행평가";
  if (!parsed.subject.trim()) {
    console.warn(`[analyzeAssignment] 최종 안전장치: 모델이 과목을 못 채워서 기본값으로 대체함 topic="${parsed.core_task_info.topic}"`);
  }

  return {
    ...parsed,
    subject,
    core_task_info: { ...parsed.core_task_info, task_elements },
    insufficient_reason: parsed.insufficient_reason || null,
  };
}
