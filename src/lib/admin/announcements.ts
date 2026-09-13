import { getServiceClient } from "@/lib/supabase/service-client";

export interface Announcement {
  id: string;
  created_at: string;
  message: string;
}

/** 관리자 목록용 — 전체 이력. announcements는 select RLS가 공개(누구나 허용)라
 * anon 클라이언트로도 읽을 수 있지만, 여기선 다른 admin 헬퍼들과 통일성을
 * 위해 service_role로 읽는다. */
export async function listAnnouncements(): Promise<Announcement[]> {
  const { data, error } = await getServiceClient()
    .from("announcements")
    .select("id, created_at, message")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`공지 목록 조회 실패: ${error.message}`);
  return data ?? [];
}

export async function createAnnouncement(message: string): Promise<Announcement> {
  const { data, error } = await getServiceClient()
    .from("announcements")
    .insert({ message })
    .select("id, created_at, message")
    .single();
  if (error) throw new Error(`공지 작성 실패: ${error.message}`);
  return data;
}

export async function deleteAnnouncement(id: string): Promise<void> {
  const { error } = await getServiceClient().from("announcements").delete().eq("id", id);
  if (error) throw new Error(`공지 삭제 실패: ${error.message}`);
}

/** 메인 화면 배너용 — 가장 최근 글 하나만. 공개 라우트에서 쓰므로 별도로
 * 둔다(등록/삭제와 같은 파일에 있어도 무방하지만 "공개 읽기"와 "관리자
 * 쓰기"를 호출부에서 구분하기 쉽게 이름을 분리). */
export async function getLatestAnnouncement(): Promise<Announcement | null> {
  const { data, error } = await getServiceClient()
    .from("announcements")
    .select("id, created_at, message")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`공지 조회 실패: ${error.message}`);
  return data;
}
