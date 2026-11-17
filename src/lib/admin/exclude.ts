import { getServiceClient } from "@/lib/supabase/service-client";
import { excludePatterns, isExcludedEmail } from "./exclude-pure";

// 관리자 집계에서 뺄 계정(STATS_EXCLUDE_EMAILS). 이메일로 사용자 id를 찾아 두고(1분 캐시) 사용량 기록의 user_id와 맞춰 뺀다.
// 비어 있으면 아무것도 빼지 않는다.
let cache: { at: number; raw: string; ids: Set<string> } | null = null;

export function getExcludePatterns(): RegExp[] {
  return excludePatterns(process.env.STATS_EXCLUDE_EMAILS);
}

export async function getExcludedUserIds(): Promise<Set<string>> {
  const raw = process.env.STATS_EXCLUDE_EMAILS ?? "";
  const patterns = getExcludePatterns();
  if (patterns.length === 0) return new Set();
  if (cache && cache.raw === raw && Date.now() - cache.at < 60_000) return cache.ids;

  const ids = new Set<string>();
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await getServiceClient().auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`사용자 조회 실패: ${error.message}`);
    for (const u of data.users) if (isExcludedEmail(u.email, patterns)) ids.add(u.id);
    if (data.users.length < 1000) break;
  }
  cache = { at: Date.now(), raw, ids };
  return ids;
}
