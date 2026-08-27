import { NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME } from "@/lib/admin/session";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(ADMIN_COOKIE_NAME);
  return response;
}
