// 출처 범위(AI 설정 "국내 출처" / "국내/해외 출처 포함"). "domestic"이면 검색·사실 노트·최종 출처를 한국 사이트로 한정한다.
// alias import 없음 — node:test에서 바로 불러올 수 있게.

export type SourceScope = "domestic" | "all";

/** 요청 본문 값 → 범위. "domestic" 외에는(예전 화면이 아무것도 안 보내는 경우 포함) 지금까지처럼 "all". */
export function parseSourceScope(v: unknown): SourceScope {
  return v === "domestic" ? "domestic" : "all";
}

// .kr이 아니어도 한국 사이트인 곳(언론·포털·서점·출판사·블로그·백과). 하위 도메인까지 포함해 본다.
const KOREAN_HOSTS = [
  "naver.com", "daum.net", "kakao.com", "tistory.com", "brunch.co.kr", "namu.wiki",
  "chosun.com", "donga.com", "joongang.co.kr", "hani.co.kr", "khan.co.kr", "hankyung.com", "mk.co.kr", "seoul.co.kr",
  "hankookilbo.com", "kmib.co.kr", "segye.com", "munhwa.com", "edaily.co.kr", "mt.co.kr", "heraldcorp.com",
  "newsis.com", "news1.kr", "yna.co.kr", "yonhapnewstv.co.kr", "ohmynews.com", "pressian.com", "sisain.co.kr", "nocutnews.co.kr",
  "kbs.co.kr", "imbc.com", "mbc.co.kr", "sbs.co.kr", "jtbc.co.kr", "ytn.co.kr", "ebs.co.kr", "chosun.co.kr",
  "yes24.com", "kyobobook.co.kr", "aladin.co.kr", "interpark.com", "changbi.com", "minumsa.com", "munhak.com", "gimmyoung.com",
  "doopedia.co.kr", "scienceall.com", "sciencetimes.co.kr", "dongascience.com", "korea.net", "kdi.re.kr",
  // 교과서·참고서 출판사(실측 2026-10-24: 미래엔·원교육 자료가 .kr이 아니라 해외로 분류됨)
  "mirae-n.com", "visang.com", "wonedu.org", "milkt.co.kr", "kyohak.co.kr", "jihak.co.kr", "chunjae.co.kr", "dbpia.co.kr", "riss.kr",
];

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** 한국 출처인가 — .kr 도메인, 알려진 한국 사이트, 한국어판 위키(ko.wikipedia.org 등 ko. 하위 도메인). */
export function isDomesticUrl(url: string): boolean {
  const h = hostOf(url);
  if (!h) return false;
  if (h === "kr" || h.endsWith(".kr") || h.startsWith("ko.")) return true;
  return KOREAN_HOSTS.some((k) => h === k || h.endsWith(`.${k}`));
}

/** 국내 범위면 해외 출처를 뺀다(전체 범위면 그대로). */
export function keepInScope<T extends { url: string }>(items: T[], scope: SourceScope): T[] {
  return scope === "domestic" ? items.filter((x) => isDomesticUrl(x.url)) : items;
}

/** 검색 호출에 덧붙이는 지시(국내 범위일 때만).
 * 실측(2026-10-24): ".kr 도메인"이라고 적었더니 모델이 모든 검색어에 "site:.kr"을 붙여 검색 결과가 0건 → 조사 실패 → 예전 한 번에 쓰기 경로로
 * 넘어가 검색 10회·57초가 됐다. 그래서 검색 연산자를 쓰지 말라고 하고, 한국 사이트 판정은 코드(isDomesticUrl)가 한다. */
export const DOMESTIC_SEARCH_RULE =
  "[출처 범위 — 국내 출처만] 검색어는 평범한 한국어 낱말로만 쓴다 — site:·inurl: 같은 검색 연산자나 도메인 이름(.kr 등)을 검색어에 넣지 말 것(결과가 거의 사라진다). 검색 결과 가운데 한국 사이트(정부·공공기관·학교·연구기관, 국내 언론·포털·백과, 국내 서점·출판사, 한국어 위키)만 근거로 쓰고, 해외 사이트(영문 위키백과·해외 언론·해외 기관)는 근거로 쓰지 말 것.";
