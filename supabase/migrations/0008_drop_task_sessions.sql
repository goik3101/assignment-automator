-- 0007에서 만든 다단계 세션(task_sessions/task_session_stages) 구조를 되돌린다.
-- "여러 번 나눠서 호출하고 그 사이 상태를 DB에 저장/전달"하는 방식 대신, 안내문
-- 분석 결과(요소가 여러 개인 다단계 과제 포함)를 한 번의 생성 호출에 전부 담아
-- 처리하는 방식으로 되돌아갔다 — 같은 컨텍스트 안에서 한 번에 쓰면 단계 사이에
-- 확정된 사실이 어긋나는 문제가 애초에 구조적으로 생기지 않는다(generate-essay.ts
-- 참고). 이 결정 배경은 PROGRESS.md에 남겨둠.
drop table if exists task_session_stages;
drop table if exists task_sessions;
