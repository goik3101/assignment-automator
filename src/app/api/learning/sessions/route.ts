import { NextRequest, NextResponse } from "next/server";
import { requireLearningUser, jsonError } from "@/lib/learning/auth";
import { deriveLearningItems } from "@/lib/learning/items";
import type { AdministrativeInfo, CoreTaskInfo } from "@/types/task";
import type { SubjectMode } from "@/types/learning";

// 학습 과제 목록 (사이드바 "작업 목록"과 /learning 화면 공용). withHistories=1이면
// 자동 작성 모드의 최근 히스토리도 읽기 전용으로 함께 돌려준다(사이드바 작업 목록에서
// 두 모드를 한 목록에 표시하기 위함 — user_histories는 조회만 한다).
export async function GET(req: NextRequest) {
  try {
    const auth = await requireLearningUser(req);
    if ("error" in auth) return auth.error;
    const { supabase } = auth;

    const { data: sessions, error } = await supabase
      .from("learning_sessions")
      .select("id, title, subject, status, admin_info, focus_subject, research_status, updated_at, created_at")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) throw error;

    const ids = (sessions ?? []).map((s) => s.id);
    const progress = new Map<string, { done: number; total: number }>();
    if (ids.length > 0) {
      const { data: sections, error: sErr } = await supabase
        .from("learning_sections")
        .select("session_id, status")
        .in("session_id", ids);
      if (sErr) throw sErr;
      for (const s of sections ?? []) {
        const p = progress.get(s.session_id) ?? { done: 0, total: 0 };
        p.total += 1;
        if (s.status === "completed") p.done += 1;
        progress.set(s.session_id, p);
      }
    }

    let histories: { id: string; title: string | null; subject: string; created_at: string }[] | undefined;
    if (req.nextUrl.searchParams.get("withHistories") === "1") {
      const { data } = await supabase
        .from("user_histories")
        .select("id, title, subject, created_at")
        .eq("is_current", true)
        .order("created_at", { ascending: false })
        .limit(8);
      histories = data ?? [];
    }

    return NextResponse.json({
      sessions: (sessions ?? []).map((s) => ({ ...s, progress: progress.get(s.id) ?? { done: 0, total: 0 } })),
      histories,
    });
  } catch (err) {
    console.error("[/api/learning/sessions] 목록 조회 실패", err);
    return jsonError("학습 과제 목록을 불러오지 못했어요.", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireLearningUser(req);
    if ("error" in auth) return auth.error;
    const { supabase, user } = auth;

    const body = (await req.json()) as {
      subject?: string;
      coreTaskInfo?: CoreTaskInfo;
      adminInfo?: AdministrativeInfo | null;
      instructions?: string;
      focusSubject?: string | null;
      subjectMode?: SubjectMode | null;
    };
    if (!body.subject?.trim() || !body.coreTaskInfo?.task_elements?.length) {
      return jsonError("과목과 분석된 과제 정보가 필요해요.", 400);
    }

    const items = deriveLearningItems(body.coreTaskInfo);
    if (items.length === 0) return jsonError("이 과제에서 작성할 항목을 찾지 못했어요.", 422);

    const { data: session, error } = await supabase
      .from("learning_sessions")
      .insert({
        user_id: user.id,
        subject: body.subject.trim(),
        title: (body.coreTaskInfo.topic || body.subject).slice(0, 120),
        core_task_info: body.coreTaskInfo,
        admin_info: body.adminInfo ?? null,
        instructions: body.instructions?.trim() || null,
        focus_subject: body.focusSubject?.trim() || null,
        subject_mode: body.subjectMode ?? null,
      })
      .select("id")
      .single();
    if (error || !session) throw error ?? new Error("세션 생성 실패");

    const { error: secErr } = await supabase.from("learning_sections").insert(
      items.map((it, i) => ({
        session_id: session.id,
        user_id: user.id,
        position: i,
        label: it.label,
        element_label: it.elementLabel,
      }))
    );
    if (secErr) {
      // 항목 생성에 실패하면 빈 세션이 남지 않게 정리한다.
      await supabase.from("learning_sessions").delete().eq("id", session.id);
      throw secErr;
    }

    return NextResponse.json({ id: session.id, itemCount: items.length });
  } catch (err) {
    console.error("[/api/learning/sessions] 생성 실패", err);
    return jsonError("학습 과제를 만들지 못했어요. 잠시 후 다시 시도해주세요.", 500);
  }
}
