-- 피드백/문의에 이미지(화면 캡처) 첨부. 파일은 비공개 Storage 버킷에 두고,
-- 표에는 경로만 남긴다. 읽는 쪽은 관리자 라우트(service_role)뿐이라 RLS 정책을 더하지 않는다.
alter table feedback_submissions
  add column if not exists attachments jsonb not null default '[]'::jsonb;

insert into storage.buckets (id, name, public)
values ('feedback-attachments', 'feedback-attachments', false)
on conflict (id) do nothing;
