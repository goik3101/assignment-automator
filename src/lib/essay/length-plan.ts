// 안내문에 분량이 없을 때 단계별로 "필요한 내용을 다 담는 데 알맞은" 분량 범위를 정한다.
// 모든 단계에 같은 글자 수를 주지 않는다: 단계의 역할(조사 자료·신문·소감·발표문 …)과 다뤄야 할 항목 수로 정하고,
// 이 값은 생성 지시용 가이드일 뿐 강제 기준이 아니다(강제는 안내문이 명시한 분량만 — 부족 여부는 필수 항목 충족으로 본다).
// alias import 없음 — node:test에서 바로 불러올 수 있게.
import { inferDeliverableForm, isResearchMaterialStep } from "./deliverable.ts";
import { qualityFixesOn, formRequirementsOn, lengthInferOn, lineLengthOn, lengthTargetOn } from "./quality-flags.ts";
import { pageLengthForElement } from "./page-length.ts";
import { hasSizeLimit, isSceneListElement, requirementsForElement } from "./form-requirements.ts";
import { isDrawingBox } from "./box-lines.ts";
import { lengthFromAnalyzeOn, type LengthEstimate } from "./length-estimate.ts";

export type LengthRole =
  | "material" // 항목별 조사 자료(소제목 구조)
  | "report_sections" // 항목 소제목이 있는 제출용 보고서(항목마다 문단)
  | "newspaper"
  | "reflection" // 소감·느낀 점·후기·성찰
  | "reason" // 선정 이유·동기
  | "slogan" // 문구·슬로건·캐치프레이즈
  | "script" // 발표문·대본·연설
  | "report" // 보고서·논설문·감상문·에세이·비평
  | "short_answer" // 짧은 서술형 답변 (LENGTH_INFER)
  | "opinion" // 일반적인 의견 작성 (LENGTH_INFER)
  | "argument" // 주장하는 글·논설문 (LENGTH_INFER)
  | "inquiry" // 탐구·조사 보고서 (LENGTH_INFER)
  | "deep_analysis" // 심층 분석 보고서 (LENGTH_INFER)
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
  // 과제 유형 추론(분량 기준 문서 3순위) — 낱말로 정한 아래 규칙보다 먼저, 더 구체적인 유형부터 본다.
  if (lengthInferOn()) {
    if (/심층|종합\s*분석|비교\s*분석/.test(text) && /보고서/.test(text)) return "deep_analysis";
    if (/(탐구|조사|연구|실험)\s*(결과\s*)?보고서/.test(text)) return "inquiry";
    if (/논설|논술|주장하는\s*글|설득/.test(text)) return "argument";
    if (/서술형|한\s*문단|간단히\s*(쓰|서술|작성)|짧게\s*(쓰|서술|작성)|한두\s*문장/.test(text)) return "short_answer";
    if (/의견|견해|입장|제언|생각을?\s*(쓰|서술|작성)/.test(text) && !/보고서/.test(label)) return "opinion";
  }
  if (/보고서|논설|논술|에세이|소논문|비평|감상문|독후감|칼럼/.test(text)) return "report";
  if (/계획|개요|설계|구상|기획/.test(label)) return "plan";
  return "general";
}

/** 항목 수가 많을수록 늘어나는 폭(항목당 가산). */
const PER_ITEM = 140;

// 평가 기준 개수로 상한을 줄이는 규칙은 넣지 않는다(2026-11-06 시도 후 제거): 기준 개수를 문장 매칭으로 세면 부정확해서
// 8장면 스토리보드가 "500~500자"가 됐다. 짧게 나오는 문제를 키우므로 기준 수 → 분량 규칙은 만들지 않는다.
export function planLength(el: PlanElement): LengthPlan {
  const role = lengthRoleOf(el);
  const items = el.required_items?.length ?? 0;
  const itemBoost = Math.max(0, items - 2) * PER_ITEM;
  switch (role) {
    case "short_answer":
      return { role, min: 300, max: 500, basis: "짧은 서술형 답변" };
    case "opinion":
      return { role, min: 500, max: 800, basis: "근거를 갖춘 일반적인 의견" };
    case "argument":
      return { role, min: 800, max: 1200, basis: "주장·근거·반론·결론을 갖춘 글" };
    case "inquiry":
      return { role, min: 1200, max: 2000, basis: "탐구·조사 보고서" };
    case "deep_analysis":
      return { role, min: 2000, max: 2800, basis: "심층 분석 보고서" };
    case "material": {
      const n = Math.max(items, 2);
      return { role, min: n * 160, max: n * 380, basis: `조사 항목 ${n}개 × 항목당 사실 2~4문장` };
    }
    case "report_sections": {
      // 항목당 250~450자는 학교 평가지 칸(보통 기준선 5~6줄)보다 훨씬 길다 — 실측(2026-10-30): 항목 7개 평가지가 1,900~2,300자로 나와
      // "길고 반복적"이라는 지적과 글쓰기 14초(전체 29초)의 원인이 됐다. 안내문도 "칸의 기준선만큼" 쓰라고 한다.
      const n = Math.max(items, 2);
      return { role, min: n * 160, max: n * 300, basis: `보고서 항목 ${n}개 × 항목당 대여섯 문장` };
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

/** 목표 하나에 허용할 오차. */
const TOLERANCE = 0.2;

/**
 * 역할별 범위를 **목표 하나 + ±20%**로 좁힌다.
 *
 * 왜(실측 2026-11-08, 비용 0): 저장된 결과물 26편을 단계별로 세어 보니 **우리가 준 범위가 넓은 단계일수록 결과도 더
 * 퍼졌다.** 항목 목록이 구조를 묶어 주는 단계(보고서·개요, 범위 1.9배)는 실행 간 1.3배로 안정적인데,
 * 범위가 2.2배인 general 단계(카드뉴스·스토리보드)는 588~2302자로 갈렸다. "500자도 맞고 1100자도 맞다"고
 * 말해 놓고 적당한 길이를 기대한 것이 원인이다 — 범위를 주면 모델은 그 안에서 아무 데나 쓴다.
 *
 * 새 숫자를 지어내지 않고 **기존 역할 범위의 중앙값**을 목표로 쓴다. 항목 수로 커지는 역할은 중앙값도 항목 수에
 * 따라 커진다(보고서 항목당 230자 — 정답 채점 만점을 받은 결과물의 실측 180~237자/항목과 맞는다).
 * 하한은 여전히 강제하지 않는다(짧은지는 글자 수가 아니라 필수 항목 충족으로 본다).
 *
 * 다만 중앙값만 쓰면 **항목이 많은 단계**가 너무 얇아진다 — `plan` 역할은 하한이 400자라 항목 7개짜리 개요의
 * 중앙값이 790자(항목당 113자)가 되는데, 정답 채점 12/12를 받은 실제 개요는 1,282~1,649자였다.
 * 그래서 항목이 3개 이상이면 **항목당 150자를 바닥으로** 둔다.
 *
 * 그 바닥을 **역할 상한으로 깎지 않는다**(2026-11-08 실측에서 고침): 카드뉴스는 한 단계에 칸이 열 개가 넘는데
 * 역할이 `general`(상한 1,100자)로 잡혀 목표가 800자로 깎였고, 그 실행이 안내문 채점 **7/9**로 내려갔다.
 * 같은 안내문·같은 체크리스트로 분량만 다른 세 실행을 비교하면 1,775자 → **9/9**, 990자 → 7/9, 686자 → 6/9로
 * **점수가 분량을 따라갔다**(떨어진 항목은 "책 내용을 다룬다"·"그림 묘사" — 둘 다 자리가 필요한 것이다).
 * 항목이 많다는 것은 쓸 것이 많다는 뜻이므로, 항목이 정한 바닥이 역할 상한보다 크면 바닥을 따른다.
 */
/**
 * 항목(칸) 하나당 바닥 분량. **150자로 되돌렸다**(2026-11-08, 카드뉴스 생성 3회로 재 봄).
 *
 * 200자로 올려 봤다 — 근거는 정답 채점 만점 결과물의 밀도(194~226자/항목, `scripts/measure/length-truth.ts`)였다.
 * 결과는 **역효과**였다: 카드뉴스 목표가 2,050자가 되고 글이 1,789자로 나오자 안내문의 반대쪽 조건
 * ("칸에 들어갈 말은 한두 문장")을 깨서 채점이 **7/9로 내려갔고**, 생성이 39.9초로 30초를 넘겼다.
 *
 * 그때 같이 배운 것(이전 기록을 고침): "점수가 분량을 따라간다"는 3개 표본의 과잉 해석이었다.
 * 같은 안내문 6개 표본은 660→6/9, 965→7/9, 1,064→6/9, 1,496→8/9, 1,750→9/9, 1,789→7/9로
 * **단조롭지 않다.** 채점표에는 "내용을 충분히"와 "칸마다 한두 문장"처럼 서로 반대인 조건이 함께 있어
 * 적당한 지점은 가운데(약 1,500자)이고, 길게 쓰는 쪽으로 밀면 반대쪽 조건이 깨진다.
 */
const PER_ITEM_FLOOR = 150;

export function narrowTarget(el: PlanElement & { length_estimate?: LengthEstimate }): {
  target: number;
  min: number;
  max: number;
  basis: string;
} {
  // 분석이 사진(칸 크기·줄 수·배점·예시 글)을 보고 정한 분량이 있으면 그것을 쓴다 — 역할 표는 사진을 못 본다.
  // 채점된 결과물 7편에서 항목당 글자 수가 72~465자로 흩어져(length-truth.ts) 역할·항목 수로는 정할 수 없음이 확인됐다.
  const est = lengthFromAnalyzeOn() ? el.length_estimate : undefined;
  if (est) {
    return {
      target: est.chars,
      min: Math.round(est.chars * (1 - TOLERANCE)),
      max: Math.round(est.chars * (1 + TOLERANCE)),
      basis: `안내문 사진 기준 ${est.basis}`,
    };
  }
  const p = planLength(el);
  const items = el.required_items?.length ?? 0;
  const floor = items >= 3 ? items * PER_ITEM_FLOOR : 0;
  const target = Math.round(Math.max((p.min + p.max) / 2, floor));
  return { target, min: Math.round(target * (1 - TOLERANCE)), max: Math.round(target * (1 + TOLERANCE)), basis: p.basis };
}

export type GuideElement = PlanElement & { target_length?: unknown; length_estimate?: LengthEstimate };
export type GuideCtx = { requirements: string[]; guide?: string; labels: string[] };

/** 이 단계에 분량 가이드를 줄 수 있는가(= lengthGuideLines가 이 단계를 다루는가). */
function guided(e: GuideElement, ctx?: GuideCtx): boolean {
  if (e.target_length) return false;
  if (lengthTargetOn() && isDrawingBox(e.label)) return false;
  if (ctx && formRequirementsOn() && hasSizeLimit(requirementsForElement(e, ctx.requirements, ctx.guide, ctx.labels))) return false;
  return true;
}

/**
 * 프롬프트가 이 단계에 말한 **목표 글자 수**(없으면 null). 가이드 줄을 만드는 데 쓰고,
 * 한 단계를 항목별로 나눠 쓸 때 **각 호출의 몫**을 계산하는 데도 쓴다(parallel-write.ts의 myShareLine).
 * 가이드 줄과 같은 사다리를 타야 한다 — 프롬프트에 적힌 숫자와 나눠 주는 숫자가 다르면 안 된다.
 */
export function effectiveTarget(el: GuideElement, ctx?: GuideCtx): number | null {
  if (!guided(el, ctx)) return null;
  const pg = lineLengthOn() && ctx ? pageLengthForElement(el, ctx.requirements, ctx.guide, ctx.labels) : null;
  if (pg) return Math.round((pg.min + pg.max) / 2);
  if (lengthTargetOn()) return narrowTarget(el).target;
  const p = planLength(el);
  return Math.round((p.min + p.max) / 2);
}

/**
 * 프롬프트에 넣을 분량 가이드 줄(안내문에 분량이 없는 단계만). ctx를 주면 안내문이 문장·줄·문단 상한을 정한 단계는 뺀다 —
 * 기본 범위(예: 발표 900~1700자)가 "5문장 이내"와 부딪혀 모델이 숫자 큰 쪽을 따랐다(form-requirements.ts).
 */
export function lengthGuideLines(elements: GuideElement[], ctx?: GuideCtx): string[] {
  return elements
    // 그림을 그리는 칸(만평·삽화·컷)에는 글자 수를 주지 않는다 — 실측(2026-11-08): 만평 칸이 분량 가이드를
    // 받아 483자짜리 산문이 됐고, 그림 칸의 각주를 떼는 규칙과 정반대를 말하고 있었다.
    .filter((e) => guided(e, ctx))
    .map((e) => {
      // 안내문이 "A4 1장 이내"·"원고지 5매"처럼 쪽·매로 분량을 정했으면 그 환산 범위가 역할별 기본 범위를 대신한다(page-length.ts).
      const pg = lineLengthOn() && ctx ? pageLengthForElement(e, ctx.requirements, ctx.guide, ctx.labels) : null;
      if (pg) return `- "${e.label}" 단계: 공백 포함 ${round50(pg.min)}~${round50(pg.max)}자 안팎(안내문이 정한 분량 "${pg.text}"을 ${pg.unit === "page" ? "A4 한 쪽 약 1,000자" : "원고지 한 매 200자"}로 환산한 값 — 이 범위를 넘지 말고, 다만 필수 항목을 빠뜨릴 만큼 줄이지도 말 것).`;
      if (lengthTargetOn()) {
        const t = narrowTarget(e);
        return `- "${e.label}" 단계: 공백 포함 **약 ${round50(t.target)}자**(${round50(t.min)}~${round50(t.max)}자 안에 들어오게 — ${t.basis}).`;
      }
      const p = planLength(e);
      return `- "${e.label}" 단계: 공백 포함 ${round50(p.min)}~${round50(p.max)}자 안팎(${p.basis}).`;
    });
}
