-- 관리자 대시보드의 "웹사이트 방문" 그래프용. 새 표 1개만 추가한다 — 기존 표·데이터는 건드리지 않는다.
-- 방문자(브라우저 세션)가 사이트를 열면 한 시간에 한 줄. 서버가 service_role로만 읽고 쓰므로 RLS는 켜두고 정책은 주지 않는다.
--
-- 개인정보 없음: IP·UA·이메일·사용자 id는 저장하지 않는다. visitor는 (IP, UA, 한국 날짜)를 서버 비밀키로 해시해 앞부분만 자른 값이라
-- 같은 날 같은 사람을 한 명으로 세는 데만 쓰이고, 날짜가 바뀌면 다른 값이 되어 날을 넘어 추적할 수 없다.
create table if not exists site_visits (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  visitor text not null,
  hour_bucket timestamptz not null,   -- 방문 시각을 정시로 내린 값(UTC). 같은 방문자의 같은 시간대는 한 줄만 남는다.
  unique (visitor, hour_bucket)
);

create index if not exists idx_site_visits_hour on site_visits (hour_bucket);

alter table site_visits enable row level security;
