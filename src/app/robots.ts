import type { MetadataRoute } from "next";
import { PRIVATE_PATHS, SITE_URL } from "@/lib/seo/site";

// 일반 검색 로봇과 AI 검색 로봇(GPTBot·ClaudeBot·PerplexityBot 등)을 구분하지 않고 같은 규칙을 적용한다 — 공개 페이지는 모두 허용.
// 학습용 수집을 막고 싶으면 여기에 해당 userAgent 규칙(disallow: "/")을 따로 추가하면 된다.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: PRIVATE_PATHS },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
