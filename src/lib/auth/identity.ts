import { randomUUID } from "crypto";
import type { NextRequest } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server-client";

export const GUEST_COOKIE_NAME = "studed_guest_id";

export interface RequestIdentity {
  userId: string | null;
  /** 서버가 검증한 로그인 사용자의 이메일(비로그인이면 null). 관리자 예약 계정 판별에만 쓴다. */
  email?: string | null;
  guestId: string | null;
  /** 이번 요청에서 새로 발급한 guest_id면 true — 응답에 쿠키를 심어줘야 한다. */
  isNewGuest: boolean;
}

/**
 * 로그인 세션이 있으면 그 사용자로, 없으면 게스트 쿠키로 "이 요청이 누구 것인지"를
 * 판별한다. 반환하는 supabase 클라이언트는 로그인 세션이 실려 있어서, 이어서
 * user_histories에 쓸 때 재사용하면 RLS(auth.uid() = user_id)가 자연스럽게 통과한다.
 */
export async function resolveIdentity(req: NextRequest) {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const identity: RequestIdentity = { userId: user.id, email: user.email ?? null, guestId: null, isNewGuest: false };
    return { identity, supabase };
  }

  const existingGuestId = req.cookies.get(GUEST_COOKIE_NAME)?.value ?? null;
  const identity: RequestIdentity = {
    userId: null,
    guestId: existingGuestId ?? randomUUID(),
    isNewGuest: !existingGuestId,
  };
  return { identity, supabase };
}
