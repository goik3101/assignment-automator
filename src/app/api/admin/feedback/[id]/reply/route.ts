import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin/session";
import { saveReply } from "@/lib/feedback/reply";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: "관리자만 접근할 수 있습니다." }, { status: 403 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { reply?: unknown } | null;
  const reply = typeof body?.reply === "string" ? body.reply : "";
  const result = await saveReply(id, reply);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
