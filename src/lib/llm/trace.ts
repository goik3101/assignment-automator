import { AsyncLocalStorage } from "node:async_hooks";

// 요청(생성 1건) 단위로 모델 호출을 모으는 기록기. 라우트가 withLlmTrace로 감싸면 그 안에서 일어난 모든 호출이 여기에 쌓인다.
// 프롬프트·응답 본문·API 키는 저장하지 않는다(라벨과 숫자만).
export interface CallRecord {
  label: string;
  provider: string;
  model: string;
  ms: number;
  ok: boolean;
  retries: number;
  errorKind?: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  /** 입력 중 캐시로 처리된 토큰 수(없으면 0). */
  cachedInputTokens?: number;
  searchCalls: number;
  /** 우선 처리(priority) 등 비싼 등급으로 처리됐으면 그 이름 */
  tier?: string;
}

export interface Trace {
  name: string;
  startedAt: number;
  calls: CallRecord[];
}

const storage = new AsyncLocalStorage<Trace>();

export function withLlmTrace<T>(name: string, fn: (trace: Trace) => Promise<T>): Promise<T> {
  const trace: Trace = { name, startedAt: Date.now(), calls: [] };
  return storage.run(trace, () => fn(trace));
}

export function currentTrace(): Trace | undefined {
  return storage.getStore();
}

// 측정·테스트 스크립트가 부른 호출까지 **전부** 모아 종료할 때 한 줄로 남긴다(LLM_LEDGER=script일 때만, 서버에서는 꺼져 있다).
// 왜(2026-11-16): 대시보드 비용이 사이트 요청만 세서, 측정 스크립트가 쓴 비용($5 이상)이 어디에도 안 보였다.
// 분석 호출처럼 trace 밖에서 일어난 호출도 여기서는 잡힌다.
const LEDGER: CallRecord[] = [];
let ledgerHooked = false;
function hookLedger() {
  if (ledgerHooked) return;
  ledgerHooked = true;
  process.on("beforeExit", async () => {
    if (LEDGER.length === 0) return;
    const calls = LEDGER.splice(0);
    try {
      const { flushScriptLedger } = await import("@/lib/admin/script-ledger");
      await flushScriptLedger(calls);
    } catch {
      /* 기록은 부가 기능 */
    }
  });
}

export function recordCall(rec: CallRecord) {
  storage.getStore()?.calls.push(rec);
  if (process.env.LLM_LEDGER === "script") {
    LEDGER.push(rec);
    hookLedger();
  }
}
