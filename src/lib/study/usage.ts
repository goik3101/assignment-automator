import { getServiceClient } from "@/lib/supabase/service-client";

// 학습 도구의 AI 호출 횟수 제한. 하루(서버 시간 기준) 종류별 상한 — 환경변수로 조절한다.
// 기록 표(study_usage_events, 마이그레이션 0016)가 아직 없으면 서버 프로세스 메모리로 대신 센다
// (인스턴스마다 따로 세므로 정확하진 않지만, 표가 없다고 제한이 사라지지는 않게 한다).
export type StudyKind = "chat" | "summary" | "flashcards" | "quiz" | "exam" | "exam_grade" | "questions";

const num = (v: string | undefined, d: number) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);

export const STUDY_DAILY_LIMITS: Record<StudyKind, number> = {
  chat: num(process.env.STUDY_LIMIT_CHAT, 40),
  summary: num(process.env.STUDY_LIMIT_SUMMARY, 15),
  flashcards: num(process.env.STUDY_LIMIT_FLASHCARDS, 15),
  quiz: num(process.env.STUDY_LIMIT_QUIZ, 15),
  exam: num(process.env.STUDY_LIMIT_EXAM, 10),
  exam_grade: num(process.env.STUDY_LIMIT_EXAM_GRADE, 20),
  questions: num(process.env.STUDY_LIMIT_QUESTIONS, 30),
};

const KIND_LABEL: Record<StudyKind, string> = {
  chat: "AI 채팅",
  summary: "요약",
  flashcards: "플래시카드",
  quiz: "퀴즈",
  exam: "가상 시험",
  exam_grade: "시험 채점",
  questions: "제작 전 질문",
};

/** 사용자에게 그대로 보여줘도 되는 안내 메시지를 담은 에러. */
export class StudyLimitError extends Error {}

export function actorKey(identity: { userId: string | null; guestId: string | null }): string | null {
  if (identity.userId) return `user:${identity.userId}`;
  if (identity.guestId) return `guest:${identity.guestId}`;
  return null;
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
  memory.set(k, [...(memory.get(k) ?? []), Date.now()]);
}

/** 표가 없다는 뜻의 PostgREST/Postgres 오류인지. */
function isMissingTable(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === "42P01" || err.code === "PGRST205" || /study_usage_events/.test(err.message ?? "") && /(not find|does not exist|schema cache)/i.test(err.message ?? "");
}

export async function getStudyUsage(key: string, kind: StudyKind): Promise<number> {
  const since = dayStart();
  try {
    const { count, error } = await getServiceClient()
      .from("study_usage_events")
      .select("id", { count: "exact", head: true })
      .eq("actor_key", key)
      .eq("kind", kind)
      .gte("created_at", since.toISOString());
    if (error) {
      if (isMissingTable(error)) return memoryCount(key, kind, since);
      throw new Error(`학습 도구 사용량 조회 실패: ${error.message}`);
    }
    return count ?? 0;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("학습 도구")) throw err;
    return memoryCount(key, kind, since);
  }
}

export async function enforceStudyLimit(key: string | null, kind: StudyKind, isAdmin = false): Promise<void> {
  if (isAdmin) return;
  if (!key) throw new StudyLimitError("로그인이 필요해요.");
  const used = await getStudyUsage(key, kind);
  const limit = STUDY_DAILY_LIMITS[kind];
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
    if (error && !isMissingTable(error)) console.error("[study usage] 기록 실패", error);
  } catch (err) {
    console.error("[study usage] 기록 중 예외", err);
  }
}
