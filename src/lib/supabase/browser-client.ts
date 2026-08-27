import { createBrowserClient } from "@supabase/ssr";

/** 클라이언트 컴포넌트에서 로그인/로그아웃을 트리거할 때 쓰는 브라우저용 클라이언트. */
export function getBrowserSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
