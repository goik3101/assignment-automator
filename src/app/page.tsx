import type { Metadata } from "next";
import AssignmentFlow from "@/components/AssignmentFlow";
import AnnouncementBanner from "@/components/AnnouncementBanner";

// 같은 화면이 vercel.app 주소로도 열려서, 검색엔진에 "대표 주소는 이쪽"이라고 알린다(metadataBase = NEXT_PUBLIC_SITE_URL).
export const metadata: Metadata = { alternates: { canonical: "/" } };

export default function Home() {
  return (
    <>
      <AssignmentFlow />
      <AnnouncementBanner />
    </>
  );
}
