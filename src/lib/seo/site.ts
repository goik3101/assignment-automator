// 검색엔진·AI 검색용 사이트 정보. 도메인이 바뀌면 NEXT_PUBLIC_SITE_URL만 고치면 robots/sitemap/구조화 데이터가 같이 따라간다.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://assignment-automator.vercel.app").replace(/\/+$/, "");

export const SITE_NAME = "STUDED AI";

// 홈 제목: 검색 결과에서 잘리지 않는 선(한글 30자 안팎)에서 서비스가 무엇인지 말한다.
export const HOME_TITLE = "STUDED AI - 수행평가 AI, 안내문 사진으로 원고까지";

// 띄어쓰기·표기가 달라도 같은 서비스로 알아보게 하는 이름들(검색어 "studed ai" / "studedai" / "스터디드").
export const SITE_ALT_NAMES = ["studed ai", "studedai", "STUDED", "스터디드", "스터디드 AI", "수행평가 AI"];

// 화면(푸터)과 구조화 데이터에 같은 값이 나가야 AI가 "같은 곳"으로 알아본다.
export const CONTACT_EMAIL = "sstuded.official3101@gmail.com";

// 공식 SNS 주소. 푸터 링크와 Organization의 sameAs가 이 배열 하나에서 나온다(비어 있으면 둘 다 생략).
export const SOCIAL_LINKS: string[] = [
  "https://www.tiktok.com/@ttoday3101",
  "https://www.instagram.com/sstud2026/",
];

export const SITE_DESCRIPTION =
  "수행평가 안내문 사진만 올리면 AI가 원고나 실행 계획을 만들어 줘요. 실제 검색 출처를 달고, 다른 학생과 겹치지 않게 써 주고, 요약·퀴즈·플래시카드로 공부까지 이어가요.";

// 로그인해야 의미 있거나 개인 자료가 담긴 경로. 검색 결과에 나올 필요가 없다.
export const PRIVATE_PATHS = ["/api/", "/admin", "/histories", "/trash", "/settings", "/learning", "/tutor", "/share/"];

/** JSON-LD를 <script>에 넣을 때 "</script>" 같은 문자열로 태그가 깨지지 않게 "<"를 이스케이프한다. */
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** 페이지별 Open Graph. 페이지가 openGraph를 지정하면 레이아웃 것을 통째로 대체하므로 공통 값(siteName·locale)과 og:url을 여기서 같이 채운다. */
export function pageOpenGraph(path: string, extra: Record<string, unknown> = {}) {
  return { type: "website" as const, siteName: SITE_NAME, locale: "ko_KR", url: path, ...extra };
}
