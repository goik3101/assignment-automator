// 학습 모드 화면 공용 fetch 헬퍼 — 서버가 주는 사용자용 에러 메시지를 그대로 Error로 던진다.
export async function learningApi<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new Error("네트워크 연결을 확인해주세요.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "요청에 실패했어요.");
  return data as T;
}

export const STATUS_LABEL: Record<string, string> = {
  not_started: "시작 전",
  researching: "자료 조사 중",
  writing: "작성 중",
  feedback: "피드백 받음",
  revision: "수정 중",
  completed: "완료",
};

export function formatDue(due: string | null | undefined): string | null {
  const v = due?.trim();
  return v ? v : null;
}
