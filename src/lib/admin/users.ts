import { getServiceClient } from "@/lib/supabase/service-client";
import { ADMIN_ACCOUNT_EMAIL } from "./session";

export interface UserListItem {
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
}

/** auth.users는 Supabase Auth가 관리하는 내장 테이블이라 일반 테이블처럼
 * .from()으로 못 읽는다 — service_role의 auth.admin.listUsers()로만 조회
 * 가능. 관리자 예약 계정(ADMIN_ACCOUNT_EMAIL)은 실사용자가 아니므로 제외. */
export async function listUsers(perPage = 200): Promise<UserListItem[]> {
  const { data, error } = await getServiceClient().auth.admin.listUsers({ perPage });
  if (error) throw new Error(`사용자 목록 조회 실패: ${error.message}`);

  return data.users
    .filter((u) => u.email !== ADMIN_ACCOUNT_EMAIL)
    .map((u) => ({
      id: u.id,
      email: u.email ?? null,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
    }))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}
