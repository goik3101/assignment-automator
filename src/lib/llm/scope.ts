import { AsyncLocalStorage } from "node:async_hooks";
import type { SourceScope } from "../essay/source-scope.ts";

// 생성 요청 1건의 출처 범위. 라우트가 withSourceScope로 감싸면 그 안의 모든 검색 호출(조사·책 확인·구절 확인)과 출처 정리가 같은 범위를 본다.
const storage = new AsyncLocalStorage<SourceScope>();

export function withSourceScope<T>(scope: SourceScope, fn: () => Promise<T>): Promise<T> {
  return storage.run(scope, fn);
}

export function currentSourceScope(): SourceScope {
  return storage.getStore() ?? "all";
}
