import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveIdentity, GUEST_COOKIE_NAME, type RequestIdentity } from "@/lib/auth/identity";
import { isAdminRequest } from "@/lib/admin/session";
import { LlmError } from "@/lib/llm";
import {
  actorKey,
  enforceStudyLimit,
  recordStudyUsage,
  StudyLimitError,
  type StudyKind,
} from "./usage";
import { loadStudyContext, type StudyContext } from "./context";
import { parseContextRef } from "./context-pure";

export interface StudyRequestCtx {
  req: NextRequest;
  body: Record<string, unknown>;
  supabase: SupabaseClient;
  identity: RequestIdentity;
  isAdmin: boolean;
  key: string | null;
  /** parseContextRef + loadStudyContext로 불러온 과제 내용(요청에 context가 있었다면). */
  context: StudyContext | null;
}

const json = (error: string, status: number) => NextResponse.json({ error }, { status });

/**
 * 학습 도구 라우트 공통 틀: 본문 파싱 → 로그인/게스트 확인 → 횟수 제한 → (선택) 과제 내용 로드 → 핸들러 → 성공 시에만 횟수 기록.
 * 핸들러가 던지는 오류는 사용자에게 보여줄 수 있는 메시지로 바꾼다(내부 정보·프롬프트는 노출하지 않는다).
 */
export async function runStudyRoute(
  req: NextRequest,
  opts: {
    kind: StudyKind;
    /** true면 로그인 없이도(게스트 쿠키로) 쓸 수 있다. */
    allowGuest?: boolean;
    /** true면 body.context(과제 ref)가 반드시 있어야 하고 서버가 내용을 읽어온다. */
    requireContext?: boolean;
    /** 본문 크기 상한(바이트에 가까운 글자 수). */
    maxBodyChars?: number;
  },
  handler: (c: StudyRequestCtx) => Promise<unknown>
): Promise<Response> {
  try {
    const raw = await req.text();
    if (raw.length > (opts.maxBodyChars ?? 200_000)) return json("요청이 너무 커요.", 413);
    let body: Record<string, unknown>;
    try {
      const parsed = raw ? JSON.parse(raw) : {};
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not object");
      body = parsed as Record<string, unknown>;
    } catch {
      return json("요청 본문이 올바른 JSON이 아니에요.", 400);
    }

    const { identity, supabase } = await resolveIdentity(req);
    const isAdmin = isAdminRequest(req);
    if (!identity.userId && !(opts.allowGuest && identity.guestId)) {
      return json("로그인 후 이용할 수 있어요.", 401);
    }
    const key = actorKey(identity);

    let context: StudyContext | null = null;
    if (opts.requireContext || body.context) {
      const ref = parseContextRef(body.context);
      if (!ref) return json("대상 과제를 찾을 수 없어요.", 400);
      if (!identity.userId) return json("로그인 후 이용할 수 있어요.", 401);
      context = await loadStudyContext(supabase, ref);
      if (!context) return json("대상 과제를 찾을 수 없거나 아직 내용이 없어요.", 404);
    }

    try {
      await enforceStudyLimit(key, opts.kind, isAdmin);
    } catch (err) {
      if (err instanceof StudyLimitError) return json(err.message, 429);
      throw err;
    }

    const result = await handler({ req, body, supabase, identity, isAdmin, key, context });
    await recordStudyUsage(isAdmin ? null : key, opts.kind);

    const response = NextResponse.json(result);
    if (identity.isNewGuest && identity.guestId) {
      response.cookies.set(GUEST_COOKIE_NAME, identity.guestId, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24 * 365,
        path: "/",
      });
    }
    return response;
  } catch (err) {
    if (err instanceof StudyInputError) return json(err.message, 400);
    // 프롬프트·학생 입력은 로그에 남기지 않는다(종류와 오류 종류만).
    console.error(`[/api/study:${opts.kind}] failed`, err instanceof LlmError ? `LlmError(${err.kind})` : err instanceof Error ? err.name : "unknown");
    if (err instanceof LlmError && err.kind === "quota") return json("AI 사용량이 일시적으로 가득 찼어요. 잠시 후 다시 시도해 주세요.", 503);
    return json("처리하지 못했어요. 잠시 후 다시 시도해 주세요.", 500);
  }
}

/** 요청 값이 잘못됐을 때(사용자에게 그대로 안내) 던진다. */
export class StudyInputError extends Error {}

export function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}
export function int(v: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}
