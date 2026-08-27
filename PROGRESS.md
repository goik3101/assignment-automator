# PROGRESS — 다단계 세션 (Single Source of Truth) 작업

이 문서는 세션이 끊겨도 다음 세션에서 바로 이어갈 수 있도록 계속 갱신한다.
새 세션에서 이 작업을 이어받으면: 이 파일 + `git log`부터 읽을 것.

## 배경 (요약)

"고민쓰기 → 책처방전 → 편지" 같은 여러 단계로 이어지는 수행평가에서, 각 단계
API 호출이 이전 단계의 확정된 사실(고민 원문, 처방한 책 제목/저자 등)을 몰라서
매번 다르게 지어내는 문제. 원인: studed에는 애초에 "여러 단계가 이어지는 세션"
개념 자체가 없었음.

## 설계 결정

`assessment.worry_text`/`book_title` 같은 과제 전용 필드명 대신, 범용 구조로
일반화함 (studed는 모든 과목·모든 과제 유형을 다루는 서비스라서):

- `task_sessions`: 하나의 다단계 수행평가 세션 (subject, core_task_info 스냅샷)
- `task_session_stages`: 세션 안의 각 단계. `output_text`(본문) + `output_facts`
  (jsonb — 다음 단계로 넘길 핵심 사실. 과제마다 키가 다름: 책처방전이면
  `{book_title, book_author, quote}` 등)

다음 단계 생성 시, 이전 모든 단계를 **매번 DB에서 다시 SELECT**해서 프롬프트에
통째로 주입한다 (대화 맥락/프론트 상태에 의존하지 않음).

## 작업 순서 (하나 끝날 때마다 커밋)

- [x] 0. 베이스라인 커밋 (M1~M9 기존 작업 전체) — `60f7a40`
- [x] 1. DB 스키마 + 세션/스테이지 라이브러리 — `36bb725`
- [x] 2. API 라우트 (`POST /api/sessions`, `POST /api/sessions/{id}/stages`) +
      구조화된 JSON 출력(output_text/output_facts 분리, responseSchema 강제) +
      사후 검증(불일치 시 1회 재시도 → 그래도 실패하면 422 에러) — **이번 커밋**
- [x] 3. (2번에 포함됨) 그라운딩 재시도는 기존 `withGeminiRetry`(최대 2회 재시도)
      재사용으로 이미 충족.
- [ ] 4. 프론트엔드: 세션 기반 다단계 플로우 UI (지금은 API만 존재, 화면 없음 —
      범위가 크니 이건 사용자에게 UI 형태를 다시 확인받고 진행할 것)
- [ ] 5. "배포 환경(크롬)"에서 출처가 실패한다던 리포트 — 로컬에서는 정상 작동만
      확인됐고, 배포 여부를 아직 확인 못 받음. 다시 물어볼 것.

## 실제 검증 완료 (2026-08-28, 로그인 유저로 실제 API 호출)

**1차 테스트** (고민쓰기→책처방전→편지, 친구=민서, 책=《아무도 상처받지
않는 대화법》/하야시 겐타로): 3단계 내내 이름·에피소드·책 정보 100% 일치.
편지가 1차시의 "매점 앞 복도" 에피소드를 정확히 다시 언급함.

이 테스트에서 버그 하나 발견 → 바로 수정: 3단계가 실제로는 검색을 안 했는데
(sources=0) 이전 단계에 있던 "[1][2]" 각주 모양을 흉내 내서 근거 없는 각주가
붙는 문제. `serializePriorStages()`가 이전 단계 텍스트를 주입할 때 각주를
지우도록 수정 + `generateStage()`에 "출처 0개면 각주도 지운다" 안전장치 추가.

**2차 테스트** (수정 후 재검증, 고민쓰기→책처방전→편지, 진로 고민, 책=《데미안》
/헤르만 헤세): 3단계 내내 일치, 이번엔 3단계에 근거 없는 각주 없음 확인
(`hasBracketCitation: false`). 그라운딩도 단계별로 적절히 동작함 (1단계 개인
서술 0개 출처 / 2단계 책 정보 검색 3개 출처 / 3단계 새 검색 불필요 0개 출처 —
전부 타당함).

두 테스트 다 테스트 계정·데이터는 정리 완료.

## 지금까지 변경한 파일

- `supabase/migrations/0007_task_sessions.sql`
- `src/lib/sessions/task-sessions.ts` — createTaskSession, getTaskSession,
  listStages, addStage, serializePriorStages, mergeEstablishedFacts,
  findFactMismatches
- `src/lib/gemini/generate-stage.ts` — 2단계 생성(그라운딩 자유텍스트 →
  구조화 변환), 각주 안전장치
- `src/app/api/sessions/route.ts` — 세션 생성
- `src/app/api/sessions/[sessionId]/stages/route.ts` — 단계 생성 +
  사후검증/재시도

## 다음에 할 일

**아직 이 기능을 실제로 쓸 수 있는 화면이 없다** — API만 존재. 프론트엔드
작업(4번)을 어떤 형태로 할지(기존 단발성 플로우와 별개 페이지? 기존 확인폼에
"다단계 과제"를 감지해서 자동 분기?) 사용자에게 확인받고 진행할 것.
