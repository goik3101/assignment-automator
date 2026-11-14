// 한자를 **내용으로 쓰는 과제**(한문 과목, 한자 쓰기·독음 문항)인지 알려 주는 요청 단위 범위. alias import 없음.
//
// 왜(2026-11-15, 거대 안내문 점검 한문-01): 생성 뒤 "이상 문자(다른 문자 체계) 제거" 안전장치가 한글 바로 뒤 괄호 속 한자 병기("부(富)")만
// 정상으로 보고 나머지 한자는 전부 지운다. 한문 과제에서는 한자가 답 자체라, 결과물이 "'일체유심조'를 한자로 쓰면 이다."처럼 **정답 한자가
// 통째로 사라진 채** 나갔다. 요청마다 다르므로 모듈 전역이 아니라 AsyncLocalStorage에 둔다(llm/scope.ts와 같은 방식).
import { AsyncLocalStorage } from "node:async_hooks";

const storage = new AsyncLocalStorage<boolean>();

export function withHanjaScope<T>(allowHan: boolean, fn: () => Promise<T>): Promise<T> {
  return storage.run(allowHan, fn);
}

export function hanjaAllowed(): boolean {
  return storage.getStore() ?? false;
}

/** 과목·주제·단계 이름·요구사항에 한문/한자가 나오면 한자를 내용으로 쓰는 과제로 본다. */
export function isHanjaTask(texts: (string | undefined | null)[]): boolean {
  return texts.some((t) => /한문|한자|漢字|漢文/.test(t ?? ""));
}
