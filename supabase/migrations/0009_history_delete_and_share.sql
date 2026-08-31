-- 히스토리 삭제 기능 + 결과 공유 링크 기능을 위한 스키마 변경.

-- user_histories에는 지금까지 select/insert/update 정책만 있고 delete 정책이
-- 없었다 — 즉 세션 클라이언트(anon 키 + RLS)로는 자기 히스토리조차 지울 수
-- 없었다. 삭제 버튼을 붙이려면 이 정책이 먼저 있어야 한다.
create policy "user_histories_delete_own"
  on user_histories for delete
  using (auth.uid() = user_id);

-- 공유 링크: null이면 "공유 안 함". 학생이 "링크 공유"를 누르는 순간 값이
-- 채워진다. unique라서 토큰만 알면 그 행 하나만 정확히 찾을 수 있다 —
-- capability URL 방식(토큰 자체가 열쇠)이라 별도 공개 열람용 RLS 정책은
-- 추가하지 않는다. 공개 페이지(/share/[token])는 서버에서 service-role로
-- "이 토큰과 정확히 일치하는 행"만 조회하고, 그마저도 화면 표시에 필요한
-- 컬럼(raw_text_result/title/subject/output_type/created_at)만 골라서
-- 반환한다 — user_id 등 계정 식별 정보는 응답에 포함하지 않는다.
alter table user_histories add column share_token uuid unique;

create index idx_user_histories_share_token on user_histories (share_token) where share_token is not null;
