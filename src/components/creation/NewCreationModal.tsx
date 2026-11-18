"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  ChevronDown,
  FileText,
  ImagePlus,
  LoaderCircle,
  PencilLine,
  Plus,
  Sparkles,
  Type,
  Wrench,
  X,
} from "lucide-react";
import type { AdministrativeInfo, AnalyzeResult, CoreTaskInfo, TaskElement } from "@/types/task";
import { mergeInstructions, QUESTION_CAP, type PreAnswer, type PreQuestion } from "@/lib/questions/questions-pure";
import { getAiMode, AI_MODE_INFO } from "@/lib/ui/ai-pref";
import QuestionStep from "./QuestionStep";
import { useAuth } from "@/lib/supabase/use-auth";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Turnstile from "@/components/Turnstile";
import { learningApi } from "@/components/learning/api";
import { useT } from "@/lib/i18n";
import { MAX_GUIDE_IMAGES, mergeImagePicks } from "@/lib/ui/image-picks";
import { imagesToUploadBase64 } from "@/lib/ui/downscale-image";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

/** "AI가 만들어줘요"를 고르면 홈(AssignmentFlow)이 이 값으로 생성을 시작한다. */
export interface AiStartPayload {
  subject: string;
  coreTaskInfo: CoreTaskInfo;
  adminInfo: AdministrativeInfo | null;
  instructions: string;
  turnstileToken: string | null;
  /** 분석 때 올린 안내문 사진(줄인 것). 있으면 생성이 안내문을 직접 읽는다. 기록에서 불러온 과제엔 없다. */
  noticeImages?: { base64: string; mimeType: string }[];
}

interface LatestHistory {
  subject: string;
  core_task_info: CoreTaskInfo;
  admin_info: AdministrativeInfo | null;
  instructions: string | null;
}

const PLACEHOLDERS = [
  "예: 발표는 5분 내외로, 개인적인 경험을 넣어서",
  "예: 형식은 편지가 아니라 대화체로 써줘",
  "예: 너무 무거운 톤 말고 담백하게 써줘",
  "예: 선생님이 출처 표기를 꼭 하라고 하셨어",
];

type Stage = "input" | "analyzing" | "choose" | "questions";
type InputKind = "image" | "text";

const fieldCls =
  "w-full rounded-xl border border-border-strong bg-background px-4 text-sm placeholder:text-faint transition-colors focus:border-foreground";

export default function NewCreationModal({
  onClose,
  onStartAi,
  initialTopic = "",
  initialImage = null,
  initialKind,
}: {
  onClose: () => void;
  onStartAi: (payload: AiStartPayload) => void;
  initialTopic?: string;
  initialImage?: File | null;
  initialKind?: "image" | "text";
}) {
  const router = useRouter();
  const t = useT();
  const { user } = useAuth();
  const [stage, setStage] = useState<Stage>("input");
  const [kind, setKind] = useState<InputKind>(initialKind ?? (initialTopic && !initialImage ? "text" : "image"));
  // 안내문 사진은 최대 4장(안내·채점 기준표·예시 답안지가 따로 있는 과제가 많다). 첫 장이 대표 사진.
  const [imageFiles, setImageFiles] = useState<File[]>(() => (initialImage ? [initialImage] : []));
  const [previews, setPreviews] = useState<string[]>(() => (initialImage ? [URL.createObjectURL(initialImage)] : []));
  const [dragging, setDragging] = useState(false);
  const [topicText, setTopicText] = useState(initialTopic);
  const [instructions, setInstructions] = useState("");
  const [placeholder, setPlaceholder] = useState(PLACEHOLDERS[0]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 분석 결과(편집 가능한 상태로 보관)
  const [subject, setSubject] = useState("");
  const [core, setCore] = useState<CoreTaskInfo | null>(null);
  const [admin, setAdmin] = useState<AdministrativeInfo | null>(null);
  const [editing, setEditing] = useState(false);
  const [noticeImages, setNoticeImages] = useState<{ base64: string; mimeType: string }[]>([]);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [latest, setLatest] = useState<LatestHistory | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 제작 전 질문(AI가 만들어줘요를 고른 뒤): 질문은 한 번에 하나씩 서버에서 받아 온다.
  const [qAnswers, setQAnswers] = useState<PreAnswer[]>([]);
  const [question, setQuestion] = useState<PreQuestion | null>(null);
  const [qLoading, setQLoading] = useState(false);
  const [aiMode] = useState(() => getAiMode());

  useEffect(() => {
    // 마운트 후에만 무작위로 고른다(SSR과 값이 달라 hydration 오류가 나지 않게).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlaceholder(PLACEHOLDERS[Math.floor(Math.random() * PLACEHOLDERS.length)]);
  }, []);

  useEffect(() => {
    if (!user) return;
    fetch("/api/histories/latest")
      .then((r) => r.json())
      .then((d) => setLatest(d?.core_task_info ? d : null))
      .catch(() => setLatest(null));
  }, [user]);

  function addFiles(list: FileList | File[] | null | undefined) {
    const incoming = Array.from(list ?? []);
    if (incoming.length === 0) return;
    const merged = mergeImagePicks(imageFiles, incoming);
    const added = merged.files.slice(imageFiles.length);
    setImageFiles(merged.files);
    setPreviews((old) => [...old, ...added.map((f) => URL.createObjectURL(f))]);
    if (merged.rejectedNonImage > 0) setError(t("이미지 파일(JPG, PNG 등)만 올릴 수 있어요."));
    else if (merged.overflow > 0) setError(t("사진은 최대 {n}장까지 올릴 수 있어요.", { n: MAX_GUIDE_IMAGES }));
    else setError(null);
  }

  function removeImage(i: number) {
    setImageFiles((old) => old.filter((_, j) => j !== i));
    setPreviews((old) => {
      if (old[i]) URL.revokeObjectURL(old[i]);
      return old.filter((_, j) => j !== i);
    });
    setError(null);
  }

  const hasInput = kind === "image" ? imageFiles.length > 0 : topicText.trim().length > 0;

  async function analyze() {
    setError(null);
    setBusy(true);
    setStage("analyzing");
    try {
      let imageBase64: string | undefined;
      let imageMimeType: string | undefined;
      let extraImages: { base64: string; mimeType: string }[] | undefined;
      let keptImages: { base64: string; mimeType: string }[] = [];
      if (kind === "image" && imageFiles.length > 0) {
        // 보내기 전에 줄인다(요청 본문 한도) — 첫 장은 imageBase64, 나머지는 extraImages.
        const encoded = await imagesToUploadBase64(imageFiles); // 합계를 요청 한도 안으로 맞춘다
        imageBase64 = encoded[0].data;
        imageMimeType = encoded[0].mimeType;
        if (encoded.length > 1) extraImages = encoded.slice(1).map((e) => ({ base64: e.data, mimeType: e.mimeType }));
        // 생성에도 같은 사진을 쓸 수 있다(작성자가 안내문을 직접 읽게) — 서버가 그 경로를 켰을 때만 보관한다(아래 wantsNoticeImages).
        keptImages = encoded.map((e) => ({ base64: e.data, mimeType: e.mimeType }));
      }
      const res = await fetch("/api/tasks/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64, imageMimeType, extraImages, topicText: kind === "text" ? topicText : "", instructions }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // 서버 코드가 돌기 전에 플랫폼이 거절하면(요청이 너무 크거나 시간 초과) JSON 오류가 없다 — 원인을 알아볼 수 있게 상태로 가른다.
        const fallback =
          res.status === 413
            ? t("사진 용량이 너무 커요. 사진 수를 줄이거나 더 작은 사진으로 다시 올려 주세요.")
            : res.status === 504 || res.status === 408
              ? t("분석이 오래 걸려 중단됐어요. 잠시 후 다시 시도해 주세요.")
              : t("분석에 실패했어요.");
        throw new Error((data as { error?: string }).error ?? fallback);
      }
      const result = data as AnalyzeResult & { wantsNoticeImages?: boolean };
      // 서버가 사진 직접 읽기를 끄고 있으면 사진을 들고 있지도, 생성 요청에 싣지도 않는다(요청이 3MB 이상 커지는 것을 막는다).
      setNoticeImages(result.wantsNoticeImages ? keptImages : []);
      if (result.insufficient_data) {
        throw new Error(
          result.insufficient_reason ??
            t("안내문에서 충분한 정보를 읽지 못했어요. 사진을 더 선명하게 찍거나 주제를 직접 적어 주세요.")
        );
      }
      setSubject(result.subject);
      setCore(result.core_task_info);
      setAdmin(result.administrative_info);
      setStage("choose");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("분석 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요."));
      setStage("input");
    } finally {
      setBusy(false);
    }
  }

  function useLatest() {
    if (!latest) return;
    setSubject(latest.subject);
    setCore(latest.core_task_info);
    setAdmin(latest.admin_info);
    setInstructions(latest.instructions ?? "");
    setNoticeImages([]); // 기록에서 불러온 과제는 사진이 없다
    setStage("choose");
  }

  function updateElement(i: number, patch: Partial<TaskElement>) {
    if (!core) return;
    const next = [...core.task_elements];
    next[i] = { ...next[i], ...patch };
    setCore({ ...core, task_elements: next });
  }

  async function startLearning() {
    if (!core) return;
    setError(null);
    setBusy(true);
    try {
      const created = await learningApi<{ id: string }>("/api/learning/sessions", {
        method: "POST",
        body: JSON.stringify({ subject: subject.trim(), coreTaskInfo: core, adminInfo: admin, instructions }),
      });
      router.push(`/learning/${created.id}`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("시작하지 못했어요."));
      setBusy(false);
    }
  }

  function finishQuestions(answers: PreAnswer[]) {
    if (!core) return;
    onStartAi({
      subject: subject.trim(),
      coreTaskInfo: core,
      adminInfo: admin,
      instructions: mergeInstructions(instructions, answers),
      turnstileToken,
      ...(noticeImages.length > 0 ? { noticeImages } : {}),
    });
  }

  // 다음 질문을 서버에 물어본다. 실패하거나 더 물을 게 없으면 바로 만들기를 시작한다(질문 때문에 막히지 않게).
  async function fetchNextQuestion(answers: PreAnswer[]) {
    if (!core) return;
    setQLoading(true);
    setQuestion(null);
    try {
      const res = await fetch("/api/tasks/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: subject.trim(), coreTaskInfo: core, instructions, answers, mode: aiMode }),
      });
      const data = (await res.json().catch(() => ({}))) as { question?: PreQuestion | null };
      if (!res.ok || !data.question) {
        finishQuestions(answers);
        return;
      }
      setQuestion(data.question);
    } catch {
      finishQuestions(answers);
    } finally {
      setQLoading(false);
    }
  }

  function startAi() {
    if (!core) return;
    // **학생이 질문에 답하는 동안 조사를 미리 돌려 둔다**(research-prefetch.ts, 2026-11-13).
    // 생성의 직렬 구간은 조사 8~13초 → 글쓰기 13~24초인데, 조사는 여기서부터 생성까지 비는
    // 10~30초 안에 끝낼 수 있다. 답이 주제를 바꾸는 과제는 서버가 알아서 건너뛴다(대상 미정이면 안 한다).
    // 실패해도 생성이 평소대로 조사하므로 결과를 기다리지 않고 그냥 던진다.
    void fetch("/api/tasks/research/prefetch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, coreTaskInfo: core, instructions }),
    }).catch(() => {});
    setStage("questions");
    setQAnswers([]);
    void fetchNextQuestion([]);
  }

  function submitAnswer(a: PreAnswer) {
    const next = [...qAnswers, a];
    setQAnswers(next);
    if (next.length >= QUESTION_CAP[aiMode]) {
      finishQuestions(next);
      return;
    }
    void fetchNextQuestion(next);
  }

  const subjectMissing = !subject.trim();
  const needCaptcha = !user && !!TURNSTILE_SITE_KEY && !turnstileToken;

  /* ───────────── 제작 전 질문 ───────────── */
  if (stage === "questions") {
    const cap = QUESTION_CAP[aiMode];
    return (
      <Modal title={t("만들기 전에 한 가지만")} onClose={onClose} width={560} hideTitle>
        <QuestionStep
          question={question}
          loading={qLoading}
          index={qAnswers.length + 1}
          cap={cap}
          modeLabel={t(AI_MODE_INFO[aiMode].label)}
          onAnswer={submitAnswer}
          onSkipAll={() => finishQuestions(qAnswers)}
        />
      </Modal>
    );
  }

  /* ───────────── 분석 중 ───────────── */
  if (stage === "analyzing") {
    return (
      <Modal title={t("안내문 분석 중")} onClose={onClose} busy width={420} hideTitle>
        <div role="status" className="flex flex-col items-center gap-4 py-10 text-center">
          <LoaderCircle size={28} strokeWidth={1.6} className="animate-spin text-muted" />
          <div>
            <p className="text-base font-bold">{t("안내문을 읽고 있어요")}</p>
            <p className="mt-1 text-sm text-muted">{t("주제, 요구사항, 분량 조건을 정리하는 중이에요. 보통 10초쯤 걸려요.")}</p>
          </div>
        </div>
      </Modal>
    );
  }

  /* ───────────── 분석 결과 + 방식 선택 ───────────── */
  if (stage === "choose" && core) {
    const due = admin?.due_date?.trim();
    return (
      <Modal title={t("분석한 내용")} onClose={onClose} busy={busy} width={680}>
        <div className="space-y-5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md border border-border-strong px-2 py-0.5 text-xs font-semibold text-muted">
                {subject || t("과목 미확인")}
              </span>
              {due && (
                <span className="inline-flex items-center gap-1 text-xs text-muted">
                  <CalendarClock size={13} strokeWidth={1.7} />
                  {t("{due} 제출", { due })}
                </span>
              )}
            </div>
            <h3 className="mt-2 text-xl font-bold leading-snug tracking-tight">{core.topic}</h3>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <section aria-label={t("요구사항")} className="rounded-xl border border-border bg-background p-4">
              <p className="mb-2 text-xs font-semibold text-faint">{t("요구사항")}</p>
              {core.requirements.length > 0 ? (
                <ul className="space-y-1.5 text-sm">
                  {core.requirements.slice(0, 8).map((r, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted" aria-hidden />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">{t("안내문에 따로 적힌 요구사항이 없어요.")}</p>
              )}
            </section>
            <section aria-label={t("만들 결과물")} className="rounded-xl border border-border bg-background p-4">
              <p className="mb-2 text-xs font-semibold text-faint">{t("만들 결과물")}</p>
              <ul className="space-y-2 text-sm">
                {core.task_elements.map((el, i) => (
                  <li key={i} className="flex items-start gap-2">
                    {el.type === "external_production" ? (
                      <Wrench size={15} strokeWidth={1.7} className="mt-0.5 shrink-0 text-muted" aria-label={t("외부 툴로 제작")} />
                    ) : (
                      <FileText size={15} strokeWidth={1.7} className="mt-0.5 shrink-0 text-muted" aria-label={t("글로 제출")} />
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold leading-snug">{el.label}</p>
                      {el.required_items && el.required_items.length > 0 && (
                        <p className="mt-0.5 text-xs leading-relaxed text-muted">{el.required_items.join(" · ")}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <div>
            <button
              onClick={() => setEditing((v) => !v)}
              aria-expanded={editing}
              className="inline-flex items-center gap-1 text-[13px] font-medium text-muted transition-colors hover:text-foreground"
            >
              {t("분석 내용 수정하기")}
              <ChevronDown size={14} strokeWidth={1.8} className={editing ? "rotate-180 transition-transform" : "transition-transform"} />
            </button>
            {editing && (
              <div className="mt-3 space-y-3 rounded-xl border border-border bg-background p-4">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-faint">{t("과목")}</span>
                  <input value={subject} onChange={(e) => setSubject(e.target.value)} className={`${fieldCls} h-10`} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-faint">{t("주제")}</span>
                  <input
                    value={core.topic}
                    onChange={(e) => setCore({ ...core, topic: e.target.value })}
                    className={`${fieldCls} h-10`}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-faint">{t("요구사항 (한 줄에 하나)")}</span>
                  <textarea
                    value={core.requirements.join("\n")}
                    onChange={(e) => setCore({ ...core, requirements: e.target.value.split("\n").filter(Boolean) })}
                    rows={4}
                    className={`${fieldCls} py-2.5`}
                  />
                </label>
                {core.task_elements.map((el, i) => (
                  <div key={i} className="space-y-2 rounded-lg border border-border p-3">
                    <div className="flex gap-2">
                      <select
                        value={el.type}
                        aria-label={t("결과물 종류")}
                        onChange={(e) => updateElement(i, { type: e.target.value as TaskElement["type"] })}
                        className="h-9 rounded-lg border border-border-strong bg-background px-2 text-xs"
                      >
                        <option value="text_submission">{t("글로 제출")}</option>
                        <option value="external_production">{t("외부 툴로 제작")}</option>
                      </select>
                      <input
                        value={el.label}
                        aria-label={t("결과물 이름")}
                        onChange={(e) => updateElement(i, { label: e.target.value })}
                        className={`${fieldCls} h-9 flex-1`}
                      />
                    </div>
                    <textarea
                      value={el.description}
                      aria-label={t("결과물 설명")}
                      onChange={(e) => updateElement(i, { description: e.target.value })}
                      rows={2}
                      className={`${fieldCls} py-2 text-xs`}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && (
            <p role="alert" className="rounded-xl border border-danger/50 px-4 py-3 text-sm text-danger">
              {error}
            </p>
          )}
          {subjectMissing && (
            <p className="text-xs text-danger">{t("과목을 입력해야 시작할 수 있어요. 위의 “분석 내용 수정하기”에서 채워 주세요.")}</p>
          )}
          {!user && TURNSTILE_SITE_KEY && <Turnstile siteKey={TURNSTILE_SITE_KEY} onToken={setTurnstileToken} />}

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              onClick={startAi}
              disabled={busy || subjectMissing || needCaptcha}
              className="group flex flex-col items-start gap-3 rounded-2xl border border-border-strong p-5 text-left transition-colors hover:border-foreground hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Sparkles size={22} strokeWidth={1.6} />
              <span>
                <span className="block text-base font-bold">{t("AI가 만들어줘요")}</span>
                <span className="mt-1 block text-[13px] leading-relaxed text-muted">
                  {t("자료 조사부터 결과물 작성까지 한 번에 만들어 줘요.")}
                </span>
              </span>
            </button>
            <button
              onClick={startLearning}
              disabled={busy || subjectMissing || !user}
              className="group flex flex-col items-start gap-3 rounded-2xl border border-border-strong p-5 text-left transition-colors hover:border-foreground hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40"
            >
              <PencilLine size={22} strokeWidth={1.6} />
              <span>
                <span className="block text-base font-bold">{t("직접 작성할게요")}</span>
                <span className="mt-1 block text-[13px] leading-relaxed text-muted">
                  {user
                    ? t("자료 조사와 작성 가이드를 받고, 직접 쓴 글에 피드백을 받아요.")
                    : t("로그인하면 쓸 수 있어요. 작성 내용이 자동으로 저장돼요.")}
                </span>
              </span>
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  /* ───────────── 입력 ───────────── */
  const latestButton =
    user && latest ? (
      <button onClick={useLatest} className="text-xs font-medium text-muted transition-colors hover:text-foreground">
        {t("최근 안내문 불러오기")}
      </button>
    ) : null;
  // 이미지/텍스트 두 입력은 같은 틀(제목·내용·상세 입력·아래 버튼)이고 가운데 내용만 다르다.
  return (
    <Modal title={kind === "image" ? t("이미지 업로드") : t("텍스트 업로드")} onClose={onClose} width={460} compact busy={busy}>
      <div className="space-y-5">
        {kind === "image" ? (
          <div>
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <p className="text-[13px] font-semibold">{t("선택된 이미지")}</p>
              {latestButton}
            </div>
            {/* 사진을 올릴 때마다 오른쪽으로 한 칸씩 늘어나고, 맨 끝의 점선 칸이 다음 사진 자리다 */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                addFiles(e.dataTransfer.files);
              }}
            >
              <ul className="flex flex-wrap gap-3" aria-label={t("올린 안내문 사진")}>
                {previews.map((src, i) => (
                  <li key={src} className="relative h-20 w-20 overflow-hidden rounded-xl border border-border bg-background">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={t("안내문 사진 {n}", { n: i + 1 })} className="h-full w-full object-cover" />
                    <button
                      onClick={() => removeImage(i)}
                      aria-label={t("{n}번 사진 지우기", { n: i + 1 })}
                      className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-background/85 text-foreground transition-colors hover:bg-background"
                    >
                      <X size={11} strokeWidth={2.2} />
                    </button>
                  </li>
                ))}
                {previews.length < MAX_GUIDE_IMAGES && (
                  <li>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      aria-label={previews.length === 0 ? t("안내문 사진 선택") : t("사진 더 올리기")}
                      className={[
                        "grid h-20 w-20 place-items-center rounded-xl border border-dashed text-muted transition-colors hover:border-foreground hover:text-foreground",
                        dragging ? "border-foreground bg-raised text-foreground" : "border-border-strong",
                      ].join(" ")}
                    >
                      <Plus size={22} strokeWidth={1.5} />
                    </button>
                  </li>
                )}
              </ul>
              <p className="mt-2.5 text-xs leading-relaxed text-faint">
                {previews.length === 0
                  ? t("눌러서 고르거나, 여기로 끌어다 놓으세요 (최대 {n}장)", { n: MAX_GUIDE_IMAGES })
                  : t("{n}/{max}장 · 안내문·채점 기준표·예시 답안을 모두 올리면 더 정확해요", { n: previews.length, max: MAX_GUIDE_IMAGES })}
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              aria-label={t("안내문 사진 선택")}
              tabIndex={-1}
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = ""; // 같은 사진을 지웠다가 다시 고를 수 있게
              }}
            />
          </div>
        ) : (
          <label className="block">
            <span className="mb-2.5 flex items-center justify-between gap-3 text-[13px] font-semibold">
              {t("안내문 또는 주제")}
              <span className="flex items-center gap-2">
                {topicText.length > 0 && <span className="text-xs font-normal text-faint">{t("{n}자", { n: topicText.length })}</span>}
                {latestButton}
              </span>
            </span>
            <textarea
              value={topicText}
              onChange={(e) => setTopicText(e.target.value)}
              rows={6}
              placeholder={t("안내문 내용을 그대로 붙여넣거나, “어린 왕자 독서감상문”처럼 주제만 적어도 돼요.")}
              className={`${fieldCls} resize-none py-3 leading-relaxed`}
            />
          </label>
        )}

        <label className="block">
          <span className="mb-2.5 block text-[13px] font-semibold">
            {t("상세 입력")} <span className="font-normal text-faint">{t("(선택)")}</span>
          </span>
          <input
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder={t(placeholder)}
            className={`${fieldCls} h-11`}
          />
        </label>

        {error && (
          <p role="alert" className="rounded-xl border border-danger/50 px-4 py-3 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-1">
          {/* 입력 방식 바꾸기는 말없는 글자 버튼으로 왼쪽에 둔다 */}
          <Button variant="ghost" size="sm" onClick={() => setKind(kind === "image" ? "text" : "image")}>
            {kind === "image" ? <Type size={14} strokeWidth={1.8} /> : <ImagePlus size={14} strokeWidth={1.8} />}
            {kind === "image" ? t("텍스트로 붙여넣기") : t("사진 업로드")}
          </Button>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" onClick={onClose} disabled={busy} className="px-4 text-foreground">
              {t("취소")}
            </Button>
            <Button variant="primary" onClick={analyze} disabled={!hasInput || busy}>
              {t("분석하기")}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
