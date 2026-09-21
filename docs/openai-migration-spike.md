# OpenAI 전환 사전 시험 결과 (2026-09-22)

실제 API 호출로 확인한 것(키는 `.env.local`의 `OPEN_API_KEY`/`OPENAI_API_KEY`, 값은 기록하지 않음). 스크립트는 세션 scratchpad(oa_t*.js)에 있었고 저장소에는 넣지 않았다.

| 항목 | 결과 |
|---|---|
| gpt-5-nano `temperature` | 400 (지원 안 함). gpt-4.1-nano는 허용 |
| 웹 검색 지원 | gpt-5-nano(effort low)·gpt-5-mini·gpt-4.1-mini 가능 / **gpt-4.1-nano 불가**(400) / effort `minimal` + web_search 불가(400) |
| `tool_choice: "required"` | 동작(검색 강제 가능) |
| 추론 토큰 | gpt-5 계열은 `max_output_tokens` 안에서 추론 토큰을 먼저 쓴다 — 200토큰이면 본문이 비어 나옴 |
| 인용 위치 | `url_citation.start_index/end_index`는 **글자(UTF-16) 단위**(바이트 아님) |
| 인용 형태 | 본문에 `([도메인](URL?utm_source=openai))` 인라인 링크를 스스로 삽입하고 annotation이 그 구간을 가리킴. "링크 쓰지 말라"는 지시를 nano·mini 모두 무시 |
| 검색+구조화 출력 | 동시 사용 가능하나 이 경우 annotation은 0개 → 출처가 필요하면 기존처럼 2단계 유지 |
| 엄격 JSON 스키마 | `additionalProperties:false` + 모든 속성 required 필수, 선택 항목은 `["string","null"]` |
| 지연 | 검색 호출 7~14초. 소형 구조화 호출은 minimal 1.5~2.5초, low nano 5~11초 / mini 3~6초 |
| 검색 1회 토큰 | 입력 약 9~13K 토큰(검색 결과) — 요금은 검색 호출당 $10/1000회 + 토큰 |
| 임베딩 | text-embedding-3-small, `dimensions:768` 가능(노름 1.0). 같은 과제 다른 표현 0.76, 다른 과목 0.19~0.28 → 기존 임계값(0.9/0.8) 재조정 필요 |
| 이미지(깨끗한 렌더) | mini는 정확, nano는 제목을 과목으로 오인하고 1차시 200자 조건 누락 |
| 소형 추출 품질 | nano(low)가 안내문에 없는 조건을 지어내거나 스키마 필드에 군더더기를 넣음. minimal은 빠르지만 대상 유형을 unspecified로 오분류 |
