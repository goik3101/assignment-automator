-- M4: 접근 제한(N3 일일 상한 스로틀링, N4 비로그인 1회 제한, 로그인 하루 2회 제한)에
-- 쓰는 경량 사용 기록. 결과물 텍스트는 담지 않는다 — "언제/누가(또는 어느 게스트가)
-- 생성을 요청했는지"만 기록하는 운영 로그다.
create table usage_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  guest_id uuid,
  event_type text not null check (event_type in ('generate', 'regenerate'))
);

create index idx_usage_events_created on usage_events (created_at);
create index idx_usage_events_user on usage_events (user_id, created_at);
create index idx_usage_events_guest on usage_events (guest_id, created_at);

alter table usage_events enable row level security;
-- 클라이언트가 직접 이 표를 읽거나 쓸 이유가 없다 (전부 서버가 service_role로
-- 기록/조회). RLS는 켜두고 정책은 주지 않아 anon/authenticated로는 접근 불가.
