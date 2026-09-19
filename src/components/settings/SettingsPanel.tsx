"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabase/browser-client";
import { useAuth } from "@/lib/supabase/use-auth";
import { useAdminStatus } from "@/lib/admin/use-admin-status";
import type { SettingsTab } from "@/lib/settings/open";
import ThemeToggle from "@/components/ThemeToggle";

const SCHOOL_TYPES = ["일반고", "특성화고", "특목고", "자율고", "기타"];

const TABS: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  {
    id: "general",
    label: "일반 설정",
    icon: <path d="M3 6h14M3 14h14M7 4v4M13 12v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />,
  },
  {
    id: "account",
    label: "계정",
    icon: (
      <>
        <circle cx="10" cy="7" r="3" stroke="currentColor" strokeWidth="1.5" />
        <path d="M4 17c.8-3 3-4.5 6-4.5s5.200 1.500 6 4.500" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </>
    ),
  },
  {
    id: "personal",
    label: "개인화 설정",
    icon: <path d="M10 2.500 4 5v4.500c0 3.700 2.500 6.300 6 8 3.500-1.700 6-4.300 6-8V5l-6-2.500Z" stroke="currentColor" strokeWidth="1.500" strokeLinejoin="round" />,
  },
  {
    id: "ai",
    label: "AI 설정",
    icon: <path d="M9 3l1.500 4L14.500 8.500 10.500 10 9 14 7.500 10 3.500 8.500 7.500 7 9 3ZM15 12l.8 2.200L18 15l-2.200.8L15 18l-.8-2.200L12 15l2.200-.8L15 12Z" stroke="currentColor" strokeWidth="1.300" strokeLinejoin="round" />,
  },
];

const sectionCls = "space-y-3 rounded-2xl border border-border bg-background p-5";

// 설정 모달과 /settings 페이지가 함께 쓰는 본문(탭 4개). 값 저장·탈퇴·로그아웃은 기존 API를 그대로 쓴다.
export default function SettingsPanel({ tab, onTab }: { tab: SettingsTab; onTab: (t: SettingsTab) => void }) {
  const { user, loading } = useAuth();
  const { isAdmin, setIsAdmin } = useAdminStatus();
  const router = useRouter();

  const [interests, setInterests] = useState("");
  const [textbookPublisher, setTextbookPublisher] = useState("");
  const [schoolType, setSchoolType] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");

  const [feedback, setFeedback] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetch("/api/user/settings")
      .then((res) => res.json())
      .then((data) => {
        setInterests(data.interests ?? "");
        setTextbookPublisher(data.textbook_publisher ?? "");
        setSchoolType(data.school_type ?? "");
      })
      .catch(() => {});
  }, [user]);

  async function handleSave() {
    setSaveState("saving");
    await fetch("/api/user/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interests, textbook_publisher: textbookPublisher, school_type: schoolType }),
    });
    setSaveState("saved");
    setTimeout(() => setSaveState("idle"), 1500);
  }

  async function handleFeedbackSubmit() {
    if (!feedback.trim()) return;
    await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: feedback }),
    });
    setFeedback("");
    setFeedbackSent(true);
    setTimeout(() => setFeedbackSent(false), 3000);
  }

  async function handleLogout() {
    if (isAdmin) {
      await fetch("/api/admin/logout", { method: "POST" });
      setIsAdmin(false);
    }
    await getBrowserSupabase().auth.signOut();
  }

  async function handleDeleteAccount() {
    setDeleting(true);
    const res = await fetch("/api/user/account", { method: "DELETE" });
    if (res.ok) {
      await getBrowserSupabase().auth.signOut();
      router.push("/");
    } else {
      setDeleting(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col md:flex-row">
      <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-border p-3 md:w-48 md:flex-col md:overflow-visible md:border-b-0 md:border-r">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => onTab(t.id)}
            aria-current={tab === t.id ? "page" : undefined}
            className={[
              "flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-sm font-bold transition-colors",
              tab === t.id ? "bg-accent/15 text-foreground" : "text-foreground/80 hover:bg-accent/10",
            ].join(" ")}
          >
            <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0">
              {t.icon}
            </svg>
            {t.label}
          </button>
        ))}
      </nav>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
        {tab === "general" && (
          <>
            <section className={sectionCls}>
              <ThemeToggle />
            </section>
            <section id="feedback" className={sectionCls}>
              <h2 className="text-sm font-bold">문의·피드백</h2>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                rows={3}
                placeholder="불편한 점이나 제안해주실 내용을 적어주세요"
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              />
              <button
                onClick={handleFeedbackSubmit}
                disabled={!feedback.trim()}
                className="rounded-full border border-foreground px-4 py-1.5 text-sm font-bold disabled:opacity-40"
              >
                제출
              </button>
              {feedbackSent && <p className="text-xs text-muted">전달했어요. 감사합니다!</p>}
            </section>
            <p className="text-xs text-muted">이용약관 · 개인정보처리방침 (준비 중)</p>
          </>
        )}

        {tab === "account" && (
          <>
            {loading ? null : !user ? (
              <section className={sectionCls}>
                <h2 className="text-sm font-bold">로그인 전</h2>
                <p className="text-sm text-muted">왼쪽 아래에서 이메일로 로그인할 수 있어요.</p>
              </section>
            ) : (
              <section className={sectionCls}>
                <h2 className="text-sm font-bold">계정 정보</h2>
                <p className="text-sm text-muted">{isAdmin ? "관리자 (예약 계정)" : user.email}</p>
                <button onClick={handleLogout} className="rounded-full border border-foreground px-4 py-1.5 text-sm font-bold">
                  로그아웃
                </button>
              </section>
            )}
            {!isAdmin && (
              <p className="text-right">
                <Link href="/admin/login" className="text-xs text-muted underline underline-offset-2 hover:text-foreground">
                  코드로 로그인하기
                </Link>
              </p>
            )}
            {user && !isAdmin && (
              <section className="space-y-3 rounded-2xl border border-red-500/50 p-5">
                <h2 className="text-sm font-bold text-red-500">계정 탈퇴</h2>
                <p className="text-xs text-muted">탈퇴하면 히스토리를 포함한 모든 개인 데이터가 삭제되며 되돌릴 수 없습니다.</p>
                {!confirmingDelete ? (
                  <button
                    onClick={() => setConfirmingDelete(true)}
                    className="rounded-full border border-red-500/70 px-4 py-1.5 text-sm font-bold text-red-500"
                  >
                    계정 탈퇴
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleDeleteAccount}
                      disabled={deleting}
                      className="rounded-full bg-red-600 px-4 py-1.5 text-sm font-bold text-white disabled:opacity-40"
                    >
                      {deleting ? "삭제 중..." : "정말 삭제할게요"}
                    </button>
                    <button onClick={() => setConfirmingDelete(false)} className="rounded-full border border-border px-4 py-1.5 text-sm font-bold">
                      취소
                    </button>
                  </div>
                )}
              </section>
            )}
          </>
        )}

        {tab === "personal" &&
          (!user ? (
            <p className="text-sm text-muted">개인화 정보 설정은 로그인 후 이용할 수 있어요.</p>
          ) : (
            <section className={sectionCls}>
              <h2 className="text-sm font-bold">개인화 정보 (선택)</h2>
              <p className="text-xs text-muted">결과물에 자연스럽게 녹아들어요. 학교명은 받지 않습니다.</p>
              <div>
                <label className="mb-1 block text-xs text-muted">관심사·경험</label>
                <textarea
                  value={interests}
                  onChange={(e) => setInterests(e.target.value)}
                  rows={3}
                  placeholder="예: 축구를 좋아함, 반려동물을 키움"
                  className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted">교과서 출판사</label>
                <input
                  value={textbookPublisher}
                  onChange={(e) => setTextbookPublisher(e.target.value)}
                  placeholder="예: 미래엔, 천재교육"
                  className="w-full rounded-full border border-border bg-surface px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted">학교 유형</label>
                <select
                  value={schoolType}
                  onChange={(e) => setSchoolType(e.target.value)}
                  className="w-full rounded-full border border-border bg-surface px-3 py-2 text-sm"
                >
                  <option value="">선택 안 함</option>
                  {SCHOOL_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleSave}
                disabled={saveState === "saving"}
                className="rounded-full bg-accent px-4 py-1.5 text-sm font-bold text-accent-foreground disabled:opacity-40"
              >
                {saveState === "saving" ? "저장 중..." : saveState === "saved" ? "저장됨" : "저장"}
              </button>
            </section>
          ))}

        {tab === "ai" && (
          <section className={sectionCls}>
            <h2 className="text-sm font-bold">AI 사용 안내</h2>
            <ul className="space-y-1.5 text-sm text-muted">
              <li>· 완성 원고·실행 계획 만들기: 로그인 시 하루 2회</li>
              <li>· 결과 수정 요청(재생성): 하루 1회</li>
              <li>· 학습 모드(자료 조사 + 피드백): 하루 5회</li>
            </ul>
            <p className="text-xs text-muted">AI 모델·말투 같은 세부 설정은 준비 중이에요.</p>
          </section>
        )}
      </div>
    </div>
  );
}
