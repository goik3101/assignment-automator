// 검색엔진·AI 검색용 사이트 정보. 도메인이 바뀌면 NEXT_PUBLIC_SITE_URL만 고치면 robots/sitemap/구조화 데이터가 같이 따라간다.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://assignment-automator.vercel.app").replace(/\/+$/, "");

export const SITE_NAME = "STUDED AI";

export const SITE_DESCRIPTION =
  "수행평가 안내문 사진만 올리면 AI가 원고나 실행 계획을 만들어 줘요. 실제 검색 출처를 달고, 다른 학생과 겹치지 않게 써 주고, 요약·퀴즈·플래시카드로 공부까지 이어가요.";

// 로그인해야 의미 있거나 개인 자료가 담긴 경로. 검색 결과에 나올 필요가 없다.
export const PRIVATE_PATHS = ["/api/", "/admin", "/histories", "/trash", "/settings", "/learning", "/tutor", "/share/"];

/** JSON-LD를 <script>에 넣을 때 "</script>" 같은 문자열로 태그가 깨지지 않게 "<"를 이스케이프한다. */
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
