import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server-client";
import { createTaskSession } from "@/lib/sessions/task-sessions";
import { identifyCluster } from "@/lib/clusters/identify-cluster";
import type { CoreTaskInfo } from "@/types/task";

// 다단계 세션 시작. "고민쓰기 → 책처방전 → 편지" 같은 여러 차시짜리 과제를 시작할 때
// 한 번 호출해서 세션을 만들고, 이후 각 단계는 POST /api/sessions/{id}/stages로 이어간다.
// 로그인 사용자 전용 — 세션이 유저 계정에 귀속되어야 다음 차시 접속 때도 이어갈 수 있다.
export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

    const { subject, coreTaskInfo } = (await req.json()) as {
      subject?: string;
      coreTaskInfo?: CoreTaskInfo;
    };
    if (!subject || !coreTaskInfo) {
      return NextResponse.json({ error: "subject와 coreTaskInfo가 필요합니다." }, { status: 400 });
    }

    // 클러스터 배정은 이 시점에 한 번만 해둔다 (세션 전체가 같은 과제이므로).
    const cluster = await identifyCluster(coreTaskInfo);

    const session = await createTaskSession(supabase, {
      userId: user.id,
      subject,
      coreTaskInfo,
      clusterId: cluster.clusterId,
    });

    return NextResponse.json(session);
  } catch (err) {
    console.error("[/api/sessions] failed", err);
    return NextResponse.json({ error: "세션 생성 중 오류가 발생했습니다." }, { status: 500 });
  }
}
