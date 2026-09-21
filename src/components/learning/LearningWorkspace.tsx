"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAuth } from "@/lib/supabase/use-auth";
import { SOURCE_TIER_LABEL } from "@/lib/links/source-quality";
import {
  MAX_DRAFT_CHARS,
  type LearningFeedback,
  type LearningSection,
  type LearningSession,
  type LearningUsage,
  type SubjectCandidate,
} from "@/types/learning";
import { learningApi, STATUS_LABEL } from "./api";

type SaveState = "saved" | "saving" | "unsaved" | "error";
type Pane = "material" | "write";

interface SessionPayload {
  session: LearningSession;
  sections: LearningSection[];
  usage: LearningUsage;
  needsSubjectSelection: boolean;
}

const SAVE_DELAY_MS = 1200;
const localKey = (sectionId: string) => `studed-learning-draft:${sectionId}`;

function readLocal(sectionId: string): { draft: string; synced: boolean } | null {
  try {
    const raw = localStorage.getItem(localKey(sectionId));
    return raw ? (JSON.parse(raw) as { draft: string; synced: boolean }) : null;
  } catch {
    return null;
  }
}
function writeLocal(sectionId: string, draft: string, synced: boolean) {
  try {
    localStorage.setItem(localKey(sectionId), JSON.stringify({ draft, synced }));
  } catch {
    // 저장소를 못 쓰는 환경(시크릿 모드 등)에서는 서버 저장만 쓴다.
  }
}

function StatusBadge({ status }: { status: string }) {
  const done = status === "completed";
  return (
    <span
      className={[
        "shrink-0 rounded-full px-2 py-0.5 text-[11px]",
        done ? "bg-accent text-accent-foreground font-bold" : "border border-border text-muted",
      ].join(" ")}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function IssueList({ title, issues }: { title: string; issues: { excerpt: string; problem: string; hint: string }[] }) {
  if (issues.length === 0) return null;
  return (
    <div>
      <h4 className="mb-1.5 text-xs font-semibold text-muted">{title}</h4>
      <ul className="space-y-2">
        {issues.map((it, i) => (
          <li key={i} className="rounded-md border border-border bg-background p-3 text-sm">
            {it.excerpt && <p className="mb-1 text-xs text-muted">&ldquo;{it.excerpt}&rdquo;</p>}
            <p>{it.problem}</p>
            {it.hint && <p className="mt-1 text-xs text-accent">힌트: {it.hint}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PlainList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h4 className="mb-1.5 text-xs font-semibold text-muted">{title}</h4>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {items.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

function FeedbackPanel({ fb }: { fb: LearningFeedback }) {
  return (
    <section aria-label="AI 피드백" className="space-y-4 rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium">{fb.summary}</p>
        <span
          className={[
            "shrink-0 rounded-full px-2.5 py-0.5 text-xs",
            fb.readyToComplete ? "bg-accent text-accent-foreground font-bold" : "border border-border text-muted",
          ].join(" ")}
        >
          {fb.readyToComplete ? "완료해도 좋아요" : "조금 더 다듬어봐요"}
        </span>
      </div>
      {fb.answer && (
        <div className="rounded-md border border-accent/40 bg-accent/5 p-3 text-sm">
          <p className="mb-1 text-xs font-semibold text-accent">질문에 대한 답</p>
          <p className="whitespace-pre-wrap">{fb.answer}</p>
        </div>
      )}
      <PlainList title="잘 쓴 부분" items={fb.strengths} />
      <PlainList title="빠진 내용" items={fb.missing} />
      <IssueList title="사실관계 확인" issues={fb.factIssues} />
      {fb.requirementCoverage.length > 0 && (
        <div>
          <h4 className="mb-1.5 text-xs font-semibold text-muted">과제 요구사항 충족</h4>
          <ul className="space-y-1.5 text-sm">
            {fb.requirementCoverage.map((r, i) => (
              <li key={i} className="flex gap-2">
                <span aria-label={r.met ? "충족" : "미충족"} className={r.met ? "text-accent" : "text-amber-600"}>
                  {r.met ? "✓" : "!"}
                </span>
                <span>
                  {r.requirement}
                  {r.note && <span className="text-muted"> — {r.note}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <IssueList title="문장·문법" issues={fb.languageIssues} />
      <PlainList title="다음에 할 일" items={fb.nextSteps} />
    </section>
  );
}

function SubjectPicker({
  sessionId,
  onChosen,
}: {
  sessionId: string;
  onChosen: (name: string, mode: "direct" | "ai" | "none") => void;
}) {
  const [tab, setTab] = useState<"ai" | "direct">("ai");
  const [candidates, setCandidates] = useState<SubjectCandidate[] | null>(null);
  const [target, setTarget] = useState<{ typeLabel: string; constraints: string[] } | null>(null);
  const [clarify, setClarify] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function choose(value: string, mode: "direct" | "ai" | "none") {
    setSaving(true);
    setError(null);
    try {
      await learningApi(`/api/learning/sessions/${sessionId}`, {
        method: "PATCH",
        body: JSON.stringify({ focusSubject: value, subjectMode: mode }),
      });
      onChosen(value, mode);
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장하지 못했어요.");
      setSaving(false);
    }
  }

  async function suggest() {
    setLoading(true);
    setError(null);
    try {
      const data = await learningApi<{
        candidates: SubjectCandidate[];
        target?: { typeLabel: string; constraints: string[] };
        needsClarification?: boolean;
        message?: string | null;
      }>(
        `/api/learning/sessions/${sessionId}/suggest-subject`,
        { method: "POST" }
      );
      setTarget(data.target ?? null);
      if (data.needsClarification) {
        setClarify(data.message ?? "안내문에서 어떤 대상을 고르라는 건지 확인되지 않아요.");
        setTab("direct");
      } else {
        setClarify(null);
        setCandidates(data.candidates);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "추천을 불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-6">
      <h2 className="mb-1 text-xl font-bold">다룰 인물/대상 정하기</h2>
      <p className="mb-4 text-sm text-muted">
        이 과제는 다룰 대상을 직접 정해야 해요. 정한 대상을 기준으로 자료를 조사해 드려요.
      </p>
      <div role="tablist" className="mb-4 inline-flex rounded-full border border-border p-0.5 text-sm">
        {(["ai", "direct"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={[
              "rounded-full px-4 py-1.5 transition-colors",
              tab === t ? "bg-accent text-accent-foreground" : "text-muted hover:text-foreground",
            ].join(" ")}
          >
            {t === "ai" ? "AI 추천" : "직접 선택하기"}
          </button>
        ))}
      </div>

      {tab === "ai" ? (
        <div className="space-y-3">
          {target && !clarify && (
            <p className="text-xs text-muted">
              이 과제는 <b>{target.typeLabel}</b>을(를) 고르는 과제예요{target.constraints.length ? ` (조건: ${target.constraints.join(", ")})` : ""}.
            </p>
          )}
          {!candidates && (
            <button
              onClick={suggest}
              disabled={loading}
              className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-accent-foreground disabled:opacity-40"
            >
              {loading ? "후보를 찾고 있어요..." : "후보 3개 추천받기"}
            </button>
          )}
          {candidates && (
            <ul className="space-y-2">
              {candidates.map((c) => (
                <li key={c.name}>
                  <button
                    onClick={() => choose(c.name, "ai")}
                    disabled={saving}
                    className="w-full rounded-md border border-border p-3 text-left transition-colors hover:border-accent disabled:opacity-40"
                  >
                    <span className="block text-sm font-medium">{c.name}</span>
                    <span className="mt-0.5 block text-xs text-muted">{c.reason}</span>
                    {c.fieldNotes && c.fieldNotes.length > 0 && (
                      <ul className="mt-1.5 space-y-0.5 text-xs text-muted">
                        {c.fieldNotes.map((f) => (
                          <li key={f.field}>
                            <b className="text-foreground/80">{f.field}</b> · {f.note}
                          </li>
                        ))}
                      </ul>
                    )}
                  </button>
                </li>
              ))}
              <li>
                <button onClick={suggest} disabled={loading} className="text-xs text-muted underline underline-offset-2 hover:text-foreground">
                  {loading ? "다시 찾는 중..." : "다른 후보 보기"}
                </button>
              </li>
            </ul>
          )}
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) void choose(name.trim(), "direct");
          }}
          className="flex gap-2"
        >
          <label className="sr-only" htmlFor="subject-direct">
            인물/대상 이름
          </label>
          <input
            id="subject-direct"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder="예: 앙리 뒤낭"
            className="min-w-0 flex-1 rounded-full border border-foreground/50 bg-background px-4 py-1.5 text-sm"
          />
          <button
            type="submit"
            disabled={!name.trim() || saving}
            className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-accent-foreground disabled:opacity-40"
          >
            정하기
          </button>
        </form>
      )}

      {clarify && (
        <p className="mt-3 rounded-xl border border-border px-4 py-3 text-sm text-muted">
          {clarify} 대상을 직접 정해서 입력해 주세요.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}
      <button
        onClick={() => choose("", "none")}
        disabled={saving}
        className="mt-5 text-xs text-muted underline underline-offset-2 hover:text-foreground"
      >
        정해진 대상이 없는 과제예요 (건너뛰기)
      </button>
    </section>
  );
}

export default function LearningWorkspace({ id }: { id: string }) {
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<SessionPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<Record<string, SaveState>>({});
  const [pane, setPane] = useState<Pane>("write");
  const [notice, setNotice] = useState<string | null>(null);
  const [researching, setResearching] = useState(false);
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [question, setQuestion] = useState("");
  const [askOpen, setAskOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [changingSubject, setChangingSubject] = useState(false);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const latest = useRef<Record<string, string>>({});

  // 서버에서 받은 과제를 화면 상태에 반영한다. 서버 저장에 실패했던 로컬 초안이 있으면
  // 그걸 우선한다(작성 내용 유실 방지) — 반영 후 다시 저장해야 할 항목 id를 돌려준다.
  const applyPayload = useCallback((payload: SessionPayload): string[] => {
    const merged: Record<string, string> = {};
    const toResync: string[] = [];
    for (const s of payload.sections) {
      const local = readLocal(s.id);
      if (local && !local.synced && local.draft !== s.draft) {
        merged[s.id] = local.draft;
        toResync.push(s.id);
      } else {
        merged[s.id] = s.draft;
      }
    }
    latest.current = merged;
    setDrafts(merged);
    setSaveState(Object.fromEntries(toResync.map((sid) => [sid, "unsaved" as SaveState])));
    setData(payload);
    setSelectedId((cur) => cur ?? payload.sections.find((s) => s.status !== "completed")?.id ?? payload.sections[0]?.id ?? null);
    setLoadError(null);
    return toResync;
  }, []);

  const saveDraft = useCallback(async (sectionId: string): Promise<boolean> => {
    const text = latest.current[sectionId] ?? "";
    setSaveState((p) => ({ ...p, [sectionId]: "saving" }));
    try {
      const res = await learningApi<{ status: LearningSection["status"] }>(`/api/learning/sections/${sectionId}`, {
        method: "PATCH",
        body: JSON.stringify({ draft: text }),
      });
      writeLocal(sectionId, text, true);
      // 저장 중에 더 입력됐다면 그 최신 내용은 아직 저장 전이다.
      const stillLatest = latest.current[sectionId] === text;
      setSaveState((p) => ({ ...p, [sectionId]: stillLatest ? "saved" : "unsaved" }));
      setData((d) =>
        d ? { ...d, sections: d.sections.map((s) => (s.id === sectionId ? { ...s, draft: text, status: res.status } : s)) } : d
      );
      return stillLatest;
    } catch (err) {
      setSaveState((p) => ({ ...p, [sectionId]: "error" }));
      setNotice(err instanceof Error ? err.message : "저장하지 못했어요.");
      return false;
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    learningApi<SessionPayload>(`/api/learning/sessions/${id}`)
      .then((payload) => {
        if (cancelled) return;
        for (const sid of applyPayload(payload)) void saveDraft(sid);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "불러오지 못했어요.");
      });
    return () => {
      cancelled = true;
    };
  }, [user, id, applyPayload, saveDraft]);

  // 저장 전 내용이 있는 채로 나가려 하면 경고.
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      const pending = Object.values(saveState).some((s) => s === "unsaved" || s === "saving" || s === "error");
      if (pending) e.preventDefault();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [saveState]);

  useEffect(() => {
    const t = timers.current;
    return () => Object.values(t).forEach(clearTimeout);
  }, []);

  const sections = useMemo(() => data?.sections ?? [], [data]);
  const selected = sections.find((s) => s.id === selectedId) ?? null;
  const selectedIdx = selected ? sections.indexOf(selected) : -1;
  const doneCount = sections.filter((s) => s.status === "completed").length;
  const allDone = sections.length > 0 && doneCount === sections.length;

  function onDraftChange(sectionId: string, text: string) {
    if (text.length > MAX_DRAFT_CHARS) return;
    latest.current[sectionId] = text;
    setDrafts((p) => ({ ...p, [sectionId]: text }));
    setSaveState((p) => ({ ...p, [sectionId]: "unsaved" }));
    writeLocal(sectionId, text, false);
    clearTimeout(timers.current[sectionId]);
    timers.current[sectionId] = setTimeout(() => void saveDraft(sectionId), SAVE_DELAY_MS);
  }

  async function flushSave(sectionId: string): Promise<boolean> {
    clearTimeout(timers.current[sectionId]);
    if ((saveState[sectionId] ?? "saved") === "saved" && drafts[sectionId] === selected?.draft) return true;
    return saveDraft(sectionId);
  }

  async function handleResearch() {
    setResearching(true);
    setNotice(null);
    try {
      const res = await learningApi<{ usage: LearningUsage }>(`/api/learning/sessions/${id}/research`, { method: "POST" });
      // 조사 중에도 입력했던 초안은 서버에 이미 저장돼 있으므로 로컬 상태를 그대로 유지한 채 항목만 갱신한다.
      const payload = await learningApi<SessionPayload>(`/api/learning/sessions/${id}`);
      setData((d) => (d ? { ...payload, sections: payload.sections.map((s) => ({ ...s, draft: d.sections.find((x) => x.id === s.id)?.draft ?? s.draft })), usage: res.usage } : payload));
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "자료를 조사하지 못했어요.");
    } finally {
      setResearching(false);
    }
  }

  async function handleFeedback() {
    if (!selected) return;
    setFeedbackBusy(true);
    setNotice(null);
    try {
      const saved = await flushSave(selected.id);
      if (!saved) throw new Error("작성한 내용을 먼저 저장하지 못했어요. 잠시 후 다시 시도해주세요.");
      const q = askOpen ? question.trim() : "";
      const res = await learningApi<{ feedback: LearningFeedback; usage: LearningUsage }>(
        `/api/learning/sections/${selected.id}/feedback`,
        { method: "POST", body: JSON.stringify({ question: q || undefined }) }
      );
      setData((d) =>
        d
          ? {
              ...d,
              usage: res.usage,
              sections: d.sections.map((s) =>
                s.id === selected.id
                  ? {
                      ...s,
                      feedback: res.feedback,
                      feedback_history: [...s.feedback_history, res.feedback],
                      status: s.status === "completed" ? "completed" : "feedback",
                    }
                  : s
              ),
            }
          : d
      );
      setQuestion("");
      setAskOpen(false);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "피드백을 받지 못했어요.");
    } finally {
      setFeedbackBusy(false);
    }
  }

  async function handleComplete() {
    if (!selected) return;
    setNotice(null);
    try {
      const saved = await flushSave(selected.id);
      if (!saved) throw new Error("작성한 내용을 먼저 저장하지 못했어요.");
      await learningApi(`/api/learning/sections/${selected.id}/complete`, { method: "POST" });
      setData((d) =>
        d ? { ...d, sections: d.sections.map((s) => (s.id === selected.id ? { ...s, status: "completed" } : s)) } : d
      );
      const next = sections.find((s, i) => i > selectedIdx && s.status !== "completed");
      if (next) setSelectedId(next.id);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "완료 처리하지 못했어요.");
    }
  }

  const assembled = useMemo(
    () =>
      sections
        .filter((s) => (drafts[s.id] ?? "").trim())
        .map((s) => `[${s.label}]\n${drafts[s.id].trim()}`)
        .join("\n\n"),
    [sections, drafts]
  );

  if (authLoading) return <div className="px-8 py-10 text-sm text-muted">불러오는 중...</div>;
  if (!user) {
    return (
      <div className="mx-auto max-w-md px-6 py-20 text-center text-sm text-muted">
        학습 모드는 로그인 후에 이용할 수 있어요. 왼쪽 아래에서 로그인해주세요.
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="mx-auto max-w-md px-6 py-20 text-center">
        <p className="mb-4 text-sm text-red-600">{loadError}</p>
        <Link href="/learning" className="text-sm text-accent underline underline-offset-2">
          학습 모드 목록으로
        </Link>
      </div>
    );
  }
  if (!data) return <div className="px-8 py-10 text-sm text-muted">학습 과제를 불러오는 중...</div>;

  const { session, usage } = data;
  const needSubject = data.needsSubjectSelection && !session.focus_subject && session.subject_mode !== "none";
  const researchDone = session.research_status === "done";
  const usageLeft = usage.unlimited ? Infinity : usage.limit - usage.used;
  const draft = selected ? (drafts[selected.id] ?? "") : "";
  const state = selected ? (saveState[selected.id] ?? "saved") : "saved";

  return (
    <div className="px-4 py-6 md:px-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/learning" className="text-xs text-muted hover:text-foreground">
            ← 학습 모드
          </Link>
          <h1 className="mt-1 truncate text-[22px] font-bold tracking-tight">{session.title}</h1>
          <p className="mt-0.5 text-xs text-muted">
            {session.subject}
            {session.focus_subject && (
              <>
                {" · "}다루는 대상: {session.focus_subject}
                {!researchDone && (
                  <button onClick={() => setChangingSubject(true)} className="ml-2 underline underline-offset-2 hover:text-foreground">
                    변경
                  </button>
                )}
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted">
          <span title="자료 조사와 피드백을 합쳐 하루에 쓸 수 있는 횟수">
            {usage.unlimited ? "AI 사용 무제한(관리자)" : `오늘 AI ${usage.used}/${usage.limit}회 사용`}
          </span>
          {assembled && (
            <button onClick={() => setShowAll((v) => !v)} className="rounded-full border border-border px-3 py-1 hover:text-foreground">
              {showAll ? "작성 화면으로" : "내가 쓴 내용 모아보기"}
            </button>
          )}
        </div>
      </header>

      {notice && (
        <p role="alert" className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          {notice}
        </p>
      )}

      {(needSubject || changingSubject) && (
        <div className="mb-6">
          <SubjectPicker
            sessionId={id}
            onChosen={(name, mode) => {
              setData((d) => (d ? { ...d, session: { ...d.session, focus_subject: name || null, subject_mode: mode } } : d));
              setChangingSubject(false);
            }}
          />
        </div>
      )}

      {!needSubject && !changingSubject && !researchDone && (
        <section className="mb-6 rounded-2xl border border-border bg-surface p-6">
          <h2 className="mb-1 text-xl font-bold">자료 조사</h2>
          <p className="mb-1 text-sm text-muted">
            과제에서 작성할 항목 {sections.length}개에 필요한 자료를 한 번에 조사해서 항목별로 나눠 보여드려요.
            자료를 읽고 답변은 직접 작성하게 돼요.
          </p>
          <p className="mb-4 text-xs text-muted">AI 사용 횟수를 1회 써요. 조사에 실패하면 차감되지 않아요.</p>
          <button
            onClick={handleResearch}
            disabled={researching || usageLeft <= 0}
            className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-accent-foreground disabled:opacity-40"
          >
            {researching
              ? "자료를 조사하고 있어요... (최대 1분)"
              : session.research_status === "failed"
                ? "다시 조사하기"
                : "자료 조사 시작"}
          </button>
          {usageLeft <= 0 && <p className="mt-2 text-xs text-red-600">오늘 사용할 수 있는 횟수를 모두 썼어요.</p>}
          <p className="mt-3 text-xs text-muted">자료 없이 바로 작성을 시작해도 돼요. 왼쪽 항목을 골라 써 내려가면 자동으로 저장돼요.</p>
        </section>
      )}

      {showAll ? (
        <section className="rounded-2xl border border-border bg-surface p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-bold">내가 쓴 내용</h2>
            <button
              onClick={() => void navigator.clipboard.writeText(assembled).then(() => setNotice("복사했어요."))}
              className="rounded-md border border-border px-3 py-1.5 text-xs hover:text-accent"
            >
              전체 복사
            </button>
          </div>
          <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">{assembled}</pre>
        </section>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
          <nav aria-label="작성 항목" className="lg:sticky lg:top-6 lg:self-start">
            <p className="mb-2 text-xs text-muted">
              {doneCount}/{sections.length} 항목 완료
            </p>
            <ul className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0">
              {sections.map((s, i) => (
                <li key={s.id} className="shrink-0 lg:shrink">
                  <button
                    onClick={() => setSelectedId(s.id)}
                    aria-current={s.id === selectedId ? "true" : undefined}
                    className={[
                      "flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-sm font-semibold transition-colors",
                      s.id === selectedId ? "border-foreground bg-accent/10" : "border-border hover:border-foreground/60",
                    ].join(" ")}
                  >
                    <span className="truncate">
                      {i + 1}. {s.label}
                    </span>
                    <StatusBadge status={s.status} />
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {selected && (
            <div className="min-w-0 space-y-5">
              {allDone && (
                <p className="rounded-md border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-accent">
                  모든 항목을 완료했어요. 위의 &ldquo;내가 쓴 내용 모아보기&rdquo;에서 한 번에 확인하고 복사할 수 있어요.
                </p>
              )}

              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-bold">{selected.label}</h2>
                <div className="flex items-center gap-3">
                <button
                  onClick={handleComplete}
                  disabled={!draft.trim() || selected.status === "completed"}
                  className="rounded-full border border-foreground/50 px-5 py-1.5 text-sm font-semibold hover:opacity-70 disabled:opacity-40"
                >
                  {selected.status === "completed" ? "완료됨" : "이 항목 완료"}
                </button>
                <div className="inline-flex rounded-full border border-border p-0.5 text-xs lg:hidden">
                  {(["material", "write"] as Pane[]).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPane(p)}
                      aria-pressed={pane === p}
                      className={["rounded-full px-3 py-1", pane === p ? "bg-accent text-accent-foreground" : "text-muted"].join(" ")}
                    >
                      {p === "material" ? "자료" : "작성"}
                    </button>
                  ))}
                </div>
                </div>
              </div>

              <div className="grid gap-5 xl:grid-cols-2">
                <section
                  aria-label="조사 자료"
                  className={[pane === "material" ? "block" : "hidden", "lg:block", "min-w-0 rounded-2xl border border-border bg-surface p-5"].join(" ")}
                >
                  <h3 className="mb-3 text-sm font-semibold">자료 읽기</h3>
                  {selected.research ? (
                    <>
                      <article className="prose prose-sm max-w-none prose-neutral dark:prose-invert">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{selected.research.content}</ReactMarkdown>
                      </article>
                      {selected.research.sources.length > 0 && (
                        <div className="mt-5 border-t border-border pt-4">
                          <h4 className="mb-1 text-xs font-semibold text-muted">출처</h4>
                          <p className="mb-2 text-xs text-muted">
                            &ldquo;연결 확인됨&rdquo;은 주소가 열린다는 뜻일 뿐, 그 페이지가 내용을 뒷받침한다는 뜻은 아니에요.
                            중요한 사실은 링크를 열어 직접 확인하세요.
                          </p>
                          <ol className="space-y-1 text-sm">
                            {selected.research.sources.map((src) => (
                              <li key={src.n} className="flex flex-wrap gap-x-2">
                                <span className="text-muted">[{src.n}]</span>
                                <a href={src.url} target="_blank" rel="noopener noreferrer" className="break-all text-accent underline underline-offset-2">
                                  {src.title}
                                </a>
                                <span className="text-xs text-muted">
                                  {src.url_valid === false ? "(없는 페이지)" : src.url_valid ? "(연결 확인됨)" : "(자동 확인 불가 — 직접 열어 보세요)"}
                                  {src.tier ? ` · ${SOURCE_TIER_LABEL[src.tier]}` : ""}
                                </span>
                              </li>
                            ))}
                          </ol>
                        </div>
                      )}
                    </>
                  ) : researchDone ? (
                    <p className="text-sm text-muted">이 항목의 자료는 찾지 못했어요. 과제 안내문과 다른 항목의 자료를 참고해서 써보세요.</p>
                  ) : (
                    <p className="text-sm text-muted">
                      아직 자료를 조사하지 않았어요. 위에서 &ldquo;자료 조사 시작&rdquo;을 누르면 이 항목의 자료가 여기 나타나요.
                    </p>
                  )}
                </section>

                <section
                  aria-label="내 답변"
                  className={[pane === "write" ? "block" : "hidden", "lg:block", "min-w-0 space-y-3"].join(" ")}
                >
                  <div className="flex items-center justify-between">
                    <label htmlFor="learning-draft" className="text-sm font-bold">
                      내 답변
                    </label>
                    <span className="text-xs text-muted" aria-live="polite">
                      {state === "saving" && "저장 중..."}
                      {state === "saved" && "저장됨"}
                      {state === "unsaved" && "저장 대기 중..."}
                      {state === "error" && (
                        <button onClick={() => void saveDraft(selected.id)} className="text-red-600 underline underline-offset-2">
                          저장 실패 · 다시 저장
                        </button>
                      )}
                    </span>
                  </div>
                  <textarea
                    id="learning-draft"
                    value={draft}
                    onChange={(e) => onDraftChange(selected.id, e.target.value)}
                    rows={14}
                    placeholder="자료를 읽고 내 말로 직접 써보세요. 쓰는 대로 자동 저장돼요."
                    className="w-full resize-y rounded-2xl border border-foreground/40 bg-background px-4 py-3 text-sm leading-relaxed"
                  />
                  <div className="flex items-center justify-between text-xs text-muted">
                    <span>
                      {draft.length.toLocaleString()} / {MAX_DRAFT_CHARS.toLocaleString()}자
                    </span>
                    {selected.status === "completed" && <span className="text-accent">완료한 항목이에요. 고치면 &ldquo;수정 중&rdquo;으로 바뀌어요.</span>}
                  </div>

                  {askOpen && (
                    <div>
                      <label htmlFor="learning-question" className="mb-1 block text-xs text-muted">
                        표현·문법이 궁금하면 질문을 적어주세요 (피드백과 함께 답해요)
                      </label>
                      <input
                        id="learning-question"
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        maxLength={300}
                        placeholder="예: 이 문장에서 ‘which’를 써도 되나요?"
                        className="w-full rounded-full border border-foreground/50 bg-background px-4 py-1.5 text-sm"
                      />
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={handleFeedback}
                      disabled={feedbackBusy || draft.trim().length < 10 || usageLeft <= 0}
                      className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-accent-foreground disabled:opacity-40"
                    >
                      {feedbackBusy ? "살펴보는 중..." : "AI 피드백 받기"}
                    </button>
                    <button onClick={() => setAskOpen((v) => !v)} className="text-xs text-muted underline underline-offset-2 hover:text-foreground">
                      {askOpen ? "질문 닫기" : "표현/문법 질문하기"}
                    </button>
                  </div>
                  {draft.trim().length < 10 && <p className="text-xs text-muted">10자 이상 직접 쓰면 피드백을 받을 수 있어요.</p>}
                  {usageLeft <= 0 && <p className="text-xs text-red-600">오늘 사용할 수 있는 AI 횟수를 모두 썼어요. 작성한 내용은 그대로 저장돼요.</p>}
                </section>
              </div>

              {selected.feedback && <FeedbackPanel fb={selected.feedback} />}

              <div className="flex justify-between pt-2 text-sm">
                <button
                  onClick={() => selectedIdx > 0 && setSelectedId(sections[selectedIdx - 1].id)}
                  disabled={selectedIdx <= 0}
                  className="text-muted hover:text-foreground disabled:opacity-30"
                >
                  ← 이전 항목
                </button>
                <button
                  onClick={() => selectedIdx < sections.length - 1 && setSelectedId(sections[selectedIdx + 1].id)}
                  disabled={selectedIdx >= sections.length - 1}
                  className="text-muted hover:text-foreground disabled:opacity-30"
                >
                  다음 항목 →
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
