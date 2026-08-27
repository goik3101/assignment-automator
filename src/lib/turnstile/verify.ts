/**
 * Cloudflare Turnstile 서버 측 검증 (N4: 비로그인 1회 생성 시 캡차 필수).
 * TURNSTILE_SECRET_KEY가 아직 설정되지 않았으면(M4 개발 초기 단계) 검증을
 * 건너뛴다 — 배포 전에는 반드시 키를 채워서 이 우회를 없애야 한다.
 */
export async function verifyTurnstile(token: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.warn(
      "[turnstile] TURNSTILE_SECRET_KEY가 없어 캡차 검증을 건너뜁니다. 배포 전 반드시 설정할 것."
    );
    return true;
  }
  if (!token) return false;

  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret, response: token }),
  });
  const data = (await res.json()) as { success: boolean };
  return data.success === true;
}
