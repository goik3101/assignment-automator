import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin/session";
import { deleteAnnouncement } from "@/lib/admin/announcements";

export async function DELETE(req: NextRequest, ctx: RouteContext<"/api/admin/announcements/[id]">) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: "관리자만 접근할 수 있습니다." }, { status: 403 });

  const { id } = await ctx.params;
  await deleteAnnouncement(id);
  return NextResponse.json({ ok: true });
}
