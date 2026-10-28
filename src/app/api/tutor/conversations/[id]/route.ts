import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server-client";
import { getSessionUser } from "@/lib/supabase/session-user";
import { isUuid } from "@/lib/study/context-pure";
import { questionFromStored } from "@/lib/tutor/tutor-pure";

// 대화 하나와 그 메시지들. RLS(auth.uid() = user_id) 덕분에 다른 사람의 id를 넣어도 조회·삭제되지 않는다.
export async function GET(_req: Request, ctx: RouteContext<"/api/tutor/conversations/[id]">) {
  try {
    const { id } = await ctx.params;
    if (!isUuid(id)) return NextResponse.json({ error: "대화를 찾을 수 없어요." }, { status: 404 });
    const supabase = await getServerSupabase();
    const user = await getSessionUser(supabase);
    if (!user) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });

    const { data: conv } = await supabase.from("tutor_conversations").select("id, title").eq("id", id).maybeSingle();
    if (!conv) return NextResponse.json({ error: "대화를 찾을 수 없어요." }, { status: 404 });
    const { data: rows, error } = await supabase
      .from("tutor_messages")
      .select("id, role, content, sources, question")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw error;
    return NextResponse.json({
      id: conv.id,
      title: conv.title,
      messages: (rows ?? []).map((m) => ({ id: m.id, role: m.role, content: m.content, sources: m.sources ?? undefined, question: questionFromStored(m.question) })),
    });
  } catch (err) {
    console.error("[/api/tutor/conversations/[id]] 조회 실패", err);
    return NextResponse.json({ error: "대화를 불러오지 못했어요." }, { status: 500 });
  }
}

// 대화 삭제(메시지는 연쇄 삭제). 학생의 질문이 담긴 데이터라 숨김 처리가 아니라 실제로 지운다.
export async function DELETE(_req: Request, ctx: RouteContext<"/api/tutor/conversations/[id]">) {
  try {
    const { id } = await ctx.params;
    if (!isUuid(id)) return NextResponse.json({ error: "대화를 찾을 수 없어요." }, { status: 404 });
    const supabase = await getServerSupabase();
    const user = await getSessionUser(supabase);
    if (!user) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
    const { error } = await supabase.from("tutor_conversations").delete().eq("id", id).eq("user_id", user.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/tutor/conversations/[id]] 삭제 실패", err);
    return NextResponse.json({ error: "대화를 지우지 못했어요." }, { status: 500 });
  }
}
