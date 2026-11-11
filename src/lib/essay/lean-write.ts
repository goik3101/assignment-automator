// **작성자 모델에게 안내문을 직접 보여 주고, 우리 지시는 모델이 알 수 없는 것만 남긴다.**
//
// 왜(2026-11-12 측정, 맨바닥 기준선): 같은 모델(luna)에 **안내문 사진 + 한 줄 요청**만 주고 정답 체크리스트로
// 채점하니 신문 11/11, 수학 12/12, 카드뉴스 9/9, 사회 7/8이었다(12.6~32.9초, 호출 1건).
// 같은 채점표에서 우리 파이프라인은 신문 9~11/11, 수학 10~12/12, 카드뉴스 8~9/9, 사회 5~8/8에
// 23~58초였다. 즉 **안내문 준수 축에서 우리 층은 점수를 더해 주지 않고 시간과 흔들림을 더하고 있었다.**
//
// 왜 그런가: 작성자 모델은 **안내문을 한 번도 본 적이 없다**. 분석이 만든 요약(흔들린다)과 그 위에 쌓은
// 규칙 190여 개·프롬프트 블록 20여 개·분량 숫자만 본다. 층마다 정보가 줄고 지시가 는다.
//
// 맨바닥이 못 하는 것은 분명하다(실측): **각주 0개·검색 0회**라 출처가 없고, "아래는 … 예시야" 같은
// 대화체 머리말이 붙고, 전국 학생이 같은 소재를 받는다(쏠림 억제가 없다). 그 셋이 우리 제품의 값이다.
// 그래서 이 경로는 **안내문은 모델이 읽고, 사실·출처·다양성·제출 형식은 우리가 지킨다**로 가른다.
//
// `ESSAY_LEAN_WRITE=on`일 때만 쓰인다(기본 꺼짐). alias import 없음 — node:test에서 바로 불러옴.

export interface LeanStep {
  label: string;
  description?: string;
}

export interface LeanInput {
  steps: LeanStep[];
  /** 학생이 적어 준 지침(주제·입장·고른 대상). 모델이 사진에서 알 수 없다. */
  instructions?: string;
  /** 조사로 확인된 사실 + 각주 번호. 이것이 우리가 가진 유일한 "검증된" 재료다. */
  factSheet?: string;
  /** 각주·사실 사용 규칙(factSheetRules). */
  factRules?: string;
  /** 쏠림 억제 지시(전국 학생이 같은 소재를 받지 않게). */
  avoidance?: string;
  /** 학생이 읽으라고 안내문에 실린 자료(사진이 흐릿할 때를 위한 보강). */
  providedMaterials?: string[];
  /**
   * 단계별 분량 가이드(length-plan의 lengthGuideLines 결과).
   *
   * 왜 이것만 남기는가(2026-11-12 실측): 안내문 조건·형식은 모델이 사진을 직접 읽는 쪽이 낫지만
   * **분량은 아니었다** — 가이드를 뺀 얇은 경로에서 카드뉴스가 616자로 나왔다(만점 실측 1,960자, 8/9).
   * 2026-11-05에 "가이드를 빼고 모델에 맡기기"를 기각한 측정과 같은 방향이다. 칸 산출물에서 모델은
   * 스스로 짧게 쓴다. 안내문이 분량을 밝힌 단계는 이 목록이 그 숫자를 그대로 말한다(box-lines).
   */
  lengthLines?: string[];
  /**
   * 실측으로 점수를 올린 블록만 더 싣는다. 얇은 경로의 뜻은 "블록을 다 뺀다"가 아니라
   * **겹치는 명령 더미를 빼고 값이 확인된 것만 남긴다**는 것이다.
   * - bookThread: 독후 활동에서 책 언급이 7~8회면 8~9/9, 3~5회면 6~7/9였다(2026-11-09, 13편).
   *   얇은 경로 첫 측정에서 이것이 없어 카드뉴스가 "그 책을 다룬다"를 놓쳤다(8/9).
   */
  bookThread?: string;
  /**
   * 안내문이 쓸 수 있는 자료를 한정·금지한 경우(visualPolicyInstruction). 얇은 경로 첫 측정에서
   * 이것이 없어 국어 발표의 화면 설명에 금지된 자료 2건이 들어갔다(2026-11-12).
   */
  visualPolicy?: string;
}

/** 제출할 글이 되게 하는 최소 규칙 — 맨바닥 실행에서 실제로 어긋났던 것들만 적는다. */
const SUBMISSION_RULES = [
  "- 너는 학생에게 설명하는 것이 아니라 **학생이 그대로 제출할 글**을 쓴다. \"아래는 ~ 예시야\", \"참고해\"처럼 말을 거는 문장, 글을 어떻게 썼는지에 대한 설명, 맺음말은 한 줄도 쓰지 말 것.",
  "- 단계마다 `## <단계 이름>` 제목 줄로 시작하고 그 아래에 그 단계의 내용만 쓸 것(이름은 아래 목록 그대로).",
  "- 맨 아래에 참고문헌·출처 목록을 따로 만들지 말 것(출처는 우리가 붙인다).",
  "- 사진·그림처럼 학생이 준비해야 하는 자리는 무엇을 준비하면 되는지 한 줄로 알려 줄 것(직접 그려 넣은 척하지 말 것).",
  "- 학생이 하지 않은 활동을 했다고 쓰지 말 것(촬영했다·방문했다·설문했다).",
].join("\n");

export function leanWritePrompt(input: LeanInput): string {
  const labels = input.steps.map((s) => s.label);
  const stepList = input.steps
    .map((s, i) => `${i + 1}. "${s.label}"${s.description ? ` — ${s.description}` : ""}`)
    .join("\n");

  const parts: string[] = [
    "위 사진은 학생이 받은 수행평가 안내문이다. **안내문을 네가 직접 읽고 그 조건을 지켜서** 학생이 그대로 제출할 결과물을 써라.",
    "형식·칸 구성은 안내문이 말하는 대로 맞춘다. 분량은 안내문에 적힌 칸 크기·줄 수·글자 수가 먼저다.",
    "",
    "【쓸 단계 — 이 이름 그대로 `## ` 제목을 붙인다】",
    stepList,
  ];

  if (input.instructions) {
    parts.push(
      "",
      "【학생이 정해 준 것 — 사진에 없는 정보이므로 반드시 이대로 쓴다】",
      input.instructions
    );
  }
  if (input.providedMaterials?.length) {
    parts.push(
      "",
      "【안내문이 실어 준 자료 — 과제가 \"위 사례\"라고 말하면 이것이다】",
      ...input.providedMaterials.map((m) => `- ${m}`)
    );
  }
  if (input.visualPolicy) parts.push("", input.visualPolicy);
  if (input.bookThread) parts.push("", input.bookThread);
  if (input.lengthLines?.length) {
    parts.push(
      "",
      "【분량 — 안내문에 적힌 칸·줄 수가 있으면 그것이 먼저고, 없는 단계는 이 범위로 쓴다】",
      ...input.lengthLines
    );
  }
  if (input.avoidance) parts.push("", input.avoidance);

  parts.push("", "【제출할 글이 되게 하는 규칙】", SUBMISSION_RULES);

  if (input.factSheet) {
    parts.push(
      "",
      "【검증된 사실과 각주】",
      input.factRules ?? "",
      "연도·수치·인용은 아래 노트에 있는 것만 쓰고, 쓴 문장 끝에 그 번호를 [1] 꼴로 붙인다. 노트에 없는 수치는 쓰지 말 것.",
      "",
      "[사실 노트]",
      input.factSheet
    );
  } else {
    parts.push(
      "",
      "연도·수치를 지어내지 말 것 — 확실하지 않으면 수치 없이 쓴다."
    );
  }

  parts.push(
    "",
    `마지막으로 확인할 것: 단계가 ${labels.length}개이고 각각 \`## \` 제목으로 들어 있는가, 안내문이 요구한 칸·조건을 빠뜨리지 않았는가.`
  );

  return parts.filter((p) => p !== undefined).join("\n");
}
