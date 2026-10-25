import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server-client";
import { getSessionUser } from "@/lib/supabase/session-user";

// 메인 화면의 "최근 불러오기" 버튼용. 가장 최근 히스토리 하나의 입력값만 돌려준다
// (분석을 다시 돌리지 않고 확인 폼으로 바로 이어가기 위함).
export async function GET() {
  const supabase = await getServerSupabase();
  const user = await getSessionUser(supabase);
  if (!user) return NextResponse.json(null);

  const { data } = await supabase
    .from("user_histories")
    .select("subject, core_task_info, admin_info, instructions")
    .eq("is_current", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json(data);
}
