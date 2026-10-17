// 출처 품질 등급 분류 — "URL이 열린다"와 "핵심 사실의 근거로 쓸 만한 출처다"는
// 다른 문제라는 원칙(수행평가 자료 수집 개선 요구사항 7)을 코드로 옮긴 것.
// 도메인(호스트) 패턴만 보는 값싼 분류이고, 그 페이지가 특정 주장을 실제로 뒷받침
// 하는지까지 판정하지는 않는다(그건 별도 문제 — ResultPanel의 안내 문구 참고).
//
// official  : 정부·국제기구·공공기관·대학·학술·공식 기록기관 (1순위)
// reliable  : 신뢰할 수 있는 언론·전문 백과사전 (2순위)
// reference : 위키류 일반 참고자료 (3순위 — 누구나 편집 가능)
// general   : 위에 해당하지 않는 일반 사이트(등급 판단 불가, 통과시키되 표시)
// weak      : 개인 블로그·커뮤니티·SNS·동영상 — 핵심 사실의 근거로 쓰지 않는다

export type SourceTier = "official" | "reliable" | "reference" | "general" | "weak";

const OFFICIAL =
  /(^|\.)(go\.kr|gov|gov\.[a-z]{2}|mil|ac\.kr|re\.kr|edu|edu\.[a-z]{2}|ac\.[a-z]{2}|un\.org|europa\.eu|who\.int|icrc\.org|oecd\.org|unesco\.org|worldbank\.org|nobelprize\.org|si\.edu)$/i;

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
    ].join("|") +
    ")$",
  "i"
);

const REFERENCE = /(^|\.)(wikipedia\.org|wikimedia\.org|namu\.wiki|namuwiki\.com|wikiwand\.com)$/i;

const WEAK =
  /(^|\.)(blogspot\.[a-z.]+|tistory\.com|blog\.naver\.com|m\.blog\.naver\.com|cafe\.naver\.com|kin\.naver\.com|brunch\.co\.kr|velog\.io|medium\.com|wordpress\.com|wixsite\.com|youtube\.com|youtu\.be|reddit\.com|tiktok\.com|instagram\.com|facebook\.com|x\.com|twitter\.com|dcinside\.com|ruliweb\.com|fmkorea\.com|theqoo\.net|quora\.com|blog\.daum\.net|cafe\.daum\.net|postype\.com|pages\.dev|netlify\.app|github\.io|vercel\.app|workers\.dev|herokuapp\.com|glitch\.me)$/i;

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
