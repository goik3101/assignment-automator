import type { SupabaseClient } from "@supabase/supabase-js";
import { essayResultToText, planResultToText } from "@/lib/clusters/save-result-embedding";
import type { EssayResult, PlanResult } from "@/types/task";

// 학습 도구(요약·플래시카드·퀴즈·가상 시험·채팅)가 근거로 삼는 "과제 내용"을 서버가 직접 읽는다.
// 클라이언트가 보낸 본문을 믿지 않는다 — id만 받아서 세션 클라이언트(RLS)로 본인 것만 조회한다.
export type StudyContextRef = { kind: "history" | "learning"; id: string };

export interface StudyContext {
  kind: "history" | "learning";
  id: string;
  title: string;
  subject: string;
  /** 모델에 넣을 본문(길이 제한 적용). */
  text: string;
  /** 어떤 종류의 자료인지(프롬프트 문구용). */
  sourceLabel: string;
}

export const MAX_CONTEXT_CHARS = 14000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseContextRef(raw: unknown): StudyContextRef | null {
  const r = raw as { kind?: unknown; id?: unknown } | null;
  if (!r || typeof r !== "object") return null;
  if ((r.kind !== "history" && r.kind !== "learning") || typeof r.id !== "string" || !UUID.test(r.id)) return null;
  return { kind: r.kind, id: r.id };
}

export function clip(text: string, max = MAX_CONTEXT_CHARS): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "\n…(이하 생략)";
}

/** 학습 모드 세션: 항목별 조사 자료 + 학생이 쓴 글을 하나의 텍스트로 묶는다. */
export function learningToText(
  sections: { label: string; research: { content?: string } | null; draft: string }[]
): string {
  return sections
    .map((s) => {
      const parts = [`## ${s.label}`];
      if (s.research?.content) parts.push(`[조사 자료]\n${s.research.content}`);
      if (s.draft?.trim()) parts.push(`[학생이 쓴 글]\n${s.draft.trim()}`);
      return parts.join("\n");
    })
    .join("\n\n");
}

export async function loadStudyContext(supabase: SupabaseClient, ref: StudyContextRef): Promise<StudyContext | null> {
  if (ref.kind === "history") {
    const { data } = await supabase
      .from("user_histories")
      .select("id, title, subject, raw_text_result")
      .eq("id", ref.id)
      .maybeSingle();
    if (!data) return null;
    let text = "";
    try {
      const result = JSON.parse(data.raw_text_result as string) as EssayResult | PlanResult;
      text = result.type === "essay" ? essayResultToText(result) : planResultToText(result);
    } catch {
      return null;
    }
    return {
      kind: "history",
      id: ref.id,
      title: (data.title as string | null) || (data.subject as string),
      subject: data.subject as string,
      text: clip(text),
      sourceLabel: "AI가 작성한 결과물",
    };
  }

  const { data: session } = await supabase
    .from("learning_sessions")
    .select("id, title, subject")
    .eq("id", ref.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!session) return null;
  const { data: sections } = await supabase
    .from("learning_sections")
    .select("label, research, draft, position")
    .eq("session_id", ref.id)
    .order("position", { ascending: true });
  const text = learningToText(
    ((sections ?? []) as { label: string; research: { content?: string } | null; draft: string }[]) ?? []
  );
  if (!text.trim()) return null;
  return {
    kind: "learning",
    id: ref.id,
    title: session.title as string,
    subject: session.subject as string,
    text: clip(text),
    sourceLabel: "조사 자료와 학생이 쓴 글",
  };
}
