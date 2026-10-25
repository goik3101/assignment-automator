import type { SupabaseClient } from "@supabase/supabase-js";

export interface SessionUser {
  id: string;
  email: string | null;
}

/**
 * 쿠키 세션의 사용자(서명 검증된 JWT 클레임)를 돌려준다. auth.getUser()와 달리 Supabase 인증 서버를 다녀오지 않아서(요청마다 약 100ms)
 * 목록 조회·자동 저장처럼 자주 부르는 곳에 맞다. 대신 서버 쪽에서 막 취소된 세션을 JWT 만료(기본 1시간) 전까지 알아채지 못한다 —
 * 데이터 접근은 어차피 같은 JWT를 쓰는 RLS가 지키고, 계정 삭제·공유·생성(횟수 제한)처럼 민감한 곳은 계속 getUser()를 쓴다.
 */
export async function getSessionUser(supabase: SupabaseClient): Promise<SessionUser | null> {
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null };
}
