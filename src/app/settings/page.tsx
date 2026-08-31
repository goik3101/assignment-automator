"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabase/browser-client";
import { useAuth } from "@/lib/supabase/use-auth";
import ThemeToggle from "@/components/ThemeToggle";

const SCHOOL_TYPES = ["일반고", "특성화고", "특목고", "자율고", "기타"];

export default function SettingsPage() {
  const { user, loading } = useAuth();
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
      });
  }, [user]);

  async function handleSave() {
    setSaveState("saving");
    await fetch("/api/user/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        interests,
        textbook_publisher: textbookPublisher,
        school_type: schoolType,
      }),
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

  if (loading) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-6 py-12">
      <h1 className="text-lg font-semibold tracking-tight">설정</h1>

      <section className="rounded-md border border-border bg-surface p-5">
        <ThemeToggle />
      </section>

      {!user ? (
        <p className="text-sm text-muted">개인화 정보 설정은 로그인 후 이용할 수 있어요.</p>
      ) : (
        <>
          <section className="space-y-4 rounded-md border border-border bg-surface p-5">
            <div>
              <h2 className="text-sm font-medium">계정 정보</h2>
              <p className="mt-1 text-sm text-muted">{user.email}</p>
            </div>
          </section>

          <section className="space-y-4 rounded-md border border-border bg-surface p-5">
            <h2 className="text-sm font-medium">개인화 정보 (선택)</h2>
            <p className="text-xs text-muted">
              결과물에 자연스럽게 녹아들어요. 학교명은 받지 않습니다.
            </p>

            <div>
              <label className="mb-1 block text-xs text-muted">관심사·경험</label>
              <textarea
                value={interests}
                onChange={(e) => setInterests(e.target.value)}
                rows={3}
                placeholder="예: 축구를 좋아함, 반려동물을 키움"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-muted">교과서 출판사</label>
              <input
                value={textbookPublisher}
                onChange={(e) => setTextbookPublisher(e.target.value)}
                placeholder="예: 미래엔, 천재교육"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-muted">학교 유형</label>
              <select
                value={schoolType}
                onChange={(e) => setSchoolType(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
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
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-40"
            >
              {saveState === "saving" ? "저장 중..." : saveState === "saved" ? "저장됨" : "저장"}
            </button>
          </section>
        </>
      )}

      <section id="feedback" className="space-y-3 rounded-md border border-border bg-surface p-5 scroll-mt-6">
        <h2 className="text-sm font-medium">문의·피드백</h2>
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          rows={3}
          placeholder="불편한 점이나 제안해주실 내용을 적어주세요"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <button
          onClick={handleFeedbackSubmit}
          disabled={!feedback.trim()}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium disabled:opacity-40"
        >
          제출
        </button>
        {feedbackSent && <p className="text-xs text-accent">전달했어요. 감사합니다!</p>}
      </section>

      <section className="space-y-2 text-xs text-muted">
        <p>이용약관 · 개인정보처리방침 (준비 중)</p>
      </section>

      {user && (
        <section className="space-y-3 rounded-md border border-red-200 p-5 dark:border-red-900">
          <h2 className="text-sm font-medium text-red-700 dark:text-red-400">계정 탈퇴</h2>
          <p className="text-xs text-muted">
            탈퇴하면 히스토리를 포함한 모든 개인 데이터가 삭제되며 되돌릴 수 없습니다.
          </p>
          {!confirmingDelete ? (
            <button
              onClick={() => setConfirmingDelete(true)}
              className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 dark:border-red-800 dark:text-red-400"
            >
              계정 탈퇴
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={handleDeleteAccount}
                disabled={deleting}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                {deleting ? "삭제 중..." : "정말 삭제할게요"}
              </button>
              <button
                onClick={() => setConfirmingDelete(false)}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium"
              >
                취소
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
