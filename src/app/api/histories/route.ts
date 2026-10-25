import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server-client";
import { getSessionUser } from "@/lib/supabase/session-user";
import { makePreview } from "@/lib/histories/preview";
import { getTrashedSubmissionIds } from "@/lib/histories/trash";

// 홈 대시보드("수행평가 및 과제")·사이드바 작업 목록용 내 결과물 목록 — 읽기 전용. 세션
// 클라이언트(RLS)로만 조회하므로 본인 것만 나온다. 비로그인이면 빈 목록(에러 아님).
// 휴지통에 있는 제출은 제외하고, 카드 썸네일에 보여줄 글 미리보기(preview)를 함께 준다.
export async function GET() {
  try {
    const supabase = await getServerSupabase();
    const user = await getSessionUser(supabase);
    if (!user) return NextResponse.json({ histories: [] });

    // 목록과 휴지통 목록은 서로 기다릴 필요가 없다 — 동시에 가져온다.
    const [{ data, error }, { ids: trashed }] = await Promise.all([
      supabase
        .from("user_histories")
        .select("id, submission_id, title, subject, output_type, created_at, raw_text_result")
        .eq("is_current", true)
        .order("created_at", { ascending: false })
        .limit(60),
      getTrashedSubmissionIds(supabase),
    ]);
    if (error) throw error;

    const histories = (data ?? [])
      .filter((h) => !trashed.has(h.submission_id))
      .slice(0, 40)
      .map((h) => ({
        id: h.id as string,
        title: h.title as string | null,
        subject: h.subject as string,
        output_type: h.output_type as "essay" | "plan",
        created_at: h.created_at as string,
        preview: makePreview(h.raw_text_result as string | null, h.output_type as "essay" | "plan"),
      }));
    return NextResponse.json({ histories });
  } catch (err) {
    console.error("[/api/histories] 목록 조회 실패", err);
    return NextResponse.json({ error: "목록을 불러오지 못했어요." }, { status: 500 });
  }
}
