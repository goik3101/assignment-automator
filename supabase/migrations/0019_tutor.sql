-- AI 튜터(채팅으로 질문하고 글까지 쓰는 화면) 대화 저장용 스키마.
-- 기존 자동 작성 모드(user_histories / clusters / task_embeddings)·학습 모드와 완전히 분리된 새 표 2개만 추가한다 —
-- 튜터 대화가 결과물 임베딩·쏠림 통계에 섞이지 않게 그쪽과는 연결하지 않는다. 사진 원본은 저장하지 않는다.

create table if not exists tutor_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tutor_conversations_user on tutor_conversations (user_id, updated_at desc);

create table if not exists tutor_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references tutor_conversations(id) on delete cascade,
  -- RLS를 조인 없이 단순하게 걸기 위해 user_id를 함께 둔다.
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  -- 학생이 올린 사진에 적힌 글을 AI가 옮겨 적은 것. 이후 턴에서 사진을 다시 보내지 않고 이 글을 쓴다.
  attachment_text text,
  -- 답변에 붙은 출처 [{ n, title, url }]
  sources jsonb,
  -- AI가 학생에게 되물은 질문 { text, options[], allow_other } — 화면의 선택 버튼용
  question jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_tutor_messages_conversation on tutor_messages (conversation_id, created_at);

alter table tutor_conversations enable row level security;
alter table tutor_messages enable row level security;

create policy "tutor_conversations_select_own" on tutor_conversations for select using (auth.uid() = user_id);
create policy "tutor_conversations_insert_own" on tutor_conversations for insert with check (auth.uid() = user_id);
create policy "tutor_conversations_update_own" on tutor_conversations for update using (auth.uid() = user_id);
create policy "tutor_conversations_delete_own" on tutor_conversations for delete using (auth.uid() = user_id);

create policy "tutor_messages_select_own" on tutor_messages for select using (auth.uid() = user_id);
create policy "tutor_messages_insert_own" on tutor_messages for insert with check (auth.uid() = user_id);
create policy "tutor_messages_delete_own" on tutor_messages for delete using (auth.uid() = user_id);

-- 하루 횟수 제한 기록(study_usage_events)이 'tutor'를 받도록 허용 종류를 넓힌다(기존 종류는 그대로 + 코드가 쓰는데 빠져 있던 analyze·expected_questions 포함).
-- 이 문장만 적용하지 않아도 튜터는 동작한다(서버 메모리 카운터가 대신 센다).
-- 0016이 아직 적용되지 않아 그 표가 없으면 이 부분만 건너뛴다(위의 새 표 생성이 같이 취소되지 않게).
do $$
begin
  if to_regclass('public.study_usage_events') is not null then
    alter table study_usage_events drop constraint if exists study_usage_events_kind_check;
    alter table study_usage_events
      add constraint study_usage_events_kind_check
      check (kind in ('chat', 'summary', 'flashcards', 'quiz', 'exam', 'exam_grade', 'questions', 'analyze', 'expected_questions', 'tutor'));
  end if;
end $$;
