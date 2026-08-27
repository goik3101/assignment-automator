import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server-client";

// F9: 설정 탭 개인화 정보. RLS(auth.uid() = user_id) 덕분에 본인 행만 다룰 수 있다.
export async function GET() {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { data, error } = await supabase
    .from("user_settings")
    .select("interests, textbook_publisher, school_type")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(
    data ?? { interests: "", textbook_publisher: "", school_type: "" }
  );
}

export async function PATCH(req: NextRequest) {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const body = await req.json();
  const { interests, textbook_publisher, school_type } = body as {
    interests?: string;
    textbook_publisher?: string;
    school_type?: string;
  };

  const { error } = await supabase.from("user_settings").upsert({
    user_id: user.id,
    interests: interests ?? null,
    textbook_publisher: textbook_publisher ?? null,
    school_type: school_type ?? null,
    updated_at: new Date().toISOString(),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
