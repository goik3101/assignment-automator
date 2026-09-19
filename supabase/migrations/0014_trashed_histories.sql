-- 휴지통(Figma 사이드바 "휴지통"): 자동 작성 모드의 결과물을 바로 지우지 않고 휴지통으로
-- 옮겼다가 복원하거나 영구 삭제할 수 있게 한다. user_histories 테이블/컬럼은 건드리지 않고
-- "휴지통에 들어간 제출(submission)" 목록만 별도 테이블로 둔다 — 이 표가 없어도(미적용
-- 상태) 기존 동작(삭제 = 완전 삭제)으로 폴백하도록 서버 코드가 짜여 있다.
--
-- submission_id 기준으로 기록한다: 같은 제출의 재생성 버전이 user_histories에 여러 행으로
-- 쌓이므로(is_current), 행 id 기준이면 재생성 후 휴지통에서 빠져나와 다시 나타난다.
-- user_histories.submission_id는 unique가 아니라서 FK는 걸지 않는다.
create table trashed_histories (
  submission_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  trashed_at timestamptz not null default now()
);

create index idx_trashed_histories_user on trashed_histories (user_id, trashed_at desc);

alter table trashed_histories enable row level security;

create policy "trashed_histories_select_own" on trashed_histories for select using (auth.uid() = user_id);
create policy "trashed_histories_insert_own" on trashed_histories for insert with check (auth.uid() = user_id);
create policy "trashed_histories_delete_own" on trashed_histories for delete using (auth.uid() = user_id);
