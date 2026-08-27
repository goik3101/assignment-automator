import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `환경변수 ${name}가 설정되어 있지 않습니다. .env.local 파일을 확인하세요 (.env.example 참고).`
    );
  }
  return value;
}

let _client: SupabaseClient | null = null;

/**
 * service_role 키를 쓰는 서버 전용 Supabase 클라이언트. RLS를 무시하고 접근한다.
 *
 * `clusters`/`task_embeddings`는 개인정보가 없고 클라이언트가 직접 접근할 이유가
 * 없어서 이 클라이언트로만 다룬다. `user_histories`처럼 사용자 세션이 필요한 테이블은
 * (M4에서 추가할) 사용자 컨텍스트 클라이언트를 따로 써야 한다 — 이 클라이언트로
 * user_histories를 다루면 RLS를 우회해버리니 주의.
 *
 * 반드시 서버 코드에서만 import할 것 (service_role 키가 클라이언트로 노출되면 안 됨).
 */
export function getServiceClient(): SupabaseClient {
  if (!_client) {
    _client = createClient(
      requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } }
    );
  }
  return _client;
}

/**
 * PostgREST는 pgvector의 `vector` 컬럼을 JSON 배열이 아니라 "[0.1,0.2,...]" 형태의
 * 문자열로 내려준다. 읽어올 때는 항상 이 함수로 파싱할 것.
 */
export function parsePgVector(value: unknown): number[] {
  if (Array.isArray(value)) return value as number[];
  if (typeof value === "string") {
    return value
      .replace(/^\[|\]$/g, "")
      .split(",")
      .map(Number);
  }
  throw new Error(`벡터 값을 파싱할 수 없습니다: ${JSON.stringify(value)}`);
}
