// 안내문에 분량이 없을 때 단계별로 "필요한 내용을 다 담는 데 알맞은" 분량 범위를 정한다.
// 모든 단계에 같은 글자 수를 주지 않는다: 단계의 역할(조사 자료·신문·소감·발표문 …)과 다뤄야 할 항목 수로 정하고,
// 이 값은 생성 지시용 가이드일 뿐 강제 기준이 아니다(강제는 안내문이 명시한 분량만 — 부족 여부는 필수 항목 충족으로 본다).
// alias import 없음 — node:test에서 바로 불러올 수 있게.
import { inferDeliverableForm, isResearchMaterialStep } from "./deliverable.ts";
import { qualityFixesOn, formRequirementsOn } from "./quality-flags.ts";
import { hasSizeLimit, isSceneListElement, requirementsForElement } from "./form-requirements.ts";

export type LengthRole =
  | "material" // 항목별 조사 자료(소제목 구조)
  | "report_sections" // 항목 소제목이 있는 제출용 보고서(항목마다 문단)
  | "newspaper"
  | "reflection" // 소감·느낀 점·후기·성찰
  | "reason" // 선정 이유·동기
  | "slogan" // 문구·슬로건·캐치프레이즈
  | "script" // 발표문·대본·연설
  | "report" // 보고서·논설문·감상문·에세이·비평
  | "plan" // 계획·개요·설계
  | "scenes" // 장면 번호 소제목(스토리보드·컷)으로 쓰는 단계 — 장면마다 화면·대사 한두 문장
  | "general";

export interface PlanElement {
  label: string;
  description: string;
  items_format?: "sections" | "flowing";
  required_items?: string[];
}

export interface LengthPlan {
  role: LengthRole;
  min: number;
  max: number;
  /** 사람이 읽는 근거(프롬프트·로그용) */
  basis: string;
}

export function lengthRoleOf(el: PlanElement): LengthRole {
  const label = el.label;
  const text = `${el.label} ${el.description}`;
  if (inferDeliverableForm(el) === "newspaper") return "newspaper";
  if (formRequirementsOn() && isSceneListElement(el)) return "scenes";
  // 개요·계획은 항목이 여럿이어도 보고서가 아니다 — 항목 수로만 정하면 "개요"에 보고서 분량(항목 7개 × 250~450 = 1,750~3,150자)이 붙어
  // 실제로 2,000~2,700자짜리 개요가 나왔다(실측 2026-10-29, 26회 중앙 2,481자). 라벨이 개요·계획이면 계획 분량을 먼저 적용한다.
  if (/계획|개요|설계|구상|기획/.test(label) && !/보고서|논설|논술|에세이|소논문/.test(label)) return "plan";
  if (el.items_format === "sections" && (el.required_items?.length ?? 0) >= 2) return qualityFixesOn() && !isResearchMaterialStep(el) ? "report_sections" : "material";
  if (/소감|느낀\s*점|후기|성찰|반성|다짐/.test(label)) return "reflection";
  if (/선정\s*이유|선택\s*이유|동기|이유\s*작성/.test(label)) return "reason";
  if (/문구|슬로건|캐치|표어|제목\s*짓/.test(label)) return "slogan";
  if (/발표|대본|스피치|연설|speech/i.test(text)) return "script";
  if (/보고서|논설|논술|에세이|소논문|비평|감상문|독후감|칼럼/.test(text)) return "report";
  if (/계획|개요|설계|구상|기획/.test(label)) return "plan";
  return "general";
}

/** 항목 수가 많을수록 늘어나는 폭(항목당 가산). */
const PER_ITEM = 140;

export function planLength(el: PlanElement): LengthPlan {
  const role = lengthRoleOf(el);
  const items = el.required_items?.length ?? 0;
  const itemBoost = Math.max(0, items - 2) * PER_ITEM;
  switch (role) {
    case "material": {
      const n = Math.max(items, 2);
      return { role, min: n * 160, max: n * 380, basis: `조사 항목 ${n}개 × 항목당 사실 2~4문장` };
    }
    case "report_sections": {
      const n = Math.max(items, 2);
      return { role, min: n * 250, max: n * 450, basis: `보고서 항목 ${n}개 × 항목당 한두 문단` };
    }
    case "scenes": {
      const n = Math.max(items, 2);
      return { role, min: n * 70, max: n * 200, basis: `장면 ${n}개 × 장면당 화면 설명·대사 한두 문장` };
    }
    case "newspaper":
      return { role, min: 900 + itemBoost / 2, max: 1500 + itemBoost, basis: "신문 한 면에 들어갈 기사·표·후기" };
    case "reflection":
      return { role, min: 250, max: 600, basis: "본인 경험·생각 중심의 짧은 글" };
    case "reason":
      return { role, min: 200, max: 500, basis: "선정 이유와 근거 한두 가지" };
    case "slogan":
      return { role, min: 60, max: 400, basis: "짧은 문구와 한 줄 설명" };
    case "script":
      return { role, min: 900 + itemBoost, max: 1700 + itemBoost, basis: "말로 전하는 발표 3분 안팎" };
    case "report":
      return { role, min: 1000 + itemBoost, max: 2000 + itemBoost * 1.5, basis: "주장·근거·해석·결론을 갖춘 글" };
    case "plan":
      return { role, min: 400, max: 900 + itemBoost, basis: "실행 가능한 단계와 근거" };
    default:
      return { role, min: 500 + itemBoost, max: 1100 + itemBoost, basis: "요구 내용을 충분히 설명하는 글" };
  }
}

const round50 = (n: number) => Math.round(n / 50) * 50;

/**
 * 프롬프트에 넣을 분량 가이드 줄(안내문에 분량이 없는 단계만). ctx를 주면 안내문이 문장·줄·문단 상한을 정한 단계는 뺀다 —
 * 기본 범위(예: 발표 900~1700자)가 "5문장 이내"와 부딪혀 모델이 숫자 큰 쪽을 따랐다(form-requirements.ts).
 */
export function lengthGuideLines(
  elements: (PlanElement & { target_length?: unknown })[],
  ctx?: { requirements: string[]; guide?: string; labels: string[] }
): string[] {
  return elements
    .filter((e) => !e.target_length)
    .filter((e) => !(ctx && formRequirementsOn() && hasSizeLimit(requirementsForElement(e, ctx.requirements, ctx.guide, ctx.labels))))
    .map((e) => {
      const p = planLength(e);
      return `- "${e.label}" 단계: 공백 포함 ${round50(p.min)}~${round50(p.max)}자 안팎(${p.basis}).`;
    });
}
