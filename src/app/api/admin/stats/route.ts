import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin/session";
import { getAdminStats } from "@/lib/admin/stats";

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "관리자 로그인이 필요합니다." }, { status: 401 });
  }
  const stats = await getAdminStats();
  return NextResponse.json(stats);
}
