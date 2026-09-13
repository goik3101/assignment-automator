import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin/session";
import { listAnnouncements, createAnnouncement } from "@/lib/admin/announcements";

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: "관리자만 접근할 수 있습니다." }, { status: 403 });
  const items = await listAnnouncements();
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: "관리자만 접근할 수 있습니다." }, { status: 403 });

  const { message } = (await req.json()) as { message?: string };
  if (!message?.trim()) {
    return NextResponse.json({ error: "공지 내용을 입력해주세요." }, { status: 400 });
  }

  const announcement = await createAnnouncement(message.trim());
  return NextResponse.json({ announcement });
}
