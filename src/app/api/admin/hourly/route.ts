import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin/session";
import { getHourlyGenerations } from "@/lib/admin/hourly";
import { isValidDayKey, kstDayKey } from "@/lib/admin/dashboard-pure";

// 관리자 대시보드: 선택한 날(?date=YYYY-MM-DD, 한국 시간)의 시간대별 생성 횟수.
const EARLIEST_DAY = "2025-01-01";

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: "관리자 로그인이 필요합니다." }, { status: 401 });

  const date = req.nextUrl.searchParams.get("date") ?? kstDayKey(new Date());
  if (!isValidDayKey(date) || date < EARLIEST_DAY || date > kstDayKey(Date.now() + 24 * 60 * 60 * 1000)) {
    return NextResponse.json({ error: "날짜 형식이 올바르지 않아요." }, { status: 400 });
  }

  try {
    return NextResponse.json(await getHourlyGenerations(date));
  } catch (err) {
    console.error("[/api/admin/hourly] 조회 실패", err);
    return NextResponse.json({ error: "시간대별 기록을 불러오지 못했어요." }, { status: 500 });
  }
}
