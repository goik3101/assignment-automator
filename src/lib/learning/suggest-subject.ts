import { Type, type Schema } from "@google/genai";
import { getGeminiClient, GEMINI_MODELS } from "@/lib/gemini/client";
import { withGeminiRetry } from "@/lib/gemini/retry";
import { ACHIEVEMENT_INTERPRETATION_RULES } from "@/lib/gemini/prompts";
import { loadSelectionHistory } from "@/lib/recommendations/recommendation-diversity";
import { canonicalize } from "@/lib/selection/canonical";
import { selectFromCandidates, type HistoryEntry, type SelectionCandidate } from "@/lib/selection/score";
import type { SubjectCandidate } from "@/types/learning";
import type { CoreTaskInfo } from "@/types/task";
import {
  extractSubjectSpec,
  verifyCandidates,
  SUBJECT_TYPE_LABEL,
  SUBJECT_TYPES,
  type SubjectSpec,
} from "./subject-spec";

const SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    candidates: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: "대상 이름(널리 쓰이는 표기)" },
          canonical_id: { type: Type.STRING, description: "영문 정식 이름 소문자 snake_case(예: henry_dunant)" },
          group: { type: Type.STRING, description: "이 대상이 속하는 분야/계열 짧은 라벨" },
          candidate_type: { type: Type.STRING, enum: [...SUBJECT_TYPES] },
          reason: { type: Type.STRING, description: "안내문의 대상 조건을 왜 충족하는지" },
          field_notes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: { field: { type: Type.STRING }, note: { type: Type.STRING } },
              required: ["field", "note"],
            },
          },
        },
        required: ["name", "canonical_id", "group", "candidate_type", "reason", "field_notes"],
      },
    },
  },
  required: ["candidates"],
};

const WANT = 3;
const OVERGENERATE = 6;
const MAX_ROUNDS = 2;
// 검증을 통과한 후보가 이만큼 모이면(WANT보다 많이) 더 생성하지 않고 그 안에서 코드가 WANT개를 고른다.
const POOL_ENOUGH = 4;

export interface SuggestResult {
  spec: SubjectSpec;
  candidates: SubjectCandidate[];
  /** 안내문만으로 대상 종류를 알 수 없어 추천하지 않은 경우 — 화면에 안내 문구를 보여준다. */
  needsClarification: boolean;
  /** 검증에서 탈락한 후보(디버깅·테스트용, 화면에는 보내지 않는다). */
  rejected: { name: string; reason: string }[];
}

async function generateRound(params: {
  subject: string;
  info: CoreTaskInfo;
  spec: SubjectSpec;
  instructions?: string | null;
  guidanceText?: string;
  avoid: string[];
}): Promise<{ name: string; canonical_id?: string; group?: string; candidate_type: string; reason: string; field_notes: { field: string; note: string }[] }[]> {
  const { spec } = params;
  const ai = getGeminiClient();
  const typeLabel = SUBJECT_TYPE_LABEL[spec.subject_type];
  const prompt = `
너는 고등학생이 수행평가에서 다룰 대상을 고르는 것을 돕는 조교다. 아래 과제 조건에 정확히 맞는 실존하는 후보를
${OVERGENERATE}개 제안해줘(뒤에서 조건 검증을 거쳐 3개만 학생에게 보여준다). 최종 선택은 학생이 한다.

[과목] ${params.subject}
[과제 주제] ${spec.topic}
[고를 대상의 종류] ${typeLabel} — 후보는 전부 이 종류여야 한다.
[대상이 만족해야 하는 조건] ${spec.constraints.join(" / ") || "(별도 조건 없음)"}
[학생이 나중에 조사할 항목] ${spec.required_fields.join(", ") || "(없음)"}
[추천하면 안 되는 대상] ${spec.exclusions.join(", ") || "(없음)"}
${params.instructions ? `[학생 지침]\n${params.instructions}\n` : ""}${params.guidanceText ? `\n${params.guidanceText}\n` : ""}${
    params.avoid.length ? `\n[이미 제외된 후보 — 다시 내지 말 것] ${params.avoid.join(", ")}\n` : ""
  }
규칙:
- "주제와 관련 있어 보인다"는 이유로 고르지 마라. 대상 종류와 조건을 정확히 충족하는 것만 낸다.
  ${typeLabel} 이외의 종류(예: 제도·기관·단체 자체·사건·법률·책·영화·개념)와, 조건을 충족하지 않는 인접 분야의 대상은 내지 마라.
- 반드시 실시간 웹 검색을 실제로 호출해서 각 후보가 실존하는지와 조건을 직접 충족하는지 확인할 것.
- 서로 다른 분야·시대·지역에서 고르고, 단순히 유명하거나 검증하기 쉽다는 이유로 고르지 말 것.
- 후보마다 (1) 이름, (2) 종류, (3) 이 과제의 조건(${spec.constraints.join(", ") || "주제"})을 왜 충족하는지,
  (4) 학생이 조사할 항목(${spec.required_fields.join(", ") || "주요 내용"}) 각각에 대한 배경 정보를 한 줄씩 적어라.
  항목별 한 줄은 자료 조사를 시작할 단서 수준으로만 쓰고, 학생이 쓸 답안을 통째로 써 주지 마라.
  검색으로 확인한 널리 알려진 사실만 쓰고, 확신이 없는 세부 사실(작은 인물 이름·정확한 수치·날짜)은 쓰지 마라.
- 외국 인물의 이름은 한국에서 통용되는 표준 표기로 띄어쓰기를 지켜 쓰고 필요하면 원어를 괄호로 병기할 것.
${ACHIEVEMENT_INTERPRETATION_RULES}
`.trim();

  const investigation = await withGeminiRetry(
    () =>
      ai.models.generateContent({
        model: GEMINI_MODELS.flash,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { tools: [{ googleSearch: {} }] },
      }),
    "learning:suggest:investigate"
  );
  const memo = investigation.text;
  if (!memo) return [];

  const extraction = await withGeminiRetry(
    () =>
      ai.models.generateContent({
        model: GEMINI_MODELS.flashLite,
        contents: [
          {
            role: "user",
            parts: [{ text: `아래 메모에서 제안된 후보(이름, 종류, 조건 충족 이유, 항목별 한 줄)를 구조화해줘.\n\n${memo}` }],
          },
        ],
        config: { responseMimeType: "application/json", responseSchema: SCHEMA },
      }),
    "learning:suggest:extract"
  );
  try {
    const parsed = JSON.parse(extraction.text ?? "{}") as {
      candidates?: { name: string; canonical_id?: string; group?: string; candidate_type: string; reason: string; field_notes: { field: string; note: string }[] }[];
    };
    return (parsed.candidates ?? []).filter((c) => c.name?.trim());
  } catch {
    return [];
  }
}

/**
 * "AI 추천" — 안내문에서 대상 종류·조건을 먼저 뽑고(subject-spec), 그 조건으로 후보를 만든 뒤,
 * 표시 전에 후보마다 종류·조건 충족 여부를 독립적으로 검증해 통과한 것만 돌려준다.
 * 최근 자주 선택된 인물은 자동 작성 모드와 같은 이력(recommendation_history)을 읽기 전용으로
 * 참고한다(인물 과제일 때만 — 그 이력은 인물 이름 기준이다). 학습 모드의 선택은 그 이력에 기록하지 않는다.
 */
export async function suggestSubjectCandidates(params: {
  subject: string;
  info: CoreTaskInfo;
  instructions?: string | null;
  userId?: string;
  /** 같은 수행평가 식별자(cluster_id) — 있으면 그 범위의 최근 선정 이력으로 후보를 코드가 골라 반복을 줄인다. */
  scopeKey?: string | null;
  /** 테스트용 fixture 이력. */
  history?: HistoryEntry[];
  rng?: () => number;
}): Promise<SuggestResult> {
  const spec = await extractSubjectSpec(params);
  if (spec.needs_clarification) {
    return { spec, candidates: [], needsClarification: true, rejected: [] };
  }

  const pool: { cand: SubjectCandidate; key: string; group: string | null }[] = [];
  const rejected: { name: string; reason: string }[] = [];
  const seen = new Set<string>();
  const key = (n: string) => n.replace(/[\s·・]/g, "").toLowerCase();

  for (let round = 0; round < MAX_ROUNDS && pool.length < POOL_ENOUGH; round++) {
    const raw = await generateRound({
      subject: params.subject,
      info: params.info,
      spec,
      instructions: params.instructions,
      avoid: [...rejected.map((r) => r.name), ...pool.map((p) => p.cand.name)],
    });
    const fresh = raw.filter((c) => !seen.has(key(c.name)));
    fresh.forEach((c) => seen.add(key(c.name)));
    if (fresh.length === 0) continue;

    const verdicts = await verifyCandidates(spec, fresh.map((c) => c.name.trim()));
    fresh.forEach((c, i) => {
      const v = verdicts[i];
      // 후보 생성 호출의 자기 분류도 대상 종류와 어긋나면 탈락시킨다(두 신호 모두 통과해야 함).
      const selfTypeOk = c.candidate_type === spec.subject_type;
      if (v.pass && selfTypeOk) {
        {
          const canon = canonicalize(c.name.trim(), c.canonical_id);
          pool.push({ key: canon.key, group: c.group?.trim() || null, cand: {
            name: c.name.trim(),
            reason: (c.reason ?? "").trim().slice(0, 200),
            fieldNotes: (c.field_notes ?? [])
              .filter((f) => f.field?.trim() && f.note?.trim() && !/종류|유형|선정|선택/.test(f.field))
              .slice(0, 6)
              .map((f) => ({ field: f.field.trim(), note: f.note.trim().slice(0, 140) })),
          } });
        }
      } else {
        rejected.push({
          name: c.name.trim(),
          reason: selfTypeOk ? v.note || `조건 미충족(${v.actual_type})` : `유형 불일치(${c.candidate_type})`,
        });
      }
    });
  }

  // 검증을 통과한 후보 풀에서 WANT개를 코드가 고른다(같은 사용자·같은 수행평가·전체 이력 + 별칭·의미 계열 반영).
  const history = params.history ?? (params.scopeKey ? await loadSelectionHistory("subject") : []);
  let remaining: (SelectionCandidate & { cand: SubjectCandidate })[] = pool.map((p) => ({ name: p.cand.name, key: p.key, group: p.group, fit: 0.8, cand: p.cand }));
  const chosen: SubjectCandidate[] = [];
  while (chosen.length < WANT && remaining.length > 0) {
    const sel = selectFromCandidates(remaining, history, { userId: params.userId, scopeKey: params.scopeKey, rng: params.rng });
    if (!sel) break;
    if (sel.fallbackUsed) console.warn(`[selection] 학습 추천 fallback tier=${sel.tier} 선택="${sel.picked.name}"`);
    const pickedKey = sel.picked.key;
    chosen.push((remaining.find((r) => r.key === pickedKey) as { cand: SubjectCandidate }).cand);
    remaining = remaining.filter((r) => r.key !== pickedKey);
  }
  return { spec, candidates: chosen, needsClarification: false, rejected };
}
