// 생성 프롬프트에 들어가는 **블록들**을 전수로 본다 — 어느 단계에 무엇이 붙고, 서로 반대를 말하는 짝이 없는지.
// 모델 호출이 없어 비용 0. 규칙 자체를 보는 rule-audit.ts와 짝이다(그쪽은 "조건이 걸리는가", 이쪽은 "그래서 무엇을 시키는가").
//
// 왜 필요한가(실측 2026-11-01): 블록은 저마다 "이 과제는 이런 모양"을 가정하고 쓰였고, 가정이 어긋나면 서로 싸운다.
//   - 신문 블록 "항목 이름을 그대로 소제목으로 쓰지 말 것" ↔ 구조화 블록 "항목명을 글자 그대로 ### 소제목으로"
//   - 장면 블록 "대사는 말할 문장 그대로" ↔ 대본 금지 "완성된 대본을 쓰지 말 것"
//   - 표 요구 "표를 만들어 넣을 것" ↔ 자료 제한 "표는 쓸 수 없음"
// 싸우면 모델이 둘 중 하나를 고르고, 그 결과는 실행마다 달라진다.
//
// 사용: node --import ./scripts/measure/loader/register.mjs scripts/measure/prompt-audit.ts
import fs from "node:fs";
import path from "node:path";
const REPO = process.cwd();
process.loadEnvFile(path.join(REPO, ".env.local"));

const { inferDeliverableForm, isResearchMaterialStep } = await import("@/lib/essay/deliverable");
const { isSceneListElement, wantsBriefScenes, requirementsForElement, hasSizeLimit, applyFormRequirements } = await import("@/lib/essay/form-requirements");
const { visualPolicy, needsDataTable } = await import("@/lib/essay/data-visual");
const { boxLengths } = await import("@/lib/essay/box-lines");
const { lengthGuideLines } = await import("@/lib/essay/length-plan");
const { isTableForm } = await import("@/lib/essay/table-form");

interface El {
  label: string;
  description: string;
  type?: string;
  items_format?: string;
  required_items?: string[];
}
interface Core {
  topic?: string;
  requirements?: string[];
  writing_guide?: string;
  task_elements?: El[];
}

// generate-essay.ts의 분류와 같은 기준(그쪽이 바뀌면 여기도 바꾼다 — 그래서 한 줄씩만 둔다).
const isStructured = (el: El) => el.items_format === "sections" && (el.required_items?.length ?? 0) >= 2;
const isNewspaper = (el: El) => inferDeliverableForm(el) === "newspaper" && (el.required_items?.length ?? 0) >= 1;
const isFlowing = (el: El) => el.items_format === "flowing" && (el.required_items?.length ?? 0) >= 2;

/** 서로 반대를 말하는 짝. 같은 단계에 둘 다 붙으면 안 된다. */
const CONFLICTS: [string, string, string][] = [
  ["신문", "구조화", "신문은 '항목명을 소제목으로 쓰지 말 것', 구조화는 '항목명 글자 그대로 소제목'"],
  ["구조화", "흐름", "구조화는 '소제목으로 나눠 쓰라', 흐름은 '소제목으로 쪼개지 말라'"],
  ["장면(대사 그대로)", "대본 금지", "하나는 말할 문장 그대로, 하나는 완성 대본 금지"],
  ["표 요구", "표 금지", "표를 만들라는 지시와 표를 쓰지 말라는 제한이 함께 간다"],
  ["분량 가이드", "분량 상한", "권장 글자 수와 'N문장 이내'가 함께 가면 모델이 큰 쪽을 따른다"],
  // 2026-11-10에 추가. 이 짝이 없어서 **신문 4단계 중 3단계의 충돌을 이 감사가 못 봤다** —
  // 분량 가이드가 "머리기사 약 600자", 칸 블록이 "머리기사 135~234자"를 둘 다 "반드시 지킬 것"으로 말했다.
  // 블록 목록을 손으로 적는 대신 length-plan에 직접 물어본다(실제로 무엇이 붙는지와 어긋나지 않게).
  ["양식 칸", "분량 가이드", "양식 칸이 'N줄→M자'를, 분량 가이드가 다른 글자 수를 말하면 2~4배가 벌어진다"],
  // 2026-11-10에 추가. 장면 블록은 "칸마다 짧게(각 1~2문장)"를, 분량 가이드는 "항목당 대여섯 문장"을 말했다 —
  // 카드뉴스 칸이 137~176자로 나와 정답 채점의 "칸마다 한두 문장"이 떨어졌다(7/9). 설명이 서로 반대면 모델이 고른다.
  ["장면(간단히)", "분량 가이드(항목당 대여섯 문장)", "칸마다 1~2문장과 항목당 대여섯 문장이 함께 간다"],
  ["장면(대사 그대로)", "분량 가이드(항목당 대여섯 문장)", "칸마다 짧게와 항목당 대여섯 문장이 함께 간다"],
  // 2026-11-11에 추가. 양식이 표인 칸에 소제목 블록이 함께 가면 열 이름이 ### 소제목이 된다 —
  // 실측: 수학 "분석적 채점 기준표"가 "### 문항 번호 / ### 평가 요소 …" 다섯 개로, 사회 "사례 분석표"가 소제목 열 개로 나왔다.
  ["표 양식", "구조화", "표는 열을 머리줄로 쓰라, 구조화는 항목명을 소제목으로 쓰라"],
  ["표 양식", "보고서 항목", "표 한 칸에 한두 문장과 항목마다 문단이 함께 간다"],
  ["표 양식", "분량 가이드(항목당 대여섯 문장)", "표 칸 한두 문장과 항목당 대여섯 문장이 함께 간다"],
];

function blocksFor(core: Core, el: El, all: El[]): string[] {
  const out: string[] = [];
  const texts = [...(core.requirements ?? []), core.writing_guide ?? "", ...all.map((e) => e.description)];
  const labels = all.map((e) => e.label);
  const brief = wantsBriefScenes(texts);
  const scene = isSceneListElement(el);
  if (isNewspaper(el)) out.push("신문");
  // 표 칸은 구조화·보고서 항목 블록에서 뺀다 — 생성도 같이 뺀다(generate-essay의 structuredEls).
  const isTable = isTableForm(el as never, core.writing_guide);
  if (isStructured(el) && !isNewspaper(el) && !isTable) out.push("구조화");
  if (isFlowing(el) && !isNewspaper(el)) out.push("흐름");
  if (scene && !brief) out.push("장면(대사 그대로)");
  if (scene && brief) out.push("장면(간단히)");
  if (brief && !scene) out.push("대본 금지");
  if (isStructured(el) && !isResearchMaterialStep(el) && !scene && !isTable) out.push("보고서 항목");
  if (needsDataTable(el as never, core.requirements ?? [], core.writing_guide, all.length === 1, all as never)) out.push("표 요구");
  // 양식이 표인 칸은 "열을 머리줄로 하는 표 하나"를 말한다 — 소제목 구조·보고서 항목 블록과 정면으로 부딪친다.
  if (isTable) out.push("표 양식");
  const pol = visualPolicy(texts);
  // "도표"가 금지라고 "표"가 금지인 것은 아니다 — 정확히 일치할 때만 본다.
  if ((pol.banned ?? []).some((b: string) => b === "표" || b === "그래프")) out.push("표 금지");
  const reqs = requirementsForElement(el as never, core.requirements ?? [], core.writing_guide, labels);
  if (hasSizeLimit(reqs)) out.push("분량 상한");
  if (boxLengths(labels, core.writing_guide, texts).some((b: { label: string }) => b.label === el.label)) out.push("양식 칸");
  // "분량 가이드가 붙는가"는 length-plan이 정한다 — 여기서 따로 추측하면 감사와 실제가 어긋난다.
  const guideCtx = {
    requirements: core.requirements ?? [],
    guide: core.writing_guide,
    labels,
    topic: core.topic,
    siblings: all.map((e) => ({ label: e.label, description: e.description })),
  };
  const guideLines = lengthGuideLines([el] as never, guideCtx as never);
  if (guideLines.length > 0) {
    // 가이드가 **무슨 근거로** 그 숫자를 말하는지까지 본다 — "항목당 대여섯 문장"은 장면 블록과 정면으로 부딪친다.
    out.push(/항목당 대여섯 문장/.test(guideLines[0]) ? "분량 가이드(항목당 대여섯 문장)" : "분량 가이드");
  }
  return out;
}

const dir = path.join(REPO, "scratchpad/measure");
const files = fs.readdirSync(dir).filter((f) => f.endsWith("-analysis.json"));
let conflicts = 0;
for (const f of files) {
  const raw = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  // 생성은 장면 단위를 "장면 1…N" 필수 항목으로 펼친 뒤 블록을 만든다 — 검사도 같은 자리에서 봐야 한다.
  const core: Core = applyFormRequirements((raw.core_task_info ?? raw) as never) as Core;
  const all = (core.task_elements ?? []).filter((e) => e.type === "text_submission");
  console.log(`\n### ${f}  (글 단계 ${all.length}개 / 전체 ${(core.task_elements ?? []).length}개)`);
  if (all.length === 0) console.log("   ⚠ 글 단계가 하나도 없다 — 학생이 글을 못 받는다");
  for (const el of all) {
    const bs = blocksFor(core, el, all);
    const bad = CONFLICTS.filter(([a, b]) => bs.includes(a) && bs.includes(b));
    conflicts += bad.length;
    console.log(`   ${bad.length ? "⚠ 충돌" : "      "} ${el.label.padEnd(22)} → ${bs.join(" + ")}`);
    for (const [a, b, why] of bad) console.log(`          ↳ ${a} ↔ ${b}: ${why}`);
  }
}
console.log(`\n=== 블록 충돌 ${conflicts}건 ===`);
