-- 같은 수행평가를 받은 학생끼리 재사용하는 "조사 노트"(검색으로 모은 공개 사실 문장 + 근거 페이지 주소) 캐시.
-- 추가만 한다(새 표 1개 + 함수 1개) — 기존 표·데이터는 건드리지 않는다.
--
-- cache_key: (수행평가 식별자 cluster_id, 과목, 선정된 책/대상, 학생 지침)의 해시. 학생·계정 정보는 키에도 값에도 없다.
-- user_histories·task_embeddings와는 FK로 연결하지 않는다(개인정보 분리 원칙).
-- 서버가 service_role로만 읽고 쓰므로 RLS는 켜두고 정책은 주지 않는다. 오래된 행은 코드가 TTL로 무시한다.
create table if not exists research_notes_cache (
  cache_key text primary key,
  notes jsonb not null,
  fact_count int not null default 0,
  hits int not null default 0,
  created_at timestamptz not null default now(),
  last_hit_at timestamptz
);

create index if not exists idx_research_notes_cache_created on research_notes_cache (created_at desc);

alter table research_notes_cache enable row level security;

-- 적중 횟수를 원자적으로 올린다(절감 효과 측정용).
create or replace function research_cache_hit(p_key text) returns void
language sql security definer set search_path = public as $$
  update research_notes_cache set hits = hits + 1, last_hit_at = now() where cache_key = p_key;
$$;

revoke all on function research_cache_hit(text) from public, anon, authenticated;
