-- 추천 다양성 시스템: 책/통계/사례 등 "추천 항목"이 반복되는 현상을 줄이기 위한
-- 이력 테이블. 실제로 발견된 문제: 서로 다른 주제("진로 고민", "친구가 없어
-- 느끼는 고립감")에 연속으로 헤르만 헤세의 『데미안』이 추천됨 — 검증(grounding)
-- 하기 쉬운 소수의 유명한 항목으로 추천이 수렴하는 구조적 편향으로 추정.
--
-- 주의: 이 테이블은 기존 `clusters`/`task_embeddings`(안내문 임베딩 기반 클러스터당
-- 전체 결과물 유사도 — M2/M3, 기획서 6-0/6-2)와는 완전히 다른 축이다. 저 둘은
-- "결과물 전체가 의미적으로 비슷한가"를 다루고, 이 테이블은 "똑같은 책 제목이
-- 문자 그대로 반복되는가"를 다룬다 — 절대 같은 값/용도로 섞지 말 것
-- (src/lib/recommendations/recommendation-diversity.ts 상단 주석도 참고).
create table recommendation_history (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- 새 추천 기능이 추가되면 이 목록에 값을 더 추가할 것(마이그레이션 필요).
  category text not null check (category in ('book', 'statistic', 'case_example')),
  -- 표시용 원문 그대로. 정규화된 비교는 애플리케이션 레벨에서
  -- normalizeBookTitleKey() 등으로 처리(겹낫표/공백 차이 흡수).
  item_name text not null,
  user_id uuid references auth.users(id) on delete set null,
  -- usage_events(0004)와 동일하게 비로그인 학생도 기록한다.
  guest_id uuid,
  -- identifyCluster()가 이미 계산하는 "안내문 형식" 단위 클러스터 — 새 주제
  -- 분류기를 따로 만들지 않고 재사용한다. 학생별 세부 고민 차이(예: "진로" vs
  -- "외로움")까지는 구분하지 못하므로 참고용이고, 이 버그의 핵심 방어선은
  -- category 전체(전 주제) 기준 최근 빈도다.
  cluster_id uuid references clusters(id) on delete set null,
  -- 참고/분석용 원문 주제 텍스트(coreTaskInfo.topic). 조회 조건으로는 잘 안 쓴다.
  topic text,
  -- 추천 근거로 쓰인 검색 출처 등(선택).
  source text,
  submission_id uuid
);

create index idx_recommendation_history_category_item
  on recommendation_history (category, item_name, created_at desc);
create index idx_recommendation_history_user
  on recommendation_history (user_id, category, created_at desc);
create index idx_recommendation_history_cluster
  on recommendation_history (cluster_id, category, created_at desc);

alter table recommendation_history enable row level security;
-- usage_events와 동일 패턴: user_id를 담지만 클라이언트가 이 표를 직접 쿼리할
-- 이유가 없다(항상 서버가 service_role로 기록/조회) — RLS는 켜두고 정책은
-- 주지 않아 anon/authenticated로는 접근 불가.
