"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabase/browser-client";
import { useAuth } from "@/lib/supabase/use-auth";
import { useAdminStatus } from "@/lib/admin/use-admin-status";
import type { SettingsTab } from "@/lib/settings/open";
import ThemeToggle from "@/components/ThemeToggle";
import LanguageToggle from "@/components/LanguageToggle";
import { useT } from "@/lib/i18n";
import { Check, ShieldCheck, SlidersHorizontal, Sparkles, UserRound, type LucideIcon } from "lucide-react";
import { AI_MODE_INFO, getAiMode, setAiMode } from "@/lib/ui/ai-pref";
import type { AiMode } from "@/lib/questions/questions-pure";

const SCHOOL_TYPES = ["일반고", "특성화고", "특목고", "자율고", "기타"];

const TABS: { id: SettingsTab; label: string; icon: LucideIcon }[] = [
  { id: "general", label: "일반 설정", icon: SlidersHorizontal },
  { id: "account", label: "계정", icon: UserRound },
  { id: "personal", label: "개인화 설정", icon: ShieldCheck },
  { id: "ai", label: "AI 설정", icon: Sparkles },
];

const sectionCls = "space-y-3 rounded-2xl border border-border bg-background p-5";
const fieldCls = "w-full rounded-xl border border-border-strong bg-surface px-3.5 text-sm placeholder:text-faint focus:border-foreground";

// 설정 모달과 /settings 페이지가 함께 쓰는 본문(탭 4개). 값 저장·탈퇴·로그아웃은 기존 API를 그대로 쓴다.
export default function SettingsPanel({ tab, onTab }: { tab: SettingsTab; onTab: (t: SettingsTab) => void }) {
  const t = useT();
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
        {TABS.map((tb) => (
          <button
            key={tb.id}
            onClick={() => onTab(tb.id)}
            aria-current={tab === tb.id ? "page" : undefined}
            className={[
              "flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
              tab === tb.id ? "bg-raised text-foreground" : "text-muted hover:bg-raised hover:text-foreground",
            ].join(" ")}
          >
            <tb.icon size={16} strokeWidth={1.7} className="shrink-0" />
            {t(tb.label)}
          </button>
        ))}
      </nav>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
        {tab === "general" && (
          <>
            <section className={sectionCls}>
              <ThemeToggle />
            </section>
            <section className={sectionCls}>
              <LanguageToggle />
            </section>
            <section id="feedback" className={sectionCls}>
              <h2 className="text-sm font-bold">{t("문의·피드백")}</h2>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                rows={3}
                placeholder={t("불편한 점이나 제안해주실 내용을 적어주세요")}
                className={`${fieldCls} py-2.5`}
              />
              <button
                onClick={handleFeedbackSubmit}
                disabled={!feedback.trim()}
                className="inline-flex h-9 items-center rounded-xl border border-border-strong px-4 text-sm font-semibold transition-colors hover:bg-raised disabled:opacity-40"
              >
                {t("제출")}
              </button>
              {feedbackSent && <p className="text-xs text-muted">{t("전달했어요. 감사합니다!")}</p>}
            </section>
            <p className="text-xs text-muted">{t("이용약관 · 개인정보처리방침 (준비 중)")}</p>
          </>
        )}

        {tab === "account" && (
          <>
            {loading ? null : !user ? (
              <section className={sectionCls}>
                <h2 className="text-sm font-bold">{t("로그인 전")}</h2>
                <p className="text-sm text-muted">{t("왼쪽 아래에서 이메일로 로그인할 수 있어요.")}</p>
              </section>
            ) : (
              <section className={sectionCls}>
                <h2 className="text-sm font-bold">{t("계정 정보")}</h2>
                <p className="text-sm text-muted">{isAdmin ? t("관리자 (예약 계정)") : user.email}</p>
                <button onClick={handleLogout} className="inline-flex h-9 items-center rounded-xl border border-border-strong px-4 text-sm font-semibold transition-colors hover:bg-raised">
                  {t("로그아웃")}
                </button>
              </section>
            )}
            {!isAdmin && (
              <p className="text-right">
                <Link href="/admin/login" className="text-xs text-muted underline underline-offset-2 hover:text-foreground">
                  {t("코드로 로그인하기")}
                </Link>
              </p>
            )}
            {user && !isAdmin && (
              <section className="space-y-3 rounded-2xl border border-danger/50 p-5">
                <h2 className="text-sm font-bold text-danger">{t("계정 탈퇴")}</h2>
                <p className="text-xs text-muted">{t("탈퇴하면 히스토리를 포함한 모든 개인 데이터가 삭제되며 되돌릴 수 없습니다.")}</p>
                {!confirmingDelete ? (
                  <button
                    onClick={() => setConfirmingDelete(true)}
                    className="inline-flex h-9 items-center rounded-xl border border-danger/60 px-4 text-sm font-semibold text-danger transition-colors hover:bg-danger/10"
                  >
                    {t("계정 탈퇴")}
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleDeleteAccount}
                      disabled={deleting}
                      className="inline-flex h-9 items-center rounded-xl bg-danger px-4 text-sm font-semibold text-white disabled:opacity-40"
                    >
                      {deleting ? t("삭제 중...") : t("정말 삭제할게요")}
                    </button>
                    <button onClick={() => setConfirmingDelete(false)} className="inline-flex h-9 items-center rounded-xl border border-border-strong px-4 text-sm font-semibold transition-colors hover:bg-raised">
                      {t("취소")}
                    </button>
                  </div>
                )}
              </section>
            )}
          </>
        )}

        {tab === "personal" &&
          (!user ? (
            <p className="text-sm text-muted">{t("개인화 정보 설정은 로그인 후 이용할 수 있어요.")}</p>
          ) : (
            <section className={sectionCls}>
              <h2 className="text-sm font-bold">{t("개인화 정보 (선택)")}</h2>
              <p className="text-xs text-muted">{t("결과물에 자연스럽게 녹아들어요. 학교명은 받지 않습니다.")}</p>
              <div>
                <label className="mb-1 block text-xs text-muted">{t("관심사·경험")}</label>
                <textarea
                  value={interests}
                  onChange={(e) => setInterests(e.target.value)}
                  rows={3}
                  placeholder={t("예: 축구를 좋아함, 반려동물을 키움")}
                  className={`${fieldCls} py-2.5`}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted">{t("교과서 출판사")}</label>
                <input
                  value={textbookPublisher}
                  onChange={(e) => setTextbookPublisher(e.target.value)}
                  placeholder={t("예: 미래엔, 천재교육")}
                  className={`${fieldCls} h-10`}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted">{t("학교 유형")}</label>
                <select
                  value={schoolType}
                  onChange={(e) => setSchoolType(e.target.value)}
                  className={`${fieldCls} h-10`}
                >
                  <option value="">{t("선택 안 함")}</option>
                  {SCHOOL_TYPES.map((s) => (
                    <option key={s} value={s}>
                      {t(s)}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleSave}
                disabled={saveState === "saving"}
                className="inline-flex h-9 items-center rounded-xl bg-accent px-4 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {saveState === "saving" ? t("저장 중...") : saveState === "saved" ? t("저장됨") : t("저장")}
              </button>
            </section>
          ))}

        {tab === "ai" && <AiTab />}
      </div>
    </div>
  );
}

// "만드는 방식" — 제작 전에 학생에게 묻는 질문의 양을 정한다. 브라우저에 저장되어 로그인 없이도 쓸 수 있다.
function AiTab() {
  const t = useT();
  const [mode, setMode] = useState<AiMode>("fast");
  useEffect(() => {
    // 저장된 값은 클라이언트에서만 읽을 수 있어 마운트 후에 반영한다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMode(getAiMode());
  }, []);
  return (
    <>
      <section className={sectionCls} aria-labelledby="ai-mode-title">
        <h2 id="ai-mode-title" className="text-sm font-bold">
          {t("만드는 방식")}
        </h2>
        <p className="text-xs leading-relaxed text-muted">{t("AI가 결과물을 만들기 전에 몇 가지를 물어볼 수 있어요. 질문은 결과물에 실제로 영향을 주는 것만 하고, 필요 없으면 묻지 않아요.")}</p>
        <div role="radiogroup" aria-labelledby="ai-mode-title" className="grid gap-2.5 sm:grid-cols-2">
          {(Object.keys(AI_MODE_INFO) as AiMode[]).map((m) => (
            <button
              key={m}
              role="radio"
              aria-checked={mode === m}
              onClick={() => {
                setMode(m);
                setAiMode(m);
              }}
              className={[
                "flex flex-col items-start gap-1.5 rounded-xl border p-4 text-left transition-colors",
                mode === m ? "border-foreground bg-raised" : "border-border-strong hover:border-foreground",
              ].join(" ")}
            >
              <span className="flex w-full items-center justify-between text-sm font-bold">
                {t(AI_MODE_INFO[m].label)}
                {mode === m && <Check size={16} strokeWidth={2.2} aria-hidden />}
              </span>
              <span className="text-[13px] leading-relaxed text-muted">{t(AI_MODE_INFO[m].summary)}</span>
            </button>
          ))}
        </div>
        {mode === "fast" && <p className="text-xs text-faint">{t("기본값이에요.")}</p>}
      </section>
      <section className={sectionCls}>
        <h2 className="text-sm font-bold">{t("AI 사용 안내")}</h2>
        <ul className="space-y-1.5 text-sm text-muted">
          <li>{t("· 완성 원고·실행 계획 만들기: 로그인 시 하루 2회")}</li>
          <li>{t("· 결과 수정 요청(다시 만들기): 하루 1회")}</li>
          <li>{t("· 학습 모드(자료 조사 + 피드백): 하루 5회")}</li>
          <li>{t("· 요약·플래시카드·퀴즈·가상 시험·AI 채팅: 종류별로 하루 횟수 제한이 있어요")}</li>
        </ul>
      </section>
    </>
  );
}
