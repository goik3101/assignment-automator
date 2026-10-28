# studed

전국 고등학생 대상 수행평가 자동화 서비스. 수행평가 안내문 사진을 올리면
산출물 종류(글로 그대로 제출 가능한 것 / 외부 툴로 제작해야 하는 것)를 자동 판별해
완성된 원고 또는 실행 계획을 실제 검색 출처와 함께 생성한다.

핵심 차별점: 전국 단위로 학생들의 결과물이 소수 소재로 쏠리지 않도록
임베딩 기반으로 자동 분산시키고, AI 특유의 문체를 제거하고, 지어낸 출처가 아닌
실시간 검색 기반 실제 출처를 제공한다.

전체 기획 배경과 의사결정 근거는 `docs/planning.md`를 참고할 것
(기술적으로 애매한 부분이 있으면 그 문서의 해당 챕터를 먼저 확인).

## 기술 스택

| 영역 | 선택 |
|---|---|
| 프론트엔드 | Next.js (App Router, TypeScript, Tailwind CSS v4) |
| 백엔드 | Next.js Route Handlers (`src/app/api/**/route.ts`) |
| DB + 인증 | Supabase (PostgreSQL + pgvector + 매직링크 인증) |
| AI | OpenAI Responses API(`LLM_PROVIDER=openai`, `src/lib/llm/`이 유일한 입구) — Gemini 제공자도 남아 있음. 모델 이름은 전부 `.env`로 분리 |
| 봇 방지 | Cloudflare Turnstile (M4에서 연동) |
| 호스팅 | Vercel Pro |

이 조합을 고른 이유: 1인 개발 + MVP 단계라 프론트-백엔드-DB-인증-호스팅을
최대한 하나의 생태계로 묶어 관리 부담을 줄이는 것이 최우선이었음.

## 코딩 컨벤션

- **두 종류의 임베딩을 절대 같은 함수/변수/컬럼에 섞지 말 것** — 이 프로젝트에서 가장
  중요한 규칙. `과제 임베딩`(안내문 core_task_info 기반, 클러스터 매칭 전용, DB에 영구
  저장하지 않음)과 `결과물 임베딩`/`content_embedding`(학생이 실제로 받은 완성원고·
  계획서 기반, `task_embeddings`에 영구 저장, 겹침방지·MMR용)은 이름부터 명확히
  구분한다. 함수명은 `embedForClustering(...)` vs `embedForDiversity(...)`처럼
  구분해서 짓는다. (배경: `docs/planning.md` 6-0, 10, 19번 챕터)
- `user_histories`(개인정보 O)와 `task_embeddings`(개인정보 X)는 **FK로 절대 연결하지
  않는다**. 두 값에 같은 `submission_id`가 존재하더라도 코드에서 JOIN하거나 나란히
  조회하는 로직을 만들지 않는다.
- Gemini 모델 이름은 하드코딩하지 않고 항상 `src/lib/gemini/client.ts`의
  `GEMINI_MODELS`를 통해 가져온다 (`.env`의 `GEMINI_MODEL_*` 값 사용). 모델이
  바뀌면 코드가 아니라 환경변수만 바꾸면 되게 유지할 것.
- AI 생성 프롬프트(완성 원고/실행 계획)에는 항상 `src/lib/gemini/prompts.ts`의
  `ANTI_AI_TONE_RULES`(AI 말투 방지)를 포함시킨다. 새 문체 규칙이 필요하면
  이 파일 하나만 고치면 전체에 반영되게 유지한다.
- Gemini Search Grounding의 `groundingSupports[].segment` 오프셋은 **UTF-8 바이트
  단위**다. 한글이 섞인 문자열에 삽입할 때는 반드시 `Buffer`로 바이트 단위 삽입을
  하고(`src/lib/gemini/citations.ts` 참고), JS 문자열 인덱스로 다루지 않는다.
- 서버 전용 비밀키(`GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` 등)는 `NEXT_PUBLIC_`
  접두사를 붙이지 않는다. 클라이언트 컴포넌트에서 직접 Gemini를 호출하지 않는다 —
  항상 Route Handler를 거친다.
- 코드 주석은 "왜"가 비직관적일 때만 짧게 남긴다 ("무엇"은 코드 자체로 설명되게).

## 폴더 구조

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
    essay/                        -- 완성 원고 품질 규칙(순수 함수, alias import 없음): deliverable(신문 등 산출물 형식·참고목록/작업설명 제거),
                                     length-plan(단계 역할별 분량 가이드), form-rules(글 종류별 작성 방식), source-select(출처 2~3개로 정리),
                                     claim-check(문장↔출처 페이지 대조), coverage·repetition(누락·반복 검사), excerpt-need(원문 구절 요구 여부), research-notes(조사→글쓰기 사실 노트), research-cache(+key: 같은 수행평가 학생끼리 조사 노트 재사용, 마이그레이션 0017),
                                     quality-flags(품질 개선 스위치 ESSAY_QUALITY_FIXES=off로 되돌림), prompt-scope(과제에 해당할 때만 공통 규칙 블록 포함), opinion-citations(감상 문장 각주 제거),
                                     form-requirements·form-repair(안내문의 개수 조건 — 8장면·N문장·N문단 — 을 프롬프트에 전하고 생성 뒤 코드로 세어 어긴 단계만 한 번 보완. FORM_REQUIREMENTS=off로 되돌림)
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

## 화면·학습 도구 구조 (2026-10 개편)

- 디자인 토큰은 `src/app/globals.css`(검정/회색 단색, `bg-surface`·`bg-raised`·`border-border-strong`·`text-faint`·`text-danger`). 폰트는 Pretendard Variable. 아이콘은 이모지가 아니라 `lucide-react`만 쓴다. 공통 모달/버튼은 `src/components/ui/`.
- 홈(`components/home/HomeDashboard.tsx`): AI 모드 결과물과 학습 모드 과제를 한 격자로 보여주고, 아래 고정 입력창(`components/chat/ChatDock.tsx`)으로 새 안내문·기존 과제에 질문한다. "새 창작물" 모달은 `components/creation/NewCreationModal.tsx`(사진/텍스트 → 분석 → AI가 만들어줘요/직접 작성할게요 → AI면 제작 전 질문). `/learning` 목록은 홈으로 리다이렉트된다.
- 학습 도구(요약·플래시카드·퀴즈·가상 시험·AI 채팅): UI는 `components/study/`(결과물 상세는 오른쪽 레일, 학습 모드는 "공부 도구" 서랍), API는 `/api/study/*`·`/api/chat`. **과제 내용은 클라이언트가 보낸 본문이 아니라 id만 받아 서버가 RLS 세션으로 직접 읽는다**(`lib/study/context.ts`). 종류별 하루 횟수 제한은 `lib/study/usage.ts`(`study_usage_events`, 마이그레이션 0016 — 미적용이면 서버 메모리로 대신 센다). 테스트 가능한 순수 함수는 alias import 없는 파일(`context-pure.ts`·`turns.ts`·`quiz-validate.ts`·`questions-pure.ts`)에 둔다.
- 제작 전 질문(`/api/tasks/questions`, `lib/questions/`): 질문은 한 번에 하나씩, 개수 상한(빠르게 2/나에게 맞추기 4)은 모델이 아니라 코드가 강제한다. 개인 경험은 지어내지 않고 학생이 "나중에 직접 쓸게요"를 고르면 빈칸으로 남긴다. 모드는 브라우저에 저장(`lib/ui/ai-pref.ts`).

## 현재 작업 목표와 작업 규칙

- **최종 목표:** 과제 생성 시간 30초 이내 + 글 품질·출처 정확도·학생별 결과물 다양성 유지 + 불필요한 API 호출/비용 방지 + 기존 기능·API 응답 형식 유지. 한 단계가 아니라 **전체 생성 시간**으로 판단한다. 사용자가 붙여넣은 지시·번호 목록 원문과 진행 상태는 `docs/current-goals.md`에 있다 — "N번 진행해줘"처럼 번호로 지시받으면 어느 목록의 몇 번인지 거기서 확인하고, 모호하면 먼저 묻는다.
- **승인 없이 하지 않는 것:** 캐시 데이터 삭제, 대규모 구조 변경, 추가 비용이 드는 대량 테스트, DB 마이그레이션 추가·적용. "승인 먼저 받겠다"고 말한 작업은 답을 받기 전에 구현하지 않는다.
- **실험 규칙:** 효과가 실측으로 확인된 변경만 적용하고, 실패하면 기존 방식으로 돌아갈 수 있게(환경변수 스위치 등) 하며, 효과가 없으면 억지로 수정하지 않고 되돌린다. 이미 기각한 실험은 `docs/current-goals.md`의 진행 상태에서 확인하고 같은 방식으로 반복하지 않는다. 추측을 사실처럼 말하지 말고 측정값에는 표본 수를 함께 적는다.
- **조사 노트 캐시**(`lib/essay/research-cache*.ts`)는 기본 꺼짐이다(다양성 저하 우려). 켜려면 `RESEARCH_CACHE=on`.
- **품질 개선 스위치**: `ESSAY_QUALITY_FIXES=off`면 2026-10-21~22 점검에서 바꾼 프롬프트·후처리(양식 충실 규칙, writing_guide 사용, 작업 메모·주소 제거 등)를 전부 예전 방식으로 되돌린다. 글쓰기 호출만 다른 모델로 바꾸려면 `OPENAI_MODEL_WRITE`(없으면 `OPENAI_MODEL_MAIN`). 안내문 분석은 `OPENAI_MODEL_ANALYZE`, 공부 도구(요약·플래시카드·퀴즈·가상 시험·암기노트·예상 질문)는 `OPENAI_MODEL_STUDY`(둘 다 없으면 `OPENAI_MODEL_LITE`, 현재 gpt-6-luna). 테스트 스크립트는 `SOURCE_STATS_LOG=off`로 링크 통계(source_validations)에 기록을 남기지 않는다. 속도 스위치(2026-10-23, 기본 켜짐): `ESSAY_PARALLEL_WRITE=off`(단계별 동시 글쓰기 끄기, `lib/essay/parallel-write.ts`), `ESSAY_BOOK_EXCERPT=legacy`(구절 요구 책 과제를 예전 경로로), `ESSAY_AUTHOR_PRECHECK=off`, `PLAN_REUSE_ESSAY_FACTS=off`(계획이 원고 사실을 재사용하지 않고 다시 조사).
- **AI 채팅**(`lib/study/chat.ts`, 프롬프트 조립은 alias 없는 `chat-pure.ts`): 안내문 분석 결과(`StudyContext.assignmentInfo`, 행정정보 제외)를 채팅에만 함께 보여준다(요약·퀴즈 등은 "자료에 있는 내용만" 규칙 때문에 섞지 않음). 값싼 공부 도구용 모델(`OPENAI_MODEL_STUDY`)이 검색 없이 먼저 답하고, 검색이 필요하다고 한 질문만 `OPENAI_MODEL_MAIN`이 검색을 강제해 다시 답한다. `CHAT_ROUTING=off`면 예전처럼 main 한 번. 하루 상한은 `STUDY_LIMIT_CHAT`(기본 20, 2026-10-26 결정; 관리자는 제외).
- **개수 조건**(2026-10-27): 안내문의 "8장면"·"5문장 이내" 같은 조건은 분석 결과를 바꾸지 않고 생성 시점에만 읽는다(`essay/form-requirements.ts`). 장면 수는 필수 항목 "장면 1…N"으로 펼치고, 문장·줄·문단 상한이 있는 단계는 기본 분량 가이드를 빼며, 생성 뒤 문장·문단 수를 코드로 센다(줄 수는 셀 수 없어 프롬프트로만). 수업 중 직접 쓰는 기록지(청중 기록지 등)와 "대본 없이" 말로 하는 발표는 분석 단계가 만들 결과물에서 뺀다(`dropNonSubmissionActivities`, 뺀 것은 요구사항에 한 줄로 남김). `FORM_REQUIREMENTS=off`로 전부 되돌린다.
- **AI 튜터**(`/tutor`, `/tutor/[id]`, `components/tutor/TutorApp.tsx`, 서버 `lib/tutor/tutor.ts`·알리아스 없는 `tutor-pure.ts`, API `/api/tutor`·`/api/tutor/conversations`): 수행평가 내용을 글로 설명하거나 사진을 올리면 튜터가 꼭 필요한 것만 한 번에 하나씩 되묻고(최근 대화 기준 3번 상한, 코드가 스키마에서 질문 칸을 빼서 강제) 근거·개요·초안을 채팅으로 직접 쓴다. AI 채팅과 같은 "값싼 모델 먼저 → 검색 필요 시 main 모델" 방식이고, 사진은 첫 호출에서만 보내 거기서 옮겨 적은 글(`attachment_text`)만 저장해 다음 턴부터 쓴다. 대화는 `tutor_conversations`·`tutor_messages`(마이그레이션 0019, 본인만 보는 RLS, 메인의 `user_histories`·임베딩과 연결하지 않음)에 저장되고, 서버가 저장된 대화를 직접 읽어 모델에 보낸다(클라이언트가 보낸 대화를 믿지 않음). 사이드바는 `/tutor`에서 작업 목록을 튜터 대화(`SidebarTutorList`)로 바꾸고 "새 창작물"을 "새 대화"로 바꾼다. 대화가 시작되면 오른쪽에 `StudyRail`(`hideChat`)이 붙고, 공부 도구는 `StudyContextRef` kind `tutor`로 대화 내용(`tutorToText`)을 읽는다. 하루 상한 `STUDY_LIMIT_TUTOR`(기본 20, 관리자 제외).
- 분석 결과 `core_task_info.writing_guide`는 채점 기준표·양식·예시에서 뽑은 "어떻게 써야 하는지"다(배점·날짜는 여전히 administrative_info). 생성 프롬프트에만 쓰고 과제 임베딩(core-task-text.ts)에는 넣지 않는다.

## 자주 헷갈릴 수 있는 부분

- `core_task_info`(핵심정보)와 `administrative_info`(행정정보)는 이미지 분석
  단계에서부터 물리적으로 분리 추출한다. 후자는 화면 표시 외 다른 로직에 쓰이지 않는다.
- 완성 원고 경로는 검색 그라운딩 후 **한 번에 전체 응답**을 받아 각주를 바이트
  단위로 정확히 삽입한다 (토큰 스트리밍이 아님 — 이유는 `generate-essay.ts` 상단 주석
  참고). 실행 계획 경로는 1차 그라운딩 텍스트 → 2차 JSON 변환의 2단계이며, 2차
  변환에서는 URL을 새로 짓지 않고 1차에서 확보한 출처 목록의 번호(`source_n`)만
  고르게 한다 (환각 방지).
- Supabase(PostgREST)는 pgvector `vector` 컬럼을 읽어올 때 JSON 배열이 아니라
  `"[0.1,0.2,...]"` 형태의 **문자열**로 내려준다. 항상
  `src/lib/supabase/service-client.ts`의 `parsePgVector()`로 파싱할 것. 반대로
  **쓸 때는** 그냥 평범한 `number[]` 배열을 넘기면 된다 (문자열로 직접 바꿀 필요 없음).
- pgvector는 벡터 간 요소별(element-wise) 연산(`+`, `-`, `*`)은 지원하지만 벡터×스칼라
  연산은 지원하지 않는다. 그래서 `clusters.centroid_vector` 이동평균 갱신은 SQL이
  아니라 `identify-cluster.ts`에서 JS 배열 연산으로 직접 계산한다.
- 이 프로젝트의 Next.js 버전(16)은 `middleware.ts`가 `src/proxy.ts`로 이름이 바뀌었고
  (export 함수명도 `middleware` → `proxy`), Node 런타임이 기본값이다. 세션 갱신
  로직은 `src/proxy.ts`에 있다.
- `user_histories`는 반드시 `server-client.ts`(세션 실린 클라이언트, RLS 적용)로만
  쓴다. `service-client.ts`(service_role)로 건드리면 RLS를 그냥 우회해버려서
  "본인 것만 보인다"는 보장이 깨진다 — `clusters`/`task_embeddings`/`usage_events`는
  반대로 service-client 전용(RLS 정책이 아예 없음).

## 에이전트 스킬

### 이슈 트래커

이슈는 이 저장소의 GitHub Issues(`gh` CLI)에 있다. `docs/agents/issue-tracker.md` 참고.

### 도메인 문서

싱글 컨텍스트 구조: 저장소 루트의 `CONTEXT.md` + `docs/adr/`. `docs/agents/domain.md` 참고.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
