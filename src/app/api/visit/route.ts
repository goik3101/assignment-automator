import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/service-client";
import { isAdminRequest } from "@/lib/admin/session";
import { hourBucketIso, isLikelyHuman, visitorKey } from "@/lib/admin/visits-pure";

// 웹사이트 방문 기록: 브라우저가 세션당 한 번 부른다. IP·UA는 저장하지 않고 그날만 유효한 해시로 "한 시간에 한 명 한 줄"만 남긴다(site_visits, 0020).
// 표가 없거나 실패해도 사용자에게는 아무 영향이 없다(항상 204).
let missingUntil = 0;

export async function POST(req: NextRequest) {
  const done = new NextResponse(null, { status: 204 });
  try {
    const ua = req.headers.get("user-agent") ?? "";
    if (Date.now() < missingUntil || !isLikelyHuman(ua) || isAdminRequest(req)) return done; // 봇·관리자 본인은 세지 않는다
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "";
    if (!ip) return done;

    const now = Date.now();
    const secret = process.env.VISIT_HASH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "studed";
    const { error } = await getServiceClient()
      .from("site_visits")
      .upsert({ visitor: visitorKey(ip, ua, now, secret), hour_bucket: hourBucketIso(now) }, { onConflict: "visitor,hour_bucket", ignoreDuplicates: true });
    if (error && (error.code === "42P01" || error.code === "PGRST205")) missingUntil = now + 10 * 60 * 1000; // 표가 아직 없다
  } catch {
    /* 방문 기록은 부가 기능 */
  }
  return done;
}
