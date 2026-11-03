import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin/session";
import { getMonthlyVisits } from "@/lib/admin/visits";
import { isValidMonthKey, kstMonthKey } from "@/lib/admin/visits-pure";

// 관리자 대시보드: 선택한 달(?month=YYYY-MM, 한국 시간)의 시간대별·날짜별 방문자 수.
export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const month = req.nextUrl.searchParams.get("month") ?? kstMonthKey(new Date());
  const nextMonth = kstMonthKey(Date.now() + 32 * 24 * 60 * 60 * 1000);
  if (!isValidMonthKey(month) || month < "2025-01" || month > nextMonth) {
    return NextResponse.json({ error: "달 형식이 올바르지 않아요." }, { status: 400 });
  }
  try {
    return NextResponse.json(await getMonthlyVisits(month));
  } catch (err) {
    console.error("[/api/admin/visits] 조회 실패", err);
    return NextResponse.json({ error: "방문 기록을 불러오지 못했어요." }, { status: 500 });
  }
}
