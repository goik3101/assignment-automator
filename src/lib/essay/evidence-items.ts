// 안내문이 "근거를 N가지 이상"이라고 하면, 글도 N개로 "세어지게" 나와야 한다.
// 실측(2026-10-31, 국어 매체 활용 주제발표): "뒷받침하는 정보 3가지 이상" 항목이 한 문단에 녹아 있어
// 채점자가 몇 가지인지 셀 수 없었고, 세어 보면 실제 근거는 2가지였다. 수를 채우려고
//   "법령정보센터에 등재된 결정문은 … 판단했다.[2]" / "국가법령정보센터 심판문은 … 밝혔다.[2]"
// 처럼 **같은 판결을 문서 이름만 바꿔** 두 번 더 쓰고, 마지막 한 줄은 근거가 아니라
//   "경찰청 통계와 연도별 범죄 표는 … 살펴볼 근거로 활용한다.[4]" 같은 계획 문장이었다.
// alias import 없음 — node:test에서 바로 불러올 수 있게.

/** 근거를 담는 항목인가(소제목 이름 기준). 출처 목록 항목은 아니다. */
export function isEvidenceHeading(heading: string): boolean {
  return /근거|뒷받침/.test(heading) && !/출처|참고/.test(heading);
}

/** 글에서 그 항목의 본문만 꺼낸다(### 소제목 기준). 없으면 null. */
export function evidenceSectionText(content: string): string | null {
  const lines = content.split("\n");
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = /^#{3,4}\s+(.+?)\s*$/.exec(lines[i]);
    if (!m) continue;
    if (start >= 0) return lines.slice(start, i).join("\n");
    if (isEvidenceHeading(m[1])) start = i + 1;
  }
  return start >= 0 ? lines.slice(start).join("\n") : null;
}

/** 번호·불릿으로 나뉘어 "세어지는" 근거의 개수. 한 문단으로 뭉쳐 있으면 0. */
export function countEvidenceItems(sectionText: string): number {
  return sectionText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^(?:[-*•]|\d+[.)]|근거\s*\d+\s*[.)·:]?)\s*\S/.test(l)).length;
}

/** 문서·매체를 주어로 삼아 사실을 전한 문장("결정문은 … 밝혔다"). 기관이 실제로 한 일은 포함하지 않는다. */
const SOURCE_SUBJECT =
  /^[^.]{0,24}(?:결정문|심판문|판결문|판례|보도자료|기사|자료|문서|보고서|논문|통계표|누리집|홈페이지|웹\s*사이트|사이트|페이지|신문|일보|뉴스|방송|포털|법령정보센터|판례정보)[^.]{0,6}(?:은|는|이|가|에는|에서는|에\s*따르면)\s/;
const REPORT_VERB = /(?:밝혔다|밝히고\s*있다|판단했다|보도했다|전했다|전한다|정리했다|소개했다|설명한다|나온다|실려\s*있다|적고\s*있다|따르면)/;

export function findSourceSubjectSentences(content: string): string[] {
  return content
    .split("\n")
    .filter((l) => !/^\s*(?:#|\||[-*•]?\s*\S.*:\s*https?:\/\/)/.test(l))
    .flatMap((l) => l.split(/(?<=[.!?。](?:\[\d+\])*)\s+/))
    .map((s) => s.trim())
    .filter((s) => {
      if (s.length < 12) return false;
      // 주어 자리(문장 앞 40자)에 문서·매체 이름이 조사와 함께 오는가.
      const head = s.slice(0, 40);
      return SOURCE_SUBJECT.test(head) && REPORT_VERB.test(s);
    });
}

/** 글쓰기 프롬프트에 넣을 블록. n이 2 미만이거나 해당 항목이 없으면 빈 문자열. */
export function evidenceWritingBlock(label: string | null, n: number): string {
  if (!label || n < 2) return "";
  return (
    `\n【근거 ${n}가지 — 반드시 지킬 것】 "${label}" 항목은 채점자가 근거를 하나씩 센다. ` +
    `"1) …", "2) …"처럼 번호를 붙여 ${n}개 이상을 각각 한 덩어리로 나눠 쓸 것(한 문단에 녹여 쓰지 말 것). ` +
    `근거마다 서로 다른 사실이어야 한다 — 같은 판결·같은 사건·같은 통계를 문서 이름이나 매체만 바꿔 두 번 쓰지 말 것. ` +
    `각 근거는 확인된 사실과 수치로 쓰고 끝에 [n] 각주를 붙인다. ` +
    `근거 하나는 두세 문장으로 쓴다 — 확인한 **사실을 바로 평서문으로** 먼저 쓰고(언제·무엇이·얼마나), 이어서 그 사실이 주장을 어떻게 뒷받침하는지 쓴다. ` +
    `출처가 무슨 말을 했는지가 아니라 무엇이 사실인지를 쓸 것 — "○○ 보고서는 ~라고 지적했다", "○○는 ~라고 설명한다", "이 자료는 ~를 분석했다"처럼 쓰지 말고 ` +
    `그 내용을 바로 "~이다/~했다"로 쓰고 출처는 끝의 [n] 각주로만 보인다. 기관이 실제로 한 일(결정·발표·시행·폐지)은 그대로 써도 된다. ` +
    `한 문장으로 끝내지 말 것(채점 기준이 "양을 제대로 채웠을 때 만점"이다). 분량을 채우려고 같은 말을 바꿔 쓰지는 말 것. ` +
    `각 근거는 사실 서술로 끝낼 것 — "…을 설명할 때 쓴다", "…의 근거로 삼는다", "…하는 데 활용한다", "…살펴볼 자료다"처럼 ` +
    `그 자료를 어디에 쓸지 덧붙이지 말 것. 채점자가 세는 것은 수집한 정보이고 쓰임 설명은 근거가 아니다 — ` +
    `덧붙일 말이 있으면 그 근거가 무엇을 보여 주는지(사실의 내용)를 쓸 것.\n`
  );
}

export function evidenceItemsRepairText(label: string, found: number, want: number): string {
  return (
    `"${label}" 항목의 근거가 ${found > 0 ? `${found}개로 보인다` : "한 문단에 뭉쳐 있어 몇 개인지 셀 수 없다"}. ` +
    `채점 기준이 ${want}가지 이상을 요구하므로 "1) …", "2) …"처럼 번호를 붙여 ${want}개 이상으로 나눠 다시 쓸 것. ` +
    `근거마다 서로 다른 사실이어야 하고(같은 판결·사건을 문서 이름만 바꿔 되풀이하지 말 것), 각 근거 끝에 [n] 각주를 붙일 것. ` +
    `다른 항목과 각주는 그대로 둘 것.`
  );
}

export function sourceSubjectRepairText(sentences: string[]): string {
  const quoted = sentences.slice(0, 2).map((s) => `"${s.slice(0, 45)}…"`).join(" / ");
  return (
    `문서·매체를 주어로 삼아 사실을 전한 문장이 있다(${quoted}). ` +
    `"결정문은 ~라고 밝혔다", "기사는 ~라고 보도했다", "자료에는 ~라고 나온다"처럼 쓰지 말고 ` +
    `사실을 바로 평서문으로 쓸 것("헌법재판소는 2012년 … 결정했다."). 근거는 끝의 [n] 각주로만 보인다. 각주는 그대로 둘 것.`
  );
}

// 근거 항목에 사실 대신 "이 자료를 어디에 쓸지"를 적는 꼬리. 실측(2026-10-31, 국어 매체 발표 2회): 근거 3개 전부가
//   "…아니라는 점을 설명할 때 쓴다." / "…넘었다는 발표의 근거로 삼는다." / "…적절한 방법인지 따져 보는 데 활용한다."
// 로 끝났다. 채점자가 세는 것은 수집한 정보인데 쓰임 설명이 절반을 차지한다. plan-citations의 isPlanSentence는
// 쓸 순서("먼저 …를 설명한다")만 보므로 이 꼬리를 하나도 잡지 못한다.
const USE_TAIL =
  /(?:쓴다|쓸\s*것이다|쓰려\s*한다|쓰겠다|활용한다|활용할\s*것이다|활용하겠다|삼는다|삼을\s*것이다|삼겠다|사용한다|제시하려\s*한다|보여\s*주려\s*한다|인용하려\s*한다|다루려\s*한다|언급하려\s*한다)[.!?]?\s*$/;
// 쓰임을 말하는 문장임을 가리키는 말(없으면 평범한 사실 서술일 수 있다).
const USE_CONTEXT = /근거|자료|사례|통계|예시|발표|설명|주장|강조|비교|언급|소개|따져|살펴|보여|할\s*때|하는\s*데|데\s/;

/** 근거 항목 안에서 "이 자료를 ~에 쓴다"로 끝나는 문장. 수집한 정보가 아니라 쓸 계획이다. */
export function findUsePlanSentences(sectionText: string): string[] {
  return sectionText
    .split("\n")
    .filter((l) => !/^\s*(?:#|\||[-*•]?\s*\S.*:\s*https?:\/\/)/.test(l))
    .flatMap((l) => l.split(/(?<=[.!?。](?:\[\d+\])*)\s+/))
    .map((s) => s.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").replace(/\[\d+\]/g, "").trim())
    .filter((s) => s.length >= 12 && USE_TAIL.test(s) && USE_CONTEXT.test(s));
}

export function usePlanRepairText(label: string, sentences: string[]): string {
  const quoted = sentences.slice(0, 2).map((s) => `"${s.slice(0, 40)}…"`).join(" / ");
  return (
    `"${label}" 항목에 수집한 정보가 아니라 그 자료를 어디에 쓸지 말하는 문장이 있다(${quoted}). ` +
    `근거 항목에는 확인된 사실과 수치만 쓸 것 — "…에 쓴다", "…의 근거로 삼는다", "…하는 데 활용한다" 같은 쓰임 설명은 지우고, ` +
    `그 자리를 그 근거가 무엇을 보여 주는지(사실의 내용)로 채울 것. 각주는 그대로 둘 것.`
  );
}

/**
 * 근거가 **한 문장으로 끝났는지** 센다. 안내문이 "양을 제대로 채웠을 때 만점"이라고 한 과제에서,
 * 근거마다 사실 한 줄만 적고 "그래서 주장을 어떻게 뒷받침하는지"를 안 쓰면 그 항목이 깎인다.
 *
 * 실측(2026-11-10, 국어 발표 정답 채점): 10/12·11/12로 떨어진 항목이
 * "근거마다 사실 한 문장으로 끝내지 않고 두세 문장으로 채웠다"였다(개요의 근거 3항이 한 문장이었다).
 *
 * **문장 수 상한이 있는 단계에서는 부르지 말 것** — "칸마다 한두 문장" 조건과 정면으로 부딪친다.
 * 호출하는 쪽이 `hasSizeLimit`으로 먼저 걸러 준다.
 *
 * **기본 꺼짐**(`EVIDENCE_DEPTH=on`으로 켠다): 국어 발표 4회에서 한 번도 발동하지 않았다 —
 * 그 4회의 근거는 모두 두세 문장이었는데도 채점이 이 항목을 깎았다(채점 쪽이 더 엄한 기준을 쓴 것으로 보인다).
 * 이 저장소의 규칙대로, **실제 실행에서 도는 것을 확인하지 못한 보완은 켜서 내보내지 않는다.**
 * 장치와 테스트는 남겨 둬서 한 문장짜리 근거가 다시 나오면 바로 켤 수 있게 한다.
 */
export function evidenceDepthOn(): boolean {
  return process.env.EVIDENCE_DEPTH === "on";
}

export function thinEvidenceItems(sectionText: string, min = 2): { index: number; text: string; sentences: number }[] {
  const lines = sectionText.split("\n");
  const BULLET = /^(?:[-*•]|\d+[.)]|근거\s*\d+\s*[.)·:]?)\s*\S/;
  const items: { index: number; lines: string[] }[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (BULLET.test(line)) items.push({ index: items.length + 1, lines: [line] });
    else if (items.length > 0 && !/^#/.test(line) && !/^\|/.test(line)) items[items.length - 1].lines.push(line);
  }
  const out: { index: number; text: string; sentences: number }[] = [];
  for (const it of items) {
    const body = it.lines.join(" ").replace(/^(?:[-*•]|\d+[.)]|근거\s*\d+\s*[.)·:]?)\s*/, "");
    // 각주 뒤의 마침표를 문장 끝으로 본다. 소수점(숫자 뒤의 점)은 문장 끝이 아니다.
    const sentences = body.split(/(?<=[.!?。](?:\[\d+(?:,\d+)*\])*)(?!\d)\s+/).filter((x) => x.replace(/\s/g, "").length >= 8).length;
    if (sentences < min) out.push({ index: it.index, text: body.slice(0, 60), sentences });
  }
  return out;
}

export function thinEvidenceRepairText(label: string, thin: { index: number; sentences: number }[], min = 2): string {
  return (
    `"${label}"의 근거 ${thin.map((t) => `${t.index}번`).join("·")}이 ${min}문장도 되지 않는다(사실만 한 줄 적고 끝났다). ` +
    `근거마다 **사실 한 문장 + 그 사실이 주장을 어떻게 뒷받침하는지 한두 문장**을 이어서 쓸 것 — 채점 기준이 "양을 제대로 채웠을 때 만점"이다. ` +
    `새 사실이나 새 출처를 들고 오지 말고, 이미 쓴 사실의 뜻을 풀어 쓴다. 다른 근거와 각주 번호는 그대로 둘 것.`
  );
}
