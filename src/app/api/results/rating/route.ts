import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/service-client";

// 결과물 평가(품질·분량) 저장. 로그인 여부와 무관하게 받는다. 개인정보·본문·submission_id는 받지도 저장하지도 않는다(마이그레이션 0022).
// 같은 결과물에서 품질과 분량을 따로 눌러도 한 줄로 합치도록, 화면이 만든 임의 uuid로 upsert한다.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const QUALITY = new Set(["good", "bad"]);
const LENGTH = new Set(["long", "ok", "short"]);

interface Step {
  label: string;
  chars: number;
}

/** 화면이 보낸 구조 정보를 숫자·짧은 글자로만 걸러서 받는다(임의 JSON을 그대로 저장하지 않는다). */
function cleanContext(raw: unknown): Record<string, unknown> {
  const c = (raw ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(1_000_000, Math.round(v))) : null);
  const steps: Step[] = Array.isArray(c.steps)
    ? c.steps.slice(0, 20).flatMap((s) => {
        const o = s as { label?: unknown; chars?: unknown };
        const chars = num(o.chars);
        return typeof o.label === "string" && chars !== null ? [{ label: o.label.slice(0, 40), chars }] : [];
      })
    : [];
  const w = (c.warnings ?? {}) as Record<string, unknown>;
  return {
    steps,
    totalChars: num(c.totalChars),
    sources: num(c.sources),
    latencyMs: num(c.latencyMs),
    warnings: { noSources: w.noSources === true, length: w.length === true, structure: w.structure === true },
  };
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { id?: unknown; quality?: unknown; length?: unknown; kind?: unknown; context?: unknown } | null;
  if (!body || typeof body.id !== "string" || !UUID.test(body.id)) return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });
  const quality = typeof body.quality === "string" && QUALITY.has(body.quality) ? body.quality : null;
  const length = typeof body.length === "string" && LENGTH.has(body.length) ? body.length : null;
  if (!quality && !length) return NextResponse.json({ error: "평가를 골라 주세요." }, { status: 400 });
  const kind = body.kind === "plan" ? "plan" : "essay";

  try {
    const supabase = getServiceClient();
    const now = new Date().toISOString();
    // 이미 있으면 새로 고른 항목만 덮어쓴다(품질을 눌러 둔 뒤 분량을 누르면 품질이 지워지지 않게).
    const { data: existing } = await supabase.from("result_ratings").select("quality, length").eq("id", body.id).maybeSingle();
    const { error } = await supabase.from("result_ratings").upsert({
      id: body.id,
      updated_at: now,
      quality: quality ?? existing?.quality ?? null,
      length: length ?? existing?.length ?? null,
      kind,
      context: cleanContext(body.context),
    });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    // 평가는 부가 기능 — 표가 아직 없어도 학생 화면은 막지 않는다.
    console.error("[/api/results/rating] 저장 실패", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "저장하지 못했어요." }, { status: 500 });
  }
}
