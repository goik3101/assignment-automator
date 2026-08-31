import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server-client";
import { getCurrentHistoryBySubmission } from "@/lib/histories/save-history";

// 결과 공유 링크 발급. submissionId(현재 버전)의 share_token을 채우고 돌려준다 —
// 이미 있으면 그대로 재사용(같은 링크를 여러 번 눌러도 새 토큰이 계속 생기지
// 않게). 세션 클라이언트로만 다뤄서 RLS(auth.uid() = user_id)가 "본인 결과만
// 공유할 수 있다"는 걸 그대로 보장한다.
// 경로 세그먼트 이름은 [id]지만(옆의 histories/[id]/route.ts, memo-note와 형제
// 경로라 Next.js가 같은 depth에 서로 다른 슬러그 이름을 허용하지 않는다), 실제
// 값은 submissionId다 — DELETE ../[id]와는 다른 값(행의 id가 아니라 submission_id).
export async function POST(req: NextRequest, ctx: RouteContext<"/api/histories/[id]/share">) {
  try {
    const { id: submissionId } = await ctx.params;
    const supabase = await getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

    const history = await getCurrentHistoryBySubmission(supabase, submissionId);
    if (!history || history.user_id !== user.id) {
      return NextResponse.json({ error: "결과를 찾을 수 없습니다." }, { status: 404 });
    }

    const existing = history.share_token;
    const token = existing ?? randomUUID();

    if (!existing) {
      const { error } = await supabase
        .from("user_histories")
        .update({ share_token: token })
        .eq("id", history.id)
        .eq("user_id", user.id);
      if (error) throw error;
    }

    return NextResponse.json({ shareToken: token });
  } catch (err) {
    console.error("[/api/histories/[id]/share] 실패", err);
    return NextResponse.json({ error: "공유 링크 생성 중 오류가 발생했습니다." }, { status: 500 });
  }
}
