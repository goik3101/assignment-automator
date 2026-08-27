import { getServiceClient } from "@/lib/supabase/service-client";

// 11-6: "로그인 실패 시 잠금". 잠정값 — 배포 전 재검토.
const MAX_FAILURES = Number(process.env.ADMIN_LOGIN_MAX_FAILURES ?? 5);
const WINDOW_MINUTES = Number(process.env.ADMIN_LOGIN_LOCKOUT_MINUTES ?? 15);

export async function isLockedOut(ip: string): Promise<boolean> {
  const supabase = getServiceClient();
  const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();

  const { count, error } = await supabase
    .from("admin_login_attempts")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .eq("success", false)
    .gte("created_at", windowStart);
  if (error) throw new Error(`잠금 상태 확인 실패: ${error.message}`);

  return (count ?? 0) >= MAX_FAILURES;
}

export async function recordAttempt(ip: string, success: boolean): Promise<void> {
  const supabase = getServiceClient();
  const { error } = await supabase.from("admin_login_attempts").insert({ ip, success });
  if (error) console.error("[admin lockout] 기록 실패", error);
}
