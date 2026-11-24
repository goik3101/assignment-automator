-- 피드백에 개발자 답변. 답변은 관리자 라우트(service_role)가 쓰고, 이용자는 /api/feedback/mine이 본인(user_id) 것만 읽어 준다.
-- 익명 피드백(user_id 없음)에는 답변을 보여 줄 대상이 없으므로 답변도 달지 않는다. 새 RLS 정책은 더하지 않는다(이 표는 select 정책이 없다).
alter table feedback_submissions add column if not exists reply text;
alter table feedback_submissions add column if not exists replied_at timestamptz;
