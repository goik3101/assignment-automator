import { Type, type Schema } from "@google/genai";
import { getGeminiClient, GEMINI_MODELS } from "./client";
import type { AnalyzeResult } from "@/types/task";

// 기획서 6-0 1단계: 안내문에서 administrative_info(제출기한 등)와
// core_task_info(주제·요구사항 등)를 "물리적으로 분리"해서 추출한다.
// 이 스키마 강제는 그라운딩 없는 이미지 분석 단계에 적용되는 것으로,
// 검색+생성 단계(5-1)의 그라운딩+JSON 이슈와는 별개다.
const ANALYZE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    subject: { type: Type.STRING, description: "과목명 (예: 국어, 과학)" },
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
                  "이 단계에 분량(글자수) 제약이 안내문에 명시되어 있으면, 그 표현을 최대한 " +
                  "안내문에 적힌 그대로 옮겨 적을 것(숫자를 계산하거나 바꾸지 말고 원문 그대로) — " +
                  "예: '800자 내외 (±50자 허용)', '500자 이내', '200자 내외'. 분량 제약이 전혀 " +
                  "없으면 빈 문자열.",
              },
              target_length_counts_spaces: {
                type: Type.BOOLEAN,
                description: "분량 기준이 공백 포함인지 여부. 안내문에 명시가 없으면 true(공백 포함)로 할 것.",
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
- target_length_text는 그 단계에 **분량(글자수) 제약이 명시된 경우에만**
  채울 것 — "800자 내외", "500자 이내", "1000자 이상" 처럼 숫자로 된 분량
  기준이 안내문에 실제로 적혀 있을 때만 그 표현을 원문 그대로 옮겨 적고,
  그런 언급이 전혀 없으면 빈 문자열로 둘 것(추측 금지, 숫자를 계산하거나
  바꿔 쓰지 말 것 — 그대로 베끼기만 할 것). 분량 기준이 특정 단계(예: "2차시
  본문")에만 적용되는 게 명확하면 그 단계에만 채우고, 다른 단계(예: "1차시
  개요")에 별도로 다른 분량 기준이 있으면 그 단계에는 그 표현을 따로 채울
  것 — 안내문 전체에 적용되는 공통 분량이면 해당하는 모든 단계에 같은
  표현을 채울 것.
`.trim();

// 처음엔 모델에게 min/max 정수 두 개를 직접 계산해서 채우게 했는데, 실제
// 테스트 중 flashLite가 드물게 토큰 반복 루프에 빠져 정수 필드에 자릿수
// 수백~수천 개짜리 값을 뱉는 사고가 3~5회 테스트 중 2번 발생했다(JS Number로
// 파싱하면 Infinity가 되고, 심한 경우엔 JSON 구문 자체가 깨져서 요청이 통째로
// 실패했다). 그래서 모델에게는 안내문에 적힌 분량 표현을 "그대로 베끼기"만
// 시키고(target_length_text — 자유 텍스트라 아무리 길어도 파싱이 깨지지
// 않는다), 실제 숫자 범위 계산은 여기서 정규식으로 코드가 직접 한다 —
// 정수 계산을 모델에게 맡기지 않는 게 핵심 방어다.
function parseLengthConstraint(text: string): { min: number; max: number } | null {
  const t = text.trim();
  if (!t) return null;

  // "500~600자" / "500-600자" / "500∼600자"
  let m = t.match(/(\d{1,6})\s*[~\-∼]\s*(\d{1,6})\s*자/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    return { min: Math.min(a, b), max: Math.max(a, b) };
  }

  // "800자 내외 (±50자 허용)" / "800자 내외 ±50자"
  m = t.match(/(\d{1,6})\s*자\s*내외[^0-9]{0,10}[±+\-]\s*(\d{1,6})\s*자/);
  if (m) {
    const target = Number(m[1]);
    const tolerance = Number(m[2]);
    return { min: Math.max(0, target - tolerance), max: target + tolerance };
  }

  // "800자 이내" / "800자 이하"
  m = t.match(/(\d{1,6})\s*자\s*(이내|이하)/);
  if (m) return { min: 0, max: Number(m[1]) };

  // "800자 이상"
  m = t.match(/(\d{1,6})\s*자\s*이상/);
  if (m) return { min: Number(m[1]), max: 0 };

  // "800자 내외" / "800자 정도" / "800자 가량" (명시적 허용치 없음) → ±10%
  m = t.match(/(\d{1,6})\s*자\s*(내외|정도|가량)/);
  if (m) {
    const target = Number(m[1]);
    const tolerance = Math.round(target * 0.1);
    return { min: Math.max(0, target - tolerance), max: target + tolerance };
  }

  // 그 외 "800자"처럼 숫자+자만 있는 경우도 같은 방식으로 처리
  m = t.match(/(\d{1,6})\s*자/);
  if (m) {
    const target = Number(m[1]);
    const tolerance = Math.round(target * 0.1);
    return { min: Math.max(0, target - tolerance), max: target + tolerance };
  }

  return null;
}

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

  const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [];

  if (input.imageBase64 && input.imageMimeType) {
    parts.push({ inlineData: { data: input.imageBase64, mimeType: input.imageMimeType } });
  }

  const userTextLines = [
    input.topicText ? `[학생이 입력한 주제]\n${input.topicText}` : null,
    input.instructions ? `[이번 과제 한정 지침]\n${input.instructions}` : null,
    !input.imageBase64 && !input.topicText ? null : "위 내용을 분석해서 JSON으로 응답해줘.",
  ].filter(Boolean);
  parts.push({ text: userTextLines.join("\n\n") });

  const ai = getGeminiClient();
  const response = await ai.models.generateContent({
    model: GEMINI_MODELS.flashLite,
    contents: [{ role: "user", parts }],
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: ANALYZE_SCHEMA,
    },
  });

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
  const task_elements = parsed.core_task_info.task_elements.map((e) => {
    const { target_length_text, target_length_counts_spaces, ...rest } = e;
    const range = target_length_text ? parseLengthConstraint(target_length_text) : null;
    return {
      ...rest,
      target_length: range ? { ...range, counts_spaces: target_length_counts_spaces ?? true } : undefined,
    };
  });

  return {
    ...parsed,
    core_task_info: { ...parsed.core_task_info, task_elements },
    insufficient_reason: parsed.insufficient_reason || null,
  };
}
