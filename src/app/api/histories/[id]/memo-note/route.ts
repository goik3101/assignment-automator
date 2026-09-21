import { routeUsage } from "@/lib/llm/route-usage";
import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server-client";
import { generateMemoNote } from "@/lib/gemini/memo-note";
import type { EssayResult, PlanResult } from "@/types/task";

// F8/9-2: 암기노트. 로그인 사용자 무료. 한 번 생성하면 user_histories.memo_note에
// 캐시해서 다시 볼 때는 재생성하지 않는다.
export const GET = routeUsage("memoNote", async function GET(_req: Request, ctx: RouteContext<"/api/histories/[id]/memo-note">) {
  const { id } = await ctx.params;
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  // RLS(auth.uid() = user_id) 덕분에 다른 사람의 히스토리는 조회되지 않는다.
  const { data: history, error } = await supabase
    .from("user_histories")
    .select("id, raw_text_result, memo_note")
    .eq("id", id)
    .single();
  if (error || !history) {
    return NextResponse.json({ error: "히스토리를 찾을 수 없습니다." }, { status: 404 });
  }

  if (history.memo_note) {
    return NextResponse.json(history.memo_note);
  }

  let result: EssayResult | PlanResult;
  try {
    result = JSON.parse(history.raw_text_result);
  } catch {
    return NextResponse.json({ error: "결과 데이터를 읽을 수 없습니다." }, { status: 500 });
  }

  const memoNote = await generateMemoNote(result);

  const { error: updateError } = await supabase
    .from("user_histories")
    .update({ memo_note: memoNote })
    .eq("id", id);
  if (updateError) console.error("[memo-note] 캐시 저장 실패", updateError);

  return NextResponse.json(memoNote);
});
