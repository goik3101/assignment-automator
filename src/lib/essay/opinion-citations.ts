// 조사→글쓰기 경로에서 학생의 의견·감상 문장에 붙은 각주를 걷어낸다.
// 실측(2026-10-20): "…자신의 길을 묻게 만드는 힘에 있다고 생각한다[3]"처럼 감상 문장에 사실 번호가 붙어, 그 생각의 근거로 중소기업청 PDF가 출처로 달렸다.
// 기존 서술 각주 제거(generate-essay.ts stripUnjustifiedNarrativeCitations)는 이 경로에서 정당한 각주 11/14개를 지워 꺼 두었으므로, 여기는 범위를 훨씬 좁힌다:
// 1인칭 또는 생각·느낌 종결이 있고, 숫자·책 제목·따옴표 인용이 없는 문장만.
// alias import 없음 — node:test에서 바로 불러올 수 있게.

const OPINION = /(?:^|[\s"“(])(?:나는|내가|나도|나에게|나의|내\s|저는|제가)|(?:생각한다|생각했다|생각된다|느꼈다|느낀다|느껴졌다|싶다|싶었다|다짐했다|다짐한다|바란다|공감했다|공감한다|깨달았다|배웠다|와닿았다|인상\s*깊었다)[.!?]?\s*$/;
const FACTUAL_SIGNAL = /\d|『|《|「|"|“|‘/;

export function stripOpinionCitations(content: string): { content: string; stripped: number } {
  let stripped = 0;
  const out = content
    .split("\n")
    .map((line) => {
      if (/^\s*(?:#|\|)/.test(line)) return line;
      return line.replace(/([^.!?。\n]*?[^.!?。\n\[\]\d])((?:\[\d+\])+)(?=[.!?。]|\s|$)/g, (m, sentence: string, markers: string) => {
        // 앞 절에 붙은 각주 번호의 숫자는 사실 신호가 아니다(실측: "…알려져 있어[1][3], …느껴졌다[2][1]"이 숫자 때문에 통과했다).
        const s = sentence.replace(/^[\s.!?]+/, "").replace(/\[\d+\]/g, "");
        if (!OPINION.test(s.trim()) || FACTUAL_SIGNAL.test(s)) return m;
        stripped += markers.match(/\[\d+\]/g)!.length;
        return sentence;
      });
    })
    .join("\n");
  return { content: stripped ? out : content, stripped };
}
