/**
 * Cloudflare Turnstile 서버 측 검증 (N4: 비로그인 1회 생성 시 캡차 필수).
 * TURNSTILE_SECRET_KEY가 없을 때: 기본은 검증을 건너뛴다(키 없이 운영하던 예전 방식, 콘솔에 경고만 남음).
 * TURNSTILE_REQUIRED=on이면 프로덕션에서는 통과시키지 않는다 — 키를 넣은 뒤 켜면 키가 빠진 채 배포돼도 비로그인 생성이 캡차 없이 열리지 않는다.
 * (2026-10-24에 이 거절을 기본값으로 바꿨다가, 키 없이 운영 중이던 서비스의 비로그인 생성이 전부 막혀 2026-10-29에 되돌렸다.)
 * 키가 있을 때는 항상 검증하고, 검증 서버에 닿지 못해도 통과시키지 않는다. 로그인 사용자는 이 검사를 거치지 않는다.
 */
export async function verifyTurnstile(token: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    if (process.env.NODE_ENV === "production" && process.env.TURNSTILE_REQUIRED === "on") {
      console.error("[turnstile] TURNSTILE_SECRET_KEY가 설정되지 않아 비로그인 요청을 거절합니다(TURNSTILE_REQUIRED=on). 환경변수를 확인하세요.");
      return false;
    }
    console.warn("[turnstile] TURNSTILE_SECRET_KEY가 없어 캡차 검증을 건너뜁니다. 봇 방지를 쓰려면 키를 설정하세요.");
    return true;
  }
  if (!token) return false;

  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
      signal: AbortSignal.timeout(8000),
    });
    const data = (await res.json()) as { success: boolean };
    return data.success === true;
  } catch (err) {
    // 검증 서버에 닿지 못하면 통과시키지 않는다(캡차 우회 방지). 사용자에게는 "캡차 확인 실패"로 보인다.
    console.error("[turnstile] 검증 요청 실패", err instanceof Error ? err.name : "unknown");
    return false;
  }
}
