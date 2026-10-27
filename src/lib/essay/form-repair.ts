import { generate } from "../llm/index.ts";
import { checkFormRequirements, describeFormIssue, type CountReq, type FormIssue } from "./form-requirements.ts";

const markersOf = (t: string): string[] => t.match(/\[\d+\]/g) ?? [];

/** 위반 정도(조건에서 벗어난 개수의 합) — 보완 결과가 실제로 나아졌는지 비교한다. */
function distance(issues: FormIssue[]): number {
  return issues.reduce((sum, i) => sum + Math.abs(i.problem === "below" ? i.req.min - i.actual : i.actual - i.req.max), 0);
}

export interface FormRepairResult {
  content: string;
  /** 보완 뒤에도 남은 위반(없으면 빈 배열) */
  remaining: FormIssue[];
  repaired: boolean;
}

/**
 * 개수 조건(장면·문장·문단 수)을 어긴 한 단계를 검색 없이 한 번만 고친다(약 5~10초, 위반이 있을 때만).
 * 사실·각주 번호는 그대로 두고, 새 각주 번호를 만들었거나 오히려 조건에서 더 멀어지면 원문을 유지한다.
 */
export async function repairFormRequirements(opts: {
  label: string;
  content: string;
  description: string;
  reqs: CountReq[];
  issues: FormIssue[];
  skipScene?: boolean;
}): Promise<FormRepairResult> {
  const { label, content, description, reqs, issues, skipScene } = opts;
  const keep: FormRepairResult = { content, remaining: issues, repaired: false };
  try {
    const res = await generate({
      label: "generateEssay:formRepair",
      role: "main",
      effort: "low",
      prompt: `
아래는 수행평가 한 단계의 원고다. 안내문(시험지)이 정한 형식 조건을 어겼다. 지적된 조건만 맞춰 이 단계 본문 전체를 다시 써줘.
- 조건 안에서 핵심 내용과 사실(연도·이름·수치), [n] 각주 표기는 그대로 두고, 새 사실·각주 번호·인용문을 만들지 말 것.
- 기존 소제목(###)·표 형식은 유지하고, 설명·머리말 없이 본문만 출력할 것.
${description ? `- 이 단계가 다룰 내용: ${description}\n` : ""}
[고칠 조건]
${issues.map((i) => `- ${describeFormIssue(i)}`).join("\n")}

[${label} 원고]
${content}`.trim(),
    });
    const next = res.text.trim();
    if (!next) return keep;
    if (markersOf(next).some((m) => !markersOf(content).includes(m))) return keep; // 없는 각주 번호를 만들었다
    const after = checkFormRequirements(next, reqs, { skipScene });
    if (distance(after) >= distance(issues)) return keep; // 나아지지 않았다
    return { content: next, remaining: after, repaired: true };
  } catch (err) {
    console.error("[formRepair] 형식 조건 보완 실패(원문 유지)", err);
    return keep;
  }
}

export function formWarningText(issues: FormIssue[]): string {
  const parts = issues.map((i) => `${i.req.word} 조건 ${describeCond(i)}, 실제 ${i.actual}개`);
  return `안내문의 형식 조건을 완전히 맞추지 못했어요 — ${parts.join(" / ")}. 제출 전에 확인해 주세요.`;
}

function describeCond(i: FormIssue): string {
  const r = i.req;
  if (r.min > 0 && r.max > 0) return r.min === r.max ? `${r.min}개` : `${r.min}~${r.max}개`;
  return r.min > 0 ? `${r.min}개 이상` : `${r.max}개 이내`;
}
