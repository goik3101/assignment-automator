import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_ACCOUNT_EMAIL, ADMIN_COOKIE_NAME, verifyAdminSessionToken } from "@/lib/admin/session-token";

// Supabase SSR 공식 패턴: 토큰이 만료되기 전에 proxy에서 세션을 갱신해서
// Server Component/Route Handler가 항상 최신 세션을 읽을 수 있게 한다.
// (server-client.ts의 setAll은 Server Component에서 실패할 수 있어서, 실제 갱신은
// 여기서 책임진다.)
// 주의: Next.js 16부터 이 파일 이름이 middleware.ts에서 proxy.ts로 바뀌었다
// (export 함수명도 middleware → proxy). CLAUDE.md 상단 "This is NOT the Next.js
// you know" 경고가 가리키는 바로 그 종류의 breaking change.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    // Supabase가 아직 설정 안 된 상태(M1 단계)에서도 앱이 죽지 않게 통과시킨다.
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const { data: claimsData } = await supabase.auth.getClaims();

  // 관리자 로그인은 8시간 뒤 끝난다. 관리자 쿠키만 만료되고 예약 계정의 Supabase 세션이 남으면 "관리자 대시보드만 사라진 채
  // 관리자 계정으로 로그인된" 어중간한 상태가 되므로, 예약 계정 세션인데 유효한 관리자 쿠키가 없으면 로그인 자체를 끊는다.
  // scope local: 이 브라우저의 세션만 지운다(다른 기기의 관리자 세션은 각자 만료 시각에 끝난다).
  if (claimsData?.claims?.email === ADMIN_ACCOUNT_EMAIL) {
    let adminValid = false;
    try {
      adminValid = verifyAdminSessionToken(request.cookies.get(ADMIN_COOKIE_NAME)?.value);
    } catch {
      // 서명 키가 없는 등의 설정 문제면 유효하지 않은 것으로 본다
    }
    if (!adminValid) {
      await supabase.auth.signOut({ scope: "local" });
      response.cookies.delete(ADMIN_COOKIE_NAME);
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
