# studed

수행평가 안내문 사진을 올리면 완성 원고 또는 실행 계획을 실제 검색 출처와 함께
만들어주는 서비스. 전체 기획 배경은 [`docs/planning.md`](docs/planning.md) 참고.

## 로컬에서 실행하기

1. OpenAI API 키(`LLM_PROVIDER=openai`)와 Supabase 프로젝트 정보가 아직 없다면, 아래 마법사를 실행하면
   무엇을 어디서 어떻게 발급받는지 화면에 안내가 뜬다 (모르는 상태로 시작해도 됨):
   ```bash
   bash scripts/setup-env.sh
   ```
   이미 값을 알고 있다면 `.env.example`을 복사해 `.env.local`을 만들고 직접 채워도 된다.
   ```bash
   cp .env.example .env.local
   ```
2. 패키지 설치 (처음 한 번만):
   ```bash
   npm install
   ```
3. 개발 서버 실행:
   ```bash
   npm run dev
   ```
4. 브라우저에서 http://localhost:3000 열기.

홈의 "새 창작물"에서 안내문 사진(최대 4장)이나 텍스트를 올리면 AI가 분석한 내용을
보여 주고, "AI가 만들어줘요"를 고르면 완성 원고 또는 실행 계획이 출처와 함께 나온다.
모델·속도·품질 스위치는 `CLAUDE.md`의 "현재 작업 목표와 작업 규칙"에 정리돼 있다.

## 확인용 명령어

```bash
npm run build   # 타입 오류·빌드 오류 확인
npm run lint    # 코드 스타일 검사
```

Supabase 연동이 필요하다 (`.env.example`의 `NEXT_PUBLIC_SUPABASE_*`,
`SUPABASE_SERVICE_ROLE_KEY`). DB 스키마는 `supabase/migrations/`.
