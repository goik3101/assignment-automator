-- 관리자가 작성/삭제하는 공지사항. 메인 화면(수행평가 생성 화면) 구석에
-- 가장 최근 글 하나만 노출한다 — 목록형 게시판이 아니라 "지금 떠 있는
-- 공지 한 줄" 개념이라 is_active 같은 상태 플래그 없이, 글을 올리면
-- INSERT, 내리고 싶으면 그냥 그 행을 DELETE하는 단순한 모델로 둔다.
create table announcements (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  message text not null
);

alter table announcements enable row level security;

-- 비로그인 학생도 메인 화면에서 공지를 봐야 하므로, 이 테이블만은 예외적으로
-- 누구나 읽을 수 있게 연다(작성/삭제는 admin 라우트가 service_role로 처리 —
-- 이 정책들과 무관하게 우회됨. anon/authenticated에는 insert/update/delete
-- 정책을 아예 안 줘서 클라이언트가 직접 쓰지는 못한다).
create policy "announcements_select_any"
  on announcements for select
  using (true);
