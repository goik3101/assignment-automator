import { getServiceClient } from "@/lib/supabase/service-client";
import { isFresh, validateCachedNotes, type CachedNotes } from "./research-cache-key";

// 조사 노트(검색으로 모은 공개 사실 + 근거 페이지)를 같은 수행평가를 받은 학생끼리 재사용한다 — 조사 호출(검색 요금 + 약 12~15초)이 두 번째 학생부터 사라진다.
// 표(research_notes_cache, 마이그레이션 0017)는 service_role 전용이며 user_histories·task_embeddings와 연결하지 않는다.
// 표가 아직 없으면 서버 메모리로 대신 둔다(인스턴스마다 따로라 적중률은 낮지만 동작은 같다).
const TTL_DAYS = Number(process.env.RESEARCH_CACHE_TTL_DAYS ?? 14);
const MEMORY_MAX = 200;
const memory = new Map<string, { notes: CachedNotes; at: number }>();

const enabled = () => process.env.RESEARCH_CACHE !== "off" && TTL_DAYS > 0;

function isMissingTable(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === "42P01" || err.code === "PGRST205" || (/research_notes_cache/.test(err.message ?? "") && /(not find|does not exist|schema cache)/i.test(err.message ?? ""));
}

/** 적중 횟수는 절감 효과를 재 보려는 용도라 실패해도 무시한다. */
function bumpHit(key: string) {
  try {
    void getServiceClient().rpc("research_cache_hit", { p_key: key }).then(() => undefined, () => undefined);
  } catch {
    /* 환경변수 없음 등 */
  }
}

export async function getCachedResearch(key: string | null, minFacts: number): Promise<CachedNotes | null> {
  if (!key || !enabled()) return null;
  const mem = memory.get(key);
  // 호출부가 노트에 값을 덧붙이므로(bookVerified) 공유 객체가 아니라 사본을 돌려준다.
  if (mem && isFresh(mem.at, TTL_DAYS)) {
    bumpHit(key);
    return structuredClone(mem.notes);
  }
  try {
    const { data, error } = await getServiceClient().from("research_notes_cache").select("notes, created_at").eq("cache_key", key).maybeSingle();
    if (error) {
      if (!isMissingTable(error)) console.error("[research cache] 조회 실패", error.message);
      return null;
    }
    if (!data || !isFresh(data.created_at as string, TTL_DAYS)) return null;
    const notes = validateCachedNotes(data.notes, minFacts);
    if (notes) {
      memory.set(key, { notes: structuredClone(notes), at: new Date(data.created_at as string).getTime() });
      bumpHit(key);
    }
    return notes;
  } catch (err) {
    console.error("[research cache] 조회 중 예외", err);
    return null;
  }
}

export async function putCachedResearch(key: string | null, notes: CachedNotes): Promise<void> {
  if (!key || !enabled()) return;
  if (memory.size >= MEMORY_MAX) memory.delete(memory.keys().next().value as string);
  memory.set(key, { notes, at: Date.now() });
  try {
    const { error } = await getServiceClient()
      .from("research_notes_cache")
      .upsert({ cache_key: key, notes, fact_count: notes.facts.length, created_at: new Date().toISOString(), hits: 0 }, { onConflict: "cache_key" });
    if (error && !isMissingTable(error)) console.error("[research cache] 저장 실패", error.message);
  } catch (err) {
    console.error("[research cache] 저장 중 예외", err);
  }
}
