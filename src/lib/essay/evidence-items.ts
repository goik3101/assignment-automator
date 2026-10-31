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
    `"~를 근거로 활용한다", "~를 살펴볼 자료다"처럼 앞으로 쓰겠다는 계획은 근거가 아니므로 이 항목에 넣지 말 것.\n`
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
