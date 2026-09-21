// plan 본문에서 "외부 통계 검증이 필요한 수치 주장"만 골라내는 분류기.
// 숫자가 있다는 이유만으로 검증하면(실측: "### 문제 설정 — 매주 5,000원 저축…" 제목 줄에 검색 6회·약 68초 낭비) 안 되므로
// 수치를 ① 사용자가 준 가정값 ② 계산·수식·표에 쓰인 입력/결과값 ③ 실제 외부 사실 주장으로 나눈다.
// 판단이 애매하면 ③(검증 대상)으로 둔다 — 외부 사실 검증을 놓치는 쪽이 더 큰 문제이기 때문이다.
export const STAT_CLAIM_PATTERN = /\d[\d,]*(?:\.\d+)?\s?(?:%|퍼센트|명|건|원|배|위|개)/g;

// 외부 자료를 근거로 하는 서술의 표지. 이게 있으면 사용자 가정값과 같은 숫자여도 검증 대상에서 빼지 않는다.
const EXTERNAL_CLAIM_MARKER =
  /통계청|한국은행|교육부|보건복지부|여성가족부|OECD|WHO|조사(?:에|결과|기관|\s*결과)|에\s*따르면|발표(?:한|했|에)|보도|보고서에|연구\s*결과|연구(?:에|팀)|평균(?:적으로|은|이|\s*\d)|전국|전체\s*(?:학생|청소년|국민)|비율은|비중은|응답자|설문/;
// 계산·수식·가정 서술의 표지
const CALCULATION_MARKER = /[=×÷＝]|합계|누적|계산|곱하|곱한|더하|더한|나누|빼면|총액|총\s*저축|가정|라고\s*하자|로\s*두|로\s*설정|이라\s*하면|라면/;
// 화면 예시·가상의 값("진행률 바(예: 60% 완료)", "예를 들어 30명")은 외부 사실이 아니다. 단 외부 자료 표지가 함께 있으면 위에서 먼저 검증 대상이 된다.
const EXAMPLE_MARKER = /\(\s*예\s*[:：]|예\s*[:：]|예시|예를\s*들(?:어|면)|가상의|가령|샘플|더미/;
const HEADING_LINE = /^\s{0,3}#{1,6}\s/;
const TABLE_OR_FORMULA_LINE = /^\s*\||^\s*[-*]\s*\$|^\s*\$\$|^\s*[\\][[(]/;

export type StatClaimKind = "external" | "assumption" | "calculation" | "structure";

export interface StatClaimCandidate {
  afterEnd: number;
  sentence: string;
}

const numberValue = (m: string) => m.replace(/[^\d.]/g, "");

/** 사용자가 안내문·요청에서 직접 준 숫자 값들(단위 무시). */
export function collectUserNumbers(...texts: (string | undefined | null)[]): Set<string> {
  const set = new Set<string>();
  for (const t of texts) {
    if (!t) continue;
    for (const m of t.matchAll(/\d[\d,]*(?:\.\d+)?/g)) set.add(numberValue(m[0]));
  }
  return set;
}

/** 한 문장(또는 줄)이 어떤 종류의 수치 서술인지. */
export function classifyStatSentence(sentence: string, userNumbers: Set<string>): StatClaimKind {
  if (HEADING_LINE.test(sentence) || TABLE_OR_FORMULA_LINE.test(sentence)) return "structure";
  if (EXTERNAL_CLAIM_MARKER.test(sentence)) return "external";
  if (EXAMPLE_MARKER.test(sentence)) return "assumption";
  const nums = [...sentence.matchAll(STAT_CLAIM_PATTERN)].map((m) => numberValue(m[0]));
  if (nums.length > 0 && nums.every((n) => userNumbers.has(n))) return "assumption";
  if (CALCULATION_MARKER.test(sentence)) return "calculation";
  return "external";
}

/**
 * 각주가 안 붙은 수치 주장 후보를 순서대로 돌려준다. strictExternalOnly(계산·창작·기획형 과제)에서는 외부 자료 표지가 명시된 문장만 후보로 삼는다.
 */
export function findStatClaimCandidates(
  content: string,
  opts: { userNumbers: Set<string>; strictExternalOnly: boolean }
): (StatClaimCandidate & { kind: StatClaimKind })[] {
  const out: (StatClaimCandidate & { kind: StatClaimKind })[] = [];
  const re = new RegExp(STAT_CLAIM_PATTERN.source, "g");
  const seen = new Set<number>(); // 한 문장에 수치가 여러 개여도 후보는 한 번만
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    const afterEnd = m.index + m[0].length;
    const lineStart = content.lastIndexOf("\n", m.index) + 1;
    const line = content.slice(lineStart, content.indexOf("\n", m.index) === -1 ? content.length : content.indexOf("\n", m.index));
    // 줄 안에서 문장 시작/끝을 찾는다(제목·표 줄은 줄 전체가 하나의 단위)
    const isStructural = HEADING_LINE.test(line) || TABLE_OR_FORMULA_LINE.test(line);
    let sentenceStart = lineStart;
    let sentenceEnd = lineStart + line.length;
    if (!isStructural) {
      const dot = content.lastIndexOf(".", m.index);
      if (dot + 1 > lineStart) sentenceStart = dot + 1;
      const endRel = content.slice(afterEnd, lineStart + line.length).search(/[.!?]/);
      if (endRel !== -1) sentenceEnd = afterEnd + endRel + 1;
    }
    if (seen.has(sentenceStart)) continue;
    seen.add(sentenceStart);
    const sentence = content.slice(sentenceStart, sentenceEnd).trim();
    const kind = isStructural ? "structure" : classifyStatSentence(sentence, opts.userNumbers);
    if (kind !== "external") continue;
    if (opts.strictExternalOnly && !EXTERNAL_CLAIM_MARKER.test(sentence)) continue;
    out.push({ afterEnd, sentence, kind });
  }
  return out;
}
