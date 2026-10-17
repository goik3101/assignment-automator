// 안내문에 분량이 없을 때 단계별로 "필요한 내용을 다 담는 데 알맞은" 분량 범위를 정한다.
// 모든 단계에 같은 글자 수를 주지 않는다: 단계의 역할(조사 자료·신문·소감·발표문 …)과 다뤄야 할 항목 수로 정하고,
// 이 값은 생성 지시용 가이드일 뿐 강제 기준이 아니다(강제는 안내문이 명시한 분량만 — 부족 여부는 필수 항목 충족으로 본다).
// alias import 없음 — node:test에서 바로 불러올 수 있게.
import { inferDeliverableForm } from "./deliverable.ts";

export type LengthRole =
  | "material" // 항목별 조사 자료(소제목 구조)
  | "newspaper"
  | "reflection" // 소감·느낀 점·후기·성찰
  | "reason" // 선정 이유·동기
  | "slogan" // 문구·슬로건·캐치프레이즈
  | "script" // 발표문·대본·연설
  | "report" // 보고서·논설문·감상문·에세이·비평
  | "plan" // 계획·개요·설계
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
  if (el.items_format === "sections" && (el.required_items?.length ?? 0) >= 2) return "material";
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

/** 프롬프트에 넣을 분량 가이드 줄(안내문에 분량이 없는 단계만). */
export function lengthGuideLines(elements: (PlanElement & { target_length?: unknown })[]): string[] {
  return elements
    .filter((e) => !e.target_length)
    .map((e) => {
      const p = planLength(e);
      return `- "${e.label}" 단계: 공백 포함 ${round50(p.min)}~${round50(p.max)}자 안팎(${p.basis}).`;
    });
}
