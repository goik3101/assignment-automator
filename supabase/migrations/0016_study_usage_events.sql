-- 학습 도구(요약·플래시카드·퀴즈·가상 시험·AI 채팅·제작 전 질문)의 AI 호출 횟수 제한용 기록.
-- 추가만 한다(새 표 1개) — 기존 표·데이터는 건드리지 않는다. usage_events / learning_usage_events와 같은 패턴:
-- 서버가 service_role로만 읽고 쓰므로 RLS는 켜두고 정책은 주지 않는다.
--
-- actor_key: 로그인 사용자는 'user:<uuid>', 비로그인(게스트)은 'guest:<uuid>'.
-- 결과물·질문 내용은 저장하지 않는다(언제·누가·어떤 종류를 썼는지만 기록).
create table if not exists study_usage_events (
  id uuid primary key default gen_random_uuid(),
  actor_key text not null,
  kind text not null check (kind in ('chat', 'summary', 'flashcards', 'quiz', 'exam', 'exam_grade', 'questions')),
  created_at timestamptz not null default now()
);

create index if not exists idx_study_usage_actor_day on study_usage_events (actor_key, created_at desc);

alter table study_usage_events enable row level security;
