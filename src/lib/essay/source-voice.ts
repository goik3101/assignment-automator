// 근거가 "세상에서 무엇이 사실인가"가 아니라 "그 문서가 무슨 말을 했나"로 쓰인 것을 찾는다.
//
// 실측(2026-11-01, 사용자 결과물.9): 근거 4개 중 3개가 이런 모양이었다.
//   "참여연대의 2011년 이슈리포트는 … 문제를 제기했다.[2]"
//   "이 보고서는 2010년 정보통신망 관련 법제와 … 문제점도 분석했다.[2]"   ← 보고서가 무엇을 했는지만 남는다
//   "헌법재판소는 표현의 자유를 헌법 제21조가 보장하는 기본권으로 설명한다.[1]"
// 읽는 사람에게 남는 정보가 "누가 무슨 말을 했다"뿐이라 주장을 받쳐 주지 못한다. 출처는 각주로 보이면 된다.
//
// **낱말 목록으로 판정하지 않는다.** 앞서 쓰던 evidence-items의 findSourceSubjectSentences는 "보고서·기사·판결문…"을
// 나열해 두고 찾았는데, 결과물.9의 네 문장을 하나도 잡지 못했다("이슈리포트"가 목록에 없고 "분석했다"가 동사 목록에 없다).
// 낱말을 더하면 다음 안내문에서 또 뚫린다. 그래서 **그 글이 실제로 달고 있는 출처 제목**과 문장 주어를 맞춰 본다 —
// 목록이 과제마다 바뀌므로 과제 유형과 무관하게 걸린다.
//
// 기관이 실제로 **한 일**("헌법재판소는 … 위헌 결정했다")은 근거다. 말하거나 분석한 것만 전하는 동사일 때만 잡는다.
// alias import 없음 — node:test에서 바로 불러올 수 있게.

/** 말·분석을 전하는 동사. 기관이 세상에서 한 일(결정했다·발표했다·도입했다·폐지했다)은 일부러 넣지 않았다. */
const TELLING =
  /(?:설명한다|설명했다|설명하고\s*있다|밝혔다|밝히고\s*있다|분석했다|분석하고\s*있다|다뤘다|다루고\s*있다|소개한다|소개했다|지적했다|제기했다|언급했다|정리했다|평가했다|주장한다|주장했다|전했다|전한다|보도했다|나와\s*있다|나온다|실려\s*있다|적고\s*있다|담고\s*있다|따르면)/;

/** 앞에서 말한 출처를 "이 보고서는"처럼 다시 가리키는 주어. 근거 자리에서는 언제나 알맹이가 없다. */
const ANAPHORA =
  /^(?:이|그|해당|위|앞(?:서|의))\s*(?:보고서|자료|기사|문서|리포트|논문|통계|판결문|결정문|심판문|페이지|사이트|누리집|보도)/;
// "이 글은 …"은 제출할 글 자신을 말하는 것이라 출처 되가리킴이 아니다(실측 2026-11-01 전수 적용: 저장된 결과물 거의 전부에서 오발동).

/** 출처 제목에서 "그 출처를 가리키는 이름"으로 쓸 만한 조각만 남긴다(어디에나 있는 일반 낱말은 뺀다). */
const GENERIC =
  /^(?:자료|보고서|기사|논문|간행물|홈페이지|누리집|사이트|페이지|뉴스|신문|일보|방송|통계|정보|센터|제도|결과|내용|관련|이슈|리포트|보고|조사|사건|위원회|영문|요약|목록|검색|포털|백과|위키|나무위키|온라인|인터넷|대한민국|한국)$/;

const stripJosa = (w: string) => w.replace(/(?:은|는|이|가|의|을|를|에|에서|에는|에서는|도|과|와|으로|로)$/, "");

/** 출처 제목에서 뽑은, 그 출처를 알아볼 수 있는 낱말들. */
export function sourceNames(titles: string[], exclude: string[] = []): string[] {
  // 출처 제목에 과제 주제어가 들어 있으면("인터넷 실명제 위헌확인 - 헌법재판소") 주제어까지 출처 이름이 되어
  // 본문의 평범한 문장을 전부 잡는다(실측 2026-11-01: "실명제"가 이름으로 잡혀 세부 내용의 계획 문장까지 걸렸다).
  const banned = new Set<string>();
  for (const e of exclude) for (const w of (e ?? "").split(/[^가-힣A-Za-z0-9]+/)) if (w.length >= 2) banned.add(stripJosa(w));
  const out = new Set<string>();
  for (const t of titles ?? []) {
    // 괄호 안 보충 설명과 주소·구분 기호는 이름이 아니다.
    const cleaned = (t ?? "").replace(/[(（][^)）]*[)）]/g, " ").replace(/https?:\/\/\S+/g, " ");
    for (const raw of cleaned.split(/[\s|·・,、>＞\-–—:：/]+/)) {
      const w = stripJosa(raw.replace(/[^가-힣A-Za-z0-9]/g, ""));
      // 두 글자짜리는 "자유"·"위헌"처럼 어디에나 나오는 말이라 출처 이름으로 쓰면 평범한 문장까지 잡는다(실측 2026-11-01 전수).
      if (w.length < 3 || w.length > 20) continue;
      if (GENERIC.test(w) || banned.has(w)) continue;
      if (/^\d+$/.test(w)) continue;
      out.add(w);
    }
  }
  return [...out];
}

export interface SourceVoiceHit {
  text: string;
  /** 주어 자리에서 찾은 출처 이름(없으면 "이 보고서는" 같은 되가리킴). */
  name: string | null;
}

function sentences(text: string): string[] {
  return text
    .split("\n")
    .filter((l) => !/^\s*(?:#|\||[-*•]?\s*\S.*:\s*https?:\/\/)/.test(l))
    .flatMap((l) => l.split(/(?<=[.!?。](?:\[\d+\])*)\s+/))
    .map((s) => s.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").replace(/\[\d+\]/g, "").trim())
    .filter((s) => s.length >= 12);
}

/**
 * `sectionText` 안에서 출처를 주어로 삼아 말만 전한 문장. `titles`는 그 글이 달고 있는 출처 제목들.
 * 책 제목(《》·『』)이 주어인 문장은 보지 않는다 — 독후감·카드뉴스에서는 책을 말하는 것이 글의 내용 자체다.
 */
export function findSourceVoiceSentences(sectionText: string, titles: string[], exclude: string[] = []): SourceVoiceHit[] {
  const names = sourceNames(titles, exclude);
  const hits: SourceVoiceHit[] = [];
  for (const s of sentences(sectionText)) {
    if (/[《『「][^》』」]{1,40}[》』」]/.test(s.slice(0, 30))) continue;
    // "먼저 …를 설명한다", "본론에서는 …"처럼 쓸 차례를 말하는 문장은 근거가 아니라 글의 짜임이다(plan-citations와 같은 판정).
    if (/^(?:먼저|우선|다음으로|이어서|끝으로|마지막으로|첫째|둘째|셋째|도입(?:부)?에서는?|본론에서는?|결론에서는?|첫\s*(?:문단|단락|부분)|두\s*번째|세\s*번째|발표(?:에서)?는?)/.test(s)) continue;
    if (!TELLING.test(s)) {
      // 되가리킴은 동사와 상관없이 알맹이가 없다("이 보고서는 2010년 법제를 담았다").
      if (ANAPHORA.test(s)) hits.push({ text: s, name: null });
      continue;
    }
    if (ANAPHORA.test(s)) {
      hits.push({ text: s, name: null });
      continue;
    }
    // 주어 자리(문장 앞 35자)에 이 글의 출처 이름이 있는가.
    // 이름이 문장 앞쪽에 "있기만" 하면 안 되고 주어 자리여야 한다 — 이름 뒤 12자 안에 주격·주제 조사가 와야 한다
    // ("표현의 자유 등 기본권을 침해한다고 주장했다"의 "자유"는 주어가 아니다).
    const head = s.slice(0, 35);
    const found = names.find((n) => {
      const i = head.indexOf(n);
      return i >= 0 && /(?:은|는|이|가)\s/.test(head.slice(i + n.length, i + n.length + 12));
    });
    if (found) hits.push({ text: s, name: found });
  }
  return hits;
}

export function sourceVoiceRepairText(label: string, hits: SourceVoiceHit[]): string {
  const quoted = hits.slice(0, 2).map((h) => `"${h.text.slice(0, 42)}…"`).join(" / ");
  return (
    `"${label}" 항목의 근거가 사실이 아니라 **출처가 한 말**을 전하고 있다(${quoted}). ` +
    `"○○ 보고서는 ~라고 지적했다", "○○는 ~라고 설명한다", "이 자료는 ~를 분석했다"처럼 쓰지 말 것 — ` +
    `그 출처에서 확인한 내용을 바로 평서문으로 쓴다(예: "강제적 실명제는 표현의 자유를 침해할 수 있다.[2]"). ` +
    `출처는 문장 끝 [n] 각주로만 보이면 된다. 기관이 실제로 한 일(결정·발표·시행·폐지)은 그대로 써도 된다. 각주 번호는 바꾸지 말 것.`
  );
}
