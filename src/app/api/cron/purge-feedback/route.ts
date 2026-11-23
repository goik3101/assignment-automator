import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/service-client";
import { isCronAuthorized, purgeExpiredFeedback } from "@/lib/feedback/retention";

// 매일 한 번 Vercel Cron(vercel.json)이 부른다. 받은 지 1년이 지난 문의·피드백("개선 돕기" 포함)과 그 첨부 사진을 지운다.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req.headers.get("authorization"), req.headers.get("user-agent"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "허용되지 않은 호출입니다." }, { status: 401 });
  }
  try {
    const result = await purgeExpiredFeedback(getServiceClient());
    console.log("[cron/purge-feedback]", result);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron/purge-feedback] 실패", err);
    return NextResponse.json({ error: "삭제하지 못했어요." }, { status: 500 });
  }
}
