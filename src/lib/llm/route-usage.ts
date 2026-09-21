import type { NextRequest } from "next/server";
import { isAdminRequest } from "@/lib/admin/session";
import { withUsageLogging } from "./usage";

/** 라우트 핸들러용: 요청 단위 모델 호출량·비용을 로그로 남기고, 관리자 테스트 요청에는 x-llm-usage 헤더로도 돌려준다. */
export function routeUsage<A extends [Request, ...unknown[]]>(name: string, handler: (...args: A) => Promise<Response | undefined>) {
  return withUsageLogging(name, handler, (req) => isAdminRequest(req as NextRequest));
}
