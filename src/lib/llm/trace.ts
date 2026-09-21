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
  searchCalls: number;
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

export function recordCall(rec: CallRecord) {
  storage.getStore()?.calls.push(rec);
}
