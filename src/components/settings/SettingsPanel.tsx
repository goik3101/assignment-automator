"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Minus, Plus, Search, Send, Settings, Sparkles, UserRound, X, ShieldCheck, type LucideIcon } from "lucide-react";
import { getBrowserSupabase } from "@/lib/supabase/browser-client";
import { useAuth } from "@/lib/supabase/use-auth";
import { useAdminStatus } from "@/lib/admin/use-admin-status";
import type { SettingsTab } from "@/lib/settings/open";
import { useLang, useT } from "@/lib/i18n";
import { LANGS } from "@/lib/i18n/core";
import { AI_MODE_INFO, getAiMode, setAiMode } from "@/lib/ui/ai-pref";
import type { AiMode } from "@/lib/questions/questions-pure";
import {
  DEFAULT_STUDY_PREFS,
  FLASHCARD_COUNT,
  QUIZ_COUNT,
  loadStudyPrefs,
  resetStudyPrefs,
  saveStudyPrefs,
  type QuizType,
  type StudyPrefs,
} from "@/lib/study/prefs";

const SCHOOL_TYPES = ["일반고", "특성화고", "특목고", "자율고", "기타"];

const TABS: { id: SettingsTab; label: string; icon: LucideIcon }[] = [
  { id: "general", label: "일반 설정", icon: Settings },
  { id: "account", label: "계정", icon: UserRound },
  { id: "personal", label: "개인화 설정", icon: ShieldCheck },
  { id: "ai", label: "AI 설정", icon: Sparkles },
  { id: "feedback", label: "개선 요청", icon: Send },
];

const fieldCls = "w-full rounded-xl bg-background px-3.5 text-sm outline-none placeholder:text-faint focus:ring-1 focus:ring-foreground";
const THEME_KEY = "studed-theme";

// ── 작은 구성 요소 ─────────────────────────────────────────────────────────────

/** 제목 + 둥근 카드. 카드 안의 줄(Row)은 가는 선으로 나뉜다. */
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2.5 px-1 text-[15px] font-bold tracking-tight">{title}</h3>
      <div className="divide-y divide-border rounded-2xl bg-surface px-5">{children}</div>
    </section>
  );
}

/** 왼쪽에 이름·설명, 오른쪽에 조작 버튼. stacked면 버튼을 아래 줄에 둔다(문제 유형처럼 선택지가 많을 때). */
function Row({ label, desc, children, stacked = false }: { label: string; desc?: ReactNode; children: ReactNode; stacked?: boolean }) {
  return (
    <div className={stacked ? "space-y-3 py-4" : "flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-4"}>
      <div className="min-w-0 max-w-[260px]">
        <p className="text-sm font-semibold">{label}</p>
        {desc && <p className="mt-1 text-xs leading-relaxed text-muted">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

function Pills<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { id: T; label: string }[];
  /** 여러 개 고를 수 있으면 배열. */
  value: T | T[];
  onChange: (id: T) => void;
  label: string;
}) {
  const multi = Array.isArray(value);
  return (
    <div role={multi ? "group" : "radiogroup"} aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = multi ? value.includes(o.id) : value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role={multi ? "checkbox" : "radio"}
            aria-checked={on}
            onClick={() => onChange(o.id)}
            className={[
              "h-9 rounded-full px-4 text-[13px] font-semibold transition-colors",
              on ? "bg-foreground text-background" : "bg-background text-foreground hover:bg-raised",
            ].join(" ")}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Stepper({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (n: number) => void; label: string }) {
  const t = useT();
  const [draft, setDraft] = useState(String(value));
  // 버튼으로 바뀐 값을 입력칸에도 반영한다.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setDraft(String(value)), [value]);
  const commit = (raw: string) => {
    const n = Math.round(Number(raw));
    onChange(Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : value);
    setDraft(String(Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : value));
  };
  const btn = "grid h-10 w-10 place-items-center rounded-full text-foreground transition-colors hover:bg-raised disabled:opacity-30 disabled:hover:bg-transparent";
  return (
    <div className="flex items-center rounded-full bg-background">
      <button type="button" className={btn} onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={t("줄이기")}>
        <Minus size={15} strokeWidth={2} />
      </button>
      <input
        value={draft}
        inputMode="numeric"
        aria-label={label}
        onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ""))}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && commit((e.target as HTMLInputElement).value)}
        className="w-10 bg-transparent text-center text-sm font-semibold tabular-nums outline-none"
      />
      <button type="button" className={btn} onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={t("늘리기")}>
        <Plus size={15} strokeWidth={2} />
      </button>
    </div>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={["relative h-7 w-12 shrink-0 rounded-full transition-colors", checked ? "bg-foreground" : "bg-background"].join(" ")}
    >
      <span
        className={[
          "absolute top-1 h-5 w-5 rounded-full transition-all",
          checked ? "left-6 bg-background" : "left-1 bg-muted",
        ].join(" ")}
      />
    </button>
  );
}

const btnCls = "inline-flex h-9 items-center rounded-full px-4 text-[13px] font-semibold transition-colors";

// ── 본문 ─────────────────────────────────────────────────────────────────────

// 설정 모달과 /settings 페이지가 함께 쓰는 본문. 왼쪽: 닫기·검색·메뉴·약관, 오른쪽: 제목 + 카드(줄마다 이름/설명과 버튼).
// 값 저장·탈퇴·로그아웃은 기존 API를 그대로 쓰고, AI 설정(만드는 방식·공부 도구)은 이 기기 브라우저에 저장한다.
export default function SettingsPanel({ tab, onTab, onClose }: { tab: SettingsTab; onTab: (t: SettingsTab) => void; onClose?: () => void }) {
  const t = useT();
  const { lang, setLang } = useLang();
  const { user, loading } = useAuth();
  const { isAdmin, setIsAdmin } = useAdminStatus();
  const router = useRouter();
  const [query, setQuery] = useState("");

  const [interests, setInterests] = useState("");
  const [textbookPublisher, setTextbookPublisher] = useState("");
  const [schoolType, setSchoolType] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");

  const [feedback, setFeedback] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
  const [mode, setMode] = useState<AiMode>("fast");
  const [prefs, setPrefs] = useState<StudyPrefs>(DEFAULT_STUDY_PREFS);

  useEffect(() => {
    // 브라우저에 저장된 값은 마운트 뒤에만 읽을 수 있다.
    /* eslint-disable react-hooks/set-state-in-effect */
    setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");
    setMode(getAiMode());
    setPrefs(loadStudyPrefs());
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

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

  function changeTheme(next: "light" | "dark") {
    setTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // 저장소를 못 쓰면 이번 방문에만 적용된다.
    }
    document.documentElement.setAttribute("data-theme", next);
  }

  function updatePrefs(next: StudyPrefs) {
    setPrefs(next);
    saveStudyPrefs(next);
  }

  function resetAi() {
    resetStudyPrefs();
    setAiMode("fast");
    setMode("fast");
    setPrefs(DEFAULT_STUDY_PREFS);
  }

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

  const q = prefs.quiz;
  const toggleQuizType = (type: QuizType) => {
    const has = q.types.includes(type);
    // 마지막 하나는 끌 수 없다(문제를 낼 유형이 없어진다).
    if (has && q.types.length === 1) return;
    updatePrefs({ ...prefs, quiz: { ...q, types: has ? q.types.filter((x) => x !== type) : [...q.types, type] } });
  };

  // 검색은 묶음(Group) 단위로 찾는다 — 제목과 그 안의 항목 이름이 검색어를 포함하면 보여준다.
  const groups: { tab: SettingsTab; title: string; keywords: string[]; node: ReactNode }[] = [
    {
      tab: "general",
      title: t("화면"),
      keywords: [t("화면 테마"), t("다크 모드"), t("라이트 모드"), t("화면 언어"), "English", "한국어"],
      node: (
        <Group title={t("화면")}>
          <Row label={t("화면 테마")}>
            {theme && (
              <Pills
                label={t("화면 테마")}
                value={theme}
                onChange={changeTheme}
                options={[
                  { id: "light", label: t("라이트") },
                  { id: "dark", label: t("다크") },
                ]}
              />
            )}
          </Row>
          <Row label={t("화면 언어")} desc={t("버튼과 안내 문구의 언어예요. AI가 만드는 자료도 이 언어를 따라요.")}>
            <Pills label={t("화면 언어")} value={lang} onChange={setLang} options={LANGS.map((l) => ({ id: l.id, label: l.label }))} />
          </Row>
        </Group>
      ),
    },
    {
      tab: "account",
      title: t("계정 정보"),
      keywords: [t("로그아웃"), t("계정 탈퇴"), t("코드로 로그인하기"), t("이메일")],
      node: loading ? null : (
        <>
          <Group title={t("계정 정보")}>
            {!user ? (
              <Row label={t("로그인 전")} desc={t("왼쪽 아래에서 이메일로 로그인할 수 있어요.")}>
                <span />
              </Row>
            ) : (
              <Row label={isAdmin ? t("관리자 (예약 계정)") : (user.email ?? "")} desc={t("로그인한 계정")}>
                <button onClick={handleLogout} className={`${btnCls} bg-background hover:bg-raised`}>
                  {t("로그아웃")}
                </button>
              </Row>
            )}
            {!isAdmin && (
              <Row label={t("코드로 로그인하기")} desc={t("관리자 코드가 있다면 여기서 들어갈 수 있어요.")}>
                <Link href="/admin/login" className={`${btnCls} bg-background hover:bg-raised`}>
                  {t("열기")}
                </Link>
              </Row>
            )}
          </Group>
          {user && !isAdmin && (
            <section className="mt-7">
              <h3 className="mb-2.5 px-1 text-[15px] font-bold tracking-tight text-danger">{t("계정 탈퇴")}</h3>
              <div className="rounded-2xl border border-danger/40 px-5">
                <Row label={t("계정 탈퇴")} desc={t("탈퇴하면 히스토리를 포함한 모든 개인 데이터가 삭제되며 되돌릴 수 없습니다.")}>
                  {!confirmingDelete ? (
                    <button onClick={() => setConfirmingDelete(true)} className={`${btnCls} border border-danger/60 text-danger hover:bg-danger/10`}>
                      {t("계정 탈퇴")}
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button onClick={handleDeleteAccount} disabled={deleting} className={`${btnCls} bg-danger text-white disabled:opacity-40`}>
                        {deleting ? t("삭제 중...") : t("정말 삭제할게요")}
                      </button>
                      <button onClick={() => setConfirmingDelete(false)} className={`${btnCls} bg-surface hover:bg-raised`}>
                        {t("취소")}
                      </button>
                    </div>
                  )}
                </Row>
              </div>
            </section>
          )}
        </>
      ),
    },
    {
      tab: "personal",
      title: t("개인화 정보 (선택)"),
      keywords: [t("관심사·경험"), t("교과서 출판사"), t("학교 유형")],
      node: !user ? (
        <p className="px-1 text-sm text-muted">{t("개인화 정보 설정은 로그인 후 이용할 수 있어요.")}</p>
      ) : (
        <Group title={t("개인화 정보 (선택)")}>
          <Row stacked label={t("관심사·경험")} desc={t("결과물에 자연스럽게 녹아들어요. 학교명은 받지 않습니다.")}>
            <textarea
              value={interests}
              onChange={(e) => setInterests(e.target.value)}
              rows={3}
              placeholder={t("예: 축구를 좋아함, 반려동물을 키움")}
              className={`${fieldCls} py-2.5`}
            />
          </Row>
          <Row label={t("교과서 출판사")}>
            <input
              value={textbookPublisher}
              onChange={(e) => setTextbookPublisher(e.target.value)}
              placeholder={t("예: 미래엔, 천재교육")}
              className={`${fieldCls} h-10 sm:w-56`}
            />
          </Row>
          <Row label={t("학교 유형")}>
            <select value={schoolType} onChange={(e) => setSchoolType(e.target.value)} className={`${fieldCls} h-10 sm:w-56`}>
              <option value="">{t("선택 안 함")}</option>
              {SCHOOL_TYPES.map((s) => (
                <option key={s} value={s}>
                  {t(s)}
                </option>
              ))}
            </select>
          </Row>
          <div className="flex justify-end py-4">
            <button
              onClick={handleSave}
              disabled={saveState === "saving"}
              className={`${btnCls} bg-foreground text-background hover:opacity-90 disabled:opacity-40`}
            >
              {saveState === "saving" ? t("저장 중...") : saveState === "saved" ? t("저장됨") : t("저장")}
            </button>
          </div>
        </Group>
      ),
    },
    {
      tab: "ai",
      title: t("만드는 방식"),
      keywords: [t("빠르게 만들기"), t("나에게 맞추기"), t("제작 전 질문")],
      node: (
        <Group title={t("만드는 방식")}>
          <Row label={t("제작 전 질문")} desc={t(AI_MODE_INFO[mode].summary)}>
            <Pills
              label={t("만드는 방식")}
              value={mode}
              onChange={(m) => {
                setMode(m);
                setAiMode(m);
              }}
              options={(Object.keys(AI_MODE_INFO) as AiMode[]).map((m) => ({ id: m, label: t(AI_MODE_INFO[m].label) }))}
            />
          </Row>
        </Group>
      ),
    },
    {
      tab: "ai",
      title: t("퀴즈 설정"),
      keywords: [t("문제 유형"), t("객관식"), t("주관식"), t("빈칸 채우기"), t("난이도"), t("생성 방식"), t("심층"), t("문항 수")],
      node: (
        <Group title={t("퀴즈 설정")}>
          <Row stacked label={t("문제 유형")}>
            <Pills
              label={t("문제 유형")}
              value={q.types}
              onChange={toggleQuizType}
              options={[
                { id: "choice", label: t("객관식") },
                { id: "ox", label: t("OX") },
                { id: "short", label: t("주관식") },
                { id: "blank", label: t("빈칸 채우기") },
              ]}
            />
          </Row>
          <Row label={t("난이도")}>
            <Pills
              label={t("난이도")}
              value={q.difficulty}
              onChange={(d) => updatePrefs({ ...prefs, quiz: { ...q, difficulty: d } })}
              options={[
                { id: "easy", label: t("쉬움") },
                { id: "normal", label: t("보통") },
                { id: "hard", label: t("어려움") },
              ]}
            />
          </Row>
          <Row label={t("생성 방식")} desc={t("심층은 문제를 한 번 더 검토해 품질이 좋아지지만, 생성이 더 오래 걸릴 수 있어요.")}>
            <Pills
              label={t("생성 방식")}
              value={q.depth}
              onChange={(d) => updatePrefs({ ...prefs, quiz: { ...q, depth: d } })}
              options={[
                { id: "basic", label: t("기본") },
                { id: "deep", label: t("심층") },
              ]}
            />
          </Row>
          <Row label={t("문항 수")} desc={t("한 번에 {min}–{max}문항", { min: QUIZ_COUNT.min, max: QUIZ_COUNT.max })}>
            <Stepper
              label={t("문항 수")}
              value={q.count}
              min={QUIZ_COUNT.min}
              max={QUIZ_COUNT.max}
              onChange={(n) => updatePrefs({ ...prefs, quiz: { ...q, count: n } })}
            />
          </Row>
        </Group>
      ),
    },
    {
      tab: "ai",
      title: t("플래시카드 설정"),
      keywords: [t("카드 수")],
      node: (
        <Group title={t("플래시카드 설정")}>
          <Row label={t("카드 수")} desc={t("한 번에 {min}–{max}장", { min: FLASHCARD_COUNT.min, max: FLASHCARD_COUNT.max })}>
            <Stepper
              label={t("카드 수")}
              value={prefs.flashcards.count}
              min={FLASHCARD_COUNT.min}
              max={FLASHCARD_COUNT.max}
              onChange={(n) => updatePrefs({ ...prefs, flashcards: { count: n } })}
            />
          </Row>
        </Group>
      ),
    },
    {
      tab: "ai",
      title: t("요약 설정"),
      keywords: [t("상세도"), t("요약 형식"), t("개조식"), t("서술식"), t("쉬운 설명 포함")],
      node: (
        <Group title={t("요약 설정")}>
          <Row label={t("상세도")} desc={t("기본값은 표준이에요.")}>
            <Pills
              label={t("상세도")}
              value={prefs.summary.detail}
              onChange={(d) => updatePrefs({ ...prefs, summary: { ...prefs.summary, detail: d } })}
              options={[
                { id: "brief", label: t("간결") },
                { id: "standard", label: t("표준") },
                { id: "detailed", label: t("상세") },
              ]}
            />
          </Row>
          <Row label={t("요약 형식")} desc={t("개조식은 핵심을 짧은 항목으로, 서술식은 문단으로 풀어 정리합니다")}>
            <Pills
              label={t("요약 형식")}
              value={prefs.summary.format}
              onChange={(f) => updatePrefs({ ...prefs, summary: { ...prefs.summary, format: f } })}
              options={[
                { id: "bullets", label: t("개조식") },
                { id: "prose", label: t("서술식") },
              ]}
            />
          </Row>
          <Row label={t("쉬운 설명 포함")} desc={t("복잡한 개념을 더 쉽게 이해할 수 있도록 설명합니다")}>
            <Switch
              label={t("쉬운 설명 포함")}
              checked={prefs.summary.easy}
              onChange={(v) => updatePrefs({ ...prefs, summary: { ...prefs.summary, easy: v } })}
            />
          </Row>
        </Group>
      ),
    },
    {
      tab: "ai",
      title: t("AI 사용 안내"),
      keywords: [t("하루"), t("횟수")],
      node: (
        <Group title={t("AI 사용 안내")}>
          <ul className="space-y-1.5 py-4 text-[13px] leading-relaxed text-muted">
            <li>{t("· 완성 원고·실행 계획 만들기: 로그인 시 하루 2회")}</li>
            <li>{t("· 결과 수정 요청(다시 만들기): 하루 1회")}</li>
            <li>{t("· 학습 모드(자료 조사 + 피드백): 하루 5회")}</li>
            <li>{t("· 요약·플래시카드·퀴즈·가상 시험·AI 채팅: 종류별로 하루 횟수 제한이 있어요")}</li>
          </ul>
        </Group>
      ),
    },
    {
      tab: "feedback",
      title: t("문의·피드백"),
      keywords: [t("개선 요청"), t("피드백"), t("문의")],
      node: (
        <Group title={t("문의·피드백")}>
          <div className="space-y-3 py-4">
            <p className="text-xs leading-relaxed text-muted">{t("불편한 점이나 바라는 기능을 알려 주세요. 보내 주신 내용은 서비스 개선에만 써요.")}</p>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={5}
              placeholder={t("불편한 점이나 제안해주실 내용을 적어주세요")}
              className={`${fieldCls} py-2.5`}
            />
            <div className="flex items-center justify-end gap-3">
              {feedbackSent && <p className="text-xs text-muted">{t("전달했어요. 감사합니다!")}</p>}
              <button
                onClick={handleFeedbackSubmit}
                disabled={!feedback.trim()}
                className={`${btnCls} bg-foreground text-background hover:opacity-90 disabled:opacity-40`}
              >
                {t("제출")}
              </button>
            </div>
          </div>
        </Group>
      ),
    },
  ];

  const needle = query.trim().toLowerCase();
  const shown = needle
    ? groups.filter((g) => [g.title, ...g.keywords].some((k) => k.toLowerCase().includes(needle)))
    : groups.filter((g) => g.tab === tab);

  return (
    <div className="flex h-full min-h-0 flex-col md:flex-row">
      <nav className="flex shrink-0 flex-col gap-3 border-b border-border p-3 md:w-56 md:border-b-0 md:border-r">
        {onClose && (
          <button
            onClick={onClose}
            aria-label={t("닫기")}
            className="hidden h-9 w-9 place-items-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-foreground md:grid"
          >
            <X size={18} strokeWidth={1.8} />
          </button>
        )}
        <label className="flex h-10 items-center gap-2 rounded-full bg-surface px-3.5 text-muted focus-within:ring-1 focus-within:ring-foreground">
          <Search size={15} strokeWidth={1.8} className="shrink-0" />
          <span className="sr-only">{t("설정 검색")}</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("설정 검색")}
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-faint"
          />
        </label>
        <div className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
          {TABS.map((tb) => {
            const active = !needle && tab === tb.id;
            return (
              <button
                key={tb.id}
                onClick={() => {
                  setQuery("");
                  onTab(tb.id);
                }}
                aria-current={active ? "page" : undefined}
                className={[
                  "flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                  active ? "bg-surface text-foreground" : "text-muted hover:bg-surface hover:text-foreground",
                ].join(" ")}
              >
                <tb.icon size={17} strokeWidth={1.7} className="shrink-0" />
                {t(tb.label)}
              </button>
            );
          })}
        </div>
        <div className="mt-auto hidden space-y-1 px-1 pb-1 text-xs text-faint md:block">
          <p title={t("준비 중")}>{t("이용약관")}</p>
          <p title={t("준비 중")}>{t("개인정보 처리방침")}</p>
        </div>
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 md:px-7">
        <div className="space-y-7">
          {shown.map((g, i) => (
            <div key={`${g.tab}-${i}`}>{g.node}</div>
          ))}
          {needle && shown.length === 0 && <p className="px-1 text-sm text-muted">{t("검색 결과가 없어요.")}</p>}
          {!needle && tab === "ai" && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-1 pt-5">
              <p className="text-[13px] text-muted">{t("이 기기의 AI 설정을 기본값으로 되돌립니다.")}</p>
              <button onClick={resetAi} className={`${btnCls} bg-surface hover:bg-raised`}>
                {t("기본 설정 사용")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
