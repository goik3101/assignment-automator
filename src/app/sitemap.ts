import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo/site";

// 로그인 없이 볼 수 있는 공개 페이지만 담는다. lastModified는 실제로 고친 날짜를 모르니 넣지 않는다(잘못된 날짜는 안 넣느니만 못함).
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/about`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/terms`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
