import { Type, type Schema } from "@google/genai";
import { getGeminiClient, GEMINI_MODELS } from "@/lib/gemini/client";
import { withGeminiRetry } from "@/lib/gemini/retry";
import type { CoreTaskInfo } from "@/types/task";

// 학습 모드 전용: "이 과제가 학생에게 고르라고 하는 대상이 무슨 종류이고 어떤 조건을 만족해야
// 하는가"를 안내문 분석 결과에서 따로 뽑는다. 자동 작성 모드의 analyze.ts는 건드리지 않는다.

export const SUBJECT_TYPES = [
  "person",
  "event",
  "work",
  "system",
  "place",
  "organization",
  "concept",
  "other",
  "unspecified",
] as const;
export type SubjectType = (typeof SUBJECT_TYPES)[number];

export const SUBJECT_TYPE_LABEL: Record<SubjectType, string> = {
  person: "인물",
  event: "사건",
  work: "작품",
  system: "제도·정책·법률",
  place: "지역·장소",
  organization: "기관·단체",
  concept: "개념·현상",
  other: "기타 대상",
  unspecified: "지정되지 않음",
};

export interface SubjectSpec {
  subject_type: SubjectType;
  topic: string;
  /** 대상이 만족해야 하는 조건 — 안내문에 적힌 표현(예: "인권 선구자"). */
  constraints: string[];
  /** 학생이 그 대상에 대해 조사·작성해야 하는 항목. */
  required_fields: string[];
  /** 추천하면 안 되는 대상 종류·예. */
  exclusions: string[];
  /** 안내문만으로는 어떤 종류의 대상을 고르라는 건지 알 수 없을 때 true. */
  needs_clarification: boolean;
  clarification_note: string | null;
}

const SPEC_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    subject_type: { type: Type.STRING, enum: [...SUBJECT_TYPES], description: "학생이 골라야 하는 대상의 종류" },
    topic: { type: Type.STRING },
    constraints: { type: Type.ARRAY, items: { type: Type.STRING } },
    required_fields: { type: Type.ARRAY, items: { type: Type.STRING } },
    exclusions: { type: Type.ARRAY, items: { type: Type.STRING } },
    needs_clarification: { type: Type.BOOLEAN },
    clarification_note: { type: Type.STRING, nullable: true },
  },
  required: ["subject_type", "topic", "constraints", "required_fields", "exclusions", "needs_clarification"],
};

function describeTask(params: { subject: string; info: CoreTaskInfo; instructions?: string | null }): string {
  const { info } = params;
  return [
    `[과목] ${params.subject}`,
    `[과제 주제] ${info.topic}`,
    `[요구사항]\n${info.requirements.map((r) => `- ${r}`).join("\n") || "(없음)"}`,
    `[산출물별 내용]\n${info.task_elements
      .map((e) => `- ${e.label}: ${e.description}${e.required_items?.length ? ` (항목: ${e.required_items.join(", ")})` : ""}`)
      .join("\n")}`,
    params.instructions ? `[학생 지침]\n${params.instructions}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** 대상 조건 추출. 판별은 안내문에 실제로 적힌 표현에만 근거한다 — 관련 있어 보이는 종류를 짐작하지 않는다. */
export async function extractSubjectSpec(params: {
  subject: string;
  info: CoreTaskInfo;
  instructions?: string | null;
}): Promise<SubjectSpec> {
  const ai = getGeminiClient();
  const prompt = `
아래는 고등학생 수행평가 안내문을 분석한 결과다. 학생이 스스로 "골라야 하는 대상"이 무엇인지 구조화해줘.

${describeTask(params)}

규칙:
- subject_type은 안내문이 고르라고 하는 대상의 종류다: 인물(person: 인물·선구자·운동가·작가 등 사람을 가리키는 표현 포함),
  사건(event), 작품(work: 책·영화·미술·음악 등), 제도·정책·법률(system), 지역·장소(place), 기관·단체(organization),
  개념·현상(concept), 그 밖(other).
- 안내문에 적힌 표현에만 근거한다. 주제와 "관련 있어 보이는" 종류를 짐작해 채우지 마라. 예: "인권 선구자를 선정" → person.
- 안내문만으로 어떤 종류의 대상을 고르라는 것인지 알 수 없으면 subject_type을 "unspecified"로 하고
  needs_clarification을 true로, clarification_note에 "안내문에서 확인되는 것 / 확인되지 않는 것"을 한두 문장으로 적어라.
- constraints: 대상이 만족해야 하는 조건을 안내문 표현 그대로(예: "인권 선구자"). 없으면 빈 배열.
- required_fields: 대상을 고른 뒤 학생이 조사·작성해야 하는 항목(대상 선정 이유 자체는 제외).
- exclusions: 이 과제에서 추천하면 안 되는 대상. 지정된 종류가 아닌 모든 종류(예: person이면 제도·기관·사건·법률·개념·단체 자체·책·영화)와
  과제 조건을 충족하지 못하는 인접 분야의 대상을 포함한다.
`.trim();

  const res = await withGeminiRetry(
    () =>
      ai.models.generateContent({
        model: GEMINI_MODELS.flash,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { responseMimeType: "application/json", responseSchema: SPEC_SCHEMA, temperature: 0 },
      }),
    "learning:subject-spec"
  );
  const p = JSON.parse(res.text ?? "{}") as Partial<SubjectSpec>;
  const type = (SUBJECT_TYPES as readonly string[]).includes(p.subject_type ?? "") ? (p.subject_type as SubjectType) : "unspecified";
  const unclear = type === "unspecified" || p.needs_clarification === true;
  return {
    subject_type: unclear ? "unspecified" : type,
    topic: p.topic?.trim() || params.info.topic,
    constraints: (p.constraints ?? []).map((s) => s.trim()).filter(Boolean),
    // 대상 선정 이유·학생 본인의 감상/의견 항목은 학생이 직접 써야 하므로 추천 단서 대상에서 뺀다.
    required_fields: (p.required_fields ?? [])
      .map((s) => s.trim())
      .filter((s) => s && !/선정|선택|나의|내가|느낀|소감|다짐|생각|의견/.test(s)),
    exclusions: (p.exclusions ?? []).map((s) => s.trim()).filter(Boolean),
    needs_clarification: unclear,
    clarification_note: unclear
      ? p.clarification_note?.trim() || "안내문에서 어떤 종류의 대상을 고르라는 것인지 확인되지 않아요. 선생님 안내를 확인하고 직접 정해 주세요."
      : null,
  };
}

export interface CandidateVerdict {
  name: string;
  actual_type: SubjectType;
  meets_constraints: boolean;
  note: string;
}

const VERIFY_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    verdicts: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          actual_type: { type: Type.STRING, enum: [...SUBJECT_TYPES] },
          meets_constraints: { type: Type.BOOLEAN },
          note: { type: Type.STRING },
        },
        required: ["name", "actual_type", "meets_constraints", "note"],
      },
    },
  },
  required: ["verdicts"],
};

/**
 * 후보 검증 — 후보를 만든 호출의 자기 분류를 믿지 않고, 이름만 보고 독립적으로 종류를 다시 판별한다.
 * 통과 조건: 실제 종류가 과제의 대상 종류와 같고, 안내문 조건(constraints)을 직접 충족한다.
 * "주제와 관련 있다"는 통과 사유가 아니다.
 */
export async function verifyCandidates(
  spec: SubjectSpec,
  names: string[]
): Promise<(CandidateVerdict & { pass: boolean })[]> {
  if (names.length === 0) return [];
  const ai = getGeminiClient();
  const prompt = `
수행평가에서 학생이 고를 대상의 후보를 엄격하게 검증해줘.

[과제 주제] ${spec.topic}
[대상 종류] ${SUBJECT_TYPE_LABEL[spec.subject_type]} (${spec.subject_type})
[대상이 만족해야 하는 조건] ${spec.constraints.join(" / ") || "(별도 조건 없음)"}
[제외 대상] ${spec.exclusions.join(", ") || "(없음)"}

후보 목록:
${names.map((n, i) => `${i + 1}. ${n}`).join("\n")}

각 후보에 대해:
- actual_type: 그 이름이 실제로 가리키는 것의 종류(person/event/work/system/place/organization/concept/other).
  "OO 제도", "OO 선언", "OO 법", "국제기구", "OO 운동(집합적 사건)"은 person이 아니다. 개인 이름이 아니면 person으로 하지 마라.
- meets_constraints: 위 조건을 그 대상이 직접 충족하는가. 주제와 인접한 분야일 뿐이면(예: 인권 선구자 조건에 환경운동가) false.
  조건이 없으면 주제에 직접적으로 부합하는지만 본다.
- note: 판단 근거 한 줄.
`.trim();

  const res = await withGeminiRetry(
    () =>
      ai.models.generateContent({
        model: GEMINI_MODELS.flash,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { responseMimeType: "application/json", responseSchema: VERIFY_SCHEMA, temperature: 0 },
      }),
    "learning:verify-candidates"
  );
  const verdicts = (JSON.parse(res.text ?? "{}") as { verdicts?: CandidateVerdict[] }).verdicts ?? [];
  const typeOk = (t: SubjectType) => spec.subject_type === "unspecified" || spec.subject_type === t;
  // 검증 응답에 빠진 후보는 통과시키지 않는다(보수적).
  return names.map((name, i) => {
    // 이름이 같은 판정을 우선 쓰고(모델이 순서를 바꿔도 안전), 없으면 같은 순번의 판정을 쓴다.
    const v = verdicts.find((x) => x.name?.trim() === name) ?? verdicts[i];
    if (!v) return { name, actual_type: "unspecified" as SubjectType, meets_constraints: false, note: "검증 결과 없음", pass: false };
    return { ...v, name, pass: typeOk(v.actual_type) && v.meets_constraints === true };
  });
}
