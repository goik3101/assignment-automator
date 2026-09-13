import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin/session";

// 사이드바(AuthBar.tsx)가 관리자 코드로 로그인된 상태인지 클라이언트에서
// 확인할 수 있게 해준다 — 관리자 세션 쿠키는 httpOnly라 클라이언트 JS가
// document.cookie로 직접 읽을 수 없어서, 서버에서 검증한 결과만 boolean으로
// 내려준다(코드 자체나 쿠키 값은 노출하지 않음).
export async function GET(req: NextRequest) {
  return NextResponse.json({ isAdmin: isAdminRequest(req) });
}
