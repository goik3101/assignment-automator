import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server-client";
import { LIMITS, checkText } from "@/lib/api/validate";

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
  if (error) {
    console.error("[/api/user/settings] 조회 실패", error);
    return NextResponse.json({ error: "설정을 불러오지 못했어요." }, { status: 500 });
  }

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

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "요청 본문이 올바른 JSON이 아닙니다." }, { status: 400 });
  }
  const { interests, textbook_publisher, school_type } = body as {
    interests?: string;
    textbook_publisher?: string;
    school_type?: string;
  };
  const invalid =
    checkText(interests, LIMITS.interests, "관심사") ??
    checkText(textbook_publisher, LIMITS.shortField, "교과서 출판사") ??
    checkText(school_type, LIMITS.shortField, "학교 유형");
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const { error } = await supabase.from("user_settings").upsert({
    user_id: user.id,
    interests: interests ?? null,
    textbook_publisher: textbook_publisher ?? null,
    school_type: school_type ?? null,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.error("[/api/user/settings] 저장 실패", error);
    return NextResponse.json({ error: "설정을 저장하지 못했어요." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
