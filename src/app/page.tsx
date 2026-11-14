import type { Metadata } from "next";
import AssignmentFlow from "@/components/AssignmentFlow";
import AnnouncementBanner from "@/components/AnnouncementBanner";
import { FEATURES } from "@/lib/seo/about-content";
import { SITE_ALT_NAMES, SITE_DESCRIPTION, SITE_NAME, SITE_URL, jsonLdString } from "@/lib/seo/site";

// 같은 화면이 vercel.app 주소로도 열려서, 검색엔진에 "대표 주소는 이쪽"이라고 알린다(metadataBase = NEXT_PUBLIC_SITE_URL).
export const metadata: Metadata = { alternates: { canonical: "/" } };

// 홈 화면은 앱 화면이라 글이 적다. 화면에 보이지 않는 대신, 이 서비스가 무엇인지를 구조화 데이터로 정확히 알린다.
const APP_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: SITE_NAME,
  alternateName: SITE_ALT_NAMES,
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  applicationCategory: "EducationalApplication",
  operatingSystem: "Web",
  inLanguage: ["ko", "en"],
  audience: { "@type": "EducationalAudience", educationalRole: "student" },
  featureList: FEATURES.map((f) => f.name),
};

export default function Home() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(APP_JSON_LD) }} />
      <AssignmentFlow />
      <AnnouncementBanner />
    </>
  );
}
