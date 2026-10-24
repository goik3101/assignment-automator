-- 관리자 대시보드용 AI 요청 기록(오류 수·실제 AI 사용량·비용 그래프). 새 표 1개만 추가한다 — 기존 표·데이터는 건드리지 않는다.
-- AI 요청 하나(분석·원고·계획·재생성·공부 도구)당 한 줄. 서버가 service_role로만 읽고 쓰므로 RLS는 켜두고 정책은 주지 않는다.
--
-- 개인정보 없음: 사용자·게스트 id, 이메일, 프롬프트·응답 본문, 학생 입력은 저장하지 않는다(언제·어떤 종류·얼마나 썼는지만).
-- 기록 대상: AI 호출이 있었던 요청, 서버 오류(5xx), 횟수 제한에 걸린 요청(429).
create table if not exists ai_usage_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  route text not null,                 -- analyze / essay / plan / regenerate / studyChat 등(routeUsage 이름)
  status integer not null,             -- 응답 HTTP 상태
  ok boolean not null,                 -- 서버 오류(5xx)나 예외 없이 끝났는가
  models text,                         -- 쓴 모델 이름(쉼표로 이음)
  calls integer not null default 0,    -- 모델 호출 수
  failed_calls integer not null default 0,
  search_calls integer not null default 0,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd numeric(10, 5) not null default 0,  -- 가격표 기준 추정 비용(lib/llm/usage.ts)
  wall_ms integer not null default 0   -- 요청 전체 걸린 시간
);

create index if not exists idx_ai_usage_log_created on ai_usage_log (created_at desc);
create index if not exists idx_ai_usage_log_route on ai_usage_log (route, created_at desc);

alter table ai_usage_log enable row level security;
