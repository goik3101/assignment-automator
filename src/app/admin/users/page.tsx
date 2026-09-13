import Link from "next/link";
import { requireAdminOrRedirect } from "@/lib/admin/session";
import { listUsers } from "@/lib/admin/users";

export default async function AdminUsersPage() {
  await requireAdminOrRedirect();
  const users = await listUsers();

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">사용자 목록 ({users.length}명)</h1>
        <Link href="/admin" className="text-xs text-muted underline underline-offset-2 hover:text-foreground">
          대시보드로
        </Link>
      </div>

      {users.length === 0 ? (
        <p className="text-sm text-muted">아직 가입한 사용자가 없어요.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-xs text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">이메일</th>
                <th className="px-4 py-2 font-medium">가입일</th>
                <th className="px-4 py-2 font-medium">최근 로그인</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-border">
                  <td className="px-4 py-2">{u.email ?? "—"}</td>
                  <td className="px-4 py-2 text-muted">{new Date(u.created_at).toLocaleDateString("ko-KR")}</td>
                  <td className="px-4 py-2 text-muted">
                    {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString("ko-KR") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
