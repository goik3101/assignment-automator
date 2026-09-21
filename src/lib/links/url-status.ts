// 출처 링크 검증 결과를 3가지로 나눈다. 학생에게 "무효 출처"라고 보여도 되는 것은 페이지가 없다고 확실히 확인된 경우뿐이다.
//  - valid: 페이지가 열리고 내용이 있음
//  - invalid: 없는 페이지(404/410, 도메인 없음, 내용 없는 오류·주차 페이지)
//  - unverifiable: 봇 차단(401/403/429/451), 서버 오류(5xx), 시간 초과, 연결 실패 — 사람이 열면 열릴 수 있어서 죽은 링크로 단정하지 않는다
export type LinkStatus = "valid" | "invalid" | "unverifiable";

export function classifyHttpStatus(status: number): LinkStatus {
  if (status >= 200 && status < 400) return "valid";
  if (status === 404 || status === 410) return "invalid";
  return "unverifiable"; // 400·401·403·405·429·451·5xx 등: 서버가 응답은 했지만 존재 여부를 알 수 없다
}

/** fetch가 던진 오류: DNS 조회 실패(도메인 자체가 없음)만 invalid, 시간 초과·연결 끊김·TLS 등은 unverifiable. */
export function classifyFetchError(err: unknown): LinkStatus {
  const e = err as { cause?: { code?: string }; name?: string };
  const code = e?.cause?.code;
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return code === "ENOTFOUND" ? "invalid" : "unverifiable";
  return "unverifiable";
}

/** 사용자에게 "무효"라고 표시하고 각주를 지워도 되는가. */
export const isDefinitelyInvalid = (s: LinkStatus) => s === "invalid";

/** SourceRef.url_valid로 저장하는 값: true=확인됨, false=무효 확정, null=자동 확인 불가(검증 전과 같은 값이지만 무효로 취급하지 않는다). */
export const toUrlValid = (s: LinkStatus): boolean | null => (s === "valid" ? true : s === "invalid" ? false : null);
