-- 실제로 발견된 버그(2026-09-16): "인권 선구자 탐구" 같은 인물 선정형 과제에서
-- 서로 다른 계정인데도 같은 인물(방정환)이 반복 선정됨. recommendation_history는
-- 지금까지 'book'/'statistic'/'case_example'만 추적해서, "책 제목처럼 특정
-- 항목이 문자 그대로 반복되는지" 축(0010 마이그레이션 참고)이 인물/사건 선정에는
-- 아예 적용되지 않고 있었다 — 책 추천 편향을 잡을 때 쓴 것과 동일한 메커니즘을
-- 'subject'(자유 선정 대상: 인물/사건/자료 등, generate-essay.ts의
-- confirmed_subject) 카테고리로 확장한다.
alter table recommendation_history drop constraint recommendation_history_category_check;
alter table recommendation_history add constraint recommendation_history_category_check
  check (category in ('book', 'statistic', 'case_example', 'subject'));
