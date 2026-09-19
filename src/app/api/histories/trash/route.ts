import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server-client";

// 휴지통 목록(자동 작성 모드 결과물). trashed_histories 표(0014)가 없으면 available:false.
export async function GET() {
  try {
    const supabase = await getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ histories: [], available: true });

    const { data: trashed, error } = await supabase
      .from("trashed_histories")
      .select("submission_id, trashed_at")
      .order("trashed_at", { ascending: false });
    if (error) return NextResponse.json({ histories: [], available: false });
    if (!trashed || trashed.length === 0) return NextResponse.json({ histories: [], available: true });

    const { data: rows, error: hErr } = await supabase
      .from("user_histories")
      .select("id, submission_id, title, subject, output_type")
      .eq("is_current", true)
      .in(
        "submission_id",
        trashed.map((t) => t.submission_id)
      );
    if (hErr) throw hErr;

    const at = new Map(trashed.map((t) => [t.submission_id as string, t.trashed_at as string]));
    const histories = (rows ?? []).map((r) => ({
      id: r.id as string,
      title: r.title as string | null,
      subject: r.subject as string,
      output_type: r.output_type as "essay" | "plan",
      trashed_at: at.get(r.submission_id as string) ?? "",
    }));
    return NextResponse.json({ histories, available: true });
  } catch (err) {
    console.error("[/api/histories/trash] 조회 실패", err);
    return NextResponse.json({ error: "휴지통을 불러오지 못했어요." }, { status: 500 });
  }
}
