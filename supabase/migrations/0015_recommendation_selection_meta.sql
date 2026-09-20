-- 자동 선정 시스템 개편용 메타 컬럼 (추가만 함 — 기존 행은 삭제·수정하지 않는다).
--
-- is_test: 테스트 실행이 실제 추천 통계에 섞이지 않게 표시한다. 조회 쪽은 is_test = true 행을 빈도 계산에서 제외한다.
--          기존 행은 전부 false(=실제 데이터로 간주)로 남는다 — 이미 섞여 있는 테스트 행의 정리는
--          별도 검토 후 사용자가 결정한다(자동으로 건드리지 않음).
-- display_name: 화면에 보이는 이름(예: "마틴 루터 킹 주니어"). item_name은 중복 판정용 canonical key로 쓴다.
-- semantic_group: 같은 탐구 대상 계열(예: "유체역학-베르누이")을 묶는 라벨. 문자열이 달라도 의미가 가까우면 반복으로 본다.
--
-- 과제 구분은 기존 cluster_id(안내문 임베딩 클러스터)를 그대로 쓴다 — 새 컬럼을 만들지 않는다.
alter table recommendation_history add column if not exists is_test boolean not null default false;
alter table recommendation_history add column if not exists display_name text;
alter table recommendation_history add column if not exists semantic_group text;

create index if not exists idx_recommendation_history_scope
  on recommendation_history (cluster_id, category, created_at desc)
  where is_test = false;
