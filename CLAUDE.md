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
| 호스팅 | Vercel **Hobby 플랜**(2026-11-24 대시보드에서 확인 — 기획서의 "Pro"는 실제와 다름). 크론은 하루 한 번까지·시각 ±59분, 상업적 이용 제한 약관은 운영자가 확인할 것 |

이 조합을 고른 이유: 1인 개발 + MVP 단계라 프론트-백엔드-DB-인증-호스팅을
최대한 하나의 생태계로 묶어 관리 부담을 줄이는 것이 최우선이었음.

## ★ 변경하기 전에 먼저 읽을 것 — 시스템을 무겁게 만들지 않는 원칙

> 사용자 지시 원문: **"시스템, 구조, 프롬프트, 규칙 등 무작정으로 추가/수정 하면 역효과가 나거나 무거워질 수도 있다.
> (그렇다고 추가하지 말라는 게 아니라, 전체적인 시야를 가지고 '여기에 이걸 추가/수정하면 효율적인가?'를 생각해야 한다.)"**
> 이 프로젝트에서 가장 여러 번 되풀이된 요구다. 층을 새로 더할 때(새 규칙·프롬프트 블록·AI 호출·환경변수 스위치) 아래 순서로 판단한다. 근거 사례·피할 패턴은 `docs/essay-pipeline-notes.md`의 "시스템 무게 원칙 — 근거와 사례".

1. **증상인가 원인인가** — 몇 종의 안내문에 걸치는지 저장된 안내문 전체의 비용 0 감사(`rule-audit`·`audit`·`plan-audit`·`prompt-audit`·`postprocess-audit`)로 센다. 한 안내문의 문구로 규칙을 만들지 않는다.
2. **재사용·교체가 먼저** — 기존 함수·정규식·문장을 고치거나 바꿀 수 있으면 새 함수·프롬프트 블록·스위치·AI 호출보다 먼저.
3. **빼면 어떤가** — 무겁거나 겹치는 층(특히 AI가 AI 결과를 다시 손보는 호출)을 끄는 실험이 먼저. 끈 쪽이 같거나 낫다면 지운다.
4. **가벼운 층부터** — 입력 구조 바로잡기 → 코드로 고정한 후처리 → 기존 문장 교체 → 새 프롬프트 → 새 AI 호출(마지막 수단).
5. **재고 기록한다** — 저장된 안내문 전체에서 전·후 영향 안내문 수, 호출 수·시간(목표 30초)·비용 증감, 되돌리는 스위치(`XXX=off`).

**추가해도 되는 경우(망설이지 않는다):** 원인이 구조의 한계로 확인됐고, 여러 안내문에 걸치며, 추가가 다른 층을 줄이거나 빠진 것을 채울 때.
**반대 방향의 실패도 실패다:** 확인된 결함(사용자 오류·거짓 정보·틀린 출처·빠진 화면 요소)은 이 구역을 핑계로 미루지 않는다. 명백한 버그는 체크리스트 없이 바로 고친다(테스트·전후 감사만). 점검은 몇 분으로 끝내고, 안 고친 것은 PROGRESS에 이유와 조건을 적는다.
**작업을 끝낼 때 "무게 평가" 한 줄:** 늘거나 준 줄 수·스위치·호출·시간·영향 안내문 수. 측정하지 못한 것은 못 했다고 쓴다.

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

## 폴더 구조 (요약 — 옛 상세 지도는 `docs/folder-map.md`)

```
src/app/            페이지(page.tsx·admin·learning·tutor·histories·settings)와 Route Handlers(app/api/**: tasks·study·chat·tutor·results·admin·feedback…)
src/components/     화면(creation 새 창작물·질문, home, result, study 공부 도구, tutor, admin, ui 공통 모달/버튼)
src/lib/llm/        모델 호출의 유일한 입구(openai/gemini 제공자, 사용량·로그). 모델 이름은 환경변수로만
src/lib/gemini/     analyze·generate-essay·generate-plan·prompts·citations·embeddings (이름은 gemini지만 제공자는 llm/이 고른다)
src/lib/essay/      완성 원고 품질 규칙(순수 함수, alias import 없음 → node:test로 바로 테스트). 파일별 역할은 docs/essay-pipeline-notes.md "A. essay/ 파일 지도"
src/lib/selection/  대상 자동 선정(selection-need 판정·score·subject-selection·student-topic)   src/lib/questions/  제작 전 질문(questions-pure 규칙·next-question 호출)
src/lib/clusters/   과제 임베딩 클러스터·쏠림 억제·결과물 임베딩 저장   src/lib/verification/ links/ research/  출처·구절·링크 검증과 조사
src/lib/study/ tutor/ learning/   공부 도구·AI 채팅·AI 튜터·학습 모드   src/lib/admin/ usage/ auth/ turnstile/ supabase/ histories/  관리자·접근 제한·인증·DB 클라이언트·저장
src/types/task.ts   도메인 타입      supabase/migrations/  0001~0024(Supabase 대시보드 SQL Editor에서 직접 실행, 적용 여부는 대시보드 확인)
docs/               planning.md(기획 근거)·essay-pipeline-notes.md·current-goals.md·archive/   scripts/measure/  측정·감사 도구(실제 안내문 사진은 `수행평가 안내문/`, gitignore)
```

옛 지도에만 있던 규칙: `clusters/identify-cluster.ts`는 **생성 이전에 반드시 먼저 호출**한다 · `user_histories` 저장은 반드시 세션 클라이언트(`supabase/server-client.ts`, `histories/save-history.ts`) · 로고(`components/Logo.tsx`)는 `prefers-color-scheme`로 전환하고 아이콘은 흰색 에셋이 없어 `dark:invert` — 흰색 아이콘을 받으면 워드마크처럼 별도 파일로 교체.

## 화면·학습 도구 구조 (2026-10 개편)

- 디자인 토큰은 `src/app/globals.css`(검정/회색 단색, `bg-surface`·`bg-raised`·`border-border-strong`·`text-faint`·`text-danger`). 폰트는 Pretendard Variable. 아이콘은 이모지가 아니라 `lucide-react`만 쓴다. 공통 모달/버튼은 `src/components/ui/`.
- 홈(`components/home/HomeDashboard.tsx`): AI 모드 결과물과 학습 모드 과제를 한 격자로 보여주고, 아래 고정 입력창(`components/chat/ChatDock.tsx`)으로 새 안내문·기존 과제에 질문한다. "새 창작물" 모달은 `components/creation/NewCreationModal.tsx`(사진/텍스트 → 분석 → AI가 만들어줘요/직접 작성할게요 → AI면 제작 전 질문). `/learning` 목록은 홈으로 리다이렉트된다.
- 학습 도구(요약·플래시카드·퀴즈·가상 시험·AI 채팅): UI는 `components/study/`(결과물 상세는 오른쪽 레일, 학습 모드는 "공부 도구" 서랍), API는 `/api/study/*`·`/api/chat`. **과제 내용은 클라이언트가 보낸 본문이 아니라 id만 받아 서버가 RLS 세션으로 직접 읽는다**(`lib/study/context.ts`). 종류별 하루 횟수 제한은 `lib/study/usage.ts`(`study_usage_events`, 마이그레이션 0016 — 미적용이면 서버 메모리로 대신 센다). 테스트 가능한 순수 함수는 alias import 없는 파일(`context-pure.ts`·`turns.ts`·`quiz-validate.ts`·`questions-pure.ts`)에 둔다.
- 제작 전 질문(`/api/tasks/questions`, `lib/questions/`): 질문은 한 번에 하나씩, 개수 상한(빠르게 2/나에게 맞추기 4)은 모델이 아니라 코드가 강제한다. 개인 경험은 지어내지 않고 학생이 "나중에 직접 쓸게요"를 고르면 빈칸으로 남긴다. 모드는 브라우저에 저장(`lib/ui/ai-pref.ts`).

## 현재 작업 목표와 작업 규칙

> 이 구역은 **규칙과 되돌리는 스위치만** 담는다. 날짜별 실측 기록·근거 전문은 `docs/essay-pipeline-notes.md`(옛 CLAUDE.md의 같은 구역을 글자 그대로 보관)에 있다.
> **에세이 생성·안내문 분석·측정 코드를 건드리기 전에 그 문서에서 관련 항목을 검색해 읽을 것**(통째로 읽지 말 것). 새 실측 기록은 그 문서에 더한다. 11-15 전수 점검 결과는 `docs/full-check-2026-11-15.md`.

### 작업 원칙
- **인수인계**: 새 세션·압축 뒤에는 `PROGRESS.md`(짧게 유지)부터 읽는다. 작업을 끝낼 때마다 그 파일의 "지금 상태"·"다음에 할 것"을 갱신하고, 지난 기록은 `docs/archive/`로 옮긴다. 옛 기록 검색은 `docs/archive/PROGRESS-until-2026-11-18.md`.
- **최종 목표**: 과제 생성 30초 이내 + 글 품질·출처 정확도·학생별 다양성 유지 + 불필요한 API 호출/비용 방지 + 기존 기능·API 응답 형식 유지. 한 단계가 아니라 **전체 생성 시간**으로 판단한다. 사용자가 붙여넣은 지시·번호 목록 원문과 진행 상태는 `docs/current-goals.md` — "N번 진행해줘"는 어느 목록의 몇 번인지 거기서 확인하고, 모호하면 먼저 묻는다.
- **승인 없이 하지 않는 것**: 캐시 데이터 삭제, 대규모 구조 변경, 추가 비용이 드는 대량 테스트, DB 마이그레이션 추가·적용. "승인 먼저 받겠다"고 말한 작업은 답을 받기 전에 구현하지 않는다. 서비스 방향·화면 구조·기능은 요청 없이 바꾸지 않는다.
- **비용 규칙**: 사용자 API 비용 한도로 한 번에 3~5회 이내만 돌린다(34종 전체 실행 금지). 실행 전에 횟수·예상 비용을 말하고 시작한다.
- **항상 추가만 하지 말 것 — 빼기·가볍게 하기를 먼저 의심할 것**(2026-11-17, **자세한 체크리스트·근거는 문서 위쪽 "★ 변경하기 전에 먼저 읽을 것" 구역**): 생성 뒤 AI가 다시 손보는 층(조건 대조·선택 보완)은 점수를 못 올리면서 시간과 거짓 경고만 늘렸고(10종 115→121/131, 시간 267→233초), 코드로 고정된 결정적 후처리는 점수에 기여했다(전부 끄면 −7점). 새 규칙을 더하기 전에 ① 무겁거나 겹치는 기존 층을 끄는 실험을 먼저 하고 ② 끈 쪽이 같거나 낫다면 지운다. 원인을 못 찾는 문제는 "더 막기"가 아니라 "어느 층이 방해하는가"로 접근한다.
- **맨바닥 기준선과 먼저 비교**(`scripts/measure/bare-baseline.ts`): 안내문 사진+한 줄 요청만 준 luna가 "안내문 지키기"에서 우리 파이프라인과 같거나 높았다. 기준선이 이미 지키는 것은 규칙을 더해도 얻을 점수가 없다(기준선이 못 하는 것: 각주·검색·머리말 제거·쏠림 억제).
- **실험 규칙**: 실측으로 효과가 확인된 변경만 적용, 환경변수 스위치 등으로 되돌릴 수 있게, 효과 없으면 되돌린다. 기각한 실험은 `docs/current-goals.md`·PROGRESS.md에서 확인하고 반복하지 않는다. 추측을 사실처럼 말하지 말고 측정값에는 표본 수를 적는다. 점수판은 글 내용만 재므로 시간·거짓 경고·화면 결함은 `screen-dump`·`screen-lint`·`plan-vs-actual`로 같이 본다.
- **측정이 실제 학생 다양성에 영향을 주면 안 된다**: 측정 스크립트는 `generateEssay()`를 직접 부르고(`selection: { history: [] }`) 서버 경로(`identifyCluster`→`task_embeddings` 저장→`buildAvoidanceInstruction`)를 **타지 않는다.** 겹침방지 점검은 DB에 쓰지 않는 `diversity-check.ts`·`cluster-readonly-check.ts`(전후 행 수 비교)로만. 테스트 스크립트는 `SOURCE_STATS_LOG=off`.
- 새 안내문이 들어오면 먼저 `scripts/measure/notice-loss.ts`(analyze 1회씩)로 분석이 흘린 칸·수치·행정 유입을 본다.

### 환경변수 스위치 (기본 상태 → 되돌리는 값)
| 스위치 | 역할 |
|---|---|
| `OPENAI_MODEL_MAIN`, `OPENAI_MODEL_LITE`, `OPENAI_MODEL_ANALYZE`, `OPENAI_MODEL_STUDY`, `OPENAI_MODEL_WRITE` | 모델 역할별 이름. ANALYZE=안내문 분석, STUDY=공부 도구·암기노트·예상 질문(둘 다 없으면 LITE, 현재 gpt-6-luna), WRITE=완성 원고 글쓰기(없으면 MAIN, `OPENAI_MODEL_WRITE=gpt-6-luna` — mini 대비 24.8→20.4초·되풀이 1.3→0쌍, 더 비싼 gpt-6-sol·gpt-5.6-luna는 더 낫지 않았다) |
| `ESSAY_QUALITY_FIXES=off` | 2026-10-21~22 품질 점검 변경(양식 충실 규칙·writing_guide 사용·작업 메모·주소 제거)을 전부 예전 방식으로 |
| `ESSAY_WRITE_EFFORT=low` | 글쓰기 추론 강도(luna는 minimal 거부) |
| `ESSAY_WRITER_KNOWLEDGE=strict` | 기본은 교과서 수준 일반 지식 허용(금지하면 사실 부족으로 같은 말 되풀이) |
| `ESSAY_PARALLEL_WRITE=off` / `ESSAY_ITEM_PARALLEL=off` | 단계별 동시 글쓰기 / 단계 하나일 때 항목 둘로 나눠 동시 쓰기 |
| `ESSAY_BOOK_EXCERPT=legacy` / `ESSAY_AUTHOR_PRECHECK=off` / `PLAN_REUSE_ESSAY_FACTS=off` | 구절 요구 책 과제 예전 경로 / 저자 사전 확인 / 계획이 원고 사실 재사용 |
| `ESSAY_TIME_BUDGET_MS`·`ESSAY_TOTAL_MS`(11-18 기본 1) / `ESSAY_BUDGET_MODE=legacy` / `ESSAY_REPAIR_ROLE=main` / `ESSAY_REPAIR_GRACE_MS` | 보완 시간 예산(0이면 끔)·전체 목표 30초·필수 보완 추가 허용 8초 |
| `ESSAY_STEP_ORDER=off` / `ESSAY_EVIDENCE_SLOTS=off` / `PLAN_CITATIONS=off` / `UNVERIFIED_MARK=off` | 앞 단계 바탕 순차 생성(2026-11-01 기본 켜짐) / 근거 N개 / 계획 문장 각주 제거 / 본문 "[확인 필요]" 표시 |
| `ESSAY_MAX_BLANKS`(기본 4) / `SOURCE_LIMIT`(기본 5) / `SOURCE_JUDGE=on`(기본 꺼짐) | 빈칸 허용 수 / 출처 정리 한도 / 작은 모델 판정 각주 이동 |
| `RESEARCH_CACHE=on`(기본 꺼짐) / `RESEARCH_RETRY=off` / `PARTIAL_INSUFFICIENT=off` / `SUBJECT_SPEC_CACHE=off` | 조사 노트 재사용(다양성 저하 우려) / 조사 비면 재시도 / 한 단계만 자료 부족이면 그 단계만 빈칸 / 대상 선정 사양 재사용 |
| `RUBRIC_CHECK=off`(코드는 있으나 11-18 기본 끔) / `HONESTY_REPAIR=off` / `HONESTY_REMOVE=off` / `ESSAY_DEDUPE=off` | 안내문 조건 대조 / 정직성·안내문 보완 우선 / 안 한 활동 문장 삭제 / 영역 간 되풀이 삭제 |
| `FORM_REQUIREMENTS=off` / `TABLE_FORM=off` / `NOTICE_FORM=off` / `NOTICE_TEXT`(원문 전사, 기본 꺼짐) / `ADMIN_LEAK=off` / `SELECTION_TRIGGER=legacy` / `SEARCH_TOOL_OFF=off` | 개수 조건 / 표 양식 / 분석이 흘린 칸 복구 / 행정 안내 삭제 / 선정 판정 예전 규칙 / 출제형 검색 도구 떼기 |
| `ESSAY_LEAN_WRITE=on`(기본 꺼짐, **Vercel에 두지 말 것**) / `FINAL_REVIEW=on`(기본 꺼짐·효과 미확인) / `ANALYSIS_CACHE=on`(Vercel에 켜져 있음) / `LENGTH_FROM_ANALYZE`(기각, 꺼짐) | 얇은 경로(사진 직접 주기, 구조 변경이라 승인 먼저) / 안내문 사진 대조 단계 / 분석 캐시 |
| `CHAT_ROUTING=off` / `STUDY_LIMIT_CHAT`(기본 20) / `TUTOR_WRITE_ROUTING=off` / `STUDY_LIMIT_TUTOR`(기본 20) | AI 채팅·튜터 모델 길 나누기 / 하루 상한(관리자 제외) |
| `TURNSTILE_REQUIRED=on` / `GENERATION_TICKET=off` | 운영에서 캡차 키가 없으면 비로그인 생성 거절(기본은 키 없으면 건너뜀) / 같은 과제 이어지는 요청 표 |
| `CLAIM_UNITS=off`(11-21, 기본 켜짐) | 출처 대조(`claim-check`)가 "35만 명"·"3,500만" 같은 한국어 단위 수도 본다. 생성 뒤 최종 대조에서만 켜지고(보완 호출 트리거는 그대로), 페이지의 정확한 값·万·million 표기·±5%를 뒷받침으로 인정. 저장 결과물 54개·각주 묶음 435개 점검: 판정이 바뀐 6개는 전부 "페이지 못 읽음" 알림뿐, 거짓 삭제 0 |
| `ANSWER_SHEET_RULES=off`(11-21, 기본 켜짐) | 문제 N개 답안지(한문-01 등 역할 `qa_list`)에서 보고서 규칙("2~4문장 문단·왜 중요한지")과 항목 줄 "구체적으로 길게" 문구를 빼고 "요구한 답만"을 말한다. 한문-01 실측: 독음·한자쓰기 칸 해설·지시문 오염 사라짐, 15.7→8.8~9.9초, 비용 절반. 저장 분석 34종 중 이 역할은 없어 다른 과제 영향 없음 |
| `ITEM_UNITS=off`(11-21, 기본 켜짐) | 이름 있는 필수 항목이 "N문항" 개수 이상이면 번호 세기·보완 호출을 건너뜀(가정-03 "문항 조건 4개, 실제 0개" 거짓 경고 + 보완 호출 제거) |
| `SIBLING_BANNER=off`(11-21, 기본 켜짐) | 같은 결과의 다른 카드가 출처를 가졌으면 이 카드의 "검증 안 됨" 배너는 연도·수치 같은 강한 사실이 있을 때만(책 제목·"평균·자료" 낱말로는 안 띄움) |
| `PDF_TEXT=off`(11-21, 기본 켜짐) | 출처 PDF(6MB 이하)를 받아 글자를 뽑아 출처 대조에 쓴다(`links/pdf-text.ts`, unpdf 1.9.1). 80쪽·3초까지만 읽고(쪽당 300자 미만인 희박한 문서·스캔본도) 다 못 읽었으면 partial — partial에서 값을 못 찾아도 각주를 지우지 않는다(확인 불가). 저장 결과물의 PDF 인용 23건: 판정 이동 2건(1 지원·1 못 찾음, 그 1건은 "1930년대" 연대 표현 오탐이라 고침) |
| `REFERENCE_BOOK_TASK=legacy`(11-21, 기본: 참고 목록에 적는 항목은 책 과제 아님) | 책 과제 판정(`book-hint.ts`)에서 "참고한 도서를 기록한다"·"참고문헌(도서·논문)을 정리한다"·"출처(도서…)를 밝힌다" 같은 **참고 목록 문장**을 빼는 것을 끈다. (도서관·도서산간·독서실 제외는 스위치 없이 항상.) `rule-audit.ts 책과제` 27문장 통과. 역사-05 51.7→23.5초 |
| `PLACEHOLDER_GUARD=off` / `VALUE_FIELD_NOTE=off`(11-24, 기본 켜짐) | 빈칸뿐인 단계를 분량 바닥 보정에서 빼고 항목별 빈칸 틀로(자료부족 단계가 설명문으로 부풀던 것) / 책 제목·저자 같은 값 칸은 "이름 한 줄"이라고 필수 항목 블록에 알림(값 칸 문단이 후처리로 줄어 분량이 700자로 깎이던 것, 근거 notes 맨 아래) |
| `MATERIAL_FORM=notes`(11-25, 기본: 메모·키워드·개조식을 직접 말한 안내문만 불릿, 나머지 문단) | "자료 수집" 같은 재료 단계를 항상 한 줄 불릿 메모로(예전). 인권 저널은 "기록"만 말했는데 불릿 한 문장씩 나와 분량 목표와 어긋났다. 같은 날 되풀이 지우기가 재료 단계↔뒤 단계(신문)를 한 산출물로 오판하던 것도 수정(스위치 없음) |
| `ANTI_AI_TONE_VERSION`(기본 v3) | 문체 규칙 버전 |

### 지켜야 할 규칙 (생성 파이프라인)
**규칙을 만들거나 고칠 때**
- 새 규칙은 먼저 `scripts/measure/rule-audit.ts`(비용 0)에 걸려야/걸리면 안 되는 **문구 변형**을 적고 고친다. 안내문을 읽는 규칙은 전부 "낱말이 들어 있나"로 판정하므로 낱말 경계와 문맥을 함께 보고 `audit.ts`로 저장된 분석 전부의 판정을 전·후 비교한다(생성 로그 `[generateEssay] 안내문 규칙:` 한 줄이 실제 걸린 것).
- 프롬프트 블록을 만들거나 고치면 `prompt-audit.ts`(서로 반대를 말하는 짝 감사). 후처리 단계를 더하면 `postprocess-audit.ts`(멱등성·순서·남은 표시). 단계 과제 유형이 바뀌면 `three-axis-audit.ts`.
- 규칙은 **분석이 만든 구조가 아니라 안내문 글**(요구사항+작성 기준+단계 설명을 합친 글)을 읽게 쓴다. 구조(단계 수·이름·required_items)는 실행마다 흔들린다 — 읽어야 하면 느슨하게(예 `isEvidenceHeading`의 `/근거|뒷받침/`) 본다. 흔들림은 `analyze-stability.ts`.
- 규칙이 "이 과제는 이런 모양"을 가정하지 않게, 그 조건이 **단계 하나에 걸리는지 과제 전체에 걸리는지** 먼저 정한다. 블록도 한 단계 것/전체 것을 정한다(`allCompoundItemsByStep`). 개수·분량 조건은 "칸마다"(`CountReq.perItem`)와 "단계 전체"를 가른다.
- **규칙은 그 규칙을 소유한 모듈 안에** 두고 감사는 그 함수에 직접 묻게 한다(걸러내기를 호출부에 두면 감사가 거짓 통과).
- 후처리 결과를 버리는 삼항식 주의(`notes ? {...s, content: body} : s`는 고친 body를 버린다). 사슬을 고치면 단위 테스트가 아니라 **생성 1회로 확인**한다.
- **거짓 경고는 보완보다 먼저 걷어낸다.** 단, 기입란 줄("날짜: 2024년 9월 23일")처럼 진짜 결함(지어낸 서지)까지 가리지 말 것.
- 보완은 3등급 중 먼저 정한다 — `honesty`·`notice`(안 한 활동·거절문·안내문 조건·요구한 표·금지 자료·다룰 기간)는 예산을 무시하고 한 번, 형식·분량·문체·되풀이는 여유 있을 때만(`essay/repair-priority.ts`). 조건 보완을 첫 단계에 떠넘기지 않는다(`resolveMissLabel`: 이름 하나면 그 단계, 여럿이면 버림, 없으면 첫 단계). "A 또는 B" 조건은 `choiceNote`로 조건 줄 옆에 "둘 중 하나만 고르는 칸"을 붙인다.

**채점·측정**
- 안내문을 지켰는지는 `scripts/measure/truth.ts`(사람이 안내문 사진을 읽어 적은 정답 체크리스트)로 잰다. `rubric-check`는 analyze 요약에서 나와 흘린 조건을 못 본다. **정답에 안내문에 없는 조건을 지어내지 말 것**(스크랩 칸을 "빈칸"으로 채점했다 정정). 기준을 고친 뒤에는 나쁜 실행을 다시 재서 여전히 떨어지는지 확인한다. 채점은 `scratchpad/measure/scores.json`에 쌓인다.
- 30초로 재는 것은 **`generateEssay` 단독**(analyze는 별개 요청, 사이에 사람이 들어간다). "analyze와 조사 겹치기"는 불가능(철회). 앞 단계를 받아 쓰는 2단계 과제는 직렬이라 39~43초. 호출별 분해는 `scripts/measure/final-check.ts`. 새 보완 규칙은 시간 예산 안에서 실제로 도는 구간인지(`scratchpad/measure/out/*.log`의 `시간 예산 초과`) 먼저 확인한다.
- 이미 기각: `ANALYZE_EFFORT=minimal`, analyze를 gpt-5-mini로(안내문 조건 3/5만 읽음), 글 쓰는 호출에 안내문 사진 함께 보내기, 안내문 원문 전사를 규칙이 읽게 하기, 요구사항을 한 줄씩 그대로 지시, 분량을 analyze가 사진 보고 정하기, 항목당 바닥값 200자, 분량 가이드를 아예 빼기, 글 쓰는 호출의 상한 문구.

**안내문 읽기·분석**
- `core_task_info`는 요약이라 흘린다: 빈 양식지(예시 사진)의 칸(번호 칸·이름표 기입란·괄호 기입란)은 **적힌 그대로·놓인 순서대로** `required_items`에 넣고 빈 줄 수는 writing_guide에 분량으로. 양식지=어느 칸에 무엇을(required_items), 채점 기준표=무엇을 잘 써야(writing_guide). "제목"·"내용" 같은 흔한 칸 이름은 칸으로 살리고 거짓 경고 쪽을 고친다(`FORM_FIELD_ITEM`). 빠진 칸은 작성 기준의 `'<칸 이름>' 약 N줄`에서(`essay/guide-fields.ts`, 같은 칸은 낱말 겹침으로), 표 양식은 `essay/notice-form.ts`로 되찾는다. 원문 전사는 **생성 프롬프트에 절대 넣지 말 것**(배점·일시·부정행위 안내가 들어 있다).
- 안내문에 자료(지문·기사·통계)가 실려 있으면 그것이 1순위 소재다(`core_task_info.provided_materials`, `essay/provided-materials.ts`) — 숫자·날짜까지 그대로 옮기고 조사도 그 소재를 벗어나지 않는다.
- 손글씨가 인쇄된 조건을 덮어쓴다("분량제한 X" → `noLengthLimit`, 칸 줄 수로 분량을 묶지 않음). 빈 양식지 과제의 칸 개수는 글로 없다(번호로만).
- 수업 중 몸으로 하는 평가는 글 단계에서 뺀다(`dropNonSubmissionActivities`): 기록지·대본 없는 발표·실물 스크랩·**듣고 파악하는 평가**(`isListeningTest`; 듣고 쓰는 감상문·요약문·기록지는 빼지 않음). 같은 산출물을 두 단계로 쪼갠 분석은 코드가 합쳐 본다(`dedupe.ts`의 `duplicateStepLabels`).
- 분석 보정: `foldSkeletonItems`(서론·본론·결론 뼈대와 내용 항목이 섞이면 뼈대만 칸으로), `soloDefault`(팀 전용 칸 제외). `ensureQuestionSteps`의 덮임 판정은 낱말 60% 겹침이다 — 이름만 보면 과학-09에서 단계를 둘 더 붙여 결과물이 통째로 실패했다(회귀 테스트 `analysis-questions.test.ts`).
- 행정 안내(차시·시험 대형·배점·감점)가 글에 섞이면 코드가 지운다(`essay/admin-leak.ts`): 소제목의 "N차시"는 떼고 줄 전체가 행정 안내인 줄만 지운다. **채점 기준을 만드는 칸에서는 배점이 학생이 쓸 내용**이지만 `stripBaseScore`로 "기본점수" 구절만 뗀다(표 줄은 지우지 않음).
- 글쓰기가 아닌 과제(수학 수리논술 **출제**)도 온다: 조사·각주가 없는 게 맞고, 결함은 표로 안 나오는 것·배점표가 글에 섞이는 것.

**분량**
- 분량 기준은 한 군데서: **`taskBoxLengths()` 밖에서 `boxLengths`를 직접 부르지 말 것.** 칸을 아는 단계의 목표는 `effectiveTarget`, 가이드 글은 그 단계를 말하지 않는다(`hasFormBox`). 프롬프트 숫자·판정 숫자 대조는 `length-sources-audit.ts`.
- 글자 수는 `essay/submitted-length.ts`의 `submittedLength()`로 센다(학생이 적는 글자; `###`·`**`·`[1]`·칸 구분선 제외, **표 칸 안의 글자는 센다**). 새로 글자를 세는 곳은 이것을 쓴다.
- "알맞은 분량"은 채점된 결과물로만 안다(`length-truth.ts`, `length-vs-score.ts`, `length-spread.ts`). 점수는 분량을 따라가지 않는다 — 분량은 모델에 맡기지 않고 코드로 정한다. 한 단계를 항목별로 나눠 쓰면 각 호출에 **자기 몫**을(`myShareLine`), 단계마다 **자기 목표**를(`stepLengthLine`).
- 칸 산출물(카드뉴스·스토리보드)은 항목 수가 아니라 **칸 수**(`sceneCount`)로 잰다. 표 양식은 칸 수(열×줄, 분량 역할 `table`). 한 지면의 칸들은 `form_box`, 자료 붙이는 칸은 `attachment`(`RoleCtx`로 형제 단계 확인). `isOwnRecordStep`을 분량에 재사용하지 말 것. 11-18 기본 상향 `LENGTH_RAISE`, 논술·보고 상한 2,400자, 천장 1.25배.
- 상한은 조건을 "칸마다 걸리는 것"으로 잘못 읽으면 단계 분량 목표를 통째로 지운다(871자·7/9).

**양식·형식**
- 양식은 소제목 목록과 **표** 두 종류다(`essay/table-form.ts`): 칸 이름이 `~표`이거나 작성 기준이 "표 칸·표로 정리"면 표. 열은 `required_items`, 줄은 "사례1·사례2 각각", `합계`는 마지막 줄. 1차원으로 펼친 2차원 양식은 되접는다. **표 칸은 구조화·보고서 항목 블록에서 뺀다.** 낱말 끝 '표'(발표·대표·목표·이름표)를 조심. 표 머리줄도 "그 항목을 다뤘다"로 센다(`research/research-items.ts`).
- 개수 조건(8장면·N문장·N문단)은 분석을 바꾸지 않고 생성 시점에만 읽는다(`essay/form-requirements.ts`): 장면 수는 "장면 1…N" 필수 항목으로, 문장·줄·문단 상한이 있는 단계는 기본 분량 가이드를 빼고 생성 뒤 문장·문단 수를 코드로 센다(줄 수는 프롬프트로만). `wantsBriefScenes`("간단히 표시"·"대본 없이")는 장면 내용을 핵심 낱말 한 줄로.
- 신문·여러 영역 지면: 영역 사이 되풀이는 코드가 지운다(`essay/dedupe.ts`, 한 지면을 나눠 맡은 영역끼리만 — 따로 제출하는 글은 지우지 않음). 제작 참고를 떼면 칸이 비는 경우에는 떼지 않는다(`splitProductionNotes`, 기준은 소제목밖에 안 남음 10자). 단계 본문 슬라이서가 라벨을 못 찾아도 글을 버리지 않는다(단계 하나면 전체가 그 단계, `##` 제목 수가 같으면 순서로 짝짓기).
- 붙임 칸(스크랩·부착)은 코드가 바로잡는다(`essay/paste-slot.ts`의 `normalizeAttachmentSlot`: 서지 값 비우기·거절문 삭제·`붙일 자료:` 복구). 거절문 검사기는 학생에게 말을 거는 존댓말 꼴도 잡는다. 날조 활동 검사의 진짜 결함은 지어낸 서지·안 한 활동이다.
- 밑줄은 `<u>…</u>`(마크다운에 없음). 화면은 `src/lib/markdown/underline.ts`의 `remarkUnderline`이 그린다 — `rehype-raw` 금지(모델 출력이 HTML이 되어 주입 위험). remark-parse는 `<u>`를 `html` 노드로 뗀다.
- 독후 활동은 책이 결과물에 드러나야 한다(`bookThreadBlock`: 칸 절반 이상에 그 책의 인물·시선, 장면·대사 지어내기 금지). 트리거 `isReadingActivity`는 분석 주제와 학생 지침을 함께 본다. 확인: 로그 `[generateEssay] 읽은 책: … 블록=붙임`.
- 제작 전 질문의 1번은 "무엇을 다룰지"다(`questions-pure.ts`의 `topicStillOpen`/`buildTopicQuestion`, 영역 세부를 먼저 물으면 코드가 바꿔 끼움). 질문 경로 판정(`shouldAskSubject`)은 생성 경로(`needsSubjectSelection`)보다 넓다 — 생성 쪽을 넓히면 자동 선정 11~13초가 붙어 30초가 깨진다. 새 질문은 그 답을 `findStudentTopic`이 되읽는지 테스트로 묶는다. 대상 자동 선정(사양 6+후보 13+검증 6.5초)의 사양만 학생과 무관해 재사용한다(`learning/spec-cache.ts`).

**검색·출처**
- `search: { force: false }`는 도구를 떼지 않는다(`llm/search-policy.ts`의 `factSearchReason`, `SEARCH_TOOL_OFF=off`). 조사할 사실이 없는 과제에는 `search` 옵션을 **아예 넘기지 않는다** — 단 도구를 떼는 건 **출제형**(학생이 문항·채점 기준을 만드는 과제)만이고 조사하라고 적힌 안내문은 검색한다. 도구를 뗀 과제의 출처 0개는 결함이 아니다(`noSourcesWarning` 배너·로그 안 띄움). `needsFactSearch` 문구는 `rule-audit`·`audit`이 본다.
- 조사는 그 주제 자료가 쓰인 **언어**로 검색한다(한국사는 한국어, 영어 과제는 영어).
- 출처 등급 목록(`source-quality`)이 좁으면 멀쩡한 출처를 못 믿게 만든다: 넓히되 `or.kr`은 통째로 넣지 말고, 뉴스 재배포 포털(v.daum.net·news.nate.com)은 뒤로 미룬다(언론사가 가려짐).
- 참고문헌·지어낸 출처 후처리: `essay/extra-material.ts`·`source-list-need.ts`·`prompt-leak.ts`·`item-label.ts`·`bibliographic-fields.ts`·`source-line.ts`·`hanja-scope.ts`, `deliverable.ts`의 `placeSourceList`(모델이 쓴 참고문헌을 시스템 출처로 제자리 교체), `own-activity.ts`의 `removeOwnActivitySentences`.

**시간**
- 시간 예산은 고정선이 아니라 **남은 시간**으로 판단한다: 목표 `ESSAY_TOTAL_MS`(보완까지 끝난 전체), 필수 보완은 남은 시간 7초 이상일 때 시작하고 안 끝나면 버리고 원문(`withDeadline`). 보완 호출은 글쓰기 역할(luna)로(`ESSAY_REPAIR_ROLE`). 호출별 중앙값: write 합 20.9 / research 10.5 / repair 8.0(mini) / rubric 4.1초.
- 생성 하한은 직렬 3단계(analyze 12~20 + 조사 7~13 + 글쓰기 12~20초)이고, 시간을 줄이려면 품질을 깎는 게 아니라 직렬 단계를 겹친다. 제작 전 질문 답변 중 조사 미리 띄우기는 답이 주제를 바꾸면 엉뚱한 조사를 쓴다.

**화면·기타**
- 같은 분석 흔들림 중 해로운 것은 **요구사항 개수**(개수 조건이 사라짐)뿐이다. 요구 개수를 한 줄씩 그대로 시키는 건 기각됨.
- 안내문 요구 ↔ 결과물 대조(`essay/rubric-check.ts`, `RUBRIC_CHECK`): 체크리스트를 코드에 적지 않고 안내문에서 그때그때 만들어 어긴 단계만 부분 보완(등급 critical). 글만 봐서 알 수 없는 조건(배점·기한·수업 운영·발표 시간)은 체크리스트에서 반드시 뺀다. `rubric-audit.mjs`로 비용 없이 전수 확인.
- 분석 결과 `core_task_info.writing_guide`는 채점 기준표·양식·예시에서 뽑은 "어떻게 써야 하는지"다(배점·날짜는 `administrative_info`). 생성 프롬프트에만 쓰고 과제 임베딩(`core-task-text.ts`)에는 넣지 않는다.
- 조사 노트 캐시(`lib/essay/research-cache*.ts`)는 기본 꺼짐(다양성 저하).
- 얇은 경로(`essay/lean-write.ts`, `ESSAY_LEAN_WRITE=on`): 작성자에게 안내문 사진을 직접 주고 프롬프트를 줄인다. 남기는 것은 실측으로 확인된 것만(학생 지침·사실 노트+각주·쏠림 억제·실린 자료·분량 가이드·책 실마리·자료 제한·제출문 규칙). 켜려면 화면·route에서 사진을 생성까지 넘기는 길이 필요해 **승인 먼저**.
- 측정 스크립트 실행: `node --import ./scripts/measure/loader/register.mjs scripts/measure/<스크립트>.ts`(예: `analyze-stability.ts "<사례id>" <횟수>`, `final-check.ts "<사례id>"`). 모델 호출 없는 감사(`rule-audit`·`audit`·`prompt-audit`·`postprocess-audit`·`three-axis-audit`·`length-*`)는 비용 0.
- 측정 도구 묶음: 전수 `giant-check.ts`+`full-table.mjs`, 구조 `structure-audit.ts`, 공부 도구 `study-check.ts`, 화면 `screen-dump`·`screen-lint`·`screen-score`, 결함 검사기 15종(날조 활동·거절문·빈칸 과다·금지 자료·표 누락·계획 문장 각주·기관 첫 화면 출처·무각주 수치·되풀이·빈 항목·중복 각주·범위 밖 각주·소제목 중복·끊긴 문장·외국 문자; 출처 목록은 본문에서 뺀 뒤 센다). 실제 안내문 사진은 `수행평가 안내문/`(gitignore).
- **자주 밟은 함정**: `node -e`/heredoc에 `\n`·`\s`·`\d`를 넣으면 반 먹는다 → 파일로 쓰고 정규식 줄은 Edit로 확인. `generate-essay.ts`는 줄 끝이 CRLF/LF 섞여 있다.

### 학습 도구·AI 채팅·AI 튜터
- **AI 채팅**(`lib/study/chat.ts`, 프롬프트 조립은 alias 없는 `chat-pure.ts`): 안내문 분석 결과(`StudyContext.assignmentInfo`, 행정정보 제외)를 채팅에만 보여준다(요약·퀴즈는 "자료에 있는 내용만" 규칙 때문에 섞지 않음). 값싼 모델(`OPENAI_MODEL_STUDY`)이 검색 없이 먼저 답하고 검색이 필요하다고 한 질문만 `OPENAI_MODEL_MAIN`이 검색을 강제해 다시 답한다(`CHAT_ROUTING=off`면 main 한 번). 하루 `STUDY_LIMIT_CHAT`(기본 20, 관리자 제외).
- **AI 튜터**(`/tutor`, `/tutor/[id]`, `components/tutor/TutorApp.tsx`, `lib/tutor/tutor.ts`·alias 없는 `tutor-pure.ts`, API `/api/tutor`·`/api/tutor/conversations`): 학생이 수행평가 내용을 글로 설명하거나 사진을 올리면 꼭 필요한 것만 한 번에 하나씩 되묻고(최근 대화 기준 3번 상한, 코드가 스키마에서 질문 칸을 빼서 강제) 근거·개요·초안을 채팅으로 쓴다. 값싼 모델이 먼저 보고 일반 질문·개념·안내문 분석·되묻기는 그대로 답하며, 수행평가 글쓰기(근거·개요·초안·다듬기)는 `write` 역할 모델이 양식·사실·저작권 규칙과 함께 쓰고(`TUTOR_WRITE_ROUTING=off`면 값싼 모델이), 검색 필요 질문은 main이 검색을 강제해 답한다(`decideTutorRoute`). 사진은 첫 호출에서만 보내 옮겨 적은 글(`attachment_text`)만 저장해 다음 턴부터 쓴다. 대화는 `tutor_conversations`·`tutor_messages`(마이그레이션 0019, 본인만 보는 RLS, `user_histories`·임베딩과 연결하지 않음)에 저장되고 서버가 저장된 대화를 직접 읽어 모델에 보낸다. 사이드바는 `/tutor`에서 작업 목록을 튜터 대화(`SidebarTutorList`)로, "새 창작물"을 "새 대화"로 바꾼다. 대화가 시작되면 오른쪽에 `StudyRail`(`hideChat`)이 붙고 공부 도구는 `StudyContextRef` kind `tutor`로 대화(`tutorToText`)를 읽는다. 하루 `STUDY_LIMIT_TUTOR`(기본 20, 관리자 제외).

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
