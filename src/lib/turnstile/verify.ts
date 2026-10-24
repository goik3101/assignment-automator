/**
 * Cloudflare Turnstile 서버 측 검증 (N4: 비로그인 1회 생성 시 캡차 필수).
 * TURNSTILE_SECRET_KEY가 없을 때: 개발 중에는 검증을 건너뛰지만, 프로덕션에서는 통과시키지 않는다
 * (비밀키가 빠진 채 배포돼도 비로그인 생성이 캡차 없이 열리지 않게 — 실패해도 로그인 사용자는 영향 없다).
 */
export async function verifyTurnstile(token: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      console.error("[turnstile] TURNSTILE_SECRET_KEY가 설정되지 않아 비로그인 요청을 거절합니다. 환경변수를 확인하세요.");
      return false;
    }
    console.warn("[turnstile] TURNSTILE_SECRET_KEY가 없어 캡차 검증을 건너뜁니다(개발 환경).");
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
