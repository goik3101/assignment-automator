// **학생이 제작 전 질문에 답하는 동안 조사를 미리 돌려 둔다.**
//
// 화면 흐름은 analyze → 분석 결과 확인 → 모드 선택 → 제작 전 질문 2~4개 → 생성이다.
// "AI가 만들어줘요"를 고른 순간 이 길을 한 번 두드리면, 질문에 답하는 10~30초 동안 조사(8~13초)가 끝난다.
// 생성은 `researchNotes`가 들어오면 조사 호출을 건너뛰므로 그만큼 기다리는 시간이 줄어든다.
//
// 결과는 **서버 메모리에 3분, 한 번 쓰면 사라진다**(research-prefetch.ts) — 다른 학생과 섞이지 않는다.
// 실패해도 조용히 넘어간다: 생성이 평소대로 조사하면 된다. 그래서 이 길은 항상 202로 답한다.
import { NextRequest, NextResponse } from "next/server";
import { researchForTask } from "@/lib/gemini/generate-essay";
import { prefetchKey, startPrefetch, researchPrefetchOn } from "@/lib/essay/research-prefetch";
import { findStudentTopic } from "@/lib/selection/student-topic";
import { needsSubjectSelection } from "@/lib/selection/selection-need";
import { routeUsage } from "@/lib/llm/route-usage";
import { withUiLangRoute } from "@/lib/llm/ui-lang-route";
import { validateCoreTaskInfo } from "@/lib/api/validate";
import type { CoreTaskInfo } from "@/types/task";

export const maxDuration = 60;

export const POST = routeUsage("research-prefetch", withUiLangRoute(async function POST(req: NextRequest) {
  if (!researchPrefetchOn()) return NextResponse.json({ ok: false, skipped: "off" }, { status: 202 });
  try {
    const body = (await req.json()) as { subject?: string; coreTaskInfo?: CoreTaskInfo; instructions?: string };
    const core = body.coreTaskInfo;
    if (!core || validateCoreTaskInfo(core)) return NextResponse.json({ ok: false, skipped: "invalid" }, { status: 202 });

    // **대상이 아직 안 정해진 과제는 미리 하지 않는다.** 제작 전 질문의 답이 주제를 바꾸면
    // 엉뚱한 조사를 쓰게 된다 — 그 위험은 아끼는 10초보다 크다(CLAUDE.md의 같은 경고).
    if (needsSubjectSelection(core)) return NextResponse.json({ ok: false, skipped: "subject-open" }, { status: 202 });

    const elements = (core.task_elements ?? []).filter((e) => e.type === "text_submission");
    if (elements.length === 0) return NextResponse.json({ ok: false, skipped: "no-text-step" }, { status: 202 });

    const instructions = body.instructions ?? "";
    const key = prefetchKey({
      subject: body.subject ?? "",
      topic: core.topic ?? "",
      labels: elements.map((e) => e.label),
      studentTopic: findStudentTopic(instructions) ?? "",
    });
    startPrefetch(key, () => researchForTask({ subject: body.subject ?? "", coreTaskInfo: core, instructions }, elements));
    return NextResponse.json({ ok: true }, { status: 202 });
  } catch {
    return NextResponse.json({ ok: false, skipped: "error" }, { status: 202 });
  }
}));
