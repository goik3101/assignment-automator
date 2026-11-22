# 폴더 구조 (옛 상세 지도)

CLAUDE.md에서 옮겨 온 원문이다(2026-11-22, CLAUDE.md를 250줄 안으로 줄이려고). 일부(M1·F번호·마이그레이션 0001~0004)는 초기 기록이라 지금과 다르다 — 현재 구조는 CLAUDE.md의 "폴더 구조(요약)"와 실제 폴더를 본다.

```
src/
  app/
    page.tsx                    -- M1: 단일 플로우 페이지 (업로드→확인폼→결과)
    api/tasks/
      analyze/route.ts          -- F1~F3: 안내문 분석
      generate/essay/route.ts   -- F4: 완성 원고 생성
      generate/plan/route.ts    -- F5: 실행 계획 생성
      [submissionId]/regenerate/route.ts -- F6: 재생성 (로그인 하루 1회, user_histories에서 원본 조회)
      expected-questions/route.ts -- 9-3: 예상 질문 (구술·발표형만, 로그인/제한 없음)
    histories/[id]/memo-note/route.ts -- F8/9-2: 암기노트 (생성 후 user_histories.memo_note에 캐시)
    admin/
      login/route.ts             -- F12: 관리자 ID·비밀번호 로그인 (실패 반복 시 IP 잠금)
      logout/route.ts
      stats/route.ts             -- 관리자 통계 (11-6)
  admin/
    login/page.tsx                -- 관리자 ID·비밀번호 입력 화면
    page.tsx                      -- 관리자 대시보드 (Server Component, 쿠키 직접 검증)
  components/
    AssignmentFlow.tsx          -- M1 핵심 플로우 (클라이언트 컴포넌트)
    ResultPanel.tsx             -- 원고/계획 결과 렌더링
    Logo.tsx                     -- 워드마크/아이콘 로고. public/studed_logo_*.png,
                                     public/studed_icon_black_transparent.png 사용.
                                     라이트/다크는 prefers-color-scheme로 자동 전환
                                     (아이콘은 흰색 에셋이 없어 dark:invert로 대체 —
                                     흰색 아이콘 받으면 워드마크처럼 별도 파일로 교체할 것)
  lib/
    gemini/
      client.ts                 -- Gemini 클라이언트 + 모델 이름 (환경변수 기반)
      prompts.ts                -- AI 말투 방지 / 저작권 규칙 (공유 프롬프트 조각)
      analyze.ts                -- 이미지·텍스트 → 구조화 분석 (Flash-Lite)
      generate-essay.ts         -- 완성 원고 생성 (Flash + 검색 그라운딩)
      generate-plan.ts          -- 실행 계획 생성 (2단계: 그라운딩 텍스트 → JSON 변환)
      citations.ts              -- 출처 각주 삽입, 출처 목록 구성
      embeddings.ts             -- 과제 임베딩(embedForClustering) / 결과물 임베딩(embedForDiversity) — 절대 혼용 금지
    clusters/
      core-task-text.ts         -- core_task_info → 과제 임베딩용 텍스트 직렬화
      identify-cluster.ts       -- M2: 클러스터 식별 (생성 이전에 반드시 먼저 호출)
      avoidance.ts               -- M3: 비율 기반 억제 (라플라스 스무딩 + 3개월 롤링윈도우)
      save-result-embedding.ts  -- M2/M3: 결과물 임베딩 저장 + 재생성 시 버전 관리(is_current)
    essay/                        -- 완성 원고 품질 규칙(순수 함수, alias import 없음). 파일별 역할 지도는 docs/essay-pipeline-notes.md 의 "A. essay/ 파일 지도"
    selection/
      selection-need.ts          -- 이 과제가 "학생이 대상을 골라야 하는 과제"인지 판정(순수 함수). 낱말만 보면 "설정하고"·"선정기준액"까지 걸린다 — 고르라는 말 앞에 대상 낱말이 있을 때만 참. SELECTION_TRIGGER=legacy로 예전 규칙
      student-topic.ts           -- 학생이 지침에 적은 주제·대상 찾기 + 말꼬리 떼기(cleanSubjectName)
    links/
      validate-sources.ts       -- 출처 링크 HTTP 상태 검증 (N6)
    admin/
      session.ts                  -- 관리자 세션 쿠키 서명/검증 (HMAC, ADMIN_SESSION_SECRET 또는 ADMIN_LOGIN_PASSWORD를 키로 사용)
      lockout.ts                  -- 로그인 실패 반복 시 IP 잠금
      stats.ts                    -- 대시보드 집계 쿼리(기존 지표)
      dashboard.ts / dashboard-pure.ts -- 관리자 대시보드 데이터(사용자·생성·AI 비용/오류·보안 점검). pure는 alias import 없는 순수 함수(테스트용)
      ai-usage-log.ts             -- AI 요청 1건을 ai_usage_log(마이그레이션 0018)에 기록. 표가 없으면 조용히 건너뜀. routeUsage가 호출
    supabase/
      service-client.ts         -- service_role 키 서버 전용 클라이언트 (clusters/task_embeddings/usage_events용, RLS 무시)
      server-client.ts          -- 세션이 실린 서버 클라이언트 (user_histories용, RLS 그대로 적용)
      browser-client.ts         -- 클라이언트 컴포넌트용 (로그인/로그아웃 트리거)
      use-auth.ts                -- 로그인 상태 구독 훅
    auth/
      identity.ts                -- 요청이 로그인 사용자인지 게스트인지 판별 (게스트 쿠키 발급 포함)
    usage/
      throttle.ts                 -- N3(전체 상한)·N4(비로그인 1회)·11-3(로그인 하루 2회) 검사
    turnstile/
      verify.ts                   -- Cloudflare Turnstile 서버 검증
    histories/
      save-history.ts             -- user_histories 저장 (반드시 세션 클라이언트로 호출)
  types/
    task.ts                     -- 도메인 타입 (AnalyzeResult, EssayResult, PlanResult 등)
supabase/
  migrations/
    0001_init.sql                -- clusters / cluster_match_logs / task_embeddings / user_histories / user_settings
    0002_match_cluster.sql       -- 클러스터 최근접 매칭 RPC (pgvector 코사인 유사도)
    0003_cluster_saturation.sql  -- 클러스터 쏠림도 계산 RPC (avg() 집계, 6-2 비율 억제용)
    0004_usage_events.sql        -- 접근 제한용 사용 기록 (M4)
docs/
  planning.md                    -- 원본 기획서 전문 (의사결정 근거)
```

