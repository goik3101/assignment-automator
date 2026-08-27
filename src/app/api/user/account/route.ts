import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server-client";
import { getServiceClient } from "@/lib/supabase/service-client";

// F11: 계정 탈퇴(데이터 삭제) 요청. auth.users 행을 지우면 user_histories/user_settings는
// on delete cascade로 함께 삭제된다 (0001_init.sql 참고). task_embeddings/clusters는
// 애초에 이 계정과 FK로 연결되어 있지 않아 영향받지 않는다 — 그게 이 설계의 핵심.
export async function DELETE() {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { error } = await getServiceClient().auth.admin.deleteUser(user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 세션 쿠키 자체는 클라이언트가 이어서 supabase.auth.signOut()을 호출해 정리한다.
  return NextResponse.json({ ok: true });
}
