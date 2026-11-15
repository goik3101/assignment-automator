// 사용: node --import ./scripts/qa/loader/register.mjs scripts/qa/<script>.ts
// src의 TS를 "@/…" 별칭과 확장자 없는 상대 import 그대로 실행하게 하는 Node 로더 등록기다.
// (Node 24 타입 스트리핑을 쓰므로 별도 빌드가 필요 없다. Next.js 번들러가 해 주던 해석만 대신한다.)
import { register } from "node:module";

register("./hooks.mjs", import.meta.url);

// 측정 스크립트가 쓴 모델 비용을 대시보드에 "테스트·측정" 줄로 남긴다(src/lib/llm/trace.ts, src/lib/admin/script-ledger.ts).
// SUPABASE 환경변수가 없으면(단위 테스트 등) 기록하지 않는다.
process.env.LLM_LEDGER ??= "script";
