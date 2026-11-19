import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server-client";
import { getSessionUser } from "@/lib/supabase/session-user";
import { parseContextRef } from "@/lib/study/context-pure";
import { getSectionBody, replaceSection, stripUnknownFootnotes } from "@/lib/study/section-edit";

export const maxDuration = 30;

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

/**
 * AI 채팅이 낸 칸 수정안(또는 되돌리기)을 학생 결과물에 적용한다. 모델 호출이 없고 문자열 교체뿐이다.
 * user_histories는 세션 클라이언트(RLS)로만 건드린다 — 본인 행만 읽고 쓴다. 바뀌는 것은 raw_text_result의 글과 그 글에서 만든 암기노트 캐시뿐이다
 * (task_embeddings의 결과물 임베딩은 겹침 방지 통계용이라 다시 계산하지 않는다).
 */
export async function POST(req: NextRequest) {
  let body: { context?: unknown; heading?: unknown; markdown?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail("요청을 읽지 못했어요.", 400);
  }
  const ref = parseContextRef(body.context);
  const heading = typeof body.heading === "string" ? body.heading.trim().slice(0, 120) : "";
  const markdown = typeof body.markdown === "string" ? body.markdown.slice(0, 12_000) : "";
  if (!ref || (ref.kind !== "history" && ref.kind !== "submission") || !heading || !markdown.trim()) return fail("수정할 칸과 내용이 필요해요.", 400);

  const supabase = await getServerSupabase();
  const user = await getSessionUser(supabase);
  if (!user) return fail("로그인하면 결과물을 고칠 수 있어요.", 401);

  const base = supabase.from("user_histories").select("id, raw_text_result");
  const { data: row } = await (ref.kind === "history" ? base.eq("id", ref.id) : base.eq("submission_id", ref.id).eq("is_current", true)).maybeSingle();
  if (!row) return fail("결과물을 찾지 못했어요.", 404);

  let result: Record<string, unknown>;
  try {
    result = JSON.parse(row.raw_text_result as string);
  } catch {
    return fail("결과물을 읽지 못했어요.", 500);
  }

  // 결과물 글은 essay면 markdown, plan이면 content. 단계별 카드용 sections[].markdown에도 같은 칸이 있으면 같이 바꾼다.
  const field = typeof result.markdown === "string" ? "markdown" : typeof result.content === "string" ? "content" : null;
  if (!field) return fail("고칠 수 있는 글이 아니에요.", 422);
  const main = result[field] as string;

  // 출처 목록에 없는 각주 번호는 지운다(채팅이 지어낸 번호가 출처 없는 인용으로 남지 않게).
  const sources = Array.isArray(result.sources) ? (result.sources as { n?: unknown }[]).map((s) => Number(s.n)).filter(Number.isFinite) : null;
  const text = sources ? stripUnknownFootnotes(markdown, sources) : markdown;

  const before = getSectionBody(main, heading);
  const nextMain = replaceSection(main, heading, text);
  if (before === null || nextMain === null) return fail("결과물에서 그 칸을 하나로 찾지 못했어요.", 422);
  result[field] = nextMain;
  if (Array.isArray(result.sections)) {
    result.sections = (result.sections as { markdown?: unknown }[]).map((s) => {
      if (typeof s?.markdown !== "string") return s;
      const replaced = replaceSection(s.markdown, heading, text);
      return replaced === null ? s : { ...s, markdown: replaced };
    });
  }

  const { error } = await supabase
    .from("user_histories")
    .update({ raw_text_result: JSON.stringify(result), memo_note: null })
    .eq("id", row.id as string);
  if (error) return fail("저장하지 못했어요. 잠시 후 다시 시도해 주세요.", 500);

  return NextResponse.json({ ok: true, heading, before, markdown: text });
}
