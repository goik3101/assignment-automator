import { NextResponse } from "next/server";
import { getLatestAnnouncement } from "@/lib/admin/announcements";

// 로그인 여부와 무관하게 누구나 조회 가능(메인 화면 배너용). 공지가 없으면
// announcement: null만 내려주고, 화면 쪽에서 아무것도 렌더링하지 않는다.
export async function GET() {
  const announcement = await getLatestAnnouncement();
  return NextResponse.json({ announcement });
}
