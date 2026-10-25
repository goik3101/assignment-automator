import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server-client";
import { getSessionUser } from "@/lib/supabase/session-user";
import { getTrashedSubmissionIds } from "@/lib/histories/trash";

// 사이드바 "작업 목록"용 가벼운 조회: 제목·날짜만, 최근 8개씩. 홈 화면용 /api/histories는 카드 미리보기를 만들려고 결과물 본문(수십 KB)까지
// 읽어서 사이드바가 페이지를 옮길 때마다 부르기엔 무겁다. 세 조회를 동시에 보내고, 한쪽(예: 학습 모드 표 미적용)이 실패해도 다른 쪽은 돌려준다.
export async function GET() {
  try {
    const supabase = await getServerSupabase();
    const user = await getSessionUser(supabase);
    if (!user) return NextResponse.json({ sessions: [], histories: [] });

    const [sessions, histories, { ids: trashed }] = await Promise.all([
      supabase.from("learning_sessions").select("id, title, subject, updated_at").is("deleted_at", null).order("updated_at", { ascending: false }).limit(8),
      supabase.from("user_histories").select("id, submission_id, title, subject, created_at").eq("is_current", true).order("created_at", { ascending: false }).limit(16),
      getTrashedSubmissionIds(supabase),
    ]);

    return NextResponse.json({
      sessions: sessions.error ? [] : (sessions.data ?? []),
      histories: histories.error
        ? []
        : (histories.data ?? [])
            .filter((h) => !trashed.has(h.submission_id as string))
            .slice(0, 8)
            .map((h) => ({ id: h.id, title: h.title, subject: h.subject, created_at: h.created_at })),
    });
  } catch (err) {
    console.error("[/api/worklist] 조회 실패", err);
    return NextResponse.json({ sessions: [], histories: [] });
  }
}
