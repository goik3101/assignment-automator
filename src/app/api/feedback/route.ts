import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server-client";
import { getServiceClient } from "@/lib/supabase/service-client";
import { LIMITS, checkText } from "@/lib/api/validate";
import { FEEDBACK_BUCKET, MAX_ATTACHMENTS, MAX_BYTES_EACH, sniffImage, type FeedbackAttachment } from "@/lib/feedback/attachments";

// F14: 문의/피드백 제출. 로그인 여부와 무관하게 받는다 (feedback_submissions의
// user_id는 nullable — 서비스 전용 채널이라 개인 계정과 엮이지 않아도 됨).
// 글만 보내면 JSON, 이미지가 있으면 multipart(message + files)로 받는다.
export async function POST(req: NextRequest) {
  let message = "";
  let files: File[] = [];
  if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: "요청을 읽지 못했어요." }, { status: 400 });
    const m = form.get("message");
    message = typeof m === "string" ? m : "";
    files = form.getAll("files").filter((f): f is File => typeof f !== "string" && f.size > 0);
  } else {
    const body = (await req.json().catch(() => null)) as { message?: unknown } | null;
    message = typeof body?.message === "string" ? body.message : "";
  }

  if (!message.trim()) {
    return NextResponse.json({ error: "내용을 입력해주세요." }, { status: 400 });
  }
  const tooLong = checkText(message, LIMITS.feedback, "내용");
  if (tooLong) return NextResponse.json({ error: tooLong }, { status: 400 });
  if (files.length > MAX_ATTACHMENTS) {
    return NextResponse.json({ error: `이미지는 최대 ${MAX_ATTACHMENTS}장까지 올릴 수 있어요.` }, { status: 400 });
  }

  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const uploaded: FeedbackAttachment[] = [];
  if (files.length > 0) {
    const storage = getServiceClient().storage.from(FEEDBACK_BUCKET);
    const folder = new Date().toISOString().slice(0, 7);
    for (const file of files) {
      if (file.size > MAX_BYTES_EACH) {
        await storage.remove(uploaded.map((u) => u.path));
        return NextResponse.json({ error: "이미지가 너무 커요. 다른 이미지를 올려 주세요." }, { status: 400 });
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const kind = sniffImage(bytes);
      if (!kind) {
        await storage.remove(uploaded.map((u) => u.path));
        return NextResponse.json({ error: "이미지 파일만 올릴 수 있어요." }, { status: 400 });
      }
      const path = `${folder}/${crypto.randomUUID()}.${kind.ext}`;
      const { error } = await storage.upload(path, bytes, { contentType: kind.type });
      if (error) {
        console.error("[/api/feedback] 이미지 저장 실패", error);
        await storage.remove(uploaded.map((u) => u.path));
        return NextResponse.json({ error: "이미지를 올리지 못했어요. 잠시 후 다시 시도해주세요." }, { status: 500 });
      }
      uploaded.push({ path, name: file.name.slice(0, 100), size: bytes.length, type: kind.type });
    }
  }

  // 이미지가 없으면 예전과 똑같은 열만 넣는다 — attachments 열이 아직 없어도 글 피드백은 계속 받는다.
  const { error } = await supabase
    .from("feedback_submissions")
    .insert({ user_id: user?.id ?? null, message: message.trim(), ...(uploaded.length > 0 ? { attachments: uploaded } : {}) });
  if (error) {
    console.error("[/api/feedback] 저장 실패", error);
    if (uploaded.length > 0) await getServiceClient().storage.from(FEEDBACK_BUCKET).remove(uploaded.map((u) => u.path));
    return NextResponse.json({ error: "전달하지 못했어요. 잠시 후 다시 시도해주세요." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
