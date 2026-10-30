# 생성 품질 측정 도구

"하나씩 발견해 고치기"를 멈추려고 만든 것. 모델을 부르는 것과 안 부르는 것을 나눠 둔다.

| 목적 | 명령 | 비용 |
|---|---|---|
| 저장된 결과물 전수 결함 검사 | `npm run measure:scan` | **0** |
| 저장된 결과물에 특정 수정 적용해 보기 | `node --import ./scripts/measure/loader/register.mjs scripts/measure/verify-plan.ts` | **0** |
| 고정 자료로 완성 원고 생성 n회 | `node --import ./scripts/measure/loader/register.mjs scripts/measure/run.ts <off\|on> <횟수> <태그>` | 건당 약 $0.02 |
| 생성 결과 지표 표 | `node --import ./scripts/measure/loader/register.mjs scripts/measure/report.ts <태그>` | 0 |
| 실제 안내문 사진 5종 최종 검증 | `node --import ./scripts/measure/loader/register.mjs scripts/measure/final-check.ts` | 약 $0.15 |

- 결과·로그는 `scratchpad/measure/out/`에 쌓인다(gitignore — 실제 안내문 기반 결과물이라 올리지 않는다).
- `run.ts`는 `MEASURE_FLAG` 환경변수 이름 하나를 off/on으로 바꿔 A/B를 만든다(기본 `ESSAY_EVIDENCE_SLOTS`).
  예) `MEASURE_FLAG=ESSAY_STEP_ORDER node --import ./scripts/measure/loader/register.mjs scripts/measure/run.ts off 5 ab2`
- `final-check.ts`·`fixture.ts`는 `수행평가 안내문/`의 실제 사진과 `scratchpad/measure/social-analysis.json`(분석 결과 캐시)을 읽는다. 둘 다 저장소에 없으므로, 없으면 그 사례는 건너뛴다.
- 측정 시 `SOURCE_STATS_LOG=off`가 자동으로 걸려 링크 통계 표에 테스트 기록이 남지 않는다.
- 시간 비교는 **같은 배치 안에서만** 의미가 있다 — 같은 설정인데 배치가 다르면 중앙값이 18.9초와 27.7초로 갈린 적이 있다(2026-10-29).
