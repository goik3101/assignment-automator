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
  Sparkles,
  Type,
  Wrench,
  X,
} from "lucide-react";
import type { AdministrativeInfo, AnalyzeResult, CoreTaskInfo, TaskElement } from "@/types/task";
import { useAuth } from "@/lib/supabase/use-auth";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Turnstile from "@/components/Turnstile";
import { learningApi } from "@/components/learning/api";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

/** "AI가 만들어줘요"를 고르면 홈(AssignmentFlow)이 이 값으로 생성을 시작한다. */
export interface AiStartPayload {
  subject: string;
  coreTaskInfo: CoreTaskInfo;
  adminInfo: AdministrativeInfo | null;
  instructions: string;
  turnstileToken: string | null;
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

function fileToBase64(file: File): Promise<{ data: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const [, data] = (reader.result as string).split(",");
      resolve({ data, mimeType: file.type });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

type Stage = "input" | "analyzing" | "choose";
type InputKind = "image" | "text";

const fieldCls =
  "w-full rounded-xl border border-border-strong bg-background px-4 text-sm placeholder:text-faint transition-colors focus:border-foreground";

export default function NewCreationModal({
  onClose,
  onStartAi,
  initialTopic = "",
  initialImage = null,
}: {
  onClose: () => void;
  onStartAi: (payload: AiStartPayload) => void;
  initialTopic?: string;
  initialImage?: File | null;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const [stage, setStage] = useState<Stage>("input");
  const [kind, setKind] = useState<InputKind>(initialTopic && !initialImage ? "text" : "image");
  const [imageFile, setImageFile] = useState<File | null>(initialImage);
  const [preview, setPreview] = useState<string | null>(() => (initialImage ? URL.createObjectURL(initialImage) : null));
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
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [latest, setLatest] = useState<LatestHistory | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  function pickFile(file: File | null) {
    if (file && !file.type.startsWith("image/")) {
      setError("이미지 파일(JPG, PNG 등)만 올릴 수 있어요.");
      return;
    }
    setError(null);
    setImageFile(file);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return file ? URL.createObjectURL(file) : null;
    });
  }

  const hasInput = kind === "image" ? !!imageFile : topicText.trim().length > 0;

  async function analyze() {
    setError(null);
    setBusy(true);
    setStage("analyzing");
    try {
      let imageBase64: string | undefined;
      let imageMimeType: string | undefined;
      if (kind === "image" && imageFile) {
        const encoded = await fileToBase64(imageFile);
        imageBase64 = encoded.data;
        imageMimeType = encoded.mimeType;
      }
      const res = await fetch("/api/tasks/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64, imageMimeType, topicText: kind === "text" ? topicText : "", instructions }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "분석에 실패했어요.");
      const result = data as AnalyzeResult;
      if (result.insufficient_data) {
        throw new Error(
          result.insufficient_reason ??
            "안내문에서 충분한 정보를 읽지 못했어요. 사진을 더 선명하게 찍거나 주제를 직접 적어 주세요."
        );
      }
      setSubject(result.subject);
      setCore(result.core_task_info);
      setAdmin(result.administrative_info);
      setStage("choose");
    } catch (err) {
      setError(err instanceof Error ? err.message : "분석 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.");
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
      setError(err instanceof Error ? err.message : "시작하지 못했어요.");
      setBusy(false);
    }
  }

  function startAi() {
    if (!core) return;
    onStartAi({ subject: subject.trim(), coreTaskInfo: core, adminInfo: admin, instructions, turnstileToken });
  }

  const subjectMissing = !subject.trim();
  const needCaptcha = !user && !!TURNSTILE_SITE_KEY && !turnstileToken;

  /* ───────────── 분석 중 ───────────── */
  if (stage === "analyzing") {
    return (
      <Modal title="안내문 분석 중" onClose={onClose} busy width={420} hideTitle>
        <div role="status" className="flex flex-col items-center gap-4 py-10 text-center">
          <LoaderCircle size={28} strokeWidth={1.6} className="animate-spin text-muted" />
          <div>
            <p className="text-base font-bold">안내문을 읽고 있어요</p>
            <p className="mt-1 text-sm text-muted">주제, 요구사항, 분량 조건을 정리하는 중이에요. 보통 10초쯤 걸려요.</p>
          </div>
        </div>
      </Modal>
    );
  }

  /* ───────────── 분석 결과 + 방식 선택 ───────────── */
  if (stage === "choose" && core) {
    const due = admin?.due_date?.trim();
    return (
      <Modal title="분석한 내용" onClose={onClose} busy={busy} width={680}>
        <div className="space-y-5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md border border-border-strong px-2 py-0.5 text-xs font-semibold text-muted">
                {subject || "과목 미확인"}
              </span>
              {due && (
                <span className="inline-flex items-center gap-1 text-xs text-muted">
                  <CalendarClock size={13} strokeWidth={1.7} />
                  {due} 제출
                </span>
              )}
            </div>
            <h3 className="mt-2 text-xl font-bold leading-snug tracking-tight">{core.topic}</h3>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <section aria-label="요구사항" className="rounded-xl border border-border bg-background p-4">
              <p className="mb-2 text-xs font-semibold text-faint">요구사항</p>
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
                <p className="text-sm text-muted">안내문에 따로 적힌 요구사항이 없어요.</p>
              )}
            </section>
            <section aria-label="만들 결과물" className="rounded-xl border border-border bg-background p-4">
              <p className="mb-2 text-xs font-semibold text-faint">만들 결과물</p>
              <ul className="space-y-2 text-sm">
                {core.task_elements.map((el, i) => (
                  <li key={i} className="flex items-start gap-2">
                    {el.type === "external_production" ? (
                      <Wrench size={15} strokeWidth={1.7} className="mt-0.5 shrink-0 text-muted" aria-label="외부 툴로 제작" />
                    ) : (
                      <FileText size={15} strokeWidth={1.7} className="mt-0.5 shrink-0 text-muted" aria-label="글로 제출" />
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
              분석 내용 수정하기
              <ChevronDown size={14} strokeWidth={1.8} className={editing ? "rotate-180 transition-transform" : "transition-transform"} />
            </button>
            {editing && (
              <div className="mt-3 space-y-3 rounded-xl border border-border bg-background p-4">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-faint">과목</span>
                  <input value={subject} onChange={(e) => setSubject(e.target.value)} className={`${fieldCls} h-10`} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-faint">주제</span>
                  <input
                    value={core.topic}
                    onChange={(e) => setCore({ ...core, topic: e.target.value })}
                    className={`${fieldCls} h-10`}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-faint">요구사항 (한 줄에 하나)</span>
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
                        aria-label="결과물 종류"
                        onChange={(e) => updateElement(i, { type: e.target.value as TaskElement["type"] })}
                        className="h-9 rounded-lg border border-border-strong bg-background px-2 text-xs"
                      >
                        <option value="text_submission">글로 제출</option>
                        <option value="external_production">외부 툴로 제작</option>
                      </select>
                      <input
                        value={el.label}
                        aria-label="결과물 이름"
                        onChange={(e) => updateElement(i, { label: e.target.value })}
                        className={`${fieldCls} h-9 flex-1`}
                      />
                    </div>
                    <textarea
                      value={el.description}
                      aria-label="결과물 설명"
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
            <p className="text-xs text-danger">과목을 입력해야 시작할 수 있어요. 위의 “분석 내용 수정하기”에서 채워 주세요.</p>
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
                <span className="block text-base font-bold">AI가 만들어줘요</span>
                <span className="mt-1 block text-[13px] leading-relaxed text-muted">
                  자료 조사부터 결과물 작성까지 한 번에 만들어 줘요.
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
                <span className="block text-base font-bold">직접 작성할게요</span>
                <span className="mt-1 block text-[13px] leading-relaxed text-muted">
                  {user
                    ? "자료 조사와 작성 가이드를 받고, 직접 쓴 글에 피드백을 받아요."
                    : "로그인하면 쓸 수 있어요. 작성 내용이 자동으로 저장돼요."}
                </span>
              </span>
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  /* ───────────── 입력 ───────────── */
  return (
    <Modal title="새 창작물" onClose={onClose} width={560}>
      <div className="space-y-5">
        <div role="tablist" aria-label="안내문 입력 방식" className="grid grid-cols-2 gap-1 rounded-xl bg-raised p-1">
          {(
            [
              ["image", "사진 업로드", ImagePlus],
              ["text", "텍스트로 붙여넣기", Type],
            ] as const
          ).map(([k, label, Icon]) => (
            <button
              key={k}
              role="tab"
              aria-selected={kind === k}
              onClick={() => setKind(k)}
              className={[
                "flex h-9 items-center justify-center gap-2 rounded-lg text-[13px] font-semibold transition-colors",
                kind === k ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground",
              ].join(" ")}
            >
              <Icon size={15} strokeWidth={1.8} />
              {label}
            </button>
          ))}
        </div>

        {kind === "image" ? (
          <div>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                pickFile(e.dataTransfer.files?.[0] ?? null);
              }}
              className={[
                "relative grid min-h-[220px] place-items-center rounded-2xl border border-dashed p-4 transition-colors",
                dragging ? "border-foreground bg-raised" : "border-border-strong hover:border-foreground",
              ].join(" ")}
            >
              {preview ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview} alt="업로드한 안내문 미리보기" className="max-h-[260px] rounded-lg object-contain" />
                  <button
                    onClick={() => pickFile(null)}
                    aria-label="사진 지우기"
                    className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full border border-border-strong bg-surface text-muted transition-colors hover:text-foreground"
                  >
                    <X size={15} strokeWidth={1.8} />
                  </button>
                </>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center gap-2 text-center"
                >
                  <ImagePlus size={30} strokeWidth={1.4} className="text-muted" />
                  <span className="text-sm font-semibold">안내문 사진을 올려 주세요</span>
                  <span className="text-xs text-muted">눌러서 고르거나, 여기로 끌어다 놓으세요</span>
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                aria-label="안내문 사진 선택"
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>
        ) : (
          <label className="block">
            <span className="mb-1.5 flex items-center justify-between text-[13px] font-semibold">
              안내문 또는 주제
              {topicText.length > 0 && <span className="text-xs font-normal text-faint">{topicText.length}자</span>}
            </span>
            <textarea
              value={topicText}
              onChange={(e) => setTopicText(e.target.value)}
              rows={7}
              placeholder="안내문 내용을 그대로 붙여넣거나, “어린 왕자 독서감상문”처럼 주제만 적어도 돼요."
              className={`${fieldCls} resize-none py-3 leading-relaxed`}
            />
          </label>
        )}

        <label className="block">
          <span className="mb-1.5 block text-[13px] font-semibold">
            상세 입력 <span className="font-normal text-faint">(선택)</span>
          </span>
          <input
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder={placeholder}
            className={`${fieldCls} h-11`}
          />
        </label>

        {error && (
          <p role="alert" className="rounded-xl border border-danger/50 px-4 py-3 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between gap-3">
          {user && latest ? (
            <Button variant="ghost" size="sm" onClick={useLatest}>
              최근 안내문 불러오기
            </Button>
          ) : (
            <span />
          )}
          <Button variant="primary" size="lg" onClick={analyze} disabled={!hasInput || busy} className="min-w-[140px]">
            분석하기
          </Button>
        </div>
      </div>
    </Modal>
  );
}
