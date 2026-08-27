import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`환경변수 ${name}가 설정되어 있지 않습니다. .env.local을 확인하세요.`);
  }
  return value;
}

/**
 * 로그인 세션(쿠키)을 읽는 서버용 Supabase 클라이언트. Route Handler/Server
 * Component에서 "지금 로그인한 사용자가 누구인지" 확인할 때 쓴다.
 * anon 키를 쓰기 때문에 RLS가 그대로 적용된다 — user_histories는 이 클라이언트로
 * 다뤄야 자기 것만 보이는 게 보장된다. clusters/task_embeddings처럼 RLS 없이
 * 전체 접근이 필요하면 service-client.ts를 쓸 것.
 */
export async function getServerSupabase() {
  const cookieStore = await cookies();

  return createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component에서는 쿠키를 못 쓸 수 있음 — 미들웨어가 세션 갱신을
            // 대신 처리하므로 여기서는 조용히 무시해도 된다.
          }
        },
      },
    }
  );
}
