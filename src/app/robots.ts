import type { MetadataRoute } from "next";
import { PRIVATE_PATHS, SITE_URL } from "@/lib/seo/site";

// AI 검색·답변용 로봇과 일반 로봇 모두 공개 페이지는 허용한다(개인 경로만 막음). 로봇은 자기 이름의 규칙이 있으면 "*" 규칙을 보지 않으므로
// 이름을 적은 로봇에도 같은 disallow를 반복한다. 학습용 수집(GPTBot·ClaudeBot·Google-Extended·Applebot-Extended)을 막고 싶으면 이 목록에서 빼고
// 따로 disallow: "/" 규칙을 두면 된다 — 검색용(OAI-SearchBot·Claude-SearchBot·PerplexityBot)과 사용자 요청용(*-User)은 별개다.
const AI_BOTS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: PRIVATE_PATHS },
      { userAgent: AI_BOTS, allow: "/", disallow: PRIVATE_PATHS },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
