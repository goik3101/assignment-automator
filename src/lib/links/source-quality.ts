// 출처 품질 등급 분류 — "URL이 열린다"와 "핵심 사실의 근거로 쓸 만한 출처다"는
// 다른 문제라는 원칙(수행평가 자료 수집 개선 요구사항 7)을 코드로 옮긴 것.
// 도메인(호스트) 패턴만 보는 값싼 분류이고, 그 페이지가 특정 주장을 실제로 뒷받침
// 하는지까지 판정하지는 않는다(그건 별도 문제 — ResultPanel의 안내 문구 참고).
//
// official  : 정부·국제기구·공공기관·대학·학술·공식 기록기관 (1순위)
// reliable  : 신뢰할 수 있는 언론·전문 백과사전 (2순위)
// reference : 위키류 일반 참고자료 (3순위 — 누구나 편집 가능)
// general   : 위에 해당하지 않는 일반 사이트(등급 판단 불가, 통과시키되 표시)
// weak      : 개인 블로그·커뮤니티·SNS·동영상·레포트 판매 사이트 — 핵심 사실의 근거로 쓰지 않는다

export type SourceTier = "official" | "reliable" | "reference" | "general" | "weak";

// 전수 측정(2026-11-10, 저장된 결과물 63편의 출처 200개): **"일반" 69개(35%)의 대부분이 목록에 없을 뿐
// 멀쩡한 곳**이었다 — 전자신문 37회, 정책브리핑(korea.kr) 7회, 국민연금연구원, 민주화운동기념사업회
// 오픈아카이브, 에어코리아, 보험연구원, 대학 공개강의(KOCW), Wiley 학술지. 등급은 학생 화면에 그대로
// 보이므로("일반 사이트"), 목록이 좁은 것이 곧 **멀쩡한 출처를 못 믿게 만드는 것**이다.
// 거짓 경고를 걷어낸 것과 같은 이유로 넓힌다 — 단, `or.kr`을 통째로 넣지는 않는다(시민단체·사설 기관도 쓴다).
const OFFICIAL =
  /(^|\.)(go\.kr|gov|gov\.[a-z]{2}|mil|ac\.kr|re\.kr|edu|edu\.[a-z]{2}|ac\.[a-z]{2}|un\.org|europa\.eu|who\.int|icrc\.org|oecd\.org|unesco\.org|worldbank\.org|nobelprize\.org|si\.edu|korea\.kr|korea\.net|kocw\.or\.kr|airkorea\.or\.kr|nps\.or\.kr|kdemo\.or\.kr|nahf\.or\.kr|bok\.or\.kr|kiri\.or\.kr|ebsi\.co\.kr|ebs\.co\.kr|nature\.com|science\.org|sciencedirect\.com|springer\.com|wiley\.com|jstor\.org|ssrn\.com|dbpia\.co\.kr|refworld\.org|freedomhouse\.org|carnegieendowment\.org)$/i;

const RELIABLE = new RegExp(
  "(^|\\.)(" +
    [
      "chosun\\.com", "joongang\\.co\\.kr", "donga\\.com", "hani\\.co\\.kr", "khan\\.co\\.kr",
      "kmib\\.co\\.kr", "hankookilbo\\.com", "seoul\\.co\\.kr", "segye\\.com", "munhwa\\.com",
      "mk\\.co\\.kr", "hankyung\\.com", "sedaily\\.com", "edaily\\.co\\.kr", "yna\\.co\\.kr",
      "yonhapnews\\.co\\.kr", "newsis\\.com", "news1\\.kr", "kbs\\.co\\.kr", "mbc\\.co\\.kr",
      "imbc\\.com", "sbs\\.co\\.kr", "ytn\\.co\\.kr", "jtbc\\.co\\.kr", "ohmynews\\.com",
      "voakorea\\.com", "koreadaily\\.com", "imaeil\\.com", "sciencetimes\\.co\\.kr",
      "bbc\\.com", "bbc\\.co\\.uk", "nytimes\\.com", "washingtonpost\\.com", "reuters\\.com",
      "apnews\\.com", "theguardian\\.com", "britannica\\.com", "doopedia\\.co\\.kr",
      "history\\.com", "biography\\.com", "nationalgeographic\\.com", "smithsonianmag\\.com",
      // 2026-11-10 전수 측정에서 "일반"으로 떨어져 있던 언론 — 전자신문만 37회였다.
      "etnews\\.com", "fnnews\\.com", "mt\\.co\\.kr", "inews24\\.com", "newspim\\.com",
      "newsway\\.co\\.kr", "tf\\.co\\.kr", "heraldcorp\\.com", "asiae\\.co\\.kr",
      "nocutnews\\.co\\.kr", "pressian\\.com", "sisain\\.co\\.kr", "lawtimes\\.co\\.kr",
      "zdnet\\.co\\.kr", "koreajoongangdaily\\.com", "koreaherald\\.com", "dongascience\\.com",
      "journalist\\.or\\.kr",
    ].join("|") +
    ")$",
  "i"
);

// 나무위키 미러(namu.moe 등)도 같은 위키 — 실측 2026-10-24 화법 과제 출처로 쓰였는데 일반 등급이었다.
const REFERENCE = /(^|\.)(wikipedia\.org|wikimedia\.org|namu\.wiki|namuwiki\.com|namu\.moe|namu\.la|wikiwand\.com)$/i;

const WEAK =
  /(^|\.)(blogspot\.[a-z.]+|tistory\.com|blog\.naver\.com|m\.blog\.naver\.com|cafe\.naver\.com|kin\.naver\.com|brunch\.co\.kr|velog\.io|medium\.com|wordpress\.com|wixsite\.com|youtube\.com|youtu\.be|reddit\.com|tiktok\.com|instagram\.com|facebook\.com|x\.com|twitter\.com|dcinside\.com|ruliweb\.com|fmkorea\.com|theqoo\.net|quora\.com|blog\.daum\.net|cafe\.daum\.net|postype\.com|pages\.dev|netlify\.app|github\.io|vercel\.app|workers\.dev|herokuapp\.com|glitch\.me|allreport\.co\.kr|happycampus\.com|reportworld\.co\.kr|report\.co\.kr|orbi\.kr|instiz\.net|clien\.net|ppomppu\.co\.kr|inven\.co\.kr|mlbpark\.donga\.com)$/i;

export function classifySourceTier(url: string): SourceTier {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "general";
  }
  if (WEAK.test(host)) return "weak";
  if (REFERENCE.test(host)) return "reference";
  if (OFFICIAL.test(host)) return "official";
  if (RELIABLE.test(host)) return "reliable";
  return "general";
}

export const SOURCE_TIER_LABEL: Record<SourceTier, string> = {
  official: "공식·공공·학술",
  reliable: "신뢰 매체",
  reference: "백과·위키",
  general: "일반 사이트",
  weak: "블로그·개인",
};
