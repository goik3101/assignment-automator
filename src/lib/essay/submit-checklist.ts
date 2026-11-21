// 결과 카드 아래의 "제출 전 확인" 목록. **이미 서버·코드가 계산해 둔 값만** 읽는다 — 모델 호출 0, 안내문을 다시 해석하지 않는다.
// 왜: 예전 안내문 조건 대조(RUBRIC_CHECK)는 분석 요약에서 조건을 뽑아 AI로 맞춰 보다가 흘린 조건 때문에 거짓 경고만 늘렸다.
//     그래서 여기는 "코드로 확실히 센 것"만 보여 주고, 확실하지 않은 것은 아예 행을 만들지 않는다(없는 행 = 판단 보류).
// 좋은 소식(ok)은 그 사실을 실제로 확인한 경우에만 쓴다 — 확인하지 않은 것을 "충족"이라고 하지 않는다.
// alias import 없음 — node:test에서 바로 불러올 수 있게.
import { countBlanks } from "./own-activity.ts";
import { submittedLength } from "./submitted-length.ts";

export interface ChecklistInput {
  markdown: string;
  sources: { url_valid: boolean | null }[];
  lengthWarning?: string;
  authorWarning?: string;
  noSourcesWarning?: boolean;
  structureWarning?: string;
  claimChecks: { checked: number; supported: number; repointed: number; unverified: number; unsupported: { text: string; tokens: string }[]; marked?: boolean }[];
}

/** ok = 확인됨, todo = 학생이 직접 확인·수정할 것, info = 알려 주는 값(좋고 나쁨 없음) */
export type ChecklistStatus = "ok" | "todo" | "info";

export type ChecklistRow =
  | { kind: "blanks"; status: "todo"; n: number }
  | { kind: "length"; status: "info"; chars: number }
  | { kind: "lengthWarning"; status: "todo"; message: string }
  | { kind: "structureWarning"; status: "todo"; message: string }
  | { kind: "noSources"; status: "todo" }
  | { kind: "sourcesOpen"; status: "ok"; n: number }
  | { kind: "sourcesBroken"; status: "todo"; n: number }
  | { kind: "authorWarning"; status: "todo"; message: string }
  | { kind: "claimsOk"; status: "ok"; n: number }
  | { kind: "claimsUnsupported"; status: "todo"; items: { text: string; tokens: string }[]; marked: boolean }
  | { kind: "claimsUnread"; status: "info"; n: number };

/**
 * 한 카드(한 단계)의 제출 전 확인 행. 반환이 빈 배열이면 화면에 아무것도 그리지 않는다.
 * 행을 만드는 규칙:
 *  - 서버가 경고를 붙인 것(분량·필수 항목·저자·출처 없음)은 todo 행으로 그대로 옮긴다.
 *  - 출처는 링크 검증 결과가 있을 때만 말한다(전부 열림 → ok, 하나라도 안 열림 → todo, 검증 전 null만 있으면 말하지 않음).
 *  - 글자 수는 학생이 칸에 적는 글자(submittedLength)로 센다. "충족" 판정은 하지 않는다 — 이 카드에 목표가 있었는지 화면은 모른다.
 */
export function buildChecklist(input: ChecklistInput): ChecklistRow[] {
  const rows: ChecklistRow[] = [];

  if (input.structureWarning) rows.push({ kind: "structureWarning", status: "todo", message: input.structureWarning });
  if (input.lengthWarning) rows.push({ kind: "lengthWarning", status: "todo", message: input.lengthWarning });

  const blanks = countBlanks(input.markdown);
  if (blanks > 0) rows.push({ kind: "blanks", status: "todo", n: blanks });

  if (input.authorWarning) rows.push({ kind: "authorWarning", status: "todo", message: input.authorWarning });

  if (input.noSourcesWarning) {
    rows.push({ kind: "noSources", status: "todo" });
  } else if (input.sources.length > 0) {
    const broken = input.sources.filter((s) => s.url_valid === false).length;
    const checked = input.sources.filter((s) => s.url_valid !== null).length;
    if (broken > 0) rows.push({ kind: "sourcesBroken", status: "todo", n: broken });
    else if (checked === input.sources.length) rows.push({ kind: "sourcesOpen", status: "ok", n: input.sources.length });
  }

  const total = input.claimChecks.reduce(
    (a, c) => ({
      checked: a.checked + c.checked,
      supported: a.supported + c.supported + c.repointed,
      unverified: a.unverified + c.unverified,
      unsupported: [...a.unsupported, ...c.unsupported],
    }),
    { checked: 0, supported: 0, unverified: 0, unsupported: [] as { text: string; tokens: string }[] }
  );
  if (total.checked > 0) {
    if (total.supported > 0) rows.push({ kind: "claimsOk", status: "ok", n: total.supported });
    if (total.unsupported.length > 0) {
      rows.push({ kind: "claimsUnsupported", status: "todo", items: total.unsupported, marked: input.claimChecks.some((c) => c.marked) });
    }
    if (total.unverified > 0) rows.push({ kind: "claimsUnread", status: "info", n: total.unverified });
  }

  // 글자 수는 맨 뒤에 한 줄 — 다른 행이 하나도 없는 빈 글(0자)에는 그리지 않는다.
  const chars = submittedLength(input.markdown);
  if (chars > 0 && rows.length > 0) rows.push({ kind: "length", status: "info", chars });

  return rows;
}
