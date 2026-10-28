import { NextRequest } from "next/server";
import { routeUsage } from "@/lib/llm/route-usage";
import { runStudyRoute, str, StudyInputError } from "@/lib/study/route";
import { isUuid } from "@/lib/study/context-pure";
import { answerTutor } from "@/lib/tutor/tutor";
import { questionsLeft, titleFromMessage, TUTOR_HISTORY_TURNS, type TutorTurn } from "@/lib/tutor/tutor-pure";

export const maxDuration = 120;

const MAX_IMAGE_BASE64 = 5_500_000; // 약 4MB 이미지
const ALLOWED_IMAGE = /^image\/(png|jpe?g|webp|gif)$/;
const NOT_READY = "AI 튜터를 아직 준비하는 중이에요. 잠시 후 다시 이용해 주세요.";

/** 표가 없다는 뜻의 PostgREST/Postgres 오류(마이그레이션 0019 미적용). */
const missing = (e: { code?: string } | null) => e?.code === "42P01" || e?.code === "PGRST205";

// AI 튜터: 학생이 메시지를 보내면 서버가 저장된 이전 대화를 직접 읽어(클라이언트가 보낸 대화를 믿지 않는다) 답하고,
// 이번 메시지와 답을 대화에 저장한다. AI 호출이 실패하면 아무것도 저장하지 않고 횟수도 차감하지 않는다. 로그인 사용자만, 하루 횟수 제한(study/usage.ts).
export const POST = routeUsage("tutor", async function POST(req: NextRequest) {
  return runStudyRoute(req, { kind: "tutor", maxBodyChars: 8_000_000 }, async ({ body, supabase, identity, lang }) => {
    const userId = identity.userId!;
    const message = str(body.message, 4000).trim();
    if (!message) throw new StudyInputError("메시지를 입력해 주세요.");

    let image: { base64: string; mimeType: string } | null = null;
    const img = body.image as { base64?: unknown; mimeType?: unknown } | undefined;
    if (img && typeof img.base64 === "string" && typeof img.mimeType === "string") {
      if (!ALLOWED_IMAGE.test(img.mimeType)) throw new StudyInputError("이미지 파일(JPG, PNG, WEBP)만 올릴 수 있어요.");
      if (img.base64.length > MAX_IMAGE_BASE64) throw new StudyInputError("이미지가 너무 커요. 더 작은 사진으로 올려 주세요.");
      image = { base64: img.base64, mimeType: img.mimeType };
    }

    let conversationId: string | null = null;
    let recent: { role: string; content: string; attachment_text: string | null; question: unknown }[] = [];
    if (body.conversationId != null) {
      if (!isUuid(body.conversationId)) throw new StudyInputError("대화를 찾을 수 없어요.");
      conversationId = body.conversationId;
      const { data: conv, error } = await supabase.from("tutor_conversations").select("id").eq("id", conversationId).maybeSingle();
      if (missing(error)) throw new StudyInputError(NOT_READY);
      if (!conv) throw new StudyInputError("대화를 찾을 수 없어요.");
      // 최근 대화만 모델에 다시 보낸다(최신순으로 읽어 뒤집는다).
      const { data: rows } = await supabase
        .from("tutor_messages")
        .select("role, content, attachment_text, question")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(TUTOR_HISTORY_TURNS);
      recent = (rows ?? []).reverse();
    }

    const turns: TutorTurn[] = [
      ...recent.map((m) => ({ role: m.role as "user" | "assistant", content: m.content, attachmentText: m.attachment_text })),
      { role: "user" as const, content: message },
    ];
    const answer = await answerTutor({ turns, image, lang, questionsLeft: questionsLeft(recent) });

    const now = Date.now();
    if (!conversationId) {
      const { data: created, error } = await supabase
        .from("tutor_conversations")
        .insert({ user_id: userId, title: titleFromMessage(message) })
        .select("id")
        .single();
      if (missing(error)) throw new StudyInputError(NOT_READY);
      if (error || !created) throw error ?? new Error("대화 생성 실패");
      conversationId = created.id as string;
    }
    // 같은 시각이면 순서가 뒤섞일 수 있어 답을 1ms 뒤로 적는다.
    const { error: msgErr } = await supabase.from("tutor_messages").insert([
      { conversation_id: conversationId, user_id: userId, role: "user", content: message, attachment_text: answer.imageText || null, created_at: new Date(now).toISOString() },
      {
        conversation_id: conversationId,
        user_id: userId,
        role: "assistant",
        content: answer.reply,
        sources: answer.sources.length ? answer.sources.map((s) => ({ n: s.n, title: s.title, url: s.url })) : null,
        question: answer.question,
        created_at: new Date(now + 1).toISOString(),
      },
    ]);
    if (msgErr) throw msgErr;
    await supabase.from("tutor_conversations").update({ updated_at: new Date(now + 1).toISOString() }).eq("id", conversationId);

    return { conversationId, reply: answer.reply, sources: answer.sources, question: answer.question };
  });
});
