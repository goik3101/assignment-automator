import { generate } from "@/lib/llm";
import { Type, type Schema } from "@google/genai";
import { extractSubjectSpec, verifyCandidates, SUBJECT_TYPES, SUBJECT_TYPE_LABEL, type SubjectSpec, type SubjectType } from "@/lib/learning/subject-spec";
import { needsSubjectSelection } from "@/lib/learning/items";
import { loadSelectionHistory } from "@/lib/recommendations/recommendation-diversity";
import { canonicalize } from "./canonical";
import { selectFromCandidates, type HistoryEntry, type ScoredCandidate, type SelectionCandidate, type SelectionTier } from "./score";
import { cleanSubjectName, findStudentTopic, isMediumOnly } from "./student-topic";
import { DOMESTIC_CONSTRAINT, isDomesticScope } from "./domestic-scope";
import type { CoreTaskInfo } from "@/types/task";

// 자동 선정 공통 흐름(인물·사건·탐구 대상·발표 주제 등 "학생이 고르는 대상"):
//  [1] 조건 분석(extractSubjectSpec) → [2] 후보 생성 → [3] 후보 적합성 검증 → [4] 부적합 제거 → [5] 학생 직접 지정 확인
//  → [6~9] 기록(같은 사용자/같은 수행평가/전체) + 별칭 통합 + 의미 계열 → [10~11] 점수 계산·선택 → [12] 저장은 호출부(라우트)
//  → [13] 이후 생성 단계는 선택 결과를 그대로 쓰고 바꾸지 않는다(generate-essay의 presetSubject).
// 학생이 직접 지정한 대상이면 후보 생성·점수 계산을 전혀 실행하지 않는다.

export interface SubjectSelectionContext {
  userId?: string | null;
  /** 같은 수행평가 식별자(cluster_id). 없으면 이력을 점수에 쓰지 않는다(다른 과제 기록을 섞지 않기 위해). */
  scopeKey?: string | null;
  /** 테스트에서 실제 DB 대신 넣는 이력(fixture). */
  history?: HistoryEntry[];
  rng?: () => number;
}

export interface SelectedSubject {
  kind: "user_specified" | "auto";
  name: string;
  key: string;
  group?: string | null;
  type: SubjectType;
  /** auto일 때만. */
  tier?: SelectionTier;
  fallbackUsed?: boolean;
  candidateCount?: number;
  rejected?: { name: string; reason: string }[];
  ranking?: { name: string; fit: number; penalty: number; score: number }[];
}

export const CANDIDATE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    candidates: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: "한국에서 통용되는 표기의 이름" },
          canonical_id: { type: Type.STRING, description: "영문 정식 이름을 소문자 snake_case로(예: martin_luther_king_jr). 인물이 아니면 대상을 영문 소문자 snake_case로" },
          candidate_type: { type: Type.STRING, enum: [...SUBJECT_TYPES] },
          fit: { type: Type.INTEGER, description: "과제 조건 충족도·자료 확보 가능성·고등학생 수준 적합성 종합 1~5(5가 최고)" },
          group: { type: Type.STRING, description: "이 대상이 속하는 분야/계열을 짧은 한국어 라벨로(예: 유체역학-베르누이, 흑인 민권운동, 아동 권리)" },
        },
        required: ["name", "canonical_id", "candidate_type", "fit", "group"],
      },
    },
  },
  required: ["candidates"],
};

const CANDIDATE_COUNT = 10;

/** 자동 선정을 시도할 과제인지(선정을 요구하는 표현이 있는가). */
export function isSelectionTask(info: CoreTaskInfo): boolean {
  return needsSubjectSelection(info);
}

async function generateCandidates(spec: SubjectSpec, subject: string, instructions?: string, domestic = false): Promise<SelectionCandidate[]> {
  const typeLabel = SUBJECT_TYPE_LABEL[spec.subject_type];
  const prompt = `
고등학생 수행평가에서 학생이 고를 대상의 후보를 ${CANDIDATE_COUNT}개 제안해줘. 최종 선택은 코드가 하니 너는 고르지 말고 후보와 점수만 낸다.

[과목] ${subject}
[과제 주제] ${spec.topic}
[고를 대상의 종류] ${typeLabel}
[대상이 만족해야 하는 조건] ${spec.constraints.join(" / ") || "(별도 조건 없음)"}
[학생이 나중에 조사할 항목] ${spec.required_fields.join(", ") || "(없음)"}
[추천하면 안 되는 대상] ${spec.exclusions.join(", ") || "(없음)"}
${instructions ? `[학생 지침]\n${instructions}\n` : ""}
규칙:
- 후보는 전부 위 종류·조건을 정확히 충족하는 실존 대상이어야 한다. "관련 있어 보인다"는 이유로 넣지 마라.
- 가장 유명한 대표 대상 몇 개에 치우치지 마라. ${domestic ? "한국 안에서 서로 다른 분야·시기·인물·지역에서" : "서로 다른 분야·시대·지역·성별에서"} 고르고, 덜 알려졌어도 조건을 충족하고 자료(검색·도서관·공공기관)가 충분한 대상을 절반 이상 포함할 것.
- fit은 (조건 충족도 + 자료 확보 가능성 + 고등학생이 다루기 적절한지)의 종합이다. 유명하다는 이유로 높이지 마라.
- 같은 대상을 다른 표기로 두 번 넣지 마라.
`.trim();
  const res = await generate({
      label: "selection:candidates",
      role: "main",
      prompt: prompt,
      schema: CANDIDATE_SCHEMA,
    });
  const parsed = JSON.parse(res.text ?? "{}") as { candidates?: { name: string; canonical_id: string; candidate_type: string; fit: number; group: string }[] };
  const anyType = spec.subject_type === "other" || spec.subject_type === "unspecified" || spec.subject_type === "concept";
  const seen = new Set<string>();
  const out: SelectionCandidate[] = [];
  for (const c of parsed.candidates ?? []) {
    if (!c.name?.trim()) continue;
    if (!anyType && c.candidate_type !== spec.subject_type) continue; // [4] 유형 불일치 제거
    const canon = canonicalize(c.name, c.canonical_id);
    if (seen.has(canon.key)) continue;
    seen.add(canon.key);
    out.push({ name: canon.display, key: canon.key, group: c.group?.trim() || null, fit: Math.min(1, Math.max(0, (c.fit ?? 3) / 5)) });
  }
  return out;
}

/**
 * 자동 선정. 선정 과제가 아니거나 조건을 알 수 없으면 null(호출부는 기존 방식으로 진행).
 * 학생이 지침에 대상을 명시했으면 그 값을 그대로 반환한다(추천 로직 미실행).
 */
export async function selectSubjectForTask(
  params: { subject: string; info: CoreTaskInfo; instructions?: string },
  ctx: SubjectSelectionContext = {}
): Promise<SelectedSubject | null> {
  if (!isSelectionTask(params.info)) return null;

  // 제작 전 질문 답이나 "주제: …" 줄로 학생이 이미 정했으면 AI 판정 없이 그대로 쓴다(AI 판정이 놓치거나 매체를 대상으로 잡은 실측 — student-topic.ts).
  const typed = process.env.SELECTION_STUDENT_TOPIC !== "off" ? findStudentTopic(params.instructions) : null;
  if (typed) {
    const c = canonicalize(typed);
    console.log(`[selection] 학생 직접 지정(지침에서 확인) → 자동 선정 생략: "${c.display}"`);
    return { kind: "user_specified", name: c.display, key: c.key, type: "other" };
  }

  const spec0 = await extractSubjectSpec({ subject: params.subject, info: params.info, instructions: params.instructions });
  if (spec0.student_specified_subject && isMediumOnly(spec0.student_specified_subject)) {
    console.warn(`[selection] 학생 지정으로 잡힌 값이 매체 이름이라 무시: "${spec0.student_specified_subject}"`);
  } else if (spec0.student_specified_subject) {
    const c = canonicalize(cleanSubjectName(spec0.student_specified_subject));
    console.log(`[selection] 학생 직접 지정 → 자동 선정 생략: "${c.display}"`);
    return { kind: "user_specified", name: c.display, key: c.key, type: spec0.subject_type };
  }
  // 대상 종류를 안내문에서 특정하지 못한 "주제 고르기" 과제(사회문제·탐구 주제·발표 주제 등)는 일반 주제 선정으로 다룬다.
  const specBase: SubjectSpec =
    spec0.subject_type === "unspecified" ? { ...spec0, subject_type: "other", needs_clarification: false, clarification_note: null } : spec0;
  // 한국사·우리 사회 과제면 후보와 검증 조건을 한국 대상으로 좁힌다(domestic-scope.ts). SELECTION_DOMESTIC_SCOPE=off면 예전처럼.
  const domestic =
    process.env.SELECTION_DOMESTIC_SCOPE !== "off" &&
    isDomesticScope(params.subject, [params.info.topic, ...params.info.requirements, ...params.info.task_elements.map((e) => e.description)]);
  const spec: SubjectSpec = domestic ? { ...specBase, constraints: [...specBase.constraints, DOMESTIC_CONSTRAINT] } : specBase;
  if (domestic) console.log("[selection] 한국 범위 과제 → 후보를 한국 대상으로 제한");

  const candidates = await generateCandidates(spec, params.subject, params.instructions, domestic);
  if (candidates.length === 0) {
    console.warn("[selection] 후보 생성 결과 없음 → 기존 방식(본문 생성이 직접 선정)으로 폴백");
    return null;
  }

  const history = ctx.history ?? (ctx.scopeKey ? await loadSelectionHistory("subject") : []);
  const shouldVerify = spec.subject_type !== "other" && spec.subject_type !== "concept";
  const rejected: { name: string; reason: string }[] = [];
  let remaining = candidates;

  for (let attempt = 0; attempt < 3 && remaining.length > 0; attempt++) {
    const sel = selectFromCandidates(remaining, history, { userId: ctx.userId, scopeKey: ctx.scopeKey, rng: ctx.rng });
    if (!sel) break;
    const picked: ScoredCandidate = sel.picked;
    if (shouldVerify) {
      const [v] = await verifyCandidates(spec, [picked.name]);
      if (!v.pass) {
        rejected.push({ name: picked.name, reason: v.note || `조건 미충족(${v.actual_type})` });
        remaining = remaining.filter((c) => c.key !== picked.key);
        continue;
      }
    }
    if (sel.fallbackUsed) {
      console.warn(`[selection] fallback 사용 tier=${sel.tier} 선택="${picked.name}" (후보 ${remaining.length}개, 1차 조건 통과 후보 없음)`);
    }
    console.log(
      `[selection] 후보=${JSON.stringify(sel.ranking.map((r) => ({ n: r.name, fit: r.fit.toFixed(2), pen: r.penalty.toFixed(2) })))} 선택="${picked.name}" tier=${sel.tier}`
    );
    return {
      kind: "auto",
      name: picked.name,
      key: picked.key,
      group: picked.group ?? null,
      type: spec.subject_type,
      tier: sel.tier,
      fallbackUsed: sel.fallbackUsed,
      candidateCount: candidates.length,
      rejected,
      ranking: sel.ranking.map((r) => ({ name: r.name, fit: r.fit, penalty: r.penalty, score: r.score })),
    };
  }
  console.warn("[selection] 검증을 통과한 후보가 없어 기존 방식으로 폴백");
  return null;
}
