import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server-client";
import { getSessionUser } from "@/lib/supabase/session-user";
import { isLimitExempt } from "@/lib/admin/session";

/**
 * 학습 모드 라우트 공통: 로그인 사용자 확인 + RLS가 적용되는 세션 클라이언트 반환.
 * 학습 모드는 자동 저장·복구가 DB 기반이라 로그인이 필수다. 관리자 코드 로그인은
 * 실제 Supabase 세션도 함께 발급하므로(admin/session.ts) 그대로 통과하고, 횟수
 * 제한만 예외 처리된다.
 */
export async function requireLearningUser(req: NextRequest) {
  const supabase = await getServerSupabase();
  // 학습 화면은 자동 저장·목록 조회가 잦아서 인증 서버를 매번 거치지 않는다(session-user.ts). 데이터 접근은 RLS가 지킨다.
  const user = await getSessionUser(supabase);
  if (!user) {
    return {
      error: NextResponse.json({ error: "학습 모드는 로그인 후 이용할 수 있어요." }, { status: 401 }),
    } as const;
  }
  return { supabase, user, isAdmin: isLimitExempt(req, user.email) } as const;
}

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}
