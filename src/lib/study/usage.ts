import { getServiceClient } from "@/lib/supabase/service-client";

// 학습 도구의 AI 호출 횟수 제한. 하루(서버 시간 기준) 종류별 상한 — 환경변수로 조절한다.
// 기록 표(study_usage_events, 마이그레이션 0016)가 아직 없으면 서버 프로세스 메모리로 대신 센다
// (인스턴스마다 따로 세므로 정확하진 않지만, 표가 없다고 제한이 사라지지는 않게 한다).
// analyze·expected_questions는 예전엔 제한이 없던 경로(비용 방어용으로 추가). study_usage_events.kind의 check 제약에
// 아직 없는 값이라, 마이그레이션 전에는 DB 기록이 조용히 건너뛰어지고 서버 메모리 카운터가 대신 제한을 건다.
export type StudyKind = "chat" | "summary" | "flashcards" | "quiz" | "exam" | "exam_grade" | "questions" | "analyze" | "expected_questions" | "tutor";

const num = (v: string | undefined, d: number) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);

export const STUDY_DAILY_LIMITS: Record<StudyKind, number> = {
  chat: num(process.env.STUDY_LIMIT_CHAT, 20), // 2026-10-26 사용자 결정: 40 → 20 (관리자는 enforceStudyLimit에서 제외)
  // 출시 기준(2026-10-24 사용자 결정): 공부 자료 생성은 종류별 하루 1회. 채점·채팅은 별도.
  summary: num(process.env.STUDY_LIMIT_SUMMARY, 1),
  flashcards: num(process.env.STUDY_LIMIT_FLASHCARDS, 1),
  quiz: num(process.env.STUDY_LIMIT_QUIZ, 1),
  exam: num(process.env.STUDY_LIMIT_EXAM, 1),
  exam_grade: num(process.env.STUDY_LIMIT_EXAM_GRADE, 20),
  questions: num(process.env.STUDY_LIMIT_QUESTIONS, 30),
  // 정상 사용(과제 하나에 분석 1~3회, 예상 질문 1회)보다 훨씬 넉넉한 값 — 남용 방어용이지 일반 학생을 막으려는 값이 아니다.
  analyze: num(process.env.STUDY_LIMIT_ANALYZE, 30),
  expected_questions: num(process.env.STUDY_LIMIT_EXPECTED_QUESTIONS, 30),
  // AI 튜터(글쓰기까지 하는 채팅)는 메시지 한 번이 AI 채팅보다 무거워서 따로 센다. 관리자는 제외.
  tutor: num(process.env.STUDY_LIMIT_TUTOR, 20),
};

// 비로그인은 쿠키를 지우면 새 사용자가 되므로 IP 단위 상한을 한 번 더 건다. 학교처럼 공용 IP가 흔해서 일부러 크게 잡는다.
export const GUEST_IP_DAILY_LIMITS: Partial<Record<StudyKind, number>> = {
  analyze: num(process.env.STUDY_IP_LIMIT_ANALYZE, 200),
  expected_questions: num(process.env.STUDY_IP_LIMIT_EXPECTED_QUESTIONS, 200),
};

const KIND_LABEL: Record<StudyKind, string> = {
  chat: "AI 채팅",
  summary: "요약",
  flashcards: "플래시카드",
  quiz: "퀴즈",
  exam: "가상 시험",
  exam_grade: "시험 채점",
  questions: "제작 전 질문",
  analyze: "안내문 분석",
  expected_questions: "예상 질문",
  tutor: "AI 튜터",
};

/** 사용자에게 그대로 보여줘도 되는 안내 메시지를 담은 에러. */
export class StudyLimitError extends Error {}

export function actorKey(identity: { userId: string | null; guestId: string | null }): string | null {
  if (identity.userId) return `user:${identity.userId}`;
  if (identity.guestId) return `guest:${identity.guestId}`;
  return null;
}

/** 요청 IP로 만든 제한 키. 프록시가 채워 주는 헤더를 쓰며, 알 수 없으면 null(모르는 요청끼리 한 통에 묶이지 않게). */
export function ipActorKey(headers: { get(name: string): string | null }): string | null {
  const ip = headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip")?.trim();
  return ip ? `ip:${ip}` : null;
}

function dayStart(now = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ── 메모리 폴백 ──────────────────────────────────────────────────────────────
const memory = new Map<string, number[]>();

function memoryCount(key: string, kind: StudyKind, since: Date): number {
  const list = (memory.get(`${key}|${kind}`) ?? []).filter((t) => t >= since.getTime());
  memory.set(`${key}|${kind}`, list);
  return list.length;
}
function memoryRecord(key: string, kind: StudyKind) {
  const k = `${key}|${kind}`;
  // 키(IP 등)가 끝없이 늘어 메모리를 먹지 않도록 상한을 둔다 — 넘으면 가장 오래된 키부터 버린다.
  if (memory.size >= 20_000 && !memory.has(k)) memory.delete(memory.keys().next().value as string);
  memory.set(k, [...(memory.get(k) ?? []), Date.now()]);
}

/** 표가 없다는 뜻의 PostgREST/Postgres 오류인지. */
function isMissingTable(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === "42P01" || err.code === "PGRST205" || /study_usage_events/.test(err.message ?? "") && /(not find|does not exist|schema cache)/i.test(err.message ?? "");
}

export async function getStudyUsage(key: string, kind: StudyKind): Promise<number> {
  const since = dayStart();
  // DB 기록이 건너뛰어진 종류(위 주석)도 제한이 걸리도록 메모리 카운터와 큰 쪽을 쓴다 — 메모리는 성공마다 함께 올라가므로 DB 값보다 클 일이 없다.
  const inMemory = memoryCount(key, kind, since);
  try {
    const { count, error } = await getServiceClient()
      .from("study_usage_events")
      .select("id", { count: "exact", head: true })
      .eq("actor_key", key)
      .eq("kind", kind)
      .gte("created_at", since.toISOString());
    if (error) {
      if (isMissingTable(error)) return inMemory;
      throw new Error(`학습 도구 사용량 조회 실패: ${error.message}`);
    }
    return Math.max(count ?? 0, inMemory);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("학습 도구")) throw err;
    return inMemory;
  }
}

export async function enforceStudyLimit(key: string | null, kind: StudyKind, isAdmin = false, limitOverride?: number): Promise<void> {
  if (isAdmin) return;
  if (!key) throw new StudyLimitError("로그인이 필요해요.");
  const used = await getStudyUsage(key, kind);
  const limit = limitOverride ?? STUDY_DAILY_LIMITS[kind];
  if (used >= limit) {
    throw new StudyLimitError(`오늘 ${KIND_LABEL[kind]}을(를) 쓸 수 있는 횟수(${limit}회)를 모두 썼어요. 내일 다시 이용해 주세요.`);
  }
}

/** AI 호출이 성공한 뒤에만 기록한다 — 실패한 호출은 횟수를 차감하지 않는다. */
export async function recordStudyUsage(key: string | null, kind: StudyKind): Promise<void> {
  if (!key) return;
  memoryRecord(key, kind); // 표가 생기기 전/후 어느 쪽이든 폴백 카운터는 항상 같이 올려 둔다(표가 있으면 쓰이지 않는다)
  try {
    const { error } = await getServiceClient().from("study_usage_events").insert({ actor_key: key, kind });
    // 23514: kind check 제약에 없는 종류(마이그레이션 전) — 메모리 카운터가 대신하므로 조용히 넘어간다.
    if (error && !isMissingTable(error) && error.code !== "23514") console.error("[study usage] 기록 실패", error);
  } catch (err) {
    console.error("[study usage] 기록 중 예외", err);
  }
}
